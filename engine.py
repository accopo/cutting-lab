"""Local Cutting Lab solver adapters and independent certificate checks.

PackingSolver is invoked in the worker process. This module performs no network
access. It never converts unsupported constraints into an easier problem.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
import csv
import importlib.metadata
import json
import math
from pathlib import Path
import time

from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.geometry.polygon import orient

from engine_1d import KERF_ENGINES, MODEL_NOTE


class ProblemError(ValueError):
    pass


def _number(value, label, *, low=0, high=1e8, positive=False, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProblemError(f"{label}必须是数字。")
    if not math.isfinite(value) or value < low or value > high or (positive and value <= 0):
        raise ProblemError(f"{label}超出允许范围。")
    if integer and value != int(value):
        raise ProblemError(f"{label}必须是整数；此求解路线使用整数坐标，请统一单位后输入。")
    return int(value) if integer else float(value)


def _angles(values, label):
    if not isinstance(values, list) or not 1 <= len(values) <= 72:
        raise ProblemError(f"{label}需包含 1 至 72 个角度。")
    return sorted(set(round(_number(a, label, low=-3600, high=3600) % 360, 10) for a in values))


def _polygon(points, label):
    if not isinstance(points, list) or not 3 <= len(points) <= 201:
        raise ProblemError(f"{label}需提供 3 至 200 个顶点。")
    coords = []
    for pt in points:
        if not isinstance(pt, (list, tuple)) or len(pt) != 2:
            raise ProblemError(f"{label}顶点必须是 [x,y]。")
        coords.append([_number(pt[0], label, low=-1e7, high=1e7),
                       _number(pt[1], label, low=-1e7, high=1e7)])
    if coords[-1] == coords[0]:
        coords.pop()
    if len(coords) > 200 or len(coords) < 3:
        raise ProblemError(f"{label}需包含 3 至 200 个不同轮廓顶点。")
    poly = Polygon(coords)
    if not poly.is_valid or poly.area <= 1e-10:
        raise ProblemError(f"{label}存在自交、重复边或零面积；请修正原始轮廓。")
    return [list(x) for x in orient(poly, sign=1).exterior.coords[:-1]]


def normalize_problem(problem: dict) -> dict:
    if not isinstance(problem, dict):
        raise ProblemError("问题必须是 JSON 对象。")
    if problem.get("kind")=="box" or (isinstance(problem.get("settings"),dict) and problem["settings"].get("engine")=="box"):
        from engine_box import normalize_box_problem
        return normalize_box_problem(problem)
    p = deepcopy(problem)
    kind = p.get("kind", "irregular")
    if kind not in {"irregular", "rectangle", "onedimensional"}:
        raise ProblemError("未知零件类型。")
    settings = p.setdefault("settings", {})
    if not isinstance(settings, dict):
        raise ProblemError("settings 必须是对象。")
    if any(container.get(key) for container in (p,settings) for key in ("mirror","allow_mirror","mirroring")):
        raise ProblemError("本版本尚未接入镜像，不能将镜像约束静默忽略。")
    defaults = dict(engine=kind, objective="bins" if kind == "onedimensional" else "strip",
                    rotation="source", custom_angles=[0, 180], spacing=0, edge=0,
                    kerf=0, time_limit=10, stages=3, first_cut="vertical")
    for key, value in defaults.items():
        settings.setdefault(key, value)
    eng, obj, rot = settings["engine"], settings["objective"], settings["rotation"]
    kinds = {"irregular": {"irregular", "rectangle"}, "rectangle": {"rectangle"},
             "guillotine": {"rectangle"}, "shelf": {"irregular", "rectangle"},
             "onedimensional": {"onedimensional"},
             **{name: {"onedimensional"} for name in KERF_ENGINES},
             "rectpack-maxrects": {"rectangle"}, "rectpack-skyline": {"rectangle"}}
    if eng not in kinds or kind not in kinds[eng]:
        raise ProblemError("该工具路线不支持当前零件类型；矩形路线不能替代不规则轮廓。")
    objectives = {"irregular": {"strip", "bins", "knapsack"},
                  "rectangle": {"strip", "bins", "knapsack"},
                  "guillotine": {"bins", "knapsack"},
                  "shelf": {"strip", "bins"}, "onedimensional": {"bins", "knapsack"},
                  **{name: {"bins"} for name in KERF_ENGINES},
                  "rectpack-maxrects": {"bins"}, "rectpack-skyline": {"bins"}}
    if obj not in objectives[eng]:
        raise ProblemError(f"{eng} 路线不支持 {obj} 问题。")
    if rot not in {"source", "none", "half", "quarter", "custom", "continuous"}:
        raise ProblemError("未知旋转模式。")
    if rot == "continuous" and eng != "irregular":
        raise ProblemError("连续自由旋转仅在不规则 PackingSolver 路线支持。")
    if rot == "custom" and eng in {"rectangle", "guillotine", "onedimensional", "rectpack-maxrects", "rectpack-skyline"}:
        raise ProblemError("该路线不支持自定义角度；请选择原始、禁止、180°或90°旋转。")
    if kind == "onedimensional" and rot not in {"source", "none"}:
        raise ProblemError("一维下料不提供旋转设置，请选择原始方向或禁止旋转。")
    settings["custom_angles"] = _angles(settings["custom_angles"], "自定义角度")
    integer = eng in {"rectangle", "guillotine", "onedimensional", "rectpack-maxrects", "rectpack-skyline"} | KERF_ENGINES
    for key in ["spacing", "edge", "kerf"]:
        settings[key] = _number(settings[key], key, high=1e6, integer=integer)
    settings["time_limit"] = _number(settings["time_limit"], "求解时限", low=1, high=60)
    if eng not in {"irregular", "shelf"} and (settings["spacing"] or settings["edge"]):
        raise ProblemError("当前矩形、贯通和一维路线不支持额外间距/边距；请设为0，贯通路线可单独设置刀缝。")
    if eng not in {"guillotine"} | KERF_ENGINES and settings["kerf"]:
        raise ProblemError("该路线不支持刀缝；一维锯缝请显式选择逐件锯缝或 FFD/BFD 路线，原始一维路线不计锯缝。")
    if eng == "guillotine":
        if settings["stages"] != 3:
            raise ProblemError("本版本贯通路线已验证三阶段切割，请设置 stages=3。")
        if settings["first_cut"] not in {"vertical", "horizontal"}:
            raise ProblemError("首刀方向必须为 vertical 或 horizontal。")
    stock = p.get("stock")
    if not isinstance(stock, dict):
        raise ProblemError("需要 stock 原料尺寸。")
    if any(stock.get(key) for key in ("polygon","holes","shape")) or stock.get("kind") in {"irregular","irregular-bin"}:
        raise ProblemError("本版本仅支持矩形原料；不规则原料边界及原料孔洞尚未接入。")
    stock["width"] = _number(stock.get("width"), "原料长度", positive=True, integer=integer)
    stock["height"] = _number(stock.get("height", 1 if kind == "onedimensional" else None),
                              "原料宽度", positive=True, integer=integer)
    if kind == "onedimensional" and stock["height"] != 1:
        raise ProblemError("一维原料 height 必须为1；该高度仅用于显示。")
    stock["copies"] = _number(stock.get("copies", 20), "可用原料数量", low=1, high=100, integer=True)
    p["effective_stock_copies"] = stock["copies"] if obj=="bins" else 1
    if 2 * settings["edge"] >= min(stock["width"], stock["height"]):
        raise ProblemError("边距占满了原料，请减小边距。")
    items = p.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 60:
        raise ProblemError("需提供 1 至 60 种零件。")
    ids = set()
    for n, item in enumerate(items):
        if not isinstance(item, dict):
            raise ProblemError("每种零件必须是对象。")
        ident = item.get("id", n)
        if isinstance(ident, bool) or not isinstance(ident, (str, int)) or str(ident) in ids:
            raise ProblemError("零件 id 必须唯一，且为字符串或整数。")
        ids.add(str(ident)); item["id"] = ident
        item["name"] = str(item.get("name", f"零件 {n+1}"))[:120]
        if any(item.get(key) for key in ("mirror","allow_mirror","mirroring")):
            raise ProblemError("本版本不允许零件镜像，请关闭镜像设置。")
        item["quantity"] = _number(item.get("quantity", 1), "零件数量", low=1, high=500, integer=True)
        item["profit"] = _number(item.get("profit", 1), "零件价值", high=1e12, positive=True)
        item["allowed_rotations"] = _angles(item.get("allowed_rotations", [0]), "原始允许角度")
        effective = {"none": [0], "half": [0,180], "quarter": [0,90,180,270],
                     "custom": settings["custom_angles"], "source": item["allowed_rotations"],
                     "continuous": None}[rot]
        if eng in {"rectangle", "guillotine", "rectpack-maxrects", "rectpack-skyline"} and any(a % 90 != 0 for a in effective):
            raise ProblemError("矩形和贯通路线只能使用90°整数倍方向。")
        if kind == "onedimensional" and effective != [0]:
            raise ProblemError("一维零件原始方向需为 [0]。")
        item["effective_rotations"] = effective
        if item.get("holes"):
            raise ProblemError("本版本尚未接入带孔零件，请提供单一外轮廓。")
        if kind == "irregular":
            item["polygon"] = _polygon(item.get("polygon"), item["name"])
        elif kind == "rectangle":
            item["width"] = _number(item.get("width"), "零件宽", positive=True, integer=integer)
            item["height"] = _number(item.get("height"), "零件高", positive=True, integer=integer)
            expected = box(0, 0, item["width"], item["height"])
            if item.get("polygon"):
                poly = Polygon(_polygon(item["polygon"], item["name"]))
                if poly.symmetric_difference(expected).area > max(1e-9, expected.area*1e-10):
                    raise ProblemError("矩形 polygon 必须与从原点开始的 width×height 一致。")
            item["polygon"] = [list(v) for v in expected.exterior.coords[:-1]]
        else:
            item["length"] = _number(item.get("length"), "零件长度", positive=True, integer=True)
            if item.get("polygon"):
                poly=Polygon(_polygon(item["polygon"],item["name"]))
                if poly.symmetric_difference(box(0,0,item["length"],1)).area>max(1e-9,item["length"]*1e-10):
                    raise ProblemError("一维 polygon 必须与从原点开始的 length×1 显示轮廓一致。")
            item["polygon"] = [[0,0],[item["length"],0],[item["length"],1],[0,1]]
    if sum(i["quantity"] for i in items) > 500:
        raise ProblemError("单次任务最多500件零件。")
    if eng.startswith("rectpack-") and len({tuple(sorted({a%180 for a in i["effective_rotations"]})) for i in items}) != 1:
        raise ProblemError("Rectpack 使用统一旋转开关，所有零件必须允许相同的0°/90°方向组合。")
    defects = p.setdefault("defects", [])
    if not isinstance(defects, list) or len(defects) > 20:
        raise ProblemError("缺陷区域最多20个。")
    if defects and eng in {"shelf", "onedimensional", "rectpack-maxrects", "rectpack-skyline"} | KERF_ENGINES:
        raise ProblemError("当前简易基线和一维路线不支持缺陷区域。")
    for defect in defects:
        if not isinstance(defect, dict):
            raise ProblemError("缺陷必须是矩形对象。")
        if any(defect.get(key) for key in ("polygon","shape","holes")):
            raise ProblemError("本版本缺陷只支持 x/y/width/height 矩形，不支持异形疵点或疵点孔洞。")
        for key in ["x", "y", "width", "height"]:
            defect[key] = _number(defect.get(key), "缺陷"+key,
                                  positive=key in {"width","height"}, integer=integer)
        if defect["x"]+defect["width"] > stock["width"] or defect["y"]+defect["height"] > stock["height"]:
            raise ProblemError("缺陷区域必须完全位于原料内部。")
    p["kind"] = kind
    p["unit"] = str(p.get("unit", "未指定单位"))[:60]
    p["name"] = str(p.get("name", "自定义裁切问题"))[:180]
    return p


def _clean(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(k): _clean(v) for k,v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def _dump(path, value):
    path.write_text(json.dumps(_clean(value), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def _bin(p, index):
    return {"index": index, "width": p["stock"]["width"], "height": p["stock"]["height"],
            "items": [], "defects": deepcopy(p["defects"])}


def _piece(item, angle, points):
    return {"id": item["id"], "name": item["name"], "angle": float(angle)%360,
            "mirror": False, "polygon": [list(v) for v in points]}


def _rectangle_angle(item, width, height):
    allowed = item["effective_rotations"]
    for angle in allowed:
        w,h = (item["width"],item["height"]) if angle%180 == 0 else (item["height"],item["width"])
        if abs(w-width)<1e-7 and abs(h-height)<1e-7:
            return angle
    raise RuntimeError("求解证书矩形尺寸与允许方向不一致。")


def _shelf(p):
    s=p["settings"]; edge=s["edge"]; gap=s["spacing"]
    width,height=p["stock"]["width"],p["stock"]["height"]
    candidates=[]
    for item in p["items"]:
        rotations=[]
        for angle in item["effective_rotations"]:
            poly=affinity.rotate(Polygon(item["polygon"]),angle,origin=(0,0))
            minx,miny,maxx,maxy=poly.bounds
            if maxx-minx<=width-2*edge+1e-9 and maxy-miny<=height-2*edge+1e-9:
                rotations.append((maxx-minx,maxy-miny,angle,poly))
        candidates.extend((item,rotations) for _ in range(item["quantity"]))
    candidates.sort(key=lambda v: -max((w*h for w,h,a,p in v[1]),default=0))
    bins=[]; x=y=edge; column_width=0
    maxbins=1 if s["objective"]=="strip" else p["stock"]["copies"]
    for item, options in candidates:
        if not options:
            continue
        if not bins:
            bins.append(_bin(p,0))
        choices=[]
        for w,h,a,poly in options:
            if y+h<=height-edge+1e-9 and x+w<=width-edge+1e-9:
                choices.append((x+max(column_width,w),0,w,h,a,poly,x,y))
            nx=x+column_width+(gap if column_width else 0)
            if nx+w<=width-edge+1e-9:
                choices.append((nx+w,1,w,h,a,poly,nx,edge))
        if not choices:
            if len(bins)>=maxbins:
                continue
            bins.append(_bin(p,len(bins)));x=y=edge;column_width=0
            choices=[(edge+w,0,w,h,a,poly,edge,edge) for w,h,a,poly in options]
        _,newcol,w,h,angle,poly,px,py=min(choices,key=lambda c:(c[0],c[1],c[3],c[4]))
        if newcol:column_width=0
        minx,miny,*_=poly.bounds
        transformed=affinity.translate(poly,px-minx,py-miny)
        bins[-1]["items"].append(_piece(item,angle,transformed.exterior.coords[:-1]))
        x=px;y=py+h+gap;column_width=max(column_width,w)
    return bins,{},True,None


def _packing_solver(p, out):
    eng=p["settings"]["engine"];s=p["settings"];stock=p["stock"]
    if eng=="irregular":
        import packingsolver.irregular as mod
    elif eng=="rectangle":
        import packingsolver.rectangle as mod
    elif eng=="guillotine":
        import packingsolver.rectangleguillotine as mod
    else:
        import packingsolver.onedimensional as mod
    builder=mod.InstanceBuilder()
    builder.set_objective(getattr(mod.Objective,{"strip":"OpenDimensionX","bins":"BinPacking","knapsack":"Knapsack"}[s["objective"]]))
    copies=stock["copies"] if s["objective"]=="bins" else 1
    if eng=="irregular":
        builder.set_item_item_minimum_spacing(s["spacing"])
        bid=builder.add_bin_type(mod.build_rectangle(0,stock["width"],0,stock["height"]),copies=copies,item_bin_minimum_spacing=s["edge"])
        for d in p["defects"]:
            did=builder.add_defect(bid,0,mod.ShapeWithHoles(mod.build_rectangle(d["x"],d["x"]+d["width"],d["y"],d["y"]+d["height"])))
            builder.set_item_defect_minimum_spacing(bid,did,s["spacing"])
        for item in p["items"]:
            rots=[(0,360,False)] if item["effective_rotations"] is None else [(a,a,False) for a in item["effective_rotations"]]
            builder.add_item_type(mod.build_shape(item["polygon"]),copies=item["quantity"],profit=item["profit"],allowed_rotations=rots)
    elif eng=="onedimensional":
        builder.add_bin_type(stock["width"],copies=copies)
        for item in p["items"]:
            builder.add_item_type(item["length"],copies=item["quantity"],profit=item["profit"])
    else:
        bid=builder.add_bin_type(stock["width"],stock["height"],copies=copies)
        if eng=="guillotine":
            builder.set_number_of_stages(3)
            # Exact three-stage patterns: no fourth-stage item extraction trim.
            builder.set_cut_type(mod.CutType.Exact)
            builder.set_first_stage_orientation(mod.CutOrientation.Vertical if s["first_cut"]=="vertical" else mod.CutOrientation.Horizontal)
            builder.set_cut_thickness(s["kerf"])
            builder.set_cut_through_defects(True)
        for d in p["defects"]:
            builder.add_defect(bid,d["x"],d["y"],d["width"],d["height"])
        for item in p["items"]:
            allowed=item["effective_rotations"]
            dimensions={a%180 for a in allowed}
            # A 90-only part is pre-rotated for the rectangle API, then mapped back.
            w,h=item["width"],item["height"]
            if dimensions=={90}:w,h=h,w
            builder.add_item_type(w,h,copies=item["quantity"],profit=item["profit"],oriented=len(dimensions)==1)
    instance=builder.build()
    instance.write(str(out/"solver_instance.json"))
    params=mod.OptimizeParameters();params.time_limit=s["time_limit"];params.verbosity_level=0
    params.memory_limit_megabytes=2048
    from progress import ProgressRecorder
    progress=ProgressRecorder(out,eng,"json" if eng=="irregular" else "csv",
                              model=p.get("progress_model"))
    params.new_solution_callback=progress
    try:
        answer=mod.optimize(instance,params)
    except BaseException:
        progress.finish(failed=True)
        raise
    else:
        progress.finish()
    certificate=out/("solver_solution.json" if eng=="irregular" else "solver_solution.csv")
    answer.solution.write(str(certificate))
    statistics=answer.solution.to_json()
    bins=[];tree=None
    if eng=="irregular":
        raw=json.loads(certificate.read_text(encoding="utf-8"))
        for binraw in raw.get("bins",[]):
            resultbin=_bin(p,len(bins))
            for part in binraw["items"]:
                if part["mirror"]:
                    raise RuntimeError("求解器返回未允许的镜像轮廓。")
                if len(part["item_shapes"])!=1:
                    raise RuntimeError("不支持多组件证书。")
                edges=part["item_shapes"][0]["shape"]
                if any(e["type"]!="LineSegment" for e in edges):
                    raise RuntimeError("本版本只支持直线多边形证书。")
                resultbin["items"].append(_piece(p["items"][part["id"]],part["angle"],[(e["xs"],e["ys"]) for e in edges]))
            for _ in range(binraw["copies"]):
                clone=deepcopy(resultbin);clone["index"]=len(bins);bins.append(clone)
    elif eng in {"rectangle","onedimensional"}:
        rows=list(csv.DictReader(certificate.open(encoding="utf-8",newline="")))
        groups={}
        for row in rows:
            if row["TYPE"]=="BIN":groups[row["BIN"]] = {"copies":int(row["COPIES"]),"items":[]}
            elif row["TYPE"]=="ITEM":groups[row["BIN"]]["items"].append(row)
        for group in groups.values():
            for _ in range(group["copies"]):
                resultbin=_bin(p,len(bins))
                for row in group["items"]:
                    item=p["items"][int(row["ID"])];x=float(row["X"]);w=float(row["LX"])
                    y=0 if eng=="onedimensional" else float(row["Y"])
                    h=1 if eng=="onedimensional" else float(row["LY"])
                    angle=0 if eng=="onedimensional" else _rectangle_angle(item,w,h)
                    # COPIES repeats the complete bin pattern, not coincident items.
                    if int(row["COPIES"]) not in {1,group["copies"]}:
                        raise RuntimeError("零件证书复制数与原料模式复制数不一致。")
                    resultbin["items"].append(_piece(item,angle,box(x,y,x+w,y+h).exterior.coords[:-1]))
                bins.append(resultbin)
    else:
        tree=[]
        for raw in csv.DictReader(certificate.open(encoding="utf-8",newline="")):
            row={k:(None if v=="" else int(v)) for k,v in raw.items()}
            # TYPE=-4 is a defect annotation, not a cutting-tree node/root.
            if row["TYPE"]!=-4:tree.append(row)
        roots=[r for r in tree if r["PARENT"] is None]
        parents={r["NODE_ID"]:r for r in tree}
        for root in roots:
            relevant=[r for r in tree if r["PLATE_ID"]==root["PLATE_ID"]]
            for _ in range(root["COPIES"]):
                resultbin=_bin(p,len(bins));resultbin["cuts"]=[]
                for row in relevant:
                    if row["PARENT"] is None:continue
                    x,y,w,h=(row[k] for k in ["X","Y","WIDTH","HEIGHT"])
                    if row["TYPE"]>=0:
                        item=p["items"][row["TYPE"]]
                        resultbin["items"].append(_piece(item,_rectangle_angle(item,w,h),box(x,y,x+w,y+h).exterior.coords[:-1]))
                    par=parents[row["PARENT"]]
                    vertical=(row["CUT"]%2==1)==(s["first_cut"]=="vertical")
                    if vertical and x>par["X"]:
                        cx=x-s["kerf"]/2
                        resultbin["cuts"].append(dict(x1=cx,y1=y,x2=cx,y2=y+h,stage=row["CUT"]))
                    elif not vertical and y>par["Y"]:
                        cy=y-s["kerf"]/2
                        resultbin["cuts"].append(dict(x1=x,y1=cy,x2=x+w,y2=cy,stage=row["CUT"]))
                bins.append(resultbin)
    return bins,statistics,bool(answer.solution.feasible()),tree


def _rectpack(p):
    import rectpack
    dimensions={a%180 for a in p["items"][0]["effective_rotations"]}
    algorithm=rectpack.MaxRectsBssf if p["settings"]["engine"]=="rectpack-maxrects" else rectpack.SkylineBl
    packer=rectpack.newPacker(pack_algo=algorithm, rotation=len(dimensions)==2)
    packer.add_bin(p["stock"]["width"],p["stock"]["height"],count=p["stock"]["copies"])
    for index,item in enumerate(p["items"]):
        w,h=item["width"],item["height"]
        if dimensions=={90}:w,h=h,w
        for _ in range(item["quantity"]):packer.add_rect(w,h,rid=index)
    packer.pack();bins={}
    for bid,x,y,w,h,rid in packer.rect_list():
        bins.setdefault(bid,_bin(p,bid))
        item=p["items"][rid]
        bins[bid]["items"].append(_piece(item,_rectangle_angle(item,w,h),box(x,y,x+w,y+h).exterior.coords[:-1]))
    return list(bins.values()),{"algorithm":algorithm.__name__,"rotation_enabled":len(dimensions)==2},True,None


def _validate_tree(p, rows):
    errors=[];nodes={r["NODE_ID"]:r for r in rows};children=defaultdict(list)
    if len(nodes)!=len(rows):errors.append("贯通切割树节点重复。")
    for r in rows:
        if r["WIDTH"]<=0 or r["HEIGHT"]<=0:errors.append("贯通树存在非正尺寸。")
        if r["PARENT"] is None:
            if (r["X"],r["Y"],r["WIDTH"],r["HEIGHT"],r["CUT"])!=(0,0,p["stock"]["width"],p["stock"]["height"],0):
                errors.append("贯通树根节点与原料不符。")
            continue
        par=nodes.get(r["PARENT"])
        if par is None:
            errors.append("贯通树父节点缺失。");continue
        children[par["NODE_ID"]].append(r)
        if r["PLATE_ID"]!=par["PLATE_ID"] or r["CUT"]!=par["CUT"]+1 or r["CUT"]>3:
            errors.append("贯通树板号或三阶段深度不合法。")
        if r["X"]<par["X"] or r["Y"]<par["Y"] or r["X"]+r["WIDTH"]>par["X"]+par["WIDTH"] or r["Y"]+r["HEIGHT"]>par["Y"]+par["HEIGHT"]:
            errors.append("贯通树子区域越过父区域。")
    for key, cs in children.items():
        par=nodes[key]
        vertical=(par["CUT"]%2==0)==(p["settings"]["first_cut"]=="vertical")
        axis,length,orth,orthlen=("X","WIDTH","Y","HEIGHT") if vertical else ("Y","HEIGHT","X","WIDTH")
        cs.sort(key=lambda r:r[axis])
        if any(r[orth]!=par[orth] or r[orthlen]!=par[orthlen] for r in cs):
            errors.append("切割没有贯穿所在父区域。")
        if any(b[axis]-a[axis]-a[length]<p["settings"]["kerf"] for a,b in zip(cs,cs[1:])):
            errors.append("贯通切割树刀缝不足。")
        if par["PARENT"] is not None and par["TYPE"]>=0:
            errors.append("成品节点不能继续分割。")
    return {"pass":not errors,"errors":list(dict.fromkeys(errors)),"nodes":len(rows),
            "checks":["parent containment","alternating spanning cuts","three-stage depth","sibling kerf","leaf items"]}


def validate_result(problem, result):
    if problem.get("kind")=="box":
        from engine_box import validate_box_result
        return validate_box_result(problem,result)
    p=normalize_problem(problem);s=p["settings"]
    source={str(v["id"]):v for v in p["items"]};counts=Counter();errors=[]
    # Native-unit tolerances are explicit, separate from manufacturing tolerances.
    scale=max(p["stock"]["width"],p["stock"]["height"],1)
    tol=max(1e-7,scale*1e-8);minclear=None;min_defect=None
    for b in result.get("bins",[]):
        if abs(b["width"]-p["stock"]["width"])>tol or abs(b["height"]-p["stock"]["height"])>tol:
            errors.append("结果原料尺寸与输入不符。")
        polys=[]
        domain=box(s["edge"]-tol,s["edge"]-tol,p["stock"]["width"]-s["edge"]+tol,p["stock"]["height"]-s["edge"]+tol)
        defects=[box(d["x"],d["y"],d["x"]+d["width"],d["y"]+d["height"]) for d in p["defects"]]
        for item in b.get("items",[]):
            ident=str(item["id"]);counts[ident]+=1
            if ident not in source:
                errors.append("证书包含未知零件。");continue
            original=source[ident];poly=Polygon(item["polygon"])
            if not poly.is_valid or poly.area<=0:
                errors.append(f"零件 {ident} 结果几何无效。");continue
            areatol=max(1e-8,Polygon(original["polygon"]).area*1e-7)
            angle=item["angle"];allowed=original["effective_rotations"]
            if not math.isfinite(angle) or (allowed is not None and not any(abs((angle-a+180)%360-180)<1e-6 for a in allowed)) or item.get("mirror",False):
                errors.append(f"零件 {ident} 方向不符合约束。")
            expected=affinity.rotate(Polygon(original["polygon"]),angle,origin=(0,0))
            expected=affinity.translate(expected,poly.bounds[0]-expected.bounds[0],poly.bounds[1]-expected.bounds[1])
            if poly.symmetric_difference(expected).area>areatol:
                errors.append(f"零件 {ident} 形状与原始轮廓不符。")
            if not domain.covers(poly):errors.append(f"零件 {ident} 越界或边距不足。")
            for other in polys:
                dist=poly.distance(other);minclear=dist if minclear is None else min(minclear,dist)
                if poly.intersection(other).area>areatol or dist<s["spacing"]-tol:
                    errors.append("零件之间重叠或间距不足。")
            for defect in defects:
                dist=poly.distance(defect);min_defect=dist if min_defect is None else min(min_defect,dist)
                if poly.intersection(defect).area>areatol or dist<s["spacing"]-tol:
                    errors.append("零件进入缺陷区域或避让间距不足。")
            polys.append(poly)
    required=Counter({str(i["id"]):i["quantity"] for i in p["items"]})
    if any(counts[k]>required.get(k,0) for k in counts):errors.append("零件数量超过需求。")
    maxbins=p["stock"]["copies"] if s["objective"]=="bins" else 1
    if len(result.get("bins",[]))>maxbins:errors.append("使用原料超过可用数量。")
    treecheck=result.get("cut_tree_validation")
    if treecheck and not treecheck["pass"]:errors.extend(treecheck["errors"])
    kerfcheck=None
    if s["engine"] in KERF_ENGINES:
        from engine_1d import validate_kerf_1d
        kerfcheck=validate_kerf_1d(p,result)
        errors.extend(kerfcheck["errors"])
    geometry_pass=not errors;full=counts==required
    if s["objective"]!="knapsack" and not full:errors.append("尚未放置全部需求零件。")
    validation={"pass":not errors,"geometry_pass":geometry_pass,"full_demand":full,
            "errors":list(dict.fromkeys(errors)),"placed_counts":dict(counts),"required_counts":dict(required),
            "minimum_item_clearance":minclear,"minimum_defect_clearance":min_defect,
            "coordinate_tolerance":tol,"area_tolerance":"max(1e-8, original_piece_area * 1e-7)",
            "checks":["source geometry","quantity","bounds","overlap","allowed angles","spacing","defects"],
            "scope":"独立几何校验；不等同于加工可制造性或全局最优证明。"}
    if kerfcheck is not None:
        validation["kerf_validation"]=kerfcheck
        validation["checks"].extend(kerfcheck["checks"])
    return validation


def solve(problem:dict, output_dir:Path) -> dict:
    if problem.get("kind")=="box":
        from engine_box import solve_box
        return solve_box(problem,output_dir)
    p=normalize_problem(problem);out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
    _dump(out/"problem_normalized.json",p)
    started=time.perf_counter();eng=p["settings"]["engine"]
    if eng in KERF_ENGINES:
        from engine_1d import solve_kerf_1d
        bins,stats,solver_feasible,tree=solve_kerf_1d(p,out)
    elif eng=="shelf":
        bins,stats,solver_feasible,tree=_shelf(p)
    elif eng.startswith("rectpack-"):
        bins,stats,solver_feasible,tree=_rectpack(p)
    else:
        bins,stats,solver_feasible,tree=_packing_solver(p,out)
    elapsed=time.perf_counter()-started
    bins=[b for b in bins if b["items"]]
    for n,b in enumerate(bins):b["index"]=n
    required=sum(i["quantity"] for i in p["items"])
    placed=sum(len(b["items"]) for b in bins)
    area=sum(Polygon(i["polygon"]).area for b in bins for i in b["items"])
    used=max((max(pt[0] for pt in i["polygon"]) for b in bins for i in b["items"]),default=0)
    if placed:used+=p["settings"]["edge"]
    denominator=(used*p["stock"]["height"] if p["settings"]["objective"]=="strip"
                 else len(bins)*p["stock"]["width"]*p["stock"]["height"])
    byid={str(i["id"]):i for i in p["items"]}
    result={"engine":eng,"objective":p["settings"]["objective"],"elapsed_s":elapsed,
            "full":placed==required,"feasible":solver_feasible,"units":p["unit"],
            "metrics":{"required_pieces":required,"placed_pieces":placed,"bin_count":len(bins),
                       "used_length":used if p["settings"]["objective"]=="strip" else None,
                       "utilization_percent":100*area/denominator if denominator else 0,
                       "total_item_area":area,
                       "profit":sum(byid[str(i["id"])]["profit"] for b in bins for i in b["items"])},
            "bins":bins,"warnings":[],"solver_statistics":_clean(stats),
            "engine_version":("python-1d-greedy-1" if eng in {"ffd-1d","bfd-1d"} else "python-shelf-1" if eng=="shelf" else importlib.metadata.version("rectpack" if eng.startswith("rectpack-") else "packingsolver")),
            "config":{"engine":eng,"objective":p["settings"]["objective"],"settings":deepcopy(p["settings"]),"stock":deepcopy(p["stock"]),"effective_stock_copies":p["effective_stock_copies"]}}
    if tree is not None:
        result["cut_tree_validation"]=_validate_tree(p,tree)
    result["validation"]=validate_result(p,result)
    result["full"]=result["validation"]["full_demand"]
    result["feasible"]=solver_feasible and result["validation"]["geometry_pass"]
    result["warnings"].append("单次限时启发式结果；未证明全局最优，也未验证工业加工工艺。")
    if eng in KERF_ENGINES:
        kerf_loss=placed*p["settings"]["kerf"]
        total_stock=len(bins)*p["stock"]["width"]
        result["metrics"].update(total_item_length=area,kerf_loss_length=kerf_loss,
                                 occupied_length=area+kerf_loss,total_stock_length=total_stock,
                                 unused_length=total_stock-area-kerf_loss)
        result["warnings"].append(MODEL_NOTE)
        if eng in {"ffd-1d","bfd-1d"}:
            result["warnings"].append("透明递减贪心基线；在同一原料、需求与逐件锯缝约束下作比较，不保证最少根数。")
    if eng=="shelf":result["warnings"].append("包围盒逐列贪心基线；不利用凹形轮廓互相嵌套。")
    if not result["full"]:
        result["warnings"].append("背包问题允许只选择部分零件。" if result["objective"]=="knapsack" else "此次未排完全部需求，请增加原料尺寸/数量或时限；不能作为完整订单方案。")
    if eng=="guillotine" and p["defects"]:
        result["warnings"].append("贯通路线允许刀线穿越缺陷区，成品必须避开缺陷。")
    if p["settings"]["rotation"]=="continuous":
        result["warnings"].append("已向求解器传入0–360°连续旋转范围；有限时搜索不保证遍历所有角度。")
    _dump(out/"result.json",result)
    return result

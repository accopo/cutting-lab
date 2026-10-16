"""Real PackingSolver box adapter; axis-aligned 3D geometry, no 2D proxy."""
from collections import Counter
from copy import deepcopy
import csv
import importlib.metadata
import math
from pathlib import Path
import time

AXIS_ROTATIONS = ("XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX")


def normalize_box_problem(problem):
    from engine import ProblemError, _number
    if not isinstance(problem, dict):
        raise ProblemError("三维问题必须是 JSON 对象。")
    p = deepcopy(problem)
    if p.get("kind") != "box":
        raise ProblemError("三维装箱必须使用 kind=box，不能把二维轮廓隐式拉伸为箱体。")
    s = p.setdefault("settings", {})
    if not isinstance(s, dict):
        raise ProblemError("settings 必须是对象。")
    defaults = dict(engine="box", objective="bins", rotation="orthogonal",
                    spacing=0, edge=0, kerf=0, time_limit=10)
    for key, value in defaults.items():
        s.setdefault(key, value)
    if s["engine"] != "box":
        raise ProblemError("box 箱体目前只支持真实 PackingSolver box 引擎。")
    if not isinstance(s["objective"],str) or s["objective"] not in {"bins", "knapsack"}:
        raise ProblemError("三维装箱目前支持最少容器数和单容器背包。")
    if not isinstance(s["rotation"],str) or s["rotation"] not in {"none", "orthogonal"}:
        raise ProblemError("三维仅支持保持XYZ方向或六种轴对齐朝向，不支持二维角度或连续三维旋转。")
    if any(obj.get(key) for obj in (p,s) for key in ("mirror","allow_mirror","mirroring")):
        raise ProblemError("三维装箱不支持镜像设置。")
    for key in ("spacing", "edge", "kerf"):
        s[key] = _number(s[key], key, high=1e6, integer=True)
        if s[key]:
            raise ProblemError("三维引擎本版本不支持间距、边距或刀缝，请将它们设为0。")
    s["time_limit"] = _number(s["time_limit"], "求解时限", low=1, high=60)
    p.setdefault("defects", [])
    if not isinstance(p["defects"], list) or p["defects"]:
        raise ProblemError("三维引擎本版本不支持容器缺陷区域。")
    stock = p.get("stock")
    if not isinstance(stock, dict):
        raise ProblemError("需要三维 stock 容器尺寸。")
    if any(stock.get(key) for key in ("polygon","shape","holes","mesh","vertices")):
        raise ProblemError("三维只支持长方体容器，不支持异形容器、孔洞或网格。")
    if stock.get("kind") not in (None,"box"):
        raise ProblemError("三维容器 kind 只能为 box。")
    if "weight_capacity" in stock:
        if "maximum_weight" in stock and stock["maximum_weight"] != stock["weight_capacity"]:
            raise ProblemError("maximum_weight 与 weight_capacity 不一致。")
        stock["maximum_weight"] = stock.pop("weight_capacity")
    if stock.get("maximum_weight") is not None:
        stock["maximum_weight"] = _number(stock["maximum_weight"], "容器总重量上限", high=1e12, positive=True)
    for key in ("width","height","depth"):
        stock[key] = _number(stock.get(key), "容器"+key, high=1e6, positive=True, integer=True)
    stock["copies"] = _number(stock.get("copies",20), "容器数量", low=1, high=100, integer=True)
    p["effective_stock_copies"] = stock["copies"] if s["objective"]=="bins" else 1
    items = p.get("items")
    if not isinstance(items,list) or not 1<=len(items)<=60:
        raise ProblemError("三维任务需提供1至60种箱体零件。")
    ids=set()
    for n,item in enumerate(items):
        if not isinstance(item,dict):
            raise ProblemError("每种箱体必须是对象。")
        ident=item.get("id",n)
        if isinstance(ident,bool) or not isinstance(ident,(str,int)) or str(ident) in ids:
            raise ProblemError("箱体 id 必须唯一，且为字符串或整数。")
        ids.add(str(ident));item["id"]=ident
        item["name"]=str(item.get("name",f"箱体 {n+1}"))[:120]
        if any(item.get(key) for key in ("polygon","shape","holes","mesh","vertices")):
            raise ProblemError("本版本三维零件必须为实体长方体，不能把轮廓或网格静默当成包围盒。")
        if any(item.get(key) for key in ("mirror","allow_mirror","mirroring")):
            raise ProblemError("三维箱体不支持镜像约束。")
        if item.get("maximum_weight_after") or item.get("maximum_stackability"):
            raise ProblemError("本版本未接入单件堆叠承重和层数约束，不能忽略输入值。")
        item["weight"] = _number(item.get("weight", 0), "单件重量", high=1e12,
                                  positive=stock.get("maximum_weight") is not None)
        for key in ("width","height","depth"):
            item[key]=_number(item.get(key),"箱体"+key,high=1e6,positive=True,integer=True)
        item["quantity"]=_number(item.get("quantity",1),"箱体数量",low=1,high=500,integer=True)
        item["profit"]=_number(item.get("profit",1),"箱体价值",high=1e12,positive=True)
        allowed=item.get("allowed_rotations",list(AXIS_ROTATIONS))
        if not isinstance(allowed,list) or not 1<=len(allowed)<=6 or any(a not in AXIS_ROTATIONS for a in allowed):
            raise ProblemError("三维 allowed_rotations 需使用 XYZ/XZY/YXZ/YZX/ZXY/ZYX 字符串列表。")
        item["allowed_rotations"]=list(dict.fromkeys(allowed))
        item["effective_rotations"]=[a for a in (AXIS_ROTATIONS if s["rotation"]=="orthogonal" else ["XYZ"]) if a in allowed]
        if not item["effective_rotations"]:
            raise ProblemError("全局旋转模式与箱体允许朝向没有交集。")
    if sum(i["quantity"] for i in items)>500:
        raise ProblemError("单次任务最多500件箱体。")
    volume=lambda x:x["width"]*x["height"]*x["depth"]
    if volume(stock)*p["effective_stock_copies"]>=2**62 or sum(volume(i)*i["quantity"] for i in items)>=2**62:
        raise ProblemError("体积总量超出整数求解器安全范围，请统一缩小坐标单位。")
    p["name"]=str(p.get("name","三维装箱问题"))[:180]
    p["unit"]=str(p.get("unit","未指定单位"))[:60]
    return p


def _finite(value):
    return not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value)


def validate_box_result(problem,result):
    p=normalize_box_problem(problem)
    source={str(i["id"]):i for i in p["items"]};required=Counter({str(i["id"]):i["quantity"] for i in p["items"]})
    counts=Counter();errors=[];tol=1e-7
    totalvolume=0;bins=result.get("bins",[])
    if not isinstance(bins,list):
        return {"pass":False,"geometry_pass":False,"full_demand":False,"errors":["结果bins不是列表。"]}
    if len(bins)>p["effective_stock_copies"]:
        errors.append("使用容器数量超过可用数量。")
    for b in bins:
        for key in ("width","height","depth"):
            if not _finite(b.get(key)) or abs(b[key]-p["stock"][key])>tol:
                errors.append("结果容器尺寸与输入不一致。")
        placed=[]
        bin_weight=0
        for item in b.get("items",[]):
            ident=str(item.get("id"));counts[ident]+=1
            if ident not in source:
                errors.append("结果包含未知箱体。");continue
            if any(not _finite(item.get(k)) for k in ("x","y","z","width","height","depth")):
                errors.append("箱体位置或尺寸不是有限数字。");continue
            if any(item[k]<=0 for k in ("width","height","depth")):
                errors.append("箱体尺寸必须为正。");continue
            original=source[ident];rotation=item.get("rotation")
            bin_weight += original["weight"]
            if rotation not in original["effective_rotations"]:
                errors.append(f"箱体 {ident} 朝向不符合约束。")
            else:
                dims=dict(X=original["width"],Y=original["height"],Z=original["depth"])
                if any(abs(item[k]-dims[a])>tol for k,a in zip(("width","height","depth"),rotation)):
                    errors.append(f"箱体 {ident} 尺寸与原尺寸轴置换不符。")
            for axis,size in (("x","width"),("y","height"),("z","depth")):
                if item[axis]<-tol or item[axis]+item[size]>p["stock"][size]+tol:
                    errors.append(f"箱体 {ident} 超出容器边界。")
            for other in placed:
                extents=[min(item[a]+item[k],other[a]+other[k])-max(item[a],other[a]) for a,k in (("x","width"),("y","height"),("z","depth"))]
                if all(v>tol for v in extents):
                    errors.append("箱体存在正体积重叠。")
            placed.append(item)
            totalvolume+=item["width"]*item["height"]*item["depth"]
        maximum_weight=p["stock"].get("maximum_weight")
        if maximum_weight is not None and bin_weight > maximum_weight + max(1e-8, maximum_weight*1e-9):
            errors.append("容器总重量超过上限。")
    if any(counts[k]>required.get(k,0) for k in counts):
        errors.append("箱体放置数量超过需求。")
    geometry_pass=not errors;full=counts==required
    if p["settings"]["objective"]!="knapsack" and not full:
        errors.append("尚未装入全部需求箱体。")
    return {"pass":not errors,"geometry_pass":geometry_pass,"full_demand":full,
            "errors":list(dict.fromkeys(errors)),"placed_counts":dict(counts),"required_counts":dict(required),
            "total_item_volume_checked":totalvolume,"coordinate_tolerance":tol,
            "checks":["quantity","container bounds","positive-volume overlap","axis-permutation orientation","original dimensions","container total weight"],
            "scope":"独立三维长方体几何与容器总重量校验；不包含重力稳定性、局部堆叠承重、装卸顺序或全局最优证明。"}


def solve_box(problem,output_dir):
    import packingsolver.box as mod
    from engine import _dump,_clean
    p=normalize_box_problem(problem);out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
    _dump(out/"problem_normalized.json",p)
    start=time.perf_counter();s=p["settings"];stock=p["stock"]
    builder=mod.InstanceBuilder()
    builder.set_objective(mod.Objective.BinPacking if s["objective"]=="bins" else mod.Objective.Knapsack)
    builder.add_bin_type(stock["width"],stock["height"],stock["depth"],copies=p["effective_stock_copies"],maximum_weight=stock.get("maximum_weight"))
    for item in p["items"]:
        builder.add_item_type(item["width"],item["height"],item["depth"],copies=item["quantity"],profit=item["profit"],weight=item["weight"],rotations=[getattr(mod.Rotation,a) for a in item["effective_rotations"]])
    instance=builder.build();instance.write(str(out/"solver_instance.json"))
    params=mod.OptimizeParameters();params.time_limit=s["time_limit"];params.verbosity_level=0;params.memory_limit_megabytes=2048
    from progress import ProgressRecorder
    progress=ProgressRecorder(out,"box","csv")
    params.new_solution_callback=progress
    try:
        answer=mod.optimize(instance,params)
    except BaseException:
        progress.finish(failed=True)
        raise
    else:
        progress.finish()
    certificate=out/"solver_solution.csv";answer.solution.write(str(certificate))
    groups={}
    with certificate.open(encoding="utf-8",newline="") as f:
        for row in csv.DictReader(f):
            if row["TYPE"]=="BIN":groups[row["BIN"]]={"copies":int(row["COPIES"]),"items":[]}
            elif row["TYPE"]=="ITEM":groups[row["BIN"]]["items"].append(row)
    bins=[]
    for group in groups.values():
        for _ in range(group["copies"]):
            b={"index":len(bins),"width":stock["width"],"height":stock["height"],"depth":stock["depth"],"items":[]}
            for row in group["items"]:
                if int(row["COPIES"]) not in {1,group["copies"]}:
                    raise RuntimeError("箱体证书复制数与容器模式复制数不一致。")
                original=p["items"][int(row["ID"])];part={"id":original["id"],"name":original["name"],"rotation":row["ROTATION"],"weight":original["weight"]}
                for key,column in (("x","X"),("y","Y"),("z","Z"),("width","LX"),("height","LY"),("depth","LZ")):
                    part[key]=int(row[column])
                b["items"].append(part)
            b["total_weight"]=sum(i["weight"] for i in b["items"])
            b["maximum_weight"]=stock.get("maximum_weight")
            if b["items"]:bins.append(b)
    elapsed=time.perf_counter()-start
    volume=lambda i:i["width"]*i["height"]*i["depth"]
    totalvolume=sum(volume(i) for b in bins for i in b["items"])
    stockvolume=len(bins)*volume(stock)
    byid={str(i["id"]):i for i in p["items"]}
    placed=sum(len(b["items"]) for b in bins);required=sum(i["quantity"] for i in p["items"])
    result={"kind":"box","engine":"box","objective":s["objective"],"units":p["unit"],"elapsed_s":elapsed,
            "full":placed==required,"feasible":bool(answer.solution.feasible()),
            "metrics":{"required_pieces":required,"placed_pieces":placed,"bin_count":len(bins),
                       "total_item_volume":totalvolume,"total_stock_volume":stockvolume,
                       "total_item_weight":sum(b["total_weight"] for b in bins),
                       "utilization_percent":100*totalvolume/stockvolume if stockvolume else 0,
                       "profit":sum(byid[str(i["id"])]["profit"] for b in bins for i in b["items"])},
            "bins":bins,"solver_statistics":_clean(answer.solution.to_json()),
            "engine_version":importlib.metadata.version("packingsolver"),
            "config":{"kind":"box","engine":"box","objective":s["objective"],"settings":deepcopy(s),"stock":deepcopy(stock),"effective_stock_copies":p["effective_stock_copies"]},
            "warnings":["真实三维轴对齐长方体装箱，可限制容器总重量；未接入重力稳定性、局部堆叠承重或装卸顺序。重量输入须使用同一单位。","单次限时启发式结果，未证明全局最优。"]}
    result["validation"]=validate_box_result(p,result)
    result["full"]=result["validation"]["full_demand"]
    result["feasible"]=result["feasible"] and result["validation"]["geometry_pass"]
    if not result["full"]:
        result["warnings"].append("背包目标允许只选择部分箱体。" if s["objective"]=="knapsack" else "尚未装完全部需求，请增加容器数量或求解时限。")
    _dump(out/"result.json",result)
    return result

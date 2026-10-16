"""Real solver smoke matrix, negative gates, and independent-check sabotage."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from engine import solve, normalize_problem, validate_result, ProblemError


def base(kind, engine, objective="bins"):
    p={"id":"smoke","name":"engine validation","kind":kind,"unit":"mm",
       "stock":{"width":100,"height":60 if kind!="onedimensional" else 1,"copies":10},
       "items":[],"settings":{"engine":engine,"objective":objective,"rotation":"source","time_limit":1},"defects":[]}
    for n,(w,h,q) in enumerate([(30,20,4),(45,30,2)]):
        item={"id":n,"name":str(n),"quantity":q,"profit":w*h,"allowed_rotations":[0,90] if kind!="onedimensional" else [0]}
        if kind=="rectangle":item.update(width=w,height=h)
        elif kind=="onedimensional":item.update(length=w)
        else:item["polygon"]=[[0,0],[w,0],[w,h],[w/2,h],[w/2,h/2],[0,h/2]]
        p["items"].append(item)
    return p


def main():
    out=Path(tempfile.mkdtemp(prefix="cutting-engine-smoke-"));records=[];last=None
    cases=[]
    for eng,kind,objs in [
        ("irregular","irregular",["strip","bins","knapsack"]),
        ("rectangle","rectangle",["strip","bins","knapsack"]),
        ("guillotine","rectangle",["bins","knapsack"]),
        ("onedimensional","onedimensional",["bins","knapsack"]),
        ("shelf","irregular",["strip","bins"]),
        ("rectpack-maxrects","rectangle",["bins"]),
        ("rectpack-skyline","rectangle",["bins"])]:
        for obj in objs:
            p=base(kind,eng,obj)
            if obj=="strip":p["stock"]["width"]=300
            if obj=="knapsack":p["stock"]["width"]=55
            if eng=="guillotine":p["settings"]["kerf"]=2
            cases.append((eng+"_"+obj,p))
    for rotation in ["none","half","quarter","custom","continuous"]:
        p=base("irregular","irregular","strip");p["stock"]["width"]=300
        p["settings"].update(rotation=rotation,custom_angles=[15,105,195,285])
        cases.append(("rotation_"+rotation,p))
    for eng in ["irregular","rectangle","guillotine"]:
        p=base("irregular" if eng=="irregular" else "rectangle",eng)
        p["defects"]=[dict(x=40,y=15,width=10,height=15)]
        if eng=="irregular":p["settings"].update(spacing=1,edge=2)
        if eng=="guillotine":p["settings"].update(kerf=2,first_cut="horizontal")
        cases.append((eng+"_defects",p))
    for eng in ["irregular","rectangle","guillotine","onedimensional"]:
        p=base("onedimensional" if eng=="onedimensional" else ("irregular" if eng=="irregular" else "rectangle"),eng)
        p["items"]=p["items"][:1];p["items"][0]["quantity"]=18
        if eng=="guillotine":p["settings"]["kerf"]=2
        cases.append((eng+"_repeated_bins",p))
    p=base("rectangle","rectangle")
    for i in p["items"]:i["allowed_rotations"]=[90]
    cases.append(("rectangle_only_90",p))
    for name,p in cases:
        try:
            result=solve(p,out/name)
            good=result["validation"]["pass"] and result["feasible"]
            if p["settings"]["objective"]!="knapsack":good=good and result["full"]
            record={"name":name,"pass":good,"full":result["full"],"metrics":result["metrics"],"errors":result["validation"]["errors"]}
            if name=="rectangle_bins":last=(p,result)
        except Exception as exc:
            record={"name":name,"pass":False,"error":repr(exc)}
        records.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
    negative=[]
    for name,p in [
        ("1d_kerf",base("onedimensional","onedimensional")),
        ("rectangle_spacing",base("rectangle","rectangle")),
        ("continuous_rectangle",base("rectangle","rectangle")),
        ("fractional_rectangle",base("rectangle","rectangle")),
        ("shelf_defect",base("rectangle","shelf")),
        ("rectpack_heterogeneous",base("rectangle","rectpack-maxrects")),
        ("irregular_stock",base("irregular","irregular")),
        ("mirrored_piece",base("irregular","irregular")),
        ("mirrored_settings",base("irregular","irregular"))]:
        if name=="1d_kerf":p["settings"]["kerf"]=1
        elif name=="rectangle_spacing":p["settings"]["spacing"]=1
        elif name=="continuous_rectangle":p["settings"]["rotation"]="continuous"
        elif name=="fractional_rectangle":p["items"][0]["width"]=30.5
        elif name=="shelf_defect":p["defects"]=[dict(x=5,y=5,width=10,height=10)]
        elif name=="rectpack_heterogeneous":p["items"][0]["allowed_rotations"]=[0]
        elif name=="irregular_stock":p["stock"]["polygon"]=[[0,0],[10,0],[0,10]]
        elif name=="mirrored_piece":p["items"][0]["allow_mirror"]=True
        else:p["settings"]["mirror"]=True
        try:
            normalize_problem(p);good=False
        except ProblemError:
            good=True
        negative.append({"name":name,"pass":good})
    sabotage=[]
    if last:
        p,r=last
        bad=deepcopy(r);bad["bins"][0]["items"].append(deepcopy(bad["bins"][0]["items"][0]))
        sabotage.append({"name":"duplicate_overlap","pass":not validate_result(p,bad)["pass"]})
        bad=deepcopy(r);bad["bins"][0]["items"][0]["angle"]=33
        sabotage.append({"name":"wrong_angle","pass":not validate_result(p,bad)["pass"]})
        bad=deepcopy(r);bad["bins"][0]["items"][0]["polygon"]=[[x+1000,y] for x,y in bad["bins"][0]["items"][0]["polygon"]]
        sabotage.append({"name":"out_of_bounds","pass":not validate_result(p,bad)["pass"]})
    summary={"pass":all(x["pass"] for x in records+negative+sabotage),"runs":records,"negative_gates":negative,"validator_sabotage":sabotage,"output_dir":str(out)}
    dest=Path(__file__).parent/"engine_smoke_results.json";dest.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print("SMOKE",summary["pass"],dest,flush=True)
    if not summary["pass"]:raise SystemExit(1)


if __name__=="__main__":main()

"""Real 3D solve matrix plus independent-validator tampering checks."""
from copy import deepcopy
import json
from pathlib import Path
from engine import solve,normalize_problem,validate_result,ProblemError

ROOT=Path(__file__).resolve().parent


def base(objective="bins",rotation="orthogonal"):
    return {"id":"box-test","name":"3D test","kind":"box","unit":"mm",
            "stock":{"width":100,"height":60,"depth":50,"copies":20},
            "items":[{"id":0,"name":"A","width":40,"height":30,"depth":20,"quantity":12,"profit":3},
                     {"id":1,"name":"B","width":20,"height":20,"depth":20,"quantity":4,"profit":1}],
            "settings":{"engine":"box","objective":objective,"rotation":rotation,"time_limit":1},"defects":[]}


def main():
    cases=[]
    cases.append(("bins",base()))
    cases.append(("no_rotation",base(rotation="none")))
    p=base("knapsack");p["stock"].update(width=50,height=40,depth=30);cases.append(("knapsack",p))
    p=base();p["stock"].update(width=40,height=70,depth=30)
    p["items"]=[dict(id=0,name="must rotate",width=70,height=40,depth=30,quantity=1,profit=1)]
    cases.append(("rotation_required",p))
    p=base();p["items"]=p["items"][:1];p["items"][0]["quantity"]=48;cases.append(("repeated_containers",p))
    p=base();p["items"]=p["items"][:1];p["items"][0]["allowed_rotations"]=["YZX"]
    cases.append(("per_item_orientation",p))
    results=[];reference=None
    for name,p in cases:
        try:
            r=solve(p,ROOT/"engine_box_smoke_output"/name)
            good=r["validation"]["pass"] and r["feasible"] and (r["full"] or p["settings"]["objective"]=="knapsack")
            record={"name":name,"pass":good,"full":r["full"],"feasible":r["feasible"],"metrics":r["metrics"],"errors":r["validation"]["errors"]}
            if name=="bins":reference=(p,r)
        except Exception as exc:
            record={"name":name,"pass":False,"error":repr(exc)}
        results.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
    gates=[]
    for name in ["continuous_rotation","positive_spacing","positive_edge","positive_kerf","defects","fractional_size","2d_polygon","wrong_rotations","over_quantity","stock_depth_missing","weights","conflicting_rotations"]:
        p=base()
        if name=="continuous_rotation":p["settings"]["rotation"]="continuous"
        elif name.startswith("positive_"):p["settings"][name[9:]]=1
        elif name=="defects":p["defects"]=[dict(x=0,y=0,width=10,height=10)]
        elif name=="fractional_size":p["items"][0]["depth"]=20.5
        elif name=="2d_polygon":p["items"][0]["polygon"]=[[0,0],[10,0],[0,10]]
        elif name=="wrong_rotations":p["items"][0]["allowed_rotations"]=[0,90]
        elif name=="over_quantity":p["items"][0]["quantity"]=501
        elif name=="stock_depth_missing":del p["stock"]["depth"]
        elif name=="weights":p["items"][0]["weight"]=-1
        else:p["settings"]["rotation"]="none";p["items"][0]["allowed_rotations"]=["YZX"]
        try:normalize_problem(p);passed=False
        except ProblemError:passed=True
        gates.append({"name":name,"pass":passed})
    sabotage=[]
    if reference:
        p,r=reference
        for name in ["overlap","out_of_bounds","false_rotation","wrong_dimensions","over_quantity","nonfinite","missing_demand"]:
            bad=deepcopy(r);items=bad["bins"][0]["items"]
            if name=="overlap":
                for a in ("x","y","z"):items[1][a]=items[0][a]
            elif name=="out_of_bounds":items[0]["z"]=1000
            elif name=="false_rotation":items[0]["rotation"]="XXX"
            elif name=="wrong_dimensions":items[0]["depth"]+=1
            elif name=="over_quantity":items.append(deepcopy(items[0]))
            elif name=="nonfinite":items[0]["x"]=float("nan")
            else:items.pop()
            check=validate_result(p,bad);sabotage.append({"name":name,"pass":not check["pass"],"errors":check["errors"]})
    summary={"pass":all(i["pass"] for i in results+gates+sabotage),"runs":results,"negative_gates":gates,"validator_sabotage":sabotage}
    (ROOT/"engine_box_smoke_results.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print("BOX SMOKE",summary["pass"],flush=True)
    if not summary["pass"]:raise SystemExit(1)


if __name__=="__main__":main()

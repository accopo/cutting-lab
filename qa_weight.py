"""Regression: volume fits, total payload does not; use real box solver."""
from copy import deepcopy
import json
from pathlib import Path
from engine_box import solve_box, normalize_box_problem, validate_box_result
from engine import ProblemError

ROOT = Path(__file__).resolve().parent
p = {"kind": "box", "unit": "mm", "stock": {"width": 100, "height": 100, "depth": 100, "copies": 4, "maximum_weight": 10},
     "items": [{"id": 0, "name": "重箱", "width": 20, "height": 20, "depth": 20, "quantity": 2, "weight": 6}],
     "settings": {"engine": "box", "objective": "bins", "rotation": "none", "time_limit": 1}}
rows = []
weighted = solve_box(p, ROOT/"qa"/"weight_output"/"weighted")
assert weighted["validation"]["pass"] and weighted["metrics"]["bin_count"] == 2
rows.append({"case": "weight_requires_two_bins", "pass": True, "metrics": weighted["metrics"]})
unweighted = deepcopy(p); unweighted["stock"].pop("maximum_weight")
plain = solve_box(unweighted, ROOT/"qa"/"weight_output"/"unweighted")
assert plain["validation"]["pass"] and plain["metrics"]["bin_count"] == 1
rows.append({"case": "same_geometry_without_capacity_uses_one_bin", "pass": True, "metrics": plain["metrics"]})
tampered = deepcopy(plain)
for b in tampered["bins"]:
    b["total_weight"] = 0
    for item in b["items"]: item["weight"] = 0
check = validate_box_result(p, tampered)
assert not check["pass"] and "容器总重量超过上限。" in check["errors"]
rows.append({"case": "validator_recomputes_weight_from_input", "pass": True})
for name, value in [("negative_weight", -1), ("zero_weight_with_capacity", 0), ("missing_weight_with_capacity", None)]:
    bad = deepcopy(p)
    if value is None: bad["items"][0].pop("weight")
    else: bad["items"][0]["weight"] = value
    try: normalize_box_problem(bad)
    except ProblemError: rows.append({"case": name, "pass": True})
    else: raise AssertionError(name)
alias = deepcopy(p); alias["stock"]["weight_capacity"] = alias["stock"].pop("maximum_weight")
assert normalize_box_problem(alias)["stock"]["maximum_weight"] == 10
rows.append({"case": "capacity_alias", "pass": True})
(ROOT/"qa"/"weight_results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"passed": len(rows), "results": rows}, ensure_ascii=False))

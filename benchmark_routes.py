"""Same-instance comparison; raw evidence retained, no industrial claims."""
from copy import deepcopy
import json
from pathlib import Path
from catalog import get_all, scenario_fingerprint
from engine import solve, normalize_problem

ROOT=Path(__file__).resolve().parent
source=get_all()['paper-layout']
source['settings'].update(objective='bins',rotation='quarter',spacing=0,edge=0,kerf=0,time_limit=1)
records=[]
for route in ['rectangle','rectpack-maxrects','rectpack-skyline']:
    problem=deepcopy(source);problem['settings']['engine']=route
    result=solve(problem,ROOT/'qa'/'rectangle_output'/route)
    assert result['validation']['pass'], result['validation']
    records.append({'route':route,'instance_fingerprint':scenario_fingerprint(normalize_problem(problem)),
                    'budget_s':1,'actual_s':result['elapsed_s'],'metrics':result['metrics'],
                    'validation':result['validation'],'engine_version':result['engine_version']})
assert len({r['instance_fingerprint'] for r in records}) == 1
report={'date':'2026-10-16','scenario_id':'paper-layout','source_kind':'synthetic','input':source,
        'method':'同一材料、数量、允许方向、无额外间距/刀缝/疵点。均允许最多1秒；确定性构造算法完成即返回。',
        'limitations':['仅一组合成实例及单次运行，不能据此推广算法排名或工业收益。',
                       '没有加入贯通算法，因贯通约束会改变可行域；不能与自由矩形摆放混作同一问题。'],
        'results':records}
out=ROOT/'static'/'reports';out.mkdir(parents=True,exist_ok=True)
(out/'rectangle_comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'route':r['route'],'bins':r['metrics']['bin_count'],'pieces':r['metrics']['placed_pieces'],
                   'utilization':r['metrics']['utilization_percent'],'valid':r['validation']['pass']} for r in records],ensure_ascii=False))

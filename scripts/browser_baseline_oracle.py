"""Produce deterministic Python baseline oracle; no optimizer or network used."""
from pathlib import Path
import json, random, sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine import normalize_problem,_rectpack,_shelf
from engine_1d import solve_kerf_1d
from catalog import get_all

def main():
    rng=random.Random(920);out=[]
    for e in ['rectpack-maxrects','rectpack-skyline']:
        for seed in range(20):
            p={'id':'oracle','name':'oracle','kind':'rectangle','stock':{'width':100,'height':80,'copies':30},'items':[{'id':i,'name':str(i),'width':rng.randint(5,75),'height':rng.randint(5,65),'quantity':rng.randint(1,3),'allowed_rotations':[0,90]} for i in range(12)],'settings':{'engine':e,'objective':'bins','rotation':'source','time_limit':10}}
            p=normalize_problem(p);bins,*_=_rectpack(p);out.append({'problem':p,'bins':bins})
    for id,e in [('shirts','shelf'),('metal-parts','shelf'),('bar-stock-kerf','ffd-1d'),('bar-stock-kerf','bfd-1d')]:
        p=get_all()[id];p['settings']['engine']=e;p=normalize_problem(p)
        bins,*_=(_shelf(p) if e=='shelf' else solve_kerf_1d(p,ROOT/'test-artifacts/browser/oracle'))
        out.append({'problem':p,'bins':bins})
    target=ROOT/'test-artifacts/browser/baseline-oracle.json';target.parent.mkdir(exist_ok=True,parents=True);target.write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8');print(f'{len(out)} Python baseline cases exported')
if __name__=='__main__':main()

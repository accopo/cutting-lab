"""Audit distributed public inputs without downloading data or running a solver."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from catalog import catalog, get_all

PUBLIC = ('albano', 'dagli', 'shirts', 'swim', 'trousers')

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def audit(root=ROOT):
    manifest=json.loads((root/'data/download_manifest.json').read_text(encoding='utf-8'))
    sources={item['local_path']:item for item in manifest['files']}
    browser_path=root/'static/vendor/browser-data.json'
    browser=json.loads(browser_path.read_text(encoding='utf-8'))
    expected=get_all()
    for value in expected.values():
        value['source']['derived']=False
        value['source']['scenario_label']='原始实例参数'
    if browser.get('datasets')!=expected or browser.get('catalog')!=catalog():
        raise ValueError('browser-data.json differs from the current public/synthetic catalog; regenerate it before publication')
    entries=[]
    for name in PUBLIC:
        path=root/'data/normalized'/f'{name}.json'
        normalized=json.loads(path.read_text(encoding='utf-8'))
        source=sources[normalized['source_path']]
        if source['sha256']!=normalized['source_sha256'] or source['commit']!=normalized['source_commit']:
            raise ValueError(f'{name}: normalized source provenance differs from download receipt')
        p=browser['datasets'][name]
        if len(normalized['items'])!=len(p['items']):
            raise ValueError(f'{name}: item count mismatch')
        for original,display in zip(normalized['items'],p['items']):
            if original['points']!=display['polygon'] or original['demand']!=display['quantity'] or original['allowed_rotations_deg']!=display['allowed_rotations']:
                raise ValueError(f'{name}: geometry, demand or directions changed')
        entries.append({'id':name,'distributed_normalized_path':path.relative_to(root).as_posix(),
                        'distributed_normalized_sha256':sha256(path),'distributed_normalized_bytes':path.stat().st_size,
                        'upstream_format':'ESICUP XML','upstream_commit':source['commit'],
                        'upstream_url':source['url'],'upstream_sha256':source['sha256'],
                        'upstream_raw_bundled':False,'types':len(normalized['items']),
                        'required_pieces':sum(i['demand'] for i in normalized['items']),
                        'physical_unit':'unspecified benchmark coordinate units',
                        'variant':'XML integer coordinates' if name=='swim' else 'ESICUP XML variant'})
    counts={kind:sum(p['source']['kind']==kind for p in browser['datasets'].values()) for kind in ('public-benchmark','synthetic')}
    if sum(counts.values())!=len(browser['datasets']):
        raise ValueError('Browser sample bundle contains a non-public/non-synthetic source')
    return {'schema_version':1,'distribution':'normalized ESICUP XML-derived inputs and explicitly synthetic scenarios',
            'raw_sources_bundled':False,'historical_manifest':'data/download_manifest.json',
            'historical_manifest_role':'Source retrieval receipt only; raw relative paths are not files shipped in this release.',
            'browser_bundle':{'path':browser_path.relative_to(root).as_posix(),'sha256':sha256(browser_path),'bytes':browser_path.stat().st_size,'counts':counts},
            'public_inputs':entries,'checks':{'matches_current_catalog':True,'source_receipts_match':True,'geometry_demand_directions_preserved':True,'user_jobs_in_sample_bundle':False}}

if __name__=='__main__':
    receipt=audit()
    out=ROOT/'data/distribution_source_audit.json'
    out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'audit':str(out.relative_to(ROOT)),'public_inputs':len(receipt['public_inputs']),**receipt['browser_bundle']['counts']},ensure_ascii=False))

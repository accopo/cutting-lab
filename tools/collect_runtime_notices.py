"""Retrieve license texts from pinned upstream source repositories via gh."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import base64, hashlib, json, subprocess

DEST = Path(__file__).resolve().parents[1] / 'static/vendor/packingsolver/dependency-licenses'
SOURCES = [
 ('optimizationtools','fontanf/optimizationtools','7e29ad3e2dab11a44887fbcc9382188c5d0ead12','LICENSE'),
 ('shape','fontanf/shape','04409204e5eac77bd95bc1b004b9d86641d01ef5','LICENSE'),
 ('highs','ERGO-Code/HiGHS','v1.13.1','LICENSE.txt'),
 ('mathoptsolverscmake','fontanf/mathoptsolverscmake','358904e29889b129ec2f733866abd8d18f7a4978','LICENSE'),
 ('knapsacksolver','fontanf/knapsacksolver','605153f85b0781ae0c2b7548a18639ef77d25c09','LICENSE'),
 ('multiplechoicesubsetssumsolver','fontanf/multiplechoicesubsetsumsolver','83406f59044425aef1391030db0b29333c208d7f','LICENSE'),
 ('subsetsumsolver','fontanf/subsetsumsolver','2ba9d52e87cf01d0dd80df082db5539d5d5850b8','LICENSE'),
 ('treesearchsolver','fontanf/treesearchsolver','b7254420989dd804144d16b898f323f1d606dda4','LICENSE'),
 ('columngenerationsolver','fontanf/columngenerationsolver','091ee511c51352076974e62c85aed046f83e401a','LICENSE'),
 ('nlohmann-json','nlohmann/json','v3.11.3','LICENSE.MIT'),
 ('emscripten','emscripten-core/emscripten','6.0.11','LICENSE'),
 ('mimalloc','emscripten-core/emscripten','6.0.11','system/lib/mimalloc/LICENSE'),
]

def fetch(row):
    name, repo, ref, path = row
    target=DEST/(name+'.txt')
    if target.exists():
        content=target.read_bytes()
    else:
        proc = subprocess.run(['gh','api',f'repos/{repo}/contents/{path}?ref={ref}'],capture_output=True,check=True)
        content=base64.b64decode(json.loads(proc.stdout)['content'])
        target.write_bytes(content)
    return dict(name=name,repository=repo,ref=ref,path=path,sha256=hashlib.sha256(content).hexdigest())

if __name__=='__main__':
    DEST.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(fetch,SOURCES))
    (DEST/'manifest.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps({'licenses':len(results),'destination':str(DEST.relative_to(DEST.parents[3]))}))

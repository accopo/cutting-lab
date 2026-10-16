"""Assemble audited public assets; never copy local jobs or raw research downloads."""
from pathlib import Path
import hashlib
import json
import shutil
from scripts.audit_distribution import audit

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
DIST = ROOT / 'dist'
REQUIRED = [
    'index.html', 'app.js', 'styles.css', 'browser-runtime.js', 'solver-worker.js',
    'report-ui.js', 'report-ui.css', 'editor-2d.js', 'editor-2d.css',
    'workspace-3d.js', 'workspace-3d.css', 'viewer-3d.js', 'viewer-3d.css',
    'coi-config.js', 'coi-serviceworker.js', 'vendor/browser-data.json',
    'reports/industry_reports.json', 'reports/software_catalog.json', 'reports/rectangle_comparison.json',
    'vendor/cutting-geometry.js', 'vendor/polygon-clipping-0.15.7/polygon-clipping.umd.js',
    'vendor/robust-predicates-3.0.2/orient2d.js', 'vendor/three-0.180.0/three.module.js',
    'vendor/three-0.180.0/three.core.js', 'vendor/three-0.180.0/OrbitControls.js',
    'vendor/packingsolver/packingsolver.js', 'vendor/packingsolver/packingsolver.wasm',
    'vendor/packingsolver/packingsolver_worker.js', 'vendor/packingsolver/SHA256SUMS',
    'vendor/packingsolver/LICENSE', 'vendor/packingsolver/dependency-licenses/manifest.json',
    'vendor/rectpack-LICENSE', 'vendor/rectpack-provenance.json',
    'vendor/polygon-clipping-0.15.7/LICENSE.md', 'vendor/polygon-clipping-0.15.7/SPLAYTREE-LICENSE.txt',
    'vendor/polygon-clipping-0.15.7/ROBUST-PREDICATES-LICENSE.txt', 'vendor/polygon-clipping-0.15.7/APACHE-2.0.txt',
    'vendor/robust-predicates-3.0.2/LICENSE', 'vendor/three-0.180.0/LICENSE',
    'vendor/coi-serviceworker/LICENSE',
]
PUBLIC_TEXT = [
    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'data/LICENSE-ESICUP',
    'data/SOURCE_AUDIT.md', 'data/DISTRIBUTION_SOURCE_AUDIT.md',
    'data/download_manifest.json',
]

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_solver(static):
    folder=static/'vendor/packingsolver'
    for line in (folder/'SHA256SUMS').read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        expected,name=line.split(maxsplit=1)
        file=folder/name.lstrip('* ')
        if file.resolve().parent!=folder.resolve() or not file.is_file() or sha256(file)!=expected:
            raise ValueError('Vendored solver hash mismatch: '+name)
    if (folder/'packingsolver.wasm').read_bytes()[:8]!=b'\x00asm\x01\x00\x00\x00':
        raise ValueError('Invalid WASM module header')
    for dependency in json.loads((folder/'dependency-licenses/manifest.json').read_text(encoding='utf-8')):
        file=folder/'dependency-licenses'/f"{dependency['name']}.txt"
        if not file.is_file() or sha256(file)!=dependency['sha256']:
            raise ValueError('Missing/changed dependency license: '+dependency['name'])

def build():
    missing=[str(STATIC/name) for name in REQUIRED if not (STATIC/name).is_file()]
    missing += [str(ROOT/name) for name in PUBLIC_TEXT if not (ROOT/name).is_file()]
    if missing:
        raise ValueError('Missing publication assets: '+', '.join(missing))
    verify_solver(STATIC)
    receipt=audit(ROOT)
    sources=[]
    for source in sorted(STATIC.rglob('*')):
        relative=source.relative_to(STATIC)
        if 'package' in relative.parts or source.suffix in {'.tgz','.map'}:
            continue
        if source.is_symlink():
            raise ValueError('Symlinks are not accepted as publication assets: '+str(relative))
        if not source.is_file():
            continue
        if any(part in {'jobs','raw','.git','node_modules'} for part in relative.parts) or source.name.startswith('.env'):
            raise ValueError('Private/research-only path in static publication source: '+str(relative))
        sources.append((source,relative))
    sources.extend((ROOT/name,Path(name)) for name in PUBLIC_TEXT)
    sources.extend((ROOT/item['distributed_normalized_path'],Path(item['distributed_normalized_path'])) for item in receipt['public_inputs'])
    for source,_ in sources:
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError('Publication source escapes project: '+str(source))
    if DIST.exists():
        if DIST.is_symlink() or DIST.resolve().parent!=ROOT.resolve() or DIST.name!='dist':
            raise ValueError('Refusing to clean a directory outside this project')
        shutil.rmtree(DIST)
    DIST.mkdir()
    files=[]
    for source,relative in sources:
        target=DIST/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        files.append({'path':relative.as_posix(),'bytes':target.stat().st_size,'sha256':sha256(target)})
    audit_path=DIST/'data/distribution_source_audit.json'
    audit_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    files.append({'path':'data/distribution_source_audit.json','bytes':audit_path.stat().st_size,'sha256':sha256(audit_path)})
    (DIST/'.nojekyll').write_text('',encoding='utf-8')
    manifest={'schema_version':1,'runtime':'browser-webassembly','source_scope':'static assets + explicit public documentation and normalized data allowlist',
              'includes_jobs':False,'includes_raw_research_downloads':False,'files':files}
    (DIST/'build-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'output':'dist','files':len(files)+2,'bytes':sum(f['bytes'] for f in files),
                      'includes_jobs':False,'includes_raw_research_downloads':False,'runtime':'browser-webassembly'}))
    return manifest

if __name__=='__main__':
    build()

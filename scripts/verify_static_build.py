"""Read-only verification of the assembled static publication package."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import sys
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]

class References(HTMLParser):
    def __init__(self):super().__init__();self.paths=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('src'):self.paths.append(attrs['src'])
        if tag=='link' and attrs.get('href'):self.paths.append(attrs['href'])

def verify(folder):
    folder=Path(folder).resolve()
    manifest=json.loads((folder/'build-manifest.json').read_text(encoding='utf-8'))
    if manifest['includes_jobs'] or manifest['includes_raw_research_downloads']:raise ValueError('Private artifacts declared in package')
    for row in manifest['files']:
        path=folder/row['path']
        if not path.resolve().is_relative_to(folder) or not path.is_file():raise ValueError('Missing/escaping asset: '+row['path'])
        if len(path.read_bytes())!=row['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Changed distribution asset: '+row['path'])
    for path in folder.rglob('*'):
        relative=path.relative_to(folder)
        if any(part in {'jobs','raw','.git','node_modules','test-artifacts'} for part in relative.parts) or path.name.startswith('.env'):raise ValueError('Unexpected private/research artifact: '+relative.as_posix())
    parser=References();parser.feed((folder/'index.html').read_text(encoding='utf-8'))
    for ref in parser.paths:
        parsed=urlsplit(ref)
        if parsed.scheme or parsed.netloc or not parsed.path:continue
        if parsed.path.startswith('/'):raise ValueError('Root-absolute entry asset breaks project Pages path: '+ref)
        if not (folder/parsed.path).is_file():raise ValueError('Missing entry asset: '+ref)
    for name in ['LICENSE','THIRD_PARTY_NOTICES.md','data/LICENSE-ESICUP','data/DISTRIBUTION_SOURCE_AUDIT.md','data/distribution_source_audit.json','.nojekyll']:
        if not (folder/name).is_file():raise ValueError('Missing public notice: '+name)
    receipt=json.loads((folder/'data/distribution_source_audit.json').read_text(encoding='utf-8'))
    for row in receipt['public_inputs']:
        if hashlib.sha256((folder/row['distributed_normalized_path']).read_bytes()).hexdigest()!=row['distributed_normalized_sha256']:raise ValueError('Normalized input hash mismatch')
    bundle=receipt['browser_bundle'];path=folder/bundle['path'].removeprefix('static/')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=bundle['sha256']:raise ValueError('Browser sample hash mismatch')
    return {'verified_files':len(manifest['files']),'entry_references':len(parser.paths),'public_inputs':len(receipt['public_inputs']),'private_artifacts':False}

if __name__=='__main__':print(json.dumps(verify(Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist')))

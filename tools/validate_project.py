#!/usr/bin/env python3
from pathlib import Path
import re, subprocess, sys, hashlib, json
ROOT = Path(__file__).resolve().parents[1]
errors=[]
index=(ROOT/'index.html').read_text(encoding='utf-8')
refs=[]
for pat in [r'<script[^>]+src=["\']([^"\']+)', r'<link[^>]+href=["\']([^"\']+)']:
    refs += re.findall(pat,index,re.I)
for ref in refs:
    if ref.startswith(('http://','https://','//','data:')): continue
    p=(ROOT/ref.split('?',1)[0].split('#',1)[0].lstrip('./')).resolve()
    if not p.exists(): errors.append(f'Missing referenced file: {ref}')
js=list(ROOT.rglob('*.js'))
for p in js:
    r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
    if r.returncode: errors.append(f'JS syntax error: {p.relative_to(ROOT)}\n{r.stderr}')
ids=re.findall(r'\bid=["\']([^"\']+)',index,re.I)
dup=sorted({x for x in ids if ids.count(x)>1})
if dup: errors.append('Duplicate HTML ids: '+', '.join(dup))
manifest={}
manifest_path=ROOT/'docs'/'sha256-manifest.json'
for p in sorted(x for x in ROOT.rglob('*') if x.is_file() and '.git' not in x.parts and x != manifest_path):
    manifest[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
(ROOT/'docs'/'sha256-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
print(f'Checked {len(refs)} local references, {len(js)} JavaScript files, {len(ids)} HTML ids.')
if errors:
    print('\n'.join(errors),file=sys.stderr); sys.exit(1)
print('PASS: baseline validation completed successfully.')

#!/usr/bin/env python3
"""Import binary assets listed in a committed manifest (build/import/<name>.json).

The text-only API tools used to edit this repo cannot commit images, so CI downloads them from a
temporary URL given at dispatch time. Every file must match the sha256 and byte size recorded in
the manifest, so the URL itself is not trusted.

An optional "delete" list in the manifest names repo paths (files or folders) to remove in the same
commit, e.g. retired images. Only paths under assets/board/ or build/samples are accepted, never the
manifest's own dest folder; deletions run only after every download has been verified.

usage: fetch.py build/import/<name>.json https://temporary-host/path
"""
import hashlib, json, os, re, shutil, sys, urllib.request

man_path, base = sys.argv[1], sys.argv[2].strip().rstrip('/')
if not re.fullmatch(r'build/import/[a-z0-9-]+\.json', man_path):
    sys.exit('bad manifest path: ' + man_path)
if not re.fullmatch(r'https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/-]*)?', base):
    sys.exit('bad base URL')
m = json.load(open(man_path, encoding='utf-8'))
dest = m['dest']
if not re.fullmatch(r'assets/[a-z0-9-]+(/[a-z0-9-]+)*', dest):
    sys.exit('bad dest: ' + dest)
os.makedirs(dest, exist_ok=True)
for f in m['files']:
    name = f['name']
    if not re.fullmatch(r'[a-z0-9-]+\.(webp|jpg|png)', name):
        sys.exit('bad file name: ' + name)
    req = urllib.request.Request(base + '/' + name, headers={'User-Agent': 'yuchuntsai.com asset import'})
    data = urllib.request.urlopen(req, timeout=60).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != f['sha256'] or len(data) != f['bytes']:
        sys.exit(f'{name}: sha256/size mismatch (got {digest}, {len(data)} bytes)')
    with open(os.path.join(dest, name), 'wb') as out:
        out.write(data)
    print('ok', dest + '/' + name, len(data), 'bytes')

DEL_RE = r'(assets/board/[a-z0-9-]+(/[a-z0-9-]+\.(webp|jpg|png|md))?|build/samples(/[a-z0-9._-]+)?)'
dels = m.get('delete', [])
for rel in dels:  # validate the whole list before removing anything
    if not isinstance(rel, str) or not re.fullmatch(DEL_RE, rel) or rel == dest or dest.startswith(rel + '/'):
        sys.exit('bad delete path: ' + repr(rel))
for rel in dels:
    if os.path.isdir(rel):
        shutil.rmtree(rel); print('deleted folder', rel)
    elif os.path.isfile(rel):
        os.remove(rel); print('deleted file', rel)
    else:
        print('already gone', rel)

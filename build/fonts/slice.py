#!/usr/bin/env python3
"""Slice Taipei Sans TC Beta (Light + Regular) into unicode-range WOFF2 chunks.

Run once (by .github/workflows/assets.yml, or locally); the output in assets/fonts/ is committed
and served as static files, so normal deploys never re-subset:

  pip install fonttools==4.65.0 brotli==1.1.0
  python3 build/fonts/slice.py --download /tmp/ttf --out assets/fonts

Chunk boundaries: Google Fonts' frequency-based slices of Noto Sans TC, then of Noto Sans SC,
restricted to what Taipei Sans TC has; every remaining character in the font is cut into
contiguous blocks. Every codepoint in the font's cmap lands in exactly one chunk, so any text
typed in /admin is covered. The plan is saved to assets/fonts/slices.json and reused on reruns.
"""
import argparse, hashlib, json, os, re, sys, time, urllib.request
from concurrent.futures import ProcessPoolExecutor
from io import BytesIO

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

FAMILY = 'Taipei Sans TC'
# official files: JT Foundry Drive folder 1OJOOly6jo9RID3EE2f7S3N7T-8ZWPv6N (sites.google.com/view/jtfoundry)
WEIGHTS = [
    ('light', 300, 'TaipeiSansTCBeta-Light.ttf', '1QdaqR8Setf4HEulrIW79UEV_Lg_fuoWz',
     'd69a9ea6a77f694c3a1a1fb766c764aa74cb3e2c4c69f1b532edf98b3f2bb662'),
    ('regular', 400, 'TaipeiSansTCBeta-Regular.ttf', '1eGAsTN1HBpJAkeVM57_C7ccp7hbgSz3_',
     '8cc967e1e428c552701c461e8169e6ae76c7a23694ea1a6a786d6746adec53c4'),
]
NOTO = ['https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400',
        'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400']
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
REST_CHUNK = 600   # codepoints per chunk for characters outside the Noto slices
MIN_SLICE = 12     # smaller Noto TC slices are folded into the contiguous rest
SC_GROUP = 160     # leftover Noto SC slices are merged until a chunk has this many codepoints


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def download(dst):
    os.makedirs(dst, exist_ok=True)
    for _, _, name, fid, want in WEIGHTS:
        p = os.path.join(dst, name)
        for attempt in range(4):
            if os.path.exists(p) and sha256(p) == want:
                break
            url = 'https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t' % fid
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r, open(p, 'wb') as f:
                    f.write(r.read())
            except Exception as e:  # noqa: BLE001
                print('download failed (%s), retrying' % e, file=sys.stderr)
            time.sleep(3 * attempt)
        if sha256(p) != want:
            sys.exit('%s: sha256 mismatch, refusing to use it' % name)
        print('ok', name)


def parse_ranges(s):
    out = set()
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        a, _, b = part[2:].partition('-')
        out.update(range(int(a, 16), int(b or a, 16) + 1))
    return out


def google_slices():
    out = []
    for url in NOTO:
        css = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read().decode()
        out.append([parse_ranges(m) for m in re.findall(r'unicode-range:\s*([^;]+);', css)])
    return out


def to_ranges(cps):
    cps = sorted(cps)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append([cps[i], cps[j]])
        i = j + 1
    return out


def make_plan(cps):
    left, plan = set(cps), []
    tc, sc = google_slices()
    for s in tc:                      # Noto Sans TC slices, as they are
        c = left & s
        if len(c) >= MIN_SLICE:
            plan.append(sorted(c))
            left -= c
    group = set()                     # Noto Sans SC slices: what is left of them is small, so merge
    for s in sc:
        group |= left & s
        left -= s
        if len(group) >= SC_GROUP:
            plan.append(sorted(group))
            group = set()
    if group:
        plan.append(sorted(group))
    rest = sorted(left)
    plan += [rest[i:i + REST_CHUNK] for i in range(0, len(rest), REST_CHUNK)]
    # chunk 0 = the one holding basic Latin, so it is easy to find
    plan.sort(key=lambda c: 0 if ord('a') in c else 1)
    return [to_ranges(c) for c in plan]


def widen(ranges, present):
    # unicode-range may span gaps made only of codepoints the font does not have at all
    # (no chunk can claim them), which keeps the CSS short without changing what loads.
    out = [list(ranges[0])]
    for a, b in ranges[1:]:
        if all(c not in present for c in range(out[-1][1] + 1, a)):
            out[-1][1] = b
        else:
            out.append([a, b])
    return out


def css_range(ranges):
    return ', '.join('U+%X' % a if a == b else 'U+%X-%X' % (a, b) for a, b in ranges)


_cache = {}
def work(job):
    path, out, ranges = job
    if path not in _cache:
        with open(path, 'rb') as f:
            _cache[path] = f.read()
    font = TTFont(BytesIO(_cache[path]))
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.name_IDs = ['*']          # keep copyright + OFL license strings
    opts.name_languages = ['*']
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.glyph_names = False
    s = subset.Subsetter(opts)
    s.populate(unicodes=[c for a, b in ranges for c in range(a, b + 1)])
    s.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    return out, os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', help='folder with the official TTFs')
    ap.add_argument('--download', help='download the official TTFs into this folder (sha256-checked)')
    ap.add_argument('--out', default='assets/fonts')
    a = ap.parse_args()
    src = a.download or a.src
    if a.download:
        download(a.download)
    for _, _, name, _, want in WEIGHTS:
        if sha256(os.path.join(src, name)) != want:
            sys.exit(name + ': not the official file (sha256 mismatch)')
    os.makedirs(a.out, exist_ok=True)

    cmaps = {k: set(TTFont(os.path.join(src, n), lazy=True).getBestCmap()) for k, _, n, _, _ in WEIGHTS}
    allcps = set().union(*cmaps.values())
    plan_path = os.path.join(a.out, 'slices.json')
    if os.path.exists(plan_path):
        plan = json.load(open(plan_path))['chunks']
        covered = {c for ch in plan for x, y in ch for c in range(x, y + 1)}
        missing = sorted(allcps - covered)
        if missing:  # font changed: put new codepoints in extra chunks
            plan += [to_ranges(missing[i:i + REST_CHUNK]) for i in range(0, len(missing), REST_CHUNK)]
    else:
        plan = make_plan(allcps)
    with open(plan_path, 'w') as f:
        json.dump({'note': 'chunk -> codepoint ranges; generated by build/fonts/slice.py', 'chunks': plan}, f, separators=(',', ':'))
        f.write('\n')

    for fn in os.listdir(a.out):
        if fn.endswith('.woff2'):
            os.remove(os.path.join(a.out, fn))
    jobs, faces = [], []
    for i, ranges in enumerate(plan):
        for key, wght, name, _, _ in WEIGHTS:
            own = [r for r in to_ranges([c for x, y in ranges for c in range(x, y + 1) if c in cmaps[key]])]
            if not own:
                continue
            fn = 'taipei-sans-tc-%s.%d.woff2' % (key, i)
            jobs.append((os.path.join(src, name), os.path.join(a.out, fn), own))
            faces.append("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
                         "src:url(%s) format('woff2');unicode-range:%s}" % (FAMILY, wght, fn, css_range(widen(own, allcps))))
    sizes = {}
    with ProcessPoolExecutor() as ex:
        for out, size in ex.map(work, jobs, chunksize=4):
            sizes[os.path.basename(out)] = size
    with open(os.path.join(a.out, 'taipei-sans-tc.css'), 'w') as f:
        f.write('/* 台北黑體 Taipei Sans TC Beta (JT Foundry 翰字鑄造), SIL OFL 1.1 — see OFL.txt.\n'
                '   Light 300 + Regular 400, sliced into unicode-range WOFF2 chunks by build/fonts/slice.py. */\n')
        f.write('\n'.join(faces) + '\n')
    summary = {'family': FAMILY, 'fonttools': fontTools.version, 'chunks': len(plan),
               'source': {n: w for _, _, n, _, w in WEIGHTS}, 'files': len(sizes)}
    for key, *_ in WEIGHTS:
        v = [s for n, s in sizes.items() if '-%s.' % key in n]
        summary[key] = {'files': len(v), 'bytes': sum(v), 'min': min(v), 'max': max(v),
                        'latin_chunk_bytes': sizes.get('taipei-sans-tc-%s.0.woff2' % key)}
    with open(os.path.join(a.out, 'manifest.json'), 'w') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()

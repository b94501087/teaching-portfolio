#!/usr/bin/env python3
"""Fetch the SAMPLE board images listed in build/samples/images.json (Wikimedia Commons,
free licenses), resize to 1600px on the long side, save as WebP under assets/board/<slug>/,
and write assets/board/CREDITS.md. Existing files are kept, so reruns only fetch what is new.

  pip install pillow==11.3.0
  python3 build/samples/fetch.py
These are placeholders to preview the detail pages; replace them with real work.
"""
import io, json, os, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UA = {'User-Agent': 'yuchuntsai.com sample images (https://yuchuntsai.com; b94501087@berkeley.edu)'}
LONG = 1600
MAX_BYTES = 400 * 1024
LICENSES = {
    'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'Public domain': '',
    'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
}


def commons_urls(name):
    q = urllib.parse.quote(name.replace(' ', '_'))
    return ('https://commons.wikimedia.org/wiki/File:' + q,
            'https://commons.wikimedia.org/wiki/Special:FilePath/' + q + '?width=1920')


def get(url):
    for k in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print('  retry', k + 1, e, file=sys.stderr)
            time.sleep(3 + 5 * k)
    sys.exit('failed: ' + url)


def encode(im):
    for q in (80, 74, 68, 62, 56):
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            break
    return buf.getvalue(), q


def main():
    spec = json.load(open(os.path.join(ROOT, 'build', 'samples', 'images.json'), encoding='utf8'))
    lines = ['# Board sample images — credits', '',
             'SAMPLE CONTENT ONLY: these photos/drawings are placeholders to preview the board detail pages.',
             'They are not works by YU CHUN TSAI and should be replaced with real project images.',
             'All files come from Wikimedia Commons under the licenses below; each was resized to',
             '%dpx on the long side and re-encoded as WebP (a modification, for CC BY / BY-SA purposes).' % LONG,
             'The first image of each project (cover) is an Unsplash placeholder (Unsplash License), hotlinked from images.unsplash.com.', '']
    for slug, items in spec.items():
        d = os.path.join(ROOT, 'assets', 'board', slug)
        os.makedirs(d, exist_ok=True)
        lines.append('## ' + slug)
        lines.append('')
        for it in items:
            p = os.path.join(d, it['file'])
            page, url = commons_urls(it['commons'])
            if not os.path.exists(p):
                im = Image.open(io.BytesIO(get(url)))
                im = ImageOps.exif_transpose(im).convert('RGB')
                im.thumbnail((LONG, LONG), Image.LANCZOS)
                data, q = encode(im)
                with open(p, 'wb') as f:
                    f.write(data)
                print('saved', os.path.relpath(p, ROOT), im.size, len(data) // 1024, 'KB q', q)
                time.sleep(1)
            lic = '[%s](%s)' % (it['license'], LICENSES[it['license']]) if LICENSES[it['license']] else it['license']
            lines.append('- `%s` — %s — %s — %s — source: %s' % (it['file'], it['commons'], it['author'], lic, page))
        lines.append('')
    with open(os.path.join(ROOT, 'assets', 'board', 'CREDITS.md'), 'w', encoding='utf8') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    main()

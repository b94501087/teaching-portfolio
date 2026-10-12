// Build the GitHub Pages artifact into _site/.
//  1. copy the repo (minus build-only / private folders) into _site/
//  2. render the landing page (site root /index.html), the board (/board/), one detail page per
//     visible pin (/board/<slug>/), A–Z, teaching (plus one detail page per
//     teaching studio, /teaching/<slug>/) and consulting pages from content/*.json
//  3. fill {{name}} / {{email}} in the static doc pages (cv/, A-Z/*.html)
//  4. write the lowercase /a-z/ redirect (generated here, not committed, because
//     a-z/ and A-Z/ would collide on case-insensitive file systems such as macOS)
// Run locally with: node build/build.mjs   (then serve _site/)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderAll, fillPlaceholders, validate } from '../admin/render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const EXCLUDE = new Set(['.git', '.github', '_site', 'build', 'worker', 'node_modules', 'README.md', '.gitignore', 'package.json']);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (src === root && EXCLUDE.has(ent.name)) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else if (ent.isFile()) await fs.copyFile(s, d);
  }
}

const read = async n => JSON.parse(await fs.readFile(path.join(root, 'content', n + '.json'), 'utf8'));
const all = {
  site: await read('site'), board: await read('board'), az: await read('az'),
  teaching: await read('teaching'), consulting: await read('consulting')
};
const errs = validate(all);
if (errs.length) { console.error('Content validation failed:\n- ' + errs.join('\n- ')); process.exit(1); }

await fs.rm(out, { recursive: true, force: true });
await copyDir(root, out);

// ?v= on the root stylesheet link changes whenever style.css changes, so returning visitors get the new CSS.
const v = createHash('sha256').update(await fs.readFile(path.join(root, 'style.css'))).digest('hex').slice(0, 10);
// Natural size of every board image (WebP/PNG/JPEG header), so detail pages can set width/height.
function imgSize(b) {
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let o = 2; o + 9 < b.length;) {
      const m = b[o + 1], len = b.readUInt16BE(o + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)];
      o += 2 + len;
    }
  }
  return null;
}
const dims = {};
for (const p of all.board.pins || []) for (const src of p.images || []) {
  if (typeof src !== 'string' || dims[src] || /^(https?:|data:|\/)/i.test(src)) continue;
  try { const d = imgSize(await fs.readFile(path.join(root, src))); if (d && d[0] > 0 && d[1] > 0) dims[src] = d; } catch {}
}
const pages = renderAll(all, { v, dims });
for (const [rel, html] of Object.entries(pages)) {
  await fs.mkdir(path.dirname(path.join(out, rel)), { recursive: true });
  await fs.writeFile(path.join(out, rel), html);
  console.log('rendered', rel);
}

for (const rel of [...(await fs.readdir(path.join(out, 'A-Z'))).map(f => 'A-Z/' + f), 'cv/index.html']) {
  if (!rel.endsWith('.html')) continue;
  const p = path.join(out, rel);
  const src = await fs.readFile(p, 'utf8');
  if (src.includes('{{')) await fs.writeFile(p, fillPlaceholders(src, all.site));
}

await fs.mkdir(path.join(out, 'a-z'), { recursive: true });
await fs.writeFile(path.join(out, 'a-z', 'index.html'),
  '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + all.site.name.replace(/[<&]/g, '') + '</title>\n' +
  '<meta http-equiv="refresh" content="0; url=../A-Z/">\n' +
  '<link rel="canonical" href="https://yuchuntsai.com/A-Z/">\n' +
  '</head><body>\n<p><a href="../A-Z/">A–Z</a></p>\n</body></html>\n');
console.log('detail pages:', Object.keys(pages).filter(k => /^board\/[^/]+\/index\.html$/.test(k)).length);
console.log('build ok →', path.relative(process.cwd(), out) || '.');

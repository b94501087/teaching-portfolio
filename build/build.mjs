// Build the GitHub Pages artifact into _site/.
//  1. copy the repo (minus build-only / private folders) into _site/
//  2. render the landing page (site root /index.html), the board (/board/), one detail page per
//     visible pin (/board/<slug>/), A–Z, teaching and consulting pages from content/*.json
//  3. fill {{name}} / {{email}} in the static doc pages (cv/, A-Z/*.html)
//  4. write the lowercase /a-z/ redirect (generated here, not committed, because
//     a-z/ and A-Z/ would collide on case-insensitive file systems such as macOS)
// Run locally with: node build/build.mjs   (then serve _site/)
import { promises as fs } from 'node:fs';
import path from 'node:path';
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

const pages = renderAll(all);
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

// Build the GitHub Pages artifact into _site/.
//  1. copy the repo (minus build-only / private folders) into _site/
//  2. render the landing page (site root /index.html), the board (/board/), one detail page per
//     visible pin (/board/<slug>/), A–Z, teaching (plus one detail page per
//     teaching studio, /teaching/<slug>/) and consulting pages from content/*.json
//     Board cards are in that HTML. Each card image is a small WebP thumbnail written here
//     (cwebp) so the grid is not waiting on the full cover files.
//  3. fill {{name}} / {{email}} in the static doc pages (cv/, A-Z/*.html)
//  4. write the lowercase /a-z/ redirect (generated here, not committed, because
//     a-z/ and A-Z/ would collide on case-insensitive file systems such as macOS)
// Run locally with: node build/build.mjs   (then serve _site/)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mergeBoard, renderAll, fillPlaceholders, validate, imgGuardTag, listedPins, pinImages } from '../admin/render.js';
import { injectHans } from '../admin/hans.js';
import { renderBlog, validateBlog, renderFeed, renderSitemap, renderRobots, renderLlms, blogPosts } from '../admin/blog.js';

const execFileP = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
// Card thumbnails: wide enough for a retina column (~240–460 CSS px), never upscaled.
const THUMB_MAX_W = 480;
const THUMB_MAX_H = 1600;
const THUMB_Q = 66;
const EXCLUDE = new Set(['.git', '.github', '_site', 'build', 'worker', 'node_modules', 'tests', 'README.md', '.gitignore', 'package.json', 'package-lock.json']);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (src === root && EXCLUDE.has(ent.name)) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else if (ent.isFile()) await fs.copyFile(s, d);
  }
}

const readFile = async n => JSON.parse(await fs.readFile(path.join(root, 'content', n), 'utf8'));
const read = async n => n === 'board' ? mergeBoard(await readFile('board.json'), readFile) : readFile(n + '.json');
const all = {
  site: await read('site'), board: await read('board'), az: await read('az'),
  teaching: await read('teaching'), consulting: await read('consulting'),
  blog: await readFile('blog.json').catch(() => ({ posts: [] }))
};
const errs = validate(all).concat(validateBlog(all.blog));
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
const thumbs = await buildBoardThumbs(all.board);
const categories = await readFile('categories.json');
const scales = await readFile('scale.json');
const pages = Object.assign(renderAll(all, { v, dims, thumbs, categories, scales }), renderBlog(all, { v }));
for (const [rel, html] of Object.entries(pages)) {
  await fs.mkdir(path.dirname(path.join(out, rel)), { recursive: true });
  await fs.writeFile(path.join(out, rel), html);
  console.log('rendered', rel);
}

for (const rel of [...(await fs.readdir(path.join(out, 'A-Z'))).map(f => 'A-Z/' + f), 'cv/index.html']) {
  if (!rel.endsWith('.html')) continue;
  const p = path.join(out, rel);
  let src = await fs.readFile(p, 'utf8');
  if (src.includes('{{')) src = fillPlaceholders(src, all.site);
  if (rel === 'cv/index.html') src = injectHans(src);
  await fs.writeFile(p, src);
}

await fs.mkdir(path.join(out, 'a-z'), { recursive: true });
await fs.writeFile(path.join(out, 'a-z', 'index.html'),
  '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + all.site.name.replace(/[<&]/g, '') + '</title>\n' +
  '<meta http-equiv="refresh" content="0; url=../A-Z/">\n' +
  '<link rel="canonical" href="https://yuchuntsai.com/A-Z/">\n' +
  '</head><body>\n<p><a href="../A-Z/">A–Z</a></p>\n' + imgGuardTag(1) + '</body></html>\n');
// Search / answer-engine files: Atom feed, robots.txt, sitemap.xml (every public page, drafts excluded), llms.txt.
// lastmod only where a real date exists (blog posts); stamping every page with the build date made it meaningless to crawlers.
const today = new Date().toISOString().slice(0, 10);
const SITE = 'https://yuchuntsai.com';
const drafts = new Set((all.board.pins || []).filter(p => p.draft === true).map(p => 'board/' + p.slug + '/index.html')
  .concat((all.blog.posts || []).filter(p => p && p.draft === true).map(p => 'blog/' + p.slug + '/index.html')));
const postMod = Object.fromEntries(blogPosts(all.blog).map(p => ['blog/' + p.slug + '/index.html', p.updated || p.date]));
const blogMod = blogPosts(all.blog).map(p => p.updated || p.date).sort().pop();
const staticPages = ['cv/index.html', ...(await fs.readdir(path.join(root, 'A-Z'))).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => 'A-Z/' + f)];
const urls = [...Object.keys(pages), ...staticPages].filter(rel => !drafts.has(rel)).sort()
  .map(rel => ({ loc: SITE + '/' + rel.replace(/(^|\/)index\.html$/, '$1'), lastmod: postMod[rel] || (rel === 'blog/index.html' && blogMod) || undefined }));
await fs.writeFile(path.join(out, 'sitemap.xml'), renderSitemap(urls));
await fs.writeFile(path.join(out, 'robots.txt'), renderRobots());
await fs.writeFile(path.join(out, 'blog', 'feed.xml'), renderFeed(all.blog, today));
await fs.writeFile(path.join(out, 'llms.txt'), renderLlms(all, false));
await fs.writeFile(path.join(out, 'llms-full.txt'), renderLlms(all, true));
// Static pages (cv, A-Z essays, redirects) are copied, not rendered. Give them the same image guard.
async function injectImgGuard(dir, rel = '') {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (rel === '' && ent.name === 'admin') continue;
    const r = rel ? rel + '/' + ent.name : ent.name;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await injectImgGuard(p, r);
    else if (ent.isFile() && ent.name.endsWith('.html')) {
      let html = await fs.readFile(p, 'utf8');
      if (html.includes('assets/img-guard.js') || !/<\/body>/i.test(html)) continue;
      const depth = r.split('/').length - 1;
      html = html.replace(/<\/body>/i, imgGuardTag(depth) + '</body>');
      await fs.writeFile(p, html);
    }
  }
}
await injectImgGuard(out);
console.log('sitemap urls:', urls.length, '· blog posts:', blogPosts(all.blog).length);
console.log('detail pages:', Object.keys(pages).filter(k => /^board\/[^/]+\/index\.html$/.test(k)).length);
console.log('build ok →', path.relative(process.cwd(), out) || '.');

async function mapPool(items, n, fn) {
  const ret = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const k = next++;
      if (k >= items.length) return;
      ret[k] = await fn(items[k], k);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return ret;
}

// One small WebP per listed board card, under _site/assets/board-thumbs/<slug>.webp.
// The detail page keeps the original cover URL. Requires the cwebp binary (apt package webp).
async function buildBoardThumbs(board) {
  try { await execFileP('cwebp', ['-version']); }
  catch {
    console.error('cwebp is required to build /board/ thumbnails. Install it with: sudo apt-get install webp');
    process.exit(1);
  }
  const pins = listedPins(board);
  const dir = path.join(out, 'assets', 'board-thumbs');
  await fs.mkdir(dir, { recursive: true });
  const made = await mapPool(pins, 6, async p => {
    const srcRel = pinImages(p)[0];
    if (!srcRel || /^(https?:|data:|\/)/i.test(srcRel)) throw new Error('pin ' + p.slug + ' has no local cover');
    const src = path.join(root, srcRel);
    const raw = await fs.readFile(src);
    const dim = imgSize(raw);
    if (!dim) throw new Error('could not read image size: ' + srcRel);
    const scale = Math.min(THUMB_MAX_W / dim[0], THUMB_MAX_H / dim[1], 1);
    const destRel = 'assets/board-thumbs/' + p.slug + '.webp';
    const dest = path.join(out, destRel);
    const args = ['-quiet', '-q', String(THUMB_Q), '-m', '4'];
    if (scale < 1) args.push('-resize', String(Math.max(1, Math.round(dim[0] * scale))), String(Math.max(1, Math.round(dim[1] * scale))));
    args.push(src, '-o', dest);
    await execFileP('cwebp', args, { maxBuffer: 1024 * 1024 });
    const buf = await fs.readFile(dest);
    const outDim = imgSize(buf);
    if (!outDim || outDim[0] < 1 || outDim[1] < 1) throw new Error('thumbnail has no size: ' + destRel);
    return { slug: p.slug, src: destRel, w: outDim[0], h: outDim[1], coverBytes: raw.length, thumbBytes: buf.length };
  });
  const thumbs = {};
  let coverBytes = 0, thumbBytes = 0;
  for (const t of made) {
    thumbs[t.slug] = { src: t.src, w: t.w, h: t.h };
    coverBytes += t.coverBytes;
    thumbBytes += t.thumbBytes;
  }
  console.log('board thumbs:', made.length, '· covers', (coverBytes / 1048576).toFixed(1) + 'MB', '→ thumbs', (thumbBytes / 1048576).toFixed(1) + 'MB');
  return thumbs;
}

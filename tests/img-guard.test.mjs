// Site-wide image guard: rendered <img> are not draggable, and no anchor points at an image file
// or carries a download attribute. Gallery zoom uses a button + data-full instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hardenImages, renderAll, renderDetail, renderTeaching, mergeBoard } from '../admin/render.js';
import { renderBlog, renderBlogPost } from '../admin/blog.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url), 'utf8'));
const site = read('site.json');
const board = mergeBoard(read('board.json'), f => read(f));
const all = { site, board, az: read('az.json'), teaching: read('teaching.json'), consulting: read('consulting.json'), blog: read('blog.json') };
const IMAGE_HREF = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

function assertGuarded(html, label) {
  for (const img of html.match(/<img\b[^>]*>/gi) || []) assert.match(img, /\bdraggable="false"/, label + ' ' + img);
  for (const a of html.match(/<a\b[^>]*>/gi) || []) {
    assert.doesNotMatch(a, /(?:^|\s)download(?:\s|=|>)/i, label + ' download link ' + a);
    const href = (a.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1] || '';
    assert.doesNotMatch(href.replace(/&amp;/gi, '&'), IMAGE_HREF, label + ' image href ' + a);
  }
  assert.match(html, /assets\/img-guard\.js/, label + ' missing image guard script');
}

test('hardenImages sets draggable=false and drops image and download links', () => {
  const raw = '<p><a class="zoom" href="../assets/x.webp"><img src="../assets/x.webp" alt="a"></a>' +
    '<a href="page/">text</a>' +
    '<a href="shot.jpg" download>save</a>' +
    '<a href="notes.pdf" download="notes.pdf">pdf</a>' +
    '<figure><img src="y.png" alt=""></figure></p>';
  const h = hardenImages(raw);
  assert.match(h, /<button\b(?=[^>]*\btype="button")(?=[^>]*\bclass="zoom")(?=[^>]*\bdata-full="\.\.\/assets\/x\.webp")[^>]*><img src="\.\.\/assets\/x\.webp" alt="a" draggable="false"><\/button>/);
  assert.match(h, /<button\b(?=[^>]*\btype="button")(?=[^>]*\bclass="zoom")(?=[^>]*\bdata-full="shot\.jpg")[^>]*>save<\/button>/);
  assert.match(h, /<button type="button">pdf<\/button>/);
  assert.match(h, /<img src="y\.png" alt="" draggable="false">/);
  assert.match(h, /<a href="page\/">text<\/a>/);
  assertGuarded(h + '<script src="assets/img-guard.js"></script>', 'synthetic');
  assert.doesNotMatch(h, /<a\b[^>]*\bdownload\b/i);
});

test('rendered pages: draggable=false, no image or download links, gallery still opens', () => {
  const pages = Object.assign(renderAll(all, {}), renderBlog(all, {}));
  for (const [rel, html] of Object.entries(pages)) assertGuarded(html, rel);
  const gallery = Object.values(pages).find(h => h.includes('class="zoom"'));
  assert.ok(gallery, 'a page with the image gallery');
  assert.match(gallery, /<button type="button" class="zoom" draggable="false" data-full="[^"]+\.(?:webp|jpe?g|png|gif)"/);
  assert.match(gallery, /getAttribute\("data-full"\)/);
  assert.match(gallery, /<a href="\.\.\/">/);
  for (const s of gallery.match(/<script>([\s\S]*?)<\/script>/g) || []) assert.doesNotThrow(() => new Function(s.replace(/<\/?script>/g, '')));
  const home = pages['index.html'];
  assert.match(home, /<script src="assets\/img-guard\.js"><\/script>/);
  assert.match(pages['board/index.html'], /<script src="\.\.\/assets\/img-guard\.js"><\/script>/);
  assert.match(pages['blog/index.html'], /<script src="\.\.\/assets\/img-guard\.js"><\/script>/);
  const post = renderBlogPost(site, all.blog, all.blog.posts.find(p => p && p.cover && p.draft !== true), {});
  assert.match(post, /<img\b[^>]*draggable="false"/);
  assert.match(post, /<a href="\.\.\/\.\.\/(?:board|cv|teaching|consulting)\//);
  const pin = board.pins.find(p => Array.isArray(p.images) && p.images.length);
  const one = renderDetail(site, board, pin, {});
  assert.match(one, /class="zoom"/);
  assert.doesNotMatch(one, /<a\b[^>]*class="zoom"/);
});

test('guard script and stylesheets only block images, pictures, figures, and the lightbox', () => {
  const js = readFileSync(new URL('../assets/img-guard.js', import.meta.url), 'utf8');
  assert.match(js, /contextmenu/);
  assert.match(js, /dragstart/);
  assert.match(js, /if \(blocked\(e\.target\)\) e\.preventDefault\(\)/);
  assert.match(js, /img, picture, \.zoom/);
  assert.match(js, /\.lb/);
  assert.match(js, /FIGURE/);
  for (const f of ['../style.css', '../A-Z/style.css', '../consulting/style.css']) {
    const css = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(css, /img,picture,figure,\.lb[\s\S]*\{-webkit-touch-callout:none;-webkit-user-drag:none;user-select:none\}/, f);
  }
  const cv = readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8');
  assert.match(cv, /<script src="\.\.\/assets\/img-guard\.js"><\/script>/);
});

test('legacy teaching image links are buttons, and a direct image href is not left as an anchor', () => {
  const legacy = {
    sections: [{ title: 'Studio', images: ['assets/teaching/a.webp'], captions: ['A caption'] }]
  };
  const h = renderTeaching(site, legacy, {});
  assert.match(h, /<button type="button" class="zoom" draggable="false" data-full="[^"]+a\.webp"/);
  assert.match(h, /data-full/);
  assert.doesNotMatch(h, /<a\b[^>]*href="[^"]+\.webp"/);
  assert.match(h, /<figcaption>A caption<\/figcaption>/);
  for (const s of h.match(/<script>([\s\S]*?)<\/script>/g) || []) assert.doesNotThrow(() => new Function(s.replace(/<\/?script>/g, '')));
});

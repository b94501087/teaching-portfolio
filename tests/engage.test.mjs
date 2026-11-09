// Engagement UI on blog pages, the vendored QR library, and the public Worker (D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { renderBlog, renderBlogPost, renderBlogIndex, blogPosts, ENGAGE_API, ENGAGE_VIEW_WINDOW_MS } from '../admin/blog.js';
import worker, { SCHEMA, VIEW_WINDOW_MS } from '../worker/engage/worker.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url)));
const site = read('site.json');
const blog = read('blog.json');
const post = blogPosts(blog).find(p => p.title_en || (p.title && p.title.en)) || blogPosts(blog)[0];

function d1(db) {
  function wrap(sql, params) {
    return {
      bind(...more) { return wrap(sql, more); },
      async first() {
        const row = db.prepare(sql).get(...params);
        return row === undefined ? null : row;
      },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async run() {
        const info = db.prepare(sql).run(...params);
        return { success: true, meta: { changes: info.changes } };
      }
    };
  }
  return {
    prepare(sql) { return wrap(sql, []); },
    batch(stmts) { return Promise.all(stmts.map(s => s.run())); }
  };
}
function makeEnv(over = {}) {
  const db = new DatabaseSync(':memory:');
  return { env: { DB: d1(db), ALLOWED_ORIGIN: 'https://yuchuntsai.com', RATE_SALT: 'test-salt', ...over }, db };
}
function req(path, { method = 'GET', body, ip = '203.0.113.10', origin = 'https://yuchuntsai.com', json = true } = {}) {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  if (json && method !== 'GET') headers['Content-Type'] = 'application/json';
  return new Request('https://yuchuntsai.com' + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
}
async function call(env, path, opts) {
  const res = await worker.fetch(req(path, opts), env);
  return { status: res.status, json: await res.json() };
}

test('build output: post and index engagement, feed link, unchanged URLs', () => {
  const h = renderBlogPost(site, blog, post, {});
  const index = renderBlogIndex(site, blog, {});
  assert.equal(ENGAGE_VIEW_WINDOW_MS, VIEW_WINDOW_MS);
  assert.match(h, new RegExp('<meta name="engage-api" content="' + ENGAGE_API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">'));
  assert.match(index, new RegExp('<meta name="engage-api" content="' + ENGAGE_API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">'));
  assert.match(h, new RegExp('data-view-window="' + ENGAGE_VIEW_WINDOW_MS + '"'));
  assert.match(h, /class="stat views"[^>]*hidden/);
  assert.match(h, /data-n="likes"[^>]*hidden/);
  assert.match(h, /data-n="bookmarks"[^>]*hidden/);
  for (const s of ['閱讀', '阅读', 'Reads', '喜歡', '喜欢', 'Like', '已喜歡', '已喜欢', 'Liked', '收藏清單', '收藏清单', 'Saved list',
    '訂閱新文章', '订阅新文章', 'Subscribe', '複製連結', '复制链接', 'Copy link', '產生 QR code', '生成 QR code', 'Generate QR code',
    '下載 PNG', '下载 PNG', 'Download PNG', '用微信掃描這張 QR code', '用微信扫描这张 QR code', 'Scan this QR code with WeChat']) {
    assert.ok(h.includes(s), s);
  }
  assert.match(h, /data-l="zh-Hant"/);
  assert.match(h, /data-l="zh-Hans"/);
  assert.match(h, /data-l="en"/);
  assert.match(h, /https:\/\/social-plugins\.line\.me\/lineit\/share\?url=/);
  assert.match(h, /https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
  assert.match(h, /mailto:\?subject=[^"]*&amp;body=/);
  assert.match(h, /https:\/\/mail\.google\.com\/mail\/\?view=cm&amp;fs=1&amp;su=/);
  assert.match(h, /https:\/\/wa\.me\/\?text=/);
  assert.match(h, /data-share="wechat"/);
  assert.match(h, /data-share="dcard"/);
  assert.match(h, /data-share="discord"/);
  assert.match(h, /data-share="copy"/);
  assert.match(h, /data-share="qr"/);
  assert.match(h, /data-share="native"[^>]*hidden/);
  assert.match(h, /data-qr-download/);
  assert.match(h, /src="\.\.\/\.\.\/assets\/qrcode\.js"/);
  assert.match(h, /src="\.\.\/\.\.\/assets\/engage\.js"/);
  assert.doesNotMatch(h, /cdn\.|jsdelivr|unpkg|googleapis|cdnjs/i);
  assert.match(h, new RegExp('<link rel="canonical" href="https://yuchuntsai\\.com/blog/' + post.slug + '/">'));
  assert.match(h, /href="\.\.\/feed\.xml"/);
  assert.match(index, /href="feed\.xml"/);
  assert.match(index, /data-blog-saved/);
  assert.match(index, /class="saved-panel"/);
  assert.match(index, /還沒有收藏的文章。/);
  assert.match(index, /还没有收藏的文章。/);
  assert.match(index, /No saved posts yet/);
  assert.match(index, /src="\.\.\/assets\/engage\.js"/);
  assert.doesNotMatch(index, /assets\/qrcode\.js/);
  const pages = renderBlog({ site, blog }, {});
  for (const rel of Object.keys(pages)) assert.match(rel, /^blog\/(?:index\.html|[a-z0-9-]+\/index\.html)$/, rel);
  assert.doesNotMatch(pages['blog/index.html'], /href="[^"]*\/saved\/"/);
  const engageJs = readFileSync(new URL('../assets/engage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engageJs, /yuchuntsai\.com\/engage/);
  assert.match(engageJs, /external/);
  assert.doesNotThrow(() => new Function(engageJs));
  for (const s of h.match(/<script>([\s\S]*?)<\/script>/g) || []) assert.doesNotThrow(() => new Function(s.replace(/<\/?script>/g, '')));
  const build = readFileSync(new URL('../build/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /writeFile\(path\.join\(out, 'blog', 'feed\.xml'\), renderFeed/);
  assert.match(build, /sitemap\.xml/);
  assert.match(build, /'worker'/);
  const schema = readFileSync(new URL('../worker/engage/schema.sql', import.meta.url), 'utf8');
  for (const stmt of SCHEMA) assert.ok(schema.includes(stmt), stmt.slice(0, 40));
});

test('icon share row: X / Threads / Instagram / Facebook under the article body, self-hosted SVG, language-aware', () => {
  const h = renderBlogPost(site, blog, post, {});
  const m = /<div class="share-row"[\s\S]*?<\/div>\n<p class="share-status"[\s\S]*?<\/div>\n/.exec(h);
  assert.ok(m, 'share row present');
  const row = m[0];
  // Directly after the article body, before the English summary / FAQ / subscribe box.
  assert.ok(h.indexOf(row) > h.indexOf('<div class="post-body">'));
  assert.match(h, /<\/div>\n<div class="share-row"/);
  for (const sec of ['class="en-abstract"', 'class="faq"', 'class="subscribe"']) {
    if (h.includes(sec)) assert.ok(h.indexOf(row) < h.indexOf(sec), sec);
  }
  for (const s of ['分享這篇', '分享这篇', '>Share<']) assert.ok(row.includes(s), s);
  const kinds = [...row.matchAll(/class="si si-([a-z]+)" data-share="([a-z]+)"/g)].map(x => x[1] + '/' + x[2]);
  assert.deepEqual(kinds, ['x/x', 'threads/threads', 'instagram/instagram', 'facebook/facebook']);
  assert.match(row, /<a class="si si-x" data-share="x" href="https:\/\/x\.com\/intent\/post\?text=[^"]*&amp;url=https%3A%2F%2Fyuchuntsai\.com%2Fblog%2F/);
  assert.match(row, /<a class="si si-threads" data-share="threads" href="https:\/\/www\.threads\.net\/intent\/post\?text=/);
  assert.match(row, /<a class="si si-facebook" data-share="facebook" href="https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Fyuchuntsai\.com%2Fblog%2F/);
  assert.match(row, /<button type="button" class="si si-instagram" data-share="instagram"/);
  assert.doesNotMatch(row, /instagram\.com/);
  assert.equal((row.match(/<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"[^>]*stroke="currentColor"/g) || []).length, 4);
  assert.equal((row.match(/ aria-label="[^"]+"/g) || []).length, 4);
  for (const s of ['分享到 X', 'Share on X', '分享到 Threads', 'Share on Threads', '複製連結，分享到 Instagram', '复制链接，分享到 Instagram', 'Copy link to share on Instagram', '分享到 Facebook', 'Share on Facebook']) assert.ok(row.includes(s), s);
  assert.match(row, /class="msg-ig" hidden/);
  for (const s of ['已複製，可貼到 IG', '已复制，可贴到 IG', 'Copied. Paste it on Instagram.']) assert.ok(row.includes(s), s);
  assert.match(row, /<p class="share-status" role="status" hidden><\/p>/);
  // No platform embed scripts / widgets / external icon libraries.
  assert.doesNotMatch(h, /platform\.twitter\.com|connect\.facebook\.net|widgets\.js|sdk\.js|threads\.net\/embed|instagram\.com\/embed|font-?awesome|simpleicons|iconify/i);
  // The old full share row keeps LINE / WeChat / Facebook / Dcard … but no longer has X / Threads / IG text links.
  const old = /<div class="share" role="group">[\s\S]*?<\/div>/.exec(h)[0];
  for (const k of ['line', 'wechat', 'facebook', 'email', 'gmail', 'dcard', 'discord', 'whatsapp', 'copy', 'qr']) assert.match(old, new RegExp('data-share="' + k + '"'), k);
  for (const k of ['x', 'threads', 'instagram']) assert.doesNotMatch(old, new RegExp('data-share="' + k + '"'), k);
  // engage.js: language-aware URLs, Instagram copies (no new tab), native sheet only on coarse pointers.
  const js = readFileSync(new URL('../assets/engage.js', import.meta.url), 'utf8');
  assert.match(js, /'\?lang=' \+ l/);
  assert.match(js, /l === 'en' \|\| l === 'zh-Hans'/);
  assert.match(js, /x: 'https:\/\/x\.com\/intent\/post\?text='/);
  assert.match(js, /threads: 'https:\/\/www\.threads\.net\/intent\/post\?text='/);
  assert.match(js, /\(pointer: coarse\)/);
  assert.match(js, /setStatus\('msg-ig', scope\)/);
  assert.doesNotMatch(js, /instagram\.com/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.share-icons\{display:flex;flex-wrap:wrap;gap:12px\}/);
  assert.match(css, /\.share-icons \.si\{[^}]*width:36px;height:36px;[^}]*border-radius:50%/);
  for (const c of ['--brand:#000', '--brand:#E4405F', '--brand:#1877F2']) assert.ok(css.includes(c), c);
  assert.match(css, /\.share-icons \.si:focus-visible\{/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.share-icons \.si\{transition:none\}\}/);
});

function runEngage(langNow, opts = {}) {
  // Minimal DOM stub: enough for bootPost to fill links and handle the Instagram click.
  const els = {}, listeners = {};
  const mk = (attrs = {}, extra = {}) => ({ attrs: { ...attrs }, hidden: true, textContent: '', tagName: extra.tag || 'DIV',
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    classList: { toggle() {} }, addEventListener(t, f) { (this._l = this._l || {})[t] = f; }, ...extra });
  const links = {};
  for (const k of ['line', 'facebook', 'x', 'threads', 'email', 'gmail', 'whatsapp']) links[k] = [mk({}, { tag: 'A' }), mk({}, { tag: 'A' })];
  const status = [mk(), mk()];
  const docEl = mk({ 'data-lang': langNow });
  const igMsg = mk(), icons = [mk({ 'data-labels': JSON.stringify({ 'zh-Hant': '分享到 X', en: 'Share on X', 'zh-Hans': '分享到 X' }) })];
  igMsg.querySelector = sel => ({ textContent: { 'zh-Hant': '已複製，可貼到 IG', en: 'Copied. Paste it on Instagram.', 'zh-Hans': '已复制，可贴到 IG' }[docEl.attrs['data-lang']] });
  let observer = null;
  const scope = i => mk({}, { querySelector(sel) {
    const a = /^a\[data-share="([a-z]+)"\]$/.exec(sel); if (a) return links[a[1]] ? links[a[1]][i] : null;
    if (sel === '.share-status') return status[i];
    if (sel === '.msg-ig') return i === 1 ? igMsg : null;
    return null; }, querySelectorAll(sel) { return sel === '[data-labels]' && i === 1 ? icons : []; } });
  const root = scope(0); root.attrs = { 'data-slug': post.slug, 'data-url': 'https://yuchuntsai.com/blog/' + post.slug + '/', 'data-view-window': '1' };
  const row = scope(1);
  let copied = null, shared = null;
  const ctx = {
    document: { readyState: 'complete', documentElement: docEl, referrer: '', addEventListener() {},
      querySelector(sel) { return sel === '.engage[data-slug]' ? root : sel === '.share-row' ? row : null; },
      querySelectorAll() { return []; }, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { clipboard: { writeText(v) { copied = v; return Promise.resolve(); } }, share: opts.share ? (d => { shared = d; return Promise.resolve(); }) : undefined },
    window: { MutationObserver: true, matchMedia: q => ({ matches: q === '(pointer: coarse)' ? !!opts.coarse : false }), open() { throw new Error('no new tab'); }, innerWidth: 1280 },
    MutationObserver: function (cb) { observer = cb; this.observe = function () {}; },
    location: { href: '', host: 'yuchuntsai.com' }, fetch: () => Promise.resolve({ ok: false }), Promise, JSON, Date, Math, Uint8Array, Number, String, Object, setTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../assets/engage.js', import.meta.url), 'utf8'), ctx);
  const igBtn = { tagName: 'BUTTON', getAttribute: k => (k === 'data-share' ? 'instagram' : null) };
  const switchLang = l => { docEl.attrs['data-lang'] = l; if (observer) observer([]); };
  return { links, icons, status, row, igBtn, switchLang, get copied() { return copied; }, get shared() { return shared; } };
}

test('engage.js: share URLs follow the shown language; Instagram copies it and shows the IG status', async () => {
  const base = 'https://yuchuntsai.com/blog/' + post.slug + '/';
  for (const [l, want, msg] of [['zh-Hant', base, '已複製，可貼到 IG'], ['en', base + '?lang=en', 'Copied. Paste it on Instagram.'], ['zh-Hans', base + '?lang=zh-Hans', '已复制，可贴到 IG']]) {
    const r = runEngage(l);
    const enc = encodeURIComponent(want);
    for (const i of [0, 1]) {
      assert.ok(r.links.facebook[i].attrs.href.endsWith('?u=' + enc), l + ' facebook');
      assert.ok(r.links.x[i].attrs.href.endsWith('&url=' + enc), l + ' x');
      assert.ok(r.links.threads[i].attrs.href.endsWith(enc), l + ' threads');
      assert.ok(r.links.line[i].attrs.href.endsWith('?url=' + enc), l + ' line');
    }
    assert.equal(r.icons[0].attrs['aria-label'], l === 'en' ? 'Share on X' : '分享到 X');
    r.row._l.click.call(r.row, { target: { closest: () => r.igBtn } });
    await new Promise(res => setTimeout(res, 0));
    assert.equal(r.copied, want, l + ' copied');
    assert.equal(r.status[1].textContent, msg);
    assert.equal(r.status[1].hidden, false);
    assert.equal(r.shared, null, 'no share sheet on desktop');
  }
  // S03: a status already on screen follows a later language switch; links follow too.
  const sw = runEngage('zh-Hant');
  sw.row._l.click.call(sw.row, { target: { closest: () => sw.igBtn } });
  await new Promise(res => setTimeout(res, 0));
  assert.equal(sw.status[1].textContent, '已複製，可貼到 IG');
  sw.switchLang('en');
  assert.equal(sw.status[1].textContent, 'Copied. Paste it on Instagram.');
  assert.ok(sw.links.x[1].attrs.href.endsWith(encodeURIComponent(base + '?lang=en')));
  sw.switchLang('zh-Hans');
  assert.equal(sw.status[1].textContent, '已复制，可贴到 IG');
  assert.equal(sw.status[1].hidden, false);
  assert.equal(sw.status[0].textContent, '', 'top-row status stays empty');
  const m = runEngage('en', { share: true, coarse: true });
  m.row._l.click.call(m.row, { target: { closest: () => m.igBtn } });
  await new Promise(res => setTimeout(res, 0));
  assert.equal(m.shared.url, base + '?lang=en');
  assert.equal(m.copied, base + '?lang=en');
});

test('build: engage.js gets a ?v= content hash; share icons have a 44px touch target', () => {
  const h = renderBlogPost(site, blog, post, { v: 'abc1234567', ev: 'def7654321' });
  assert.match(h, /<script src="\.\.\/\.\.\/assets\/engage\.js\?v=def7654321"><\/script>/);
  assert.match(h, /href="\.\.\/\.\.\/style\.css\?v=abc1234567"/);
  assert.match(renderBlogIndex(site, blog, { v: 'a', ev: 'b9' }), /src="\.\.\/assets\/engage\.js\?v=b9"/);
  assert.match(renderBlogPost(site, blog, post, {}), /src="\.\.\/\.\.\/assets\/engage\.js"/);
  const build = readFileSync(new URL('../build/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /createHash\('sha256'\)\.update\(await fs\.readFile\(path\.join\(root, 'assets', 'engage\.js'\)\)\)/);
  assert.match(build, /renderBlog\(all, \{ v, ev \}\)/);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.share-icons \.si\{[^}]*position:relative/);
  assert.match(css, /\.share-icons \.si::after\{content:"";position:absolute;inset:-5px\}/);
});

test('vendored QR library encodes a post URL without a network', () => {
  const src = readFileSync(new URL('../assets/qrcode.js', import.meta.url), 'utf8');
  assert.match(src, /MIT/);
  assert.match(src, /Kazuhiko Arase/);
  assert.doesNotMatch(src, /https?:\/\/cdn\.|jsdelivr|unpkg/i);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const url = 'https://yuchuntsai.com/blog/hong-kong-art-tech-undergraduate-2027-cityu-hkbu-polyu-fashion/';
  const qr = ctx.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  assert.ok(n >= 21 && n % 4 === 1, 'module count ' + n);
  assert.equal(qr.isDark(0, 0), true);
  assert.equal(qr.isDark(6, 6), true);
  assert.equal(qr.isDark(7, 0), false);
  const gif = qr.createDataURL(4, 8);
  assert.match(gif, /^data:image\/gif;base64,/);
});

test('worker counts external reads once, likes and bookmarks once, and stores subscribers', async () => {
  let now = 1_700_000_000_000;
  const { env, db } = makeEnv({ now: () => now, VIEW_LIMIT: 5, LIKE_LIMIT: 5, BOOKMARK_LIMIT: 5, SUBSCRIBE_LIMIT: 3 });
  const health = await call(env, '/engage/health');
  assert.deepEqual(health.json, { ok: true });

  const ext = await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', src: 'external' } });
  assert.equal(ext.status, 200);
  assert.equal(ext.json.counted, true);
  assert.equal(ext.json.views, 1);

  const again = await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', src: 'external' } });
  assert.equal(again.json.counted, false);
  assert.equal(again.json.views, 1);

  const siteVisit = await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-bbb2', src: 'site' } });
  assert.equal(siteVisit.json.counted, true);
  assert.equal(siteVisit.json.views, 2);

  now += VIEW_WINDOW_MS;
  const later = await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', src: 'direct' } });
  assert.equal(later.json.counted, true);
  assert.equal(later.json.views, 3);

  const like = await call(env, '/engage/like', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: true } });
  assert.equal(like.json.likes, 1);
  const likeAgain = await call(env, '/engage/like', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: true } });
  assert.equal(likeAgain.json.likes, 1);
  const unlike = await call(env, '/engage/like', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: false } });
  assert.equal(unlike.json.likes, 0);
  const unlikeAgain = await call(env, '/engage/like', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: false } });
  assert.equal(unlikeAgain.json.likes, 0);

  const mark = await call(env, '/engage/bookmark', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: true } });
  assert.equal(mark.json.bookmarks, 1);
  const unmark = await call(env, '/engage/bookmark', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1', on: false } });
  assert.equal(unmark.json.bookmarks, 0);

  const counts = await call(env, '/engage/counts?slug=fixture-post');
  assert.equal(counts.json.views, 3);
  assert.equal(counts.json.likes, 0);

  assert.equal((await call(env, '/engage/subscribe', { method: 'POST', body: { email: 'Ada@Example.com', lang: 'zh-Hant' } })).json.ok, true);
  assert.equal((await call(env, '/engage/subscribe', { method: 'POST', body: { email: 'ada@example.com', lang: 'en' } })).json.ok, true);
  const row = db.prepare('SELECT email, lang FROM subscribers').get();
  assert.equal(row.email, 'ada@example.com');
  assert.equal(row.lang, 'en');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n, 1);

  assert.equal((await call(env, '/engage/view', { method: 'POST', body: { slug: 'Bad Slug', vid: 'visitor-aaa1' } })).status, 400);
  assert.equal((await call(env, '/engage/like', { method: 'POST', body: { slug: 'fixture-post', on: true } })).status, 400);
  assert.equal((await call(env, '/engage/subscribe', { method: 'POST', body: { email: 'not-an-email' } })).status, 400);
  assert.equal((await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post' }, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(env, '/engage/view', { method: 'POST', body: { slug: 'fixture-post', vid: 'visitor-aaa1' }, json: false })).status, 415);

  const limited = makeEnv({ VIEW_LIMIT: 2 });
  assert.equal((await call(limited.env, '/engage/view', { method: 'POST', ip: '198.51.100.7', body: { slug: 'fixture-post', vid: 'visitor-ccc3', src: 'external' } })).status, 200);
  assert.equal((await call(limited.env, '/engage/view', { method: 'POST', ip: '198.51.100.7', body: { slug: 'fixture-post', vid: 'visitor-ddd4', src: 'external' } })).status, 200);
  assert.equal((await call(limited.env, '/engage/view', { method: 'POST', ip: '198.51.100.7', body: { slug: 'fixture-post', vid: 'visitor-eee5', src: 'external' } })).status, 429);
});

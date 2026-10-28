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

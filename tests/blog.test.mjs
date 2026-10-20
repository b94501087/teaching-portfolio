// Blog (/blog/), its SEO / answer-engine output (JSON-LD, feed, sitemap, robots, llms.txt) and the
// blog link in every navigation. The posts below are a TEST FIXTURE only (never in content/blog.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAll, mergeBoard, azEntries, renderAZ } from '../admin/render.js';
import { BLOG_CATEGORIES, renderBlog, renderBlogIndex, renderBlogPost, blogPosts, validateBlog, renderFeed, renderSitemap, renderRobots, renderLlms, AI_BOTS, relatedPosts } from '../admin/blog.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url)));
const site = read('site.json'), blog = read('blog.json');
const board = mergeBoard(read('board.json'), f => read(f));
const all = { site, board, az: read('az.json'), teaching: read('teaching.json'), consulting: read('consulting.json'), blog };

const FIXTURE = { author: { sameAs: ['https://example.com/profile'] }, posts: [
  { slug: 'fixture-older', title: '測試文章（舊）', date: '2026-01-02', categories: ['essay'], summary: '測試摘要舊', body: '<h2>測試問題？</h2><p>測試內文舊</p>' },
  { slug: 'fixture-post', title: { 'zh-Hant': '測試文章：作品集要放幾個項目？', en: 'Test fixture: how many projects?' }, date: '2026-03-04', updated: '2026-03-10',
    categories: ['portfolio-strategy', 'top-school'], cover: 'assets/blog/fixture-post/cover.webp', keywords: ['作品集', 'portfolio'],
    summary: { 'zh-Hant': '測試摘要', en: 'Test summary' }, tldr: { 'zh-Hant': '測試重點', en: 'Test TL;DR' },
    body: { 'zh-Hant': '<h2>作品集要放幾個項目？</h2><p>測試中文內文</p>', en: '<h2>How many projects?</h2><p>Test English body</p>' },
    faq: [{ q: { 'zh-Hant': '測試問？', en: 'Test Q?' }, a: { 'zh-Hant': '測試答。', en: 'Test A.' } }],
    source: { type: 'wechat', date: '2025-12-01' } },
  { slug: 'fixture-draft', title: '草稿', date: '2026-05-01', categories: ['essay'], body: '<p>x</p>', draft: true }
] };
const ldOf = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const types = ld => ld.flatMap(o => o['@graph'] || [o]).map(x => x['@type']);
const scripts = h => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('live content ships no posts: empty state, valid data', () => {
  assert.deepEqual(validateBlog(blog), []);
  assert.equal(blogPosts(blog).length, 0, 'content/blog.json must not contain sample posts');
  const h = renderBlogIndex(site, blog, {});
  assert.ok(h.includes('class="blog-empty"') && h.includes('即將上線') && h.includes('Coming soon'));
  for (const c of BLOG_CATEGORIES) assert.ok(h.includes('data-blog-cat="' + c.id + '"') && h.includes(c['zh-Hant']) && h.includes(c.en));
  for (const s of scripts(h)) assert.doesNotThrow(() => new Function(s));
  for (const ld of ldOf(h)) assert.ok(ld['@context']);
});

test('index: newest first, multi-category data-cat, hash filter script, drafts hidden', () => {
  assert.deepEqual(blogPosts(FIXTURE).map(p => p.slug), ['fixture-post', 'fixture-older']);
  const h = renderBlogIndex(site, FIXTURE, {});
  assert.ok(h.indexOf('fixture-post/') < h.indexOf('fixture-older/'));
  assert.ok(h.includes('data-cat="portfolio-strategy top-school"'));
  assert.ok(!h.includes('fixture-draft'));
  assert.match(h, /cat=/);
  for (const s of scripts(h)) assert.doesNotThrow(() => new Function(s));
  assert.ok(types(ldOf(h)).includes('Blog'));
});

test('post page: static body, TL;DR, author box, related, meta, hreflang, JSON-LD', () => {
  const p = FIXTURE.posts[1], h = renderBlogPost(site, FIXTURE, p, {});
  assert.ok(h.includes('測試中文內文') && h.includes('Test English body'), 'body pre-rendered in the HTML');
  assert.match(h, /<h1>/); assert.match(h, /<h2>作品集要放幾個項目？<\/h2>/);
  assert.ok(h.includes('class="tldr"') && h.includes('class="author-box"') && h.includes('href="../../cv/"') && h.includes('href="../../board/"'));
  assert.ok(h.includes('class="related"') && h.includes('fixture-older/'));
  assert.match(h, /<link rel="canonical" href="https:\/\/yuchuntsai\.com\/blog\/fixture-post\/">/);
  assert.match(h, /hreflang="zh-Hant"/); assert.match(h, /hreflang="en"/);
  for (const m of ['og:title', 'og:description', 'og:image', 'twitter:card', 'name="description"']) assert.ok(h.includes(m), m);
  const ld = ldOf(h), g = ld[0]['@graph'];
  assert.deepEqual(types(ld).sort(), ['BlogPosting', 'BreadcrumbList', 'FAQPage', 'Person'].sort());
  const a = g.find(x => x['@type'] === 'BlogPosting');
  assert.equal(a.headline, '測試文章：作品集要放幾個項目？'); assert.equal(a.datePublished, '2026-03-04'); assert.equal(a.dateModified, '2026-03-10');
  assert.equal(a.author.name, 'Yu Chun Tsai'); assert.equal(a.author.url, 'https://yuchuntsai.com/cv/');
  assert.deepEqual(a.inLanguage, ['zh-Hant', 'en']);
  assert.deepEqual(g.find(x => x['@type'] === 'Person').sameAs, ['https://example.com/profile']);
  assert.equal(g.find(x => x['@type'] === 'FAQPage').mainEntity[0].acceptedAnswer.text, '測試答。');
  for (const s of scripts(h)) assert.doesNotThrow(() => new Function(s));
  const zhOnly = renderBlogPost(site, FIXTURE, FIXTURE.posts[0], {});
  assert.ok(!zhOnly.includes('hreflang') && !zhOnly.includes('data-set-lang') && !types(ldOf(zhOnly)).includes('FAQPage'));
  assert.match(renderBlogPost(site, FIXTURE, FIXTURE.posts[2], {}), /noindex/);
  assert.deepEqual(relatedPosts(FIXTURE, FIXTURE.posts[0]).map(x => x.slug), ['fixture-post']);
});

test('validation catches bad data and WeChat image URLs', () => {
  assert.deepEqual(validateBlog(FIXTURE), []);
  const bad = { posts: [{ slug: 'Bad Slug', title: 'x', date: '2026/1/1', categories: ['nope'], body: '<img src="https://mmbiz.qpic.cn/a.jpg">' }] };
  const e = validateBlog(bad).join('\n');
  for (const k of ['網址代稱', '日期', '分類', '微信圖片']) assert.ok(e.includes(k), k);
});

test('feed, sitemap, robots and llms.txt', () => {
  const f = renderFeed(FIXTURE, '2026-10-20');
  assert.ok(f.startsWith('<?xml') && f.includes('<feed xmlns="http://www.w3.org/2005/Atom"') && (f.match(/<entry>/g) || []).length === 2 && !f.includes('fixture-draft'));
  const sm = renderSitemap([{ loc: 'https://yuchuntsai.com/blog/fixture-post/', lastmod: '2026-03-10' }, { loc: 'https://yuchuntsai.com/board/a&b/', lastmod: '2026-10-20' }]);
  assert.ok(sm.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') && sm.includes('<lastmod>2026-03-10</lastmod>') && sm.includes('a&amp;b'));
  const r = renderRobots();
  for (const b of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Googlebot', 'Bingbot', 'Applebot-Extended', 'CCBot']) {
    assert.ok(AI_BOTS.includes(b)); assert.match(r, new RegExp('User-agent: ' + b + '\\nAllow: /\\n'));
  }
  assert.match(r, /Sitemap: https:\/\/yuchuntsai\.com\/sitemap\.xml/);
  const l = renderLlms(Object.assign({}, all, { blog: FIXTURE }), true);
  for (const k of ['12,000+', '370+', '1,800+', 'Princeton University', 'National University of Singapore', 'https://yuchuntsai.com/blog/fixture-post/', '測試重點']) assert.ok(l.includes(k), k);
  assert.ok(renderLlms(all, false).includes('Coming soon'));
});

test('blog link in every navigation; A–Z lists posts with a blog tag', () => {
  const pages = Object.assign(renderAll(all, {}), renderBlog(all, {}));
  for (const [rel, h] of Object.entries(pages)) assert.match(h, /href="(\.\.\/)*blog\/"|href="\.\/"[^>]*>blog</, rel + ' has no blog link');
  assert.match(pages['blog/index.html'], /<a class="on" href="\.\/">blog<\/a>/);
  const cv = readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8');
  assert.ok(cv.includes('href="../blog/"'));
  for (const ld of ldOf(cv)) assert.ok(types([ld]).includes('Person') && types([ld]).includes('WebSite'));
  assert.ok(types(ldOf(pages['index.html'])).includes('WebSite'));
  const e = azEntries(all.az, null, null, FIXTURE).filter(x => x.kind === 'blog');
  assert.deepEqual(e.map(x => x.link).sort(), ['../blog/fixture-older/', '../blog/fixture-post/']);
  assert.ok(renderAZ(site, all.az, {}, null, null, FIXTURE).includes('<span class="az-k">blog</span>'));
});

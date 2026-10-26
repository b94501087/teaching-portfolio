// Blog (/blog/), its SEO / answer-engine output (JSON-LD, feed, sitemap, robots, llms.txt) and the
// blog link in every navigation. FIXTURE below is test-only (never in content/blog.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

test('live content: posts valid, rebranded, local images; empty state still renders', () => {
  assert.deepEqual(validateBlog(blog), []);
  const live = blogPosts(blog);
  assert.ok(live.length >= 1);
  const txt = JSON.stringify(blog);
  assert.doesNotMatch(txt, /宇乔|宇喬|YUCIAO|Ycer|qpic\.cn/i, 'no third-party brand or WeChat image URLs');
  for (const p of live) {
    assert.ok(p.source && p.source.type === 'wechat' && /^\d{4}-\d{2}-\d{2}$/.test(p.source.date));
    for (const m of (JSON.stringify(p.body) + (p.cover || '')).matchAll(/assets\/blog\/[a-z0-9-]+\/[\w.-]+\.webp/g))
      assert.ok(existsSync(new URL('../' + m[0], import.meta.url)), m[0]);
    const h = renderBlogPost(site, blog, p, {});
    for (const s of scripts(h)) assert.doesNotThrow(() => new Function(s));
    assert.ok(types(ldOf(h)).includes('BlogPosting'));
  }
  const h = renderBlogIndex(site, { author: blog.author, posts: [] }, {});
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
  assert.ok(renderLlms(Object.assign({}, all, { blog: { posts: [] } }), false).includes('Coming soon'));
  for (const p of blogPosts(blog)) assert.ok(renderLlms(all, true).includes('https://yuchuntsai.com/blog/' + p.slug + '/'), p.slug);
});

test('blog link in every navigation; A–Z lists posts with a blog tag', () => {
  const pages = Object.assign(renderAll(all, {}), renderBlog(all, {}));
  for (const [rel, h] of Object.entries(pages)) assert.match(h, /href="(\.\.\/)*blog\/"|href="(\.\.\/|\.\/)"[^>]*>blog</, rel + ' has no blog link');
  assert.match(pages['blog/index.html'], /<a class="on" href="\.\/">blog<\/a>/);
  const cv = readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8');
  assert.ok(cv.includes('href="../blog/"'));
  for (const ld of ldOf(cv)) assert.ok(types([ld]).includes('Person') && types([ld]).includes('WebSite'));
  assert.ok(types(ldOf(pages['index.html'])).includes('WebSite'));
  const e = azEntries(all.az, null, null, FIXTURE).filter(x => x.kind === 'blog');
  assert.deepEqual(e.map(x => x.link).sort(), ['../blog/fixture-older/', '../blog/fixture-post/']);
  assert.ok(renderAZ(site, all.az, {}, null, null, FIXTURE).includes('<span class="az-k">blog</span>'));
});

test('language switch: default Chinese, shared EN/繁中 control, hreflang without new URLs', () => {
  const index = renderBlogIndex(site, blog, {});
  assert.match(index, /<html lang="zh-Hant" data-lang="zh-Hant">/);
  assert.match(index, /data-set-lang="en"/);
  assert.match(index, /data-set-lang="zh-Hant"/);
  assert.match(index, /title="English">EN</);
  assert.match(index, /title="繁體中文">繁中</);
  assert.match(index, /localStorage.getItem\("lang"\)/);
  assert.match(index, /localStorage.setItem\("lang",l\)/);
  // Unset visitors stay on Chinese. Project pages fall back to English; the blog must not.
  assert.match(index, /:"zh-Hant"\);/);
  assert.doesNotMatch(index, /:"en"\);/);
  assert.match(index, /hreflang="zh-Hant" href="https:\/\/yuchuntsai\.com\/blog\/"/);
  assert.match(index, /hreflang="en" href="https:\/\/yuchuntsai\.com\/blog\/\?lang=en"/);
  assert.match(index, /hreflang="x-default" href="https:\/\/yuchuntsai\.com\/blog\/"/);
  assert.match(index, /<link rel="canonical" href="https:\/\/yuchuntsai\.com\/blog\/">/);
  for (const p of blogPosts(blog)) {
    const h = renderBlogPost(site, blog, p, {});
    assert.match(h, /<html lang="zh-Hant" data-lang="zh-Hant">/, p.slug);
    assert.ok(h.includes('data-set-lang="en"') && h.includes('data-l="en"') && h.includes('data-l="zh-Hant"'), p.slug + ' switch');
    const article = h.indexOf('<article>');
    assert.ok(article > 0 && h.indexOf('data-l="zh-Hant"', article) < h.indexOf('data-l="en"', article), p.slug + ' Chinese is the default copy');
    assert.match(h, new RegExp('<link rel="canonical" href="https://yuchuntsai\\.com/blog/' + p.slug + '/">'), p.slug);
    assert.match(h, new RegExp('hreflang="en" href="https://yuchuntsai\\.com/blog/' + p.slug + '/\\?lang=en"'), p.slug);
    assert.match(h, new RegExp('hreflang="zh-Hant" href="https://yuchuntsai\\.com/blog/' + p.slug + '/">'), p.slug);
    assert.doesNotMatch(h, /rel="canonical"[^>]*\?lang=/, p.slug);
  }
});

test('flat English fields render, and a post or field without English falls back to Chinese', () => {
  const bilingual = {
    slug: 'flat-en', title: '只有中文標題', title_en: 'Flat English title',
    date: '2026-04-01', categories: ['essay'],
    summary: '中文摘要沒有英文', description_en: '',
    excerpt_en: '',
    tldr: { 'zh-Hant': '中文重點' },
    body: '<p>中文內文</p><figure class="post-work"><figcaption><strong>卡片</strong>｜說明<br><a class="work-link" href="../../board/x/">看完整作品：卡片 →</a></figcaption></figure>',
    body_en: '<p>Flat English body</p><figure class="post-work"><figcaption><strong>Card</strong>｜caption<br><a class="work-link" href="../../board/x/">See the full project: Card →</a></figcaption></figure>',
    faq: [{ q: '中文問？', q_en: 'English question?', a: '中文答。', a_en: 'English answer.' }]
  };
  const zhOnly = { slug: 'no-en', title: '僅中文', date: '2026-01-01', categories: ['essay'], summary: '僅摘要', body: '<p>僅中文內文</p>' };
  const data = { posts: [bilingual, zhOnly] };
  assert.deepEqual(validateBlog(data), []);
  const h = renderBlogPost(site, data, bilingual, {});
  assert.ok(h.includes('Flat English title') && h.includes('只有中文標題'));
  assert.ok(h.includes('Flat English body') && h.includes('中文內文') && h.includes('See the full project: Card'));
  assert.ok(h.includes('中文摘要沒有英文') && !h.includes('data-l="en">中文摘要'), 'missing English excerpt stays Chinese, untagged');
  assert.ok(h.includes('English question?') && h.includes('English answer.') && h.includes('中文問？'));
  assert.match(h, /rel="canonical" href="https:\/\/yuchuntsai\.com\/blog\/flat-en\/"/);
  assert.ok(h.indexOf('中文內文') < h.indexOf('Flat English body'));
  const z = renderBlogPost(site, data, zhOnly, {});
  assert.ok(!z.includes('data-set-lang') && !z.includes('hreflang') && z.includes('僅中文內文'));
  const list = renderBlogIndex(site, data, {});
  assert.ok(list.includes('Flat English title') && list.includes('僅中文') && list.includes('中文摘要沒有英文'));
});

test('post student works link to existing board pins and reuse local images', () => {
  const slugs = new Set(board.pins.map(p => p.slug));
  for (const p of blogPosts(blog)) {
    const html = JSON.stringify(p.body);
    for (const m of html.matchAll(/\.\.\/\.\.\/board\/([a-z0-9-]+)\//g)) assert.ok(slugs.has(m[1]), p.slug + ' -> ' + m[1]);
    for (const m of html.matchAll(/assets\/board\/[a-z0-9-]+\/[\w.-]+\.webp/g)) assert.ok(existsSync(new URL('../' + m[0], import.meta.url)), m[0]);
    const h = renderBlogPost(site, blog, p, {});
    if (p.abstract_en) assert.ok(h.includes('class="en-abstract" lang="en"'));
    for (const m of h.matchAll(/class="post-work"[\s\S]*?<\/figure>/g)) assert.match(m[0], /看完整作品：|<figcaption>/);
  }
});

test('board school tags: card + detail, bilingual, only where set', () => {
  const pages = renderAll(all, {});
  const b = pages['board/index.html'];
  assert.ok(b.includes('class="schools"') && b.includes('普林斯頓') && b.includes('Cornell B.Arch ED'));
  const tagged = board.pins.filter(p => Array.isArray(p.admitted_schools) && p.admitted_schools.length);
  assert.ok(tagged.length >= 1);
  for (const p of tagged) assert.ok(pages['board/' + p.slug + '/index.html'].includes('class="schools-row"'), p.slug);
  const untagged = board.pins.find(p => !p.admitted_schools);
  assert.ok(!pages['board/' + untagged.slug + '/index.html'].includes('class="schools-row"'));
});

test('post pages: 發表於 = original date, 更新於 = latest; no visible WeChat / 微信 / 公眾號 source text', () => {
  const out = renderBlog(all, {});
  for (const [f, html] of Object.entries(out)) {
    const vis = html.replace(/<script[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(vis, /微信|公眾號|公众号|WeChat|mp\.weixin/i, f + ' must not mention WeChat');
    assert.ok(!vis.includes('發佈'), f + ' uses 發表於, not 發佈');
  }
  for (const p of blogPosts(blog)) {
    const html = Object.entries(out).find(([f]) => f.includes(p.slug + '/'))[1];
    const orig = (p.source && p.source.date) || p.date;
    assert.ok(html.includes('發表於 <time datetime="' + orig + '"'), p.slug + ' published date');
    assert.ok(html.includes('Published <time datetime="' + orig + '"'), p.slug + ' English published date');
    if (p.updated && p.updated !== orig) {
      assert.ok(html.includes('更新於 <time datetime="' + p.updated + '"'), p.slug + ' updated date');
      assert.ok(html.includes('Updated <time datetime="' + p.updated + '"'), p.slug + ' English updated date');
    }
  }
});

// Simplified Chinese is generated from Traditional (OpenCC) and offered everywhere the EN / 繁中 switch exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toHans, injectHans } from '../admin/hans.js';
import { mergeBoard, renderBoard, renderDetail, renderTeaching, LANGS } from '../admin/render.js';
import { renderBlogPost, renderBlogIndex, validateBlog } from '../admin/blog.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url)));
const site = read('site.json');

test('OpenCC tw→cn characters plus the Taiwan phrases that stay sensible here', () => {
  assert.equal(toHans('軟體'), '软件');
  assert.equal(toHans('網路'), '网络');
  assert.equal(toHans('列印'), '打印');
  assert.equal(toHans('資訊'), '信息');
  assert.equal(toHans('臺灣'), '台湾');
  assert.equal(toHans('裡'), '里');
  assert.equal(toHans('五張投影片與一支影片'), '五张投影片与一支视频');
  assert.equal(toHans('喬治亞理工'), '乔治亚理工');
  assert.equal(toHans('使用者'), '使用者');
  assert.equal(toHans('重新整理'), '重新整理');
  assert.equal(toHans('簡報'), '简报');
  assert.equal(toHans('預設'), '预设');
  assert.equal(toHans('預設值'), '默认值');
  assert.equal(toHans('互動裝置'), '互动装置');
  assert.equal(toHans(''), '');
  assert.equal(toHans('MIT'), 'MIT');
});

test('blog: title.hans overrides conversion; a new Traditional post still gets 简中', () => {
  const over = {
    slug: 'hans-override', title: { 'zh-Hant': '軟體教學', en: 'Software teaching', hans: '手改简体标题' },
    date: '2026-04-02', categories: ['essay'],
    summary: { 'zh-Hant': '網路摘要' }, summary_hans: '手改摘要',
    body: { 'zh-Hant': '<p>列印模型</p>' }, body_en: '<p>Printed model</p>',
    faq: [{ q: '軟體？', q_hans: '手改问', a: '可以。', a_en: 'Yes.' }]
  };
  const fresh = { slug: 'hans-fresh', title: '只有繁體', date: '2026-04-03', categories: ['essay'], summary: '資訊', body: '<p>臺灣的作品集</p>' };
  assert.deepEqual(validateBlog({ posts: [over, fresh] }), []);
  const h = renderBlogPost(site, { posts: [over, fresh] }, over, {});
  assert.ok(h.includes('手改简体标题') && !h.includes('>软件教学<'));
  assert.ok(h.includes('打印模型') && h.includes('手改问'));
  assert.ok(h.includes('data-set-lang="zh-Hans"') && h.includes('hreflang="zh-Hans"'));
  assert.match(h, /assets\/img-guard\.js/);
  const z = renderBlogPost(site, { posts: [over, fresh] }, fresh, {});
  assert.ok(z.includes('只有繁体') && z.includes('台湾的作品集'));
  assert.ok(z.includes('data-set-lang="zh-Hans"') && !z.includes('data-set-lang="en"'));
  const index = renderBlogIndex(site, { posts: [over, fresh] }, {});
  assert.ok(index.includes('手改简体标题') && index.includes('手改摘要') && index.includes('只有繁体') && index.includes('信息'));
  assert.equal(LANGS.join(','), 'en,zh-Hant,zh-Hans');
});

test('board, teaching and CV expose EN / 繁中 / 简中 and keep image guards', () => {
  const board = mergeBoard(read('board.json'), f => read(f));
  const b = renderBoard(site, board, {});
  assert.match(b, /data-set-lang="en"/);
  assert.match(b, /data-set-lang="zh-Hant"/);
  assert.match(b, /data-set-lang="zh-Hans"/);
  assert.ok(b.indexOf('>EN<') < b.indexOf('>繁中<') && b.indexOf('>繁中<') < b.indexOf('>简中<'));
  assert.match(b, /hreflang="zh-Hans" href="https:\/\/yuchuntsai\.com\/board\/\?lang=zh-Hans"/);
  assert.ok(b.includes('普林斯頓') && b.includes('普林斯顿'));
  assert.match(b, /draggable="false"/);
  assert.match(b, /assets\/img-guard\.js/);
  const pin = board.pins.find(p => p.slug === 'chimera-haven');
  const d = renderDetail(site, board, pin, {});
  assert.ok(d.includes('data-set-lang="zh-Hans"') && d.includes('岭南园林'));
  assert.match(d, /hreflang="zh-Hans" href="https:\/\/yuchuntsai\.com\/board\/chimera-haven\/\?lang=zh-Hans"/);
  assert.match(d, /class="zoom"/);
  assert.match(d, /draggable="false"/);
  const teaching = renderTeaching(site, read('teaching.json'), {});
  assert.ok(teaching.includes('data-set-lang="zh-Hans"') && teaching.includes('叙事') && teaching.includes('教學理念'));
  assert.match(teaching, /hreflang="zh-Hans" href="https:\/\/yuchuntsai\.com\/teaching\/\?lang=zh-Hans"/);
  const cv = injectHans(readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8'));
  assert.ok(cv.includes('data-set-lang="zh-Hans"') && cv.includes('>简中</button>'));
  assert.ok(cv.includes('國立臺灣大學') && cv.includes('国立台湾大学'));
  assert.ok(cv.includes('data-l="zh-Hant"') && cv.includes('hreflang="zh-Hans"'));
  assert.match(cv, /function canon\(x\)/);
  assert.equal(injectHans(cv), cv);
});

test('stored board i18n zh-Hans overrides the generated line', () => {
  const pin = {
    slug: 'hans-pin', title: 'English title', description: 'English body',
    images: ['assets/board/chimera-haven/01-original-evolution.webp'],
    i18n: {
      'zh-Hant': { title: '繁體標題', description: '繁體說明' },
      'zh-Hans': { title: '手改标题' }
    },
    sections: [{ heading: 'Section', body: 'Body', images: ['assets/board/chimera-haven/01-original-evolution.webp'], captions: ['cap'],
      i18n: { 'zh-Hant': { heading: '繁體段', body: '繁體內文', captions: ['繁體圖說'] } } }]
  };
  const h = renderDetail(site, { pins: [pin] }, pin, {});
  assert.ok(h.includes('手改标题') && h.includes('繁体说明') && h.includes('繁体段') && h.includes('繁体图说'));
  assert.ok(!h.includes('繁体标题'));
});

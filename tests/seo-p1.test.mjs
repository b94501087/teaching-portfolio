// P1: share tags, Traditional Chinese as the default, teaching studios, consulting/home, board weight, legacy stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mergeBoard, renderBoard, renderDetail, renderLanding, renderConsulting, renderTeachingDetail,
  pinShareText, stripPrivate, deferredBoardCards, BOARD_EAGER, SITEMAP_SKIP_RE, HOURS_ZH, HOURS_EN, listedPins
} from '../admin/render.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url), 'utf8'));
const site = read('site.json');
const board = mergeBoard(read('board.json'), f => read(f));
const teaching = read('teaching.json');
const consulting = read('consulting.json');

test('the first 49 board pages use the written caption; others stay free of credits and ids', () => {
  const pin = board.pins.find(p => p.slug === 'a-body-without-rights');
  assert.equal(pinShareText(pin), '以牆刺與眼球轉譯女性之痛為情緒敘事空間');
  const other = board.pins.find(p => p.slug === 'chimera-haven');
  const text = pinShareText(other);
  assert.match(text, /空間不是畫完就定格/);
  assert.doesNotMatch(text, /學生作品|Student Project|Yu Chun Tsai|設計指導/);
  const planted = {
    slug: 'not-in-the-caption-list', title: 'Tower',
    description: 'A timber tower.\n\nStudent: Ada Lovelace | ID A123456 | Student Project | Design Mentor: Yu Chun Tsai',
    i18n: { 'zh-Hant': { title: '木塔', description: '一座木塔。\n\n學生：王小明｜學號 12345678｜學生作品｜Yu Chun Tsai 設計指導' } }
  };
  const blur = pinShareText(planted);
  assert.match(blur, /木塔/);
  assert.equal(stripPrivate(blur).includes('王小明'), false);
  assert.equal(blur.includes('12345678'), false);
  assert.equal(blur.includes('Ada'), false);
  assert.equal(blur.includes('A123456'), false);
});

test('board and teaching detail pages default to zh-Hant and carry share tags', () => {
  const pin = board.pins.find(p => p.slug === 'a-body-without-rights');
  const h = renderDetail(site, board, pin, {});
  assert.match(h, /<html lang="zh-Hant" data-lang="zh-Hant">/);
  assert.match(h, /:"zh-Hant"\);/);
  assert.match(h, /<meta name="description" content="以牆刺與眼球轉譯女性之痛為情緒敘事空間">/);
  assert.match(h, /property="og:title"/);
  assert.match(h, /property="og:description"/);
  assert.match(h, /property="og:url" content="https:\/\/yuchuntsai\.com\/board\/a-body-without-rights\/"/);
  assert.match(h, /property="og:image" content="https:\/\/yuchuntsai\.com\/assets\/board\/a-body-without-rights\//);
  assert.match(h, /name="twitter:card" content="summary_large_image"/);
  assert.match(h, /hreflang="zh-Hant"/);
  assert.match(h, /data-set-lang="en"/);
  assert.match(h, /data-set-lang="zh-Hans"/);
  const studio = teaching.sections.find(s => s.slug === 'arcades');
  const t = renderTeachingDetail(site, teaching, studio, {});
  assert.match(t, /<html lang="zh-Hant" data-lang="zh-Hant">/);
  assert.match(t, /data-set-lang="en"/);
  assert.match(t, /data-set-lang="zh-Hant"/);
  assert.match(t, /data-set-lang="zh-Hans"/);
  assert.match(t, /hreflang="zh-Hant" href="https:\/\/yuchuntsai\.com\/teaching\/arcades\/"/);
  assert.match(t, /hreflang="en" href="https:\/\/yuchuntsai\.com\/teaching\/arcades\/\?lang=en"/);
  assert.match(t, /hreflang="zh-Hans" href="https:\/\/yuchuntsai\.com\/teaching\/arcades\/\?lang=zh-Hans"/);
  assert.match(t, /property="og:image"/);
  assert.ok(t.includes('From Benjamin') || t.includes('拱廊'));
  assert.ok(t.includes('從 Benjamin') || t.includes('拱廊'));
});

test('home and consulting expose the hours phrase, a question heading, and organization data', () => {
  const home = renderLanding(site, {});
  assert.match(home, /<title>YU CHUN TSAI — 建築與設計作品集指導<\/title>/);
  assert.match(home, /<h1>YU CHUN TSAI<span>建築與設計作品集指導從哪裡開始？<\/span><\/h1>/);
  assert.ok(home.includes(HOURS_ZH) && home.includes(HOURS_EN));
  assert.match(home, /property="og:image"/);
  assert.match(home, /"@type":"EducationalOrganization"/);
  assert.match(home, /"@type":"Person"/);
  const c = renderConsulting(site, consulting, {});
  assert.match(c, /<title>設計諮詢怎麼開始？ — YU CHUN TSAI<\/title>/);
  assert.match(c, /<h1>設計諮詢怎麼開始？<\/h1>/);
  assert.match(c, /<h2>想用哪種方式支付？<\/h2>/);
  assert.match(c, /<h2>如何確認方案並索取付款指示？<\/h2>/);
  assert.match(c, /rel="canonical" href="https:\/\/yuchuntsai\.com\/consulting\/"/);
  assert.match(c, /property="og:description"/);
  assert.match(c, /"@type":"EducationalOrganization"/);
  assert.match(c, /"@type":"Person"/);
  assert.ok(c.includes('Design consulting'));
  assert.ok(c.includes('先付費'));
});

test('deferred board HTML keeps the first screen and the rest in order', () => {
  const pins = listedPins(board);
  const opts = { deferBoard: true };
  const h = renderBoard(site, board, opts);
  assert.equal((h.match(/<a class="pin\b/g) || []).length, Math.min(BOARD_EAGER, pins.length));
  assert.match(h, /data-more="cards\.json"/);
  assert.ok(h.length < 120000, 'board html ' + h.length);
  const rest = deferredBoardCards(board, opts);
  assert.equal(rest.length, pins.length - BOARD_EAGER);
  assert.match(rest[0], new RegExp('data-i="' + BOARD_EAGER + '" data-slug="' + pins[BOARD_EAGER].slug + '"'));
  assert.match(rest[rest.length - 1], new RegExp('data-slug="' + pins[pins.length - 1].slug + '"'));
  const ids = rest.map(s => +(s.match(/data-i="(\d+)"/) || [])[1]);
  assert.deepEqual(ids, ids.slice().sort((a, b) => a - b));
  for (const s of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(s[1]));
});

test('CV opens in Traditional Chinese and states the hours phrase exactly', () => {
  const cv = readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8');
  assert.match(cv, /<html lang="zh-Hant" data-lang="zh-Hant">/);
  assert.match(cv, /:"zh-Hant"\);/);
  assert.doesNotMatch(cv, /:"en"\);/);
  assert.ok(cv.includes('12,000+ 小時'));
  assert.ok(cv.includes('12,000+ hours'));
});

test('legacy stubs are canonical and kept out of the sitemap', () => {
  for (const rel of ['pins/', 'a-z/', 'ksteinfe/', 'ksteinfe/index.html']) assert.equal(SITEMAP_SKIP_RE.test(rel.replace(/(^|\/)index\.html$/, '')), true, rel);
  assert.equal(SITEMAP_SKIP_RE.test('board/'), false);
  assert.equal(SITEMAP_SKIP_RE.test('A-Z/'), false);
  assert.equal(SITEMAP_SKIP_RE.test('A-Z/berkeley.html'), false);
  for (const f of ['../pins/index.html', '../ksteinfe/index.html', '../ksteinfe/berkeley.html']) {
    const html = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(html, /rel="canonical"/, f);
    assert.match(html, /http-equiv="refresh"/, f);
  }
});

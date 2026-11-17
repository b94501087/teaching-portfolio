// /privacy/ and /terms/: static trilingual doc pages on the /cv/ template, listed in the sitemap;
// the consulting page shows the tax label beside every price, a delivery section and a contact footer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderConsulting } from '../admin/render.js';
import { injectHans } from '../admin/hans.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const site = JSON.parse(read('content/site.json'));
const consulting = JSON.parse(read('content/consulting.json'));
const REFUND = consulting.terms.find(t => t.startsWith('退費：'));

test('privacy and terms pages: zh-Hant default, three languages, canonical, nav, no new stylesheet', () => {
  for (const slug of ['privacy', 'terms']) {
    const h = read(slug + '/index.html');
    assert.match(h, /<html lang="zh-Hant" data-lang="zh-Hant">/);
    assert.match(h, new RegExp('<link rel="canonical" href="https://yuchuntsai\\.com/' + slug + '/">'));
    assert.match(h, /<link rel="stylesheet" href="\.\.\/A-Z\/style\.css">/);
    assert.match(h, /<main class="doc cv">/);
    assert.ok(h.includes('href="../blog/"') && h.includes('href="../consulting/"'));
    assert.match(h, /<script src="\.\.\/assets\/img-guard\.js"><\/script>/);
    const hans = injectHans(h);
    assert.ok(hans.includes('data-l="zh-Hans"') && hans.includes('>简中</button>'));
    assert.ok(!h.includes('\u5c08\u6848'), slug + ' uses 項目');
  }
});

test('terms quote the consulting refund rule exactly', () => {
  assert.ok(REFUND);
  assert.ok(read('terms/index.html').includes(REFUND));
});

test('build lists /privacy/ and /terms/ as static pages', () => {
  const b = read('build/build.mjs');
  assert.match(b, /DOC_PAGES = \['cv\/index\.html', 'privacy\/index\.html', 'terms\/index\.html'\]/);
  assert.match(b, /staticPages = \[\.\.\.DOC_PAGES/);
});

test('consulting: tax label beside each price, delivery section, contact footer with legal links', () => {
  const c = renderConsulting(site, consulting, {});
  const tax = consulting.taxLabel;
  assert.ok(tax);
  const list = c.slice(c.indexOf('<div class="list" id="pkgs">'), c.indexOf('<section class="pay">'));
  assert.equal((list.match(/<small class="tax">/g) || []).length, consulting.plans.length);
  assert.ok(!c.includes('{{tax}}') && !c.includes('{{email}}'));
  assert.match(c, /var TAX = /);
  assert.match(c, /<section class="checkout" id="delivery">\s*<h2>服務如何交付？<\/h2>/);
  assert.match(c, /<footer class="wrap">[\s\S]*href="\.\.\/terms\/"[\s\S]*href="\.\.\/privacy\/"/);
  assert.ok(c.includes(REFUND.replace('退費：', '')));
  assert.ok(!c.includes('客服電話') && !c.includes('待老闆提供'), 'no phone placeholder on the consulting page');
  assert.ok(c.includes('聯絡地址：新北市新店區'));
});

test('r2 owner answers: tax excluded, no phone, Xindian address, admission not guaranteed in three languages', () => {
  assert.equal(consulting.taxLabel, '未稅，另加 5% 營業稅');
  const terms = injectHans(read('terms/index.html'));
  assert.ok(terms.includes('諮詢不保證錄取結果') && terms.includes('咨询不保证录取结果') && terms.includes('consulting does not guarantee admission'));
  assert.ok(terms.includes('價格未稅，另加 5% 營業稅') && terms.includes('exclude 5% Taiwan business tax'));
  for (const slug of ['privacy', 'terms']) {
    const h = read(slug + '/index.html');
    assert.ok(!/電話|Phone:/.test(h), slug + ' shows no phone line');
    assert.ok(h.includes('聯絡地址：新北市新店區'));
    assert.ok(h.includes('網站經營者：{{name}}（個人名義）'));
  }
});

test('r3: legal phrase table only on /privacy/ and /terms/, JSON-LD tax on every offer, no placeholders left', async () => {
  const { toHans } = await import('../admin/hans.js');
  assert.equal(toHans('個人資料保護法'), '个人数据保护法', 'general table unchanged for other pages');
  assert.equal(toHans('依《個人資料保護法》查詢或閱覽、製給複製本', { legal: true }), '依《个人资料保护法》查询或阅览、制给复制本');
  assert.equal(toHans('不代寫申請文件', { legal: true }), '不代写申请文件');
  const b = read('build/build.mjs');
  assert.match(b, /injectHans\(src, \{ legal: LEGAL_PAGES\.includes\(rel\) \}\)/);
  assert.match(b, /LEGAL_PAGES = \['privacy\/index\.html', 'terms\/index\.html'\]/);
  const c = renderConsulting(site, consulting, {});
  const ld = JSON.parse(c.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const offers = ld['@graph'].find(x => x['@type'] === 'Service').offers;
  assert.equal(offers.length, 4);
  for (const o of offers) {
    assert.equal(o.priceSpecification.valueAddedTaxIncluded, false);
    assert.equal(o.priceSpecification.price, o.price);
    assert.ok(o.description.includes(consulting.taxLabel));
  }
  for (const slug of ['privacy', 'terms']) {
    const h = read(slug + '/index.html');
    assert.ok(!/<mark|待老闆|TBD by owner|To be confirmed by owner|建議值，待確認|suggested, pending/.test(h), slug + ': no placeholder, suggested-value tag or <mark> left');
  }
  const p = read('privacy/index.html');
  assert.ok(p.includes('文章代稱、類型（閱讀、按讚或收藏）、狀態與時間') && p.includes('收藏時間'));
});

test('r4: Web Analytics disclosure names pageloadId and the country/device/browser/OS dimensions; zh-Hans legal terms', async () => {
  const { injectHans } = await import('../admin/hans.js');
  const p = read('privacy/index.html');
  assert.ok(p.includes('頁面識別碼（pageloadId）') && p.includes('國家、裝置類型') && p.includes('瀏覽器與作業系統'));
  assert.ok(p.includes('page-load identifier (pageloadId)') && p.includes('country, device type'));
  const hans = injectHans(p, { legal: true });
  assert.ok(hans.includes('查询字符串') && hans.includes('数据中心'));
  assert.ok(!hans.includes('查找字符串') && !hans.includes('资料中心'));
});

test('r5 owner answers (11/17 10:32): refund tiers, no-show, cooling-off, court, copyright, subscription notices, no <mark>', () => {
  const tiers = ['首次會面 7 天前取消全額退費', '3 天前取消退 80%', '首次會面前 3 天內取消退 80%', '首次會面開始後 48 小時內取消退 70%',
    '首次會面開始 48 小時後至第二次會面前取消退 70%', '第二次會面後退 60%（即使仍在首次會面開始後 48 小時內）', '第三次會面後不退費'];
  let at = -1;
  for (const t of tiers) { const i = REFUND.indexOf(t); assert.ok(i > at, 'tier in order: ' + t); at = i; }
  const c = renderConsulting(site, consulting, {});
  const t = read('terms/index.html'), p = read('privacy/index.html');
  assert.ok(c.includes(REFUND.replace('退費：', '')) && t.includes(REFUND), 'consulting and terms carry the same refund text');
  assert.ok(t.includes('within 3 days before the first meeting, 80% refund') && t.includes('from 48 hours after the first meeting starts until the second meeting, 70% refund'));
  assert.ok(t.includes('中華民國法律為準據法') && t.includes('臺灣新北地方法院'));
  assert.ok(t.includes('學生作品的著作權屬於學生；本站展示學生作品前，會先取得學生同意'));
  assert.ok(p.includes('新文章通知寄送：目前還沒有寄送過訂閱通知信') && p.includes('no subscriber notices have been sent yet'));
  for (const h of [c, t, p]) assert.ok(!/<mark|建議值，待確認|suggested, pending|待老闆|TBD by owner/.test(h));
});

test('r6 owner answers (11/17 11:25): no cooling-off clause, 60% once the second meeting has happened, no-show rule (see r7)', () => {
  const c = renderConsulting(site, consulting, {});
  const t = read('terms/index.html'), p = read('privacy/index.html');
  for (const h of [c, t, p, JSON.stringify(consulting)]) assert.ok(!/猶豫|cooling-off|Cooling-off/.test(h), 'P1: cooling-off clause removed');
  assert.ok(REFUND.includes('第二次會面後退 60%（即使仍在首次會面開始後 48 小時內）'));
  assert.ok(c.includes(REFUND.replace('退費：', '')) && t.includes(REFUND));
  assert.ok(t.includes('after the second meeting, 60% refund (even if still within 48 hours after the first meeting starts)'));
  assert.ok(!t.includes('without notice is charged'));
  for (const h of [c, t]) assert.ok(!h.includes('未事先通知而未到場'));
});

test('r7 owner answer (11/17 11:39): no-show costs 1 hour only on hour-based plans; period-based plans are not charged', () => {
  const c = renderConsulting(site, consulting, {});
  const t = read('terms/index.html');
  for (const h of [c, t]) assert.ok(!/一律扣 1 小時|不論按時數或按期間/.test(h));
  assert.ok(!t.includes('on every plan, whether hour-based or period-based'));
  const hans = injectHans(t, { legal: true });
  assert.ok(hans.includes('每次未到场扣 1 小时') && hans.includes('未到场不扣。'));
});

test('r8 owner answer (11/17 11:56): no-show sentence names the plans; 單設計項目輔導 is hour-based at 25 hours', () => {
  const c = renderConsulting(site, consulting, {});
  const t = read('terms/index.html');
  const NS = '改期與未到場：諮詢開始 24 小時前以 Email 通知可改期；按時數計的方案（10 小時諮詢、單設計項目輔導以 25 小時計），每次未到場扣 1 小時；期間制方案（三個月設計諮詢、六個月設計諮詢）未到場不扣。';
  assert.equal(consulting.delivery.filter(x => x === NS).length, 1);
  for (const h of [c, t]) assert.equal(h.split(NS).length - 1, 1);
  const titles = consulting.plans.map(p => p.title);
  for (const name of ['10 小時諮詢', '單設計項目輔導', '三個月設計諮詢', '六個月設計諮詢']) assert.ok(titles.includes(name), 'plan name matches consulting page: ' + name);
  assert.ok(t.includes('Rescheduling and no-shows: sessions can be rescheduled by email at least 24 hours before they start; on hour-based plans (10-hour consulting, and single design project mentoring counted as 25 hours), each no-show is charged 1 hour; on period-based plans (three-month and six-month design consulting), no-shows are not charged.'));
  const hans = injectHans(t, { legal: true });
  assert.ok(hans.includes('按时数计的方案（10 小时咨询、单设计项目辅导以 25 小时计），每次未到场扣 1 小时；期间制方案（三个月设计咨询、六个月设计咨询）未到场不扣。'));
});

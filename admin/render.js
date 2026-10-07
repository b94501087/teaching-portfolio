// Shared page templates for yuchuntsai.com.
// Used by build/build.mjs at deploy time (Node) and by /admin for live preview (browser),
// so the preview is rendered with exactly the same markup as the public pages.
// Pure functions only: content objects in, HTML strings out. No DOM, no Node APIs.
// Locked design (fonts, colours, spacing, radius, column count) lives in the page CSS files,
// not in content, and cannot be changed from /admin.

// Output paths. The site root (https://yuchuntsai.com/) is a minimal landing page;
// the pin board lives at /board/ and each visible pin gets a detail page at /board/<slug>/.
export const PAGES = {
  landing: 'index.html',
  board: 'board/index.html',
  az: 'A-Z/index.html',
  teaching: 'teaching/index.html',
  consulting: 'consulting/index.html'
};
// Directory of each page relative to the site root (used for <base> in the admin preview).
export const PAGE_DIRS = { landing: '', board: 'board/', az: 'A-Z/', teaching: 'teaching/', consulting: 'consulting/' };
export const detailPath = slug => 'board/' + slug + '/index.html';
export const detailDir = slug => 'board/' + slug + '/';

export const MAX_PIN_IMAGES = 10;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "Studio model" -> "studio-model". Non-Latin titles give '' (caller supplies a fallback).
export function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}
// Unique slug among `taken` (a Set): base, base-2, base-3, ...
export function uniqueSlug(base, taken) {
  base = slugify(base) || 'work';
  let s = base, k = 2;
  while (taken.has(s)) s = base + '-' + k++;
  return s;
}

export const CURRENCIES = ['CNY', 'USD', 'EUR', 'TWD'];

const LETTER_LABEL = { l: 'L' }; // lowercase l reads like 1 in italic, so it is shown capitalised

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(u) {
  u = String(u == null ? '' : u).trim();
  if (/^(javascript|data|vbscript):/i.test(u)) return '#';
  return u || '#';
}

// Tiny inline markup for editable text: **bold** and [text](link). Everything else is escaped.
// Newlines become newline + indent (keeps generated HTML tidy; renders as a space).
export function inline(s, indent) {
  let h = esc(s);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => '<a href="' + esc(safeUrl(u.replace(/&amp;/g, '&'))) + '">' + t + '</a>');
  if (indent != null) h = h.replace(/\n/g, '\n' + indent);
  return h;
}

// Root-relative asset paths (e.g. "assets/pins/x.jpg") are made relative to the page directory.
function assetUrl(src, depth) {
  src = String(src || '');
  if (/^(https?:|data:|blob:|\/|\.\.?\/)/i.test(src)) return src;
  return '../'.repeat(depth) + src;
}

function headExtra(opts) {
  return opts && opts.base ? '<base href="' + esc(opts.base) + '">' : '';
}

export function letterOf(title) {
  const m = String(title || '').match(/[A-Za-z]/);
  return m ? m[0].toLowerCase() : '#';
}

/* ---------- landing (site root) ---------- */
// Layout is fixed; only the name and the link labels come from content/site.json.
export function renderLanding(site, opts) {
  const n = site.nav;
  return '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/">\n' +
    '<link rel="stylesheet" href="style.css"></head><body class="landing">\n' +
    '<main>\n' +
    '  <h1>' + esc(site.name) + '</h1>\n' +
    '  <nav>\n' +
    '    <a href="board/">' + esc(n.board) + '</a>\n' +
    '    <a href="A-Z/">' + esc(n.az) + '</a>\n' +
    '    <a href="teaching/">' + esc(n.teaching) + '</a>\n' +
    '    <a href="consulting/">' + esc(n.consulting) + '</a>\n' +
    '    <a href="cv/">' + esc(n.cv) + '</a>\n' +
    '  </nav>\n' +
    '</main>\n' +
    '</body></html>\n';
}

/* ---------- board (/board/) and pin detail pages (/board/<slug>/) ---------- */
// Top bar shared by the board and its detail pages. depth = directory depth below the root.
function topBar(site, depth) {
  const n = site.nav, up = '../'.repeat(depth);
  return '<header class="bar">\n' +
    '  <strong><a href="' + up + '">' + esc(site.name) + '</a></strong>\n' +
    '  <nav>\n' +
    '    <a class="on" href="' + (depth === 1 ? './' : '../'.repeat(depth - 1)) + '">' + esc(n.board) + '</a>\n' +
    '    <a href="' + up + 'A-Z/">' + esc(n.az) + '</a>\n' +
    '    <a href="' + up + 'teaching/">' + esc(n.teaching) + '</a>\n' +
    '    <a href="' + up + 'consulting/">' + esc(n.consulting) + '</a>\n' +
    '    <a href="' + up + 'cv/">' + esc(n.cv) + '</a>\n' +
    '  </nav>\n' +
    '</header>\n';
}

export const pinImages = p => (Array.isArray(p.images) ? p.images : []).filter(x => String(x || '').trim());
export const visiblePins = board => (board.pins || []).filter(p => p.visible !== false);

export function renderBoard(site, board, opts) {
  const n = site.nav;
  const pins = visiblePins(board);
  const anyBig = pins.some(p => p.big);
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + ' — ' + esc(n.board) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/board/">\n' +
    '<link rel="stylesheet" href="../style.css"></head><body>\n' +
    topBar(site, 1) +
    '<div class="board">\n';
  for (const p of pins) {
    h += '  <a class="pin' + (p.big ? ' big' : '') + '" href="' + esc(p.slug) + '/"><img src="' + esc(assetUrl(pinImages(p)[0], 1)) + '" alt=""><span class="cap">' + esc(p.title) + '</span></a>\n';
  }
  h += '</div>\n';
  if (board.foot) h += '<p class="foot">' + inline(board.foot) + '</p>\n';
  if (anyBig) h += BOARD_MASONRY;
  h += '</body></html>\n';
  return h;
}

// Plain-text description: blank line = new paragraph, single newline = line break. No markup.
export function paragraphs(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(x => x.trim()).filter(Boolean)
    .map(x => '<p>' + esc(x).replace(/\n/g, '<br>\n') + '</p>\n').join('');
}

// Optional interleaved layout: pin.sections = [{ heading, body, images: [paths from pin.images], captions: [one line each] }].
// A section with text + images alternates image-left/text-right, then text-left/image-right (stacked on phones);
// images only = full width; text only = a plain text block. One caption for several images = a shared caption.
// Images of the pin that no section uses still appear in the plain gallery after the sections.
export function pinSections(pin) {
  const pool = new Set(pinImages(pin));
  return (Array.isArray(pin.sections) ? pin.sections : []).filter(s => s && typeof s === 'object').map(s => {
    const imgs = [], caps = [];
    (Array.isArray(s.images) ? s.images : []).forEach((src, k) => {
      if (pool.has(src)) { imgs.push(src); caps.push(String((Array.isArray(s.captions) && s.captions[k]) || '').trim()); }
    });
    return { heading: String(s.heading || '').trim(), body: String(s.body || ''), images: imgs, captions: caps };
  }).filter(s => s.heading || s.body.trim() || s.images.length);
}

function galleryImg(src, alt, lazy) {
  const u = esc(assetUrl(src, 2));
  return '<a href="' + u + '"><img src="' + u + '" alt="' + esc(alt) + '"' + (lazy ? ' loading="lazy"' : '') + '></a>';
}

export function renderDetail(site, board, pin, opts) {
  const n = site.nav;
  const imgs = pinImages(pin).slice(0, MAX_PIN_IMAGES);
  const secs = pinSections(pin);
  const alt = src => pin.title + (imgs.length > 1 ? '（' + (imgs.indexOf(src) + 1) + '／' + imgs.length + '）' : '');
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(pin.title) + ' — ' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/board/' + esc(pin.slug) + '/">\n' +
    '<link rel="stylesheet" href="../../style.css"></head><body class="detail">\n' +
    topBar(site, 2) +
    '<main' + (secs.length ? ' class="has-sections"' : '') + '>\n' +
    '  <p class="back"><a href="../">← ' + esc(n.board) + '</a></p>\n' +
    '  <h1>' + esc(pin.title) + '</h1>\n';
  const desc = paragraphs(pin.description);
  if (desc) h += '<div class="desc">\n' + desc + '</div>\n';
  let rest = imgs, shown = 0;
  if (secs.length) {
    const used = new Set();
    let flip = false;
    for (const s of secs) {
      const text = s.heading || s.body.trim();
      const kind = text && s.images.length ? 'split' + (flip ? ' flip' : '') : s.images.length ? 'wide' : 'text';
      if (text && s.images.length) flip = !flip;
      h += '<section class="sec ' + kind + '">\n';
      if (text) h += '<div class="sec-text">\n' + (s.heading ? '<h2>' + esc(s.heading) + '</h2>\n' : '') + paragraphs(s.body) + '</div>\n';
      if (s.images.length) {
        const caps = s.captions.filter(Boolean);
        const shared = s.images.length > 1 && caps.length === 1 && s.captions[0];
        const many = ' n' + Math.min(s.images.length, 3);
        if (shared || s.images.length === 1) {
          h += '<figure class="sec-media"><div class="sec-imgs' + many + '">' + s.images.map(src => galleryImg(src, alt(src), shown++ > 0)).join('') + '</div>' +
            (caps[0] ? '<figcaption>' + esc(caps[0]) + '</figcaption>' : '') + '</figure>\n';
        } else {
          h += '<div class="sec-media"><div class="sec-imgs' + many + '">' + s.images.map((src, k) => '<figure>' + galleryImg(src, alt(src), shown++ > 0) +
            (s.captions[k] ? '<figcaption>' + esc(s.captions[k]) + '</figcaption>' : '') + '</figure>').join('') + '</div></div>\n';
        }
        s.images.forEach(x => used.add(x));
      }
      h += '</section>\n';
    }
    rest = imgs.filter(x => !used.has(x));
  }
  if (rest.length || !secs.length) {
    h += '<div class="gallery">\n';
    rest.forEach(src => { h += '  ' + galleryImg(src, alt(src), shown++ > 0) + '\n'; });
    h += '</div>\n';
  }
  h += '<p class="back end"><a href="../">← ' + esc(n.board) + '</a></p>\n' +
    '</main>\n</body></html>\n';
  return h;
}

// Only emitted when at least one pin is marked 大圖 (big). CSS columns cannot span exactly two
// columns, so with big pins the board switches to a small JS masonry that keeps the locked
// column count from style.css (read via getComputedStyle). Without JS it falls back to columns.
const BOARD_MASONRY = `<script>
(function () {
  var b = document.querySelector('.board');
  function lay() {
    b.classList.remove('masonry');
    var cs = getComputedStyle(b);
    var n = parseInt(cs.columnCount, 10) || 4;
    var gap = parseFloat(cs.columnGap) || 16;
    var padL = parseFloat(cs.paddingLeft) || 0, padT = parseFloat(cs.paddingTop) || 0;
    var inner = b.clientWidth - padL - (parseFloat(cs.paddingRight) || 0);
    var w = (inner - gap * (n - 1)) / n;
    var hs = []; for (var i = 0; i < n; i++) hs.push(0);
    b.classList.add('masonry');
    Array.prototype.forEach.call(b.querySelectorAll('.pin'), function (p) {
      var span = p.classList.contains('big') && n > 1 ? 2 : 1;
      var best = 0, bestY = Infinity;
      for (var c = 0; c + span <= n; c++) {
        var y = Math.max.apply(null, hs.slice(c, c + span));
        if (y < bestY) { bestY = y; best = c; }
      }
      p.style.width = (w * span + gap * (span - 1)) + 'px';
      p.style.left = (padL + best * (w + gap)) + 'px';
      p.style.top = (padT + bestY) + 'px';
      var ph = p.offsetHeight + gap;
      for (var k = best; k < best + span; k++) hs[k] = bestY + ph;
    });
    b.style.height = (padT + Math.max.apply(null, hs) + (parseFloat(cs.paddingBottom) || 0) - gap) + 'px';
  }
  var t; function soon() { clearTimeout(t); t = setTimeout(lay, 50); }
  Array.prototype.forEach.call(b.querySelectorAll('img'), function (im) { if (!im.complete) im.addEventListener('load', soon); });
  addEventListener('resize', soon);
  lay();
})();
</script>
`;

/* ---------- A–Z ---------- */
export function groupAZ(entries) {
  const groups = {};
  for (const e of entries || []) {
    if (!e || !String(e.title || '').trim()) continue;
    const l = letterOf(e.title);
    (groups[l] = groups[l] || []).push(e);
  }
  const order = 'abcdefghijklmnopqrstuvwxyz'.split('').concat('#');
  return order.filter(l => groups[l]).map(l => ({ letter: l, label: LETTER_LABEL[l] || l, entries: groups[l] }));
}

// Side navigation for pages one directory below the root (/A-Z/, /teaching/).
function sideNav(site, withEmail, here) {
  const n = site.nav;
  return '<aside>\n' +
    '  <h1><a href="../">' + esc(site.name) + '</a></h1>\n' +
    '  <nav>\n' +
    '    <a href="../board/">' + esc(n.board) + '</a>\n' +
    '    <a href="' + (here === 'az' ? './' : '../A-Z/') + '">' + esc(n.az) + '</a>\n' +
    '    <a href="' + (here === 'teaching' ? './' : '../teaching/') + '">' + esc(n.teaching) + '</a>\n' +
    '    <a href="../consulting/">' + esc(n.consulting) + '</a>\n' +
    '    <a href="../cv/">' + esc(n.cv) + '</a>\n' +
    (withEmail ? '    <a href="mailto:' + esc(site.email) + '">' + esc(n.email) + '</a>\n' : '') +
    '  </nav>\n' +
    '</aside>\n';
}

export function renderAZ(site, az, opts) {
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="stylesheet" href="style.css"></head><body>\n' +
    sideNav(site, true, 'az') +
    '<main>\n';
  for (const g of groupAZ(az.entries)) {
    h += '<section><h2>' + esc(g.label) + '</h2><ul>\n';
    for (const e of g.entries) h += '  <li><a href="' + esc(safeUrl(e.link)) + '">' + esc(e.title) + '</a></li>\n';
    h += '</ul></section>\n';
  }
  h += '</main>\n</body></html>\n';
  return h;
}

/* ---------- teaching (/teaching/) ---------- */
export function renderTeaching(site, t, opts) {
  const secs = t.sections || [];
  const first = secs[0] ? secs[0].title : '';
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>Teaching — ' + esc(first) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="stylesheet" href="../A-Z/style.css"></head><body>\n' +
    sideNav(site, false, 'teaching') +
    '<main class="doc">\n';
  if (t.note) h += '<p class="note">' + esc(t.note) + '</p>\n';
  h += secs.map((s, i) => {
    let x = (i === 0 ? '<h2>' : '<h2 style="font-size:22px;margin-top:2em">') + esc(s.title) + '</h2>\n';
    if (s.body) x += String(s.body).split(/\n\s*\n/).map(p => '<p>' + inline(p.trim()) + '</p>\n').join('');
    const items = (s.items || []).filter(it => String(it).trim());
    if (items.length) x += '<ul>\n' + items.map(it => '  <li>' + inline(it) + '</li>\n').join('') + '</ul>\n';
    return x;
  }).join('\n');
  if (t.closing) h += '\n<p style="margin-top:2em">' + inline(t.closing) + '</p>\n';
  h += '</main>\n</body></html>\n';
  return h;
}

/* ---------- consulting ---------- */
const SYMBOL = { CNY: '¥', USD: '$', EUR: '€', TWD: 'NT$' };
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function jsonForScript(v) { return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

export function renderConsulting(site, c, opts) {
  const n = site.nav;
  const plans = (c.plans || []).map(p => ({ id: p.id, title: p.title, meta: p.meta, price: p.price }));
  const pays = (c.payments || []).filter(p => p.enabled !== false);
  const rows = plans.map(p =>
    '<div class="row" data-id="' + esc(p.id) + '">' +
    '<div><h2>' + esc(p.title) + '</h2><p class="meta">' + esc(p.meta) + '</p></div>' +
    '<div class="right">' +
    '<div class="price">' + SYMBOL.CNY + ' ' + fmt(p.price.CNY) +
    '<small>CNY · 基準 CNY ' + fmt(p.price.CNY) + '</small></div>' +
    '<button type="button" class="pick" data-pick="' + esc(p.id) + '">選擇此方案</button>' +
    '</div></div>').join('');
  return `<!doctype html>
<html lang="zh-Hant">
<head>${headExtra(opts)}
<meta charset="utf-8">
<title>Consulting — ${esc(site.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="bar">
  <strong><a href="../">${esc(site.name)}</a></strong>
  <nav>
    <a href="../board/">${esc(n.board)}</a>
    <a href="../A-Z/">${esc(n.az)}</a>
    <a href="../teaching/">${esc(n.teaching)}</a>
    <a class="on" href="./">${esc(n.consulting)}</a>
    <a href="../cv/">${esc(n.cv)}</a>
  </nav>
</header>
<main class="wrap">
  <h1>${esc(c.title)}</h1>
  <p class="lead">${inline(c.lead)}</p>

  <div class="notice">
    ${inline(c.notice, '    ')}
  </div>

  <div class="curr" role="group" aria-label="Currency">
    <span>幣種</span>
    <button type="button" data-cur="CNY" class="on">CNY</button>
    <button type="button" data-cur="USD">USD</button>
    <button type="button" data-cur="EUR">EUR</button>
    <button type="button" data-cur="TWD">TWD</button>
  </div>
  <p class="rate-note" id="rateNote">${esc(c.rateNote)}</p>

  <div class="list" id="pkgs">${rows}</div>

  <section class="pay">
    <h2>支付偏好</h2>
    <div class="pay-list" id="payMethods">
${pays.map((p, i) => `      <label><input type="radio" name="pay" value="${esc(p.value)}"${i === 0 ? ' checked' : ''}> ${esc(p.label)}</label>\n`).join('')}    </div>
    <ul class="terms">
${(c.terms || []).filter(x => String(x).trim()).map(x => `      <li>${inline(x)}</li>\n`).join('')}    </ul>
  </section>

  <section class="checkout" id="checkout">
    <h2>確認方案</h2>
    <p id="selected" class="selected">尚未選擇方案。</p>
    <label for="name">姓名</label>
    <input id="name" name="name" autocomplete="name" required>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" required>
    <label for="note">需求簡述（選填）</label>
    <textarea id="note" name="note" placeholder="例如：作品集申請／單案設計輔導／時區偏好"></textarea>
    <div class="actions">
      <button type="button" class="submit" id="submit">索取付款指示</button>
    </div>
    <p class="hint">${inline(c.checkoutHint)}</p>
  </section>
</main>
<script>
(function () {
  var SYMBOL = { CNY: '¥', USD: '$', EUR: '€', TWD: 'NT$' };
  // Integer list prices per currency, edited in /admin (content/consulting.json). Not live FX.
  var PACKAGES = ${jsonForScript(plans)};
  var RATE_NOTE = ${jsonForScript(c.rateNote || '')};
  var MAIL_NOTE = ${jsonForScript(c.mailNote || '')};
  var cur = 'CNY';
  var selected = null;
  var CONTACT = ${jsonForScript(site.email)};

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }
  function amount(p) {
    return fmt(p.price[cur]);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function renderRate() {
    document.getElementById('rateNote').textContent = RATE_NOTE;
  }
  function renderPkgs() {
    var root = document.getElementById('pkgs');
    root.innerHTML = PACKAGES.map(function (p) {
      var on = selected && selected.id === p.id ? ' on' : '';
      return (
        '<div class="row' + on + '" data-id="' + esc(p.id) + '">' +
        '<div><h2>' + esc(p.title) + '</h2><p class="meta">' + esc(p.meta) + '</p></div>' +
        '<div class="right">' +
        '<div class="price">' + SYMBOL[cur] + ' ' + amount(p) +
        '<small>' + cur + ' · 基準 CNY ' + fmt(p.price.CNY) + '</small></div>' +
        '<button type="button" class="pick" data-pick="' + esc(p.id) + '">選擇此方案</button>' +
        '</div></div>'
      );
    }).join('');
  }
  function updateSelected() {
    var el = document.getElementById('selected');
    if (!selected) {
      el.textContent = '尚未選擇方案。';
      return;
    }
    var pay = (document.querySelector('input[name="pay"]:checked') || {}).value || '';
    el.textContent =
      selected.title + ' · ' + SYMBOL[cur] + ' ' + amount(selected) + ' ' + cur +
      '（基準 CNY ' + fmt(selected.price.CNY) + '）· 支付偏好：' + pay;
  }
  document.querySelector('.curr').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-cur]');
    if (!btn) return;
    cur = btn.getAttribute('data-cur');
    document.querySelectorAll('.curr button').forEach(function (b) {
      b.classList.toggle('on', b === btn);
    });
    renderPkgs();
    updateSelected();
  });
  document.getElementById('pkgs').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-pick]');
    if (!btn) return;
    var id = btn.getAttribute('data-pick');
    selected = PACKAGES.filter(function (p) { return p.id === id; })[0] || null;
    renderPkgs();
    updateSelected();
    document.getElementById('checkout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('payMethods').addEventListener('change', updateSelected);
  document.getElementById('submit').addEventListener('click', function () {
    if (!selected) {
      alert('請先選擇方案。');
      return;
    }
    var name = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    var note = document.getElementById('note').value.trim();
    if (!name || !email) {
      alert('請填姓名與 Email。');
      return;
    }
    var pay = (document.querySelector('input[name="pay"]:checked') || {}).value || '';
    var subject = encodeURIComponent('[Consulting] ' + selected.title);
    var nl = String.fromCharCode(10);
    var body = encodeURIComponent(
      '姓名：' + name + nl +
      'Email：' + email + nl +
      '方案：' + selected.title + nl +
      '金額：' + SYMBOL[cur] + ' ' + amount(selected) + ' ' + cur +
      '（基準 CNY ' + fmt(selected.price.CNY) + '）' + nl +
      '支付偏好：' + pay + nl +
      '需求：' + (note || '（無）') + nl + nl +
      MAIL_NOTE
    );
    location.href = 'mailto:' + CONTACT + '?subject=' + subject + '&body=' + body;
  });
  renderRate();
  renderPkgs();
})();
</script>
</body>
</html>
`;
}

/* ---------- static doc pages (cv/index.html, A-Z/*.html) ---------- */
export function fillPlaceholders(html, site) {
  return html.replace(/\{\{name\}\}/g, esc(site.name)).replace(/\{\{email\}\}/g, esc(site.email));
}

/* ---------- validation (shared by build and admin; the Worker mirrors the rest) ---------- */
// Board pins: imported by worker/worker.js too (wrangler bundles this file), so all three agree.
export function validatePins(pins) {
  const errs = [], seen = new Set();
  pins.forEach((p, i) => {
    const who = '作品 ' + (i + 1) + (p && p.title ? '「' + p.title + '」' : '');
    if (!p || typeof p !== 'object') { errs.push(who + ' 格式錯誤'); return; }
    if (typeof p.title !== 'string' || !p.title.trim()) errs.push(who + ' 標題不能空白');
    if (typeof p.slug !== 'string' || !SLUG_RE.test(p.slug) || p.slug.length > 60) errs.push(who + ' 的網址代稱只能用小寫英文、數字和 -（例如 studio-model）');
    else if (seen.has(p.slug)) errs.push(who + ' 的網址代稱「' + p.slug + '」重複了');
    else seen.add(p.slug);
    if (p.description != null && typeof p.description !== 'string') errs.push(who + ' 說明格式錯誤');
    else if (String(p.description || '').length > 20000) errs.push(who + ' 說明太長（上限 20000 字）');
    const imgs = Array.isArray(p.images) ? p.images : null;
    if (!imgs || !imgs.length) errs.push(who + ' 至少要有一張圖片');
    else {
      if (imgs.length > MAX_PIN_IMAGES) errs.push(who + ' 最多 ' + MAX_PIN_IMAGES + ' 張圖片（現在 ' + imgs.length + ' 張）');
      if (imgs.some(x => typeof x !== 'string' || !x.trim())) errs.push(who + ' 有空白的圖片');
      else if (imgs.some(x => /^(data|blob|javascript):/i.test(x))) errs.push(who + ' 有圖片還沒上傳');
    }
    if (p.sections != null) {
      if (!Array.isArray(p.sections)) errs.push(who + ' 的圖文段落格式錯誤');
      else {
        if (p.sections.length > 30) errs.push(who + ' 最多 30 個圖文段落');
        const pool = new Set(imgs || []);
        p.sections.forEach((s, k) => {
          const sw = who + ' 段落 ' + (k + 1);
          if (!s || typeof s !== 'object') { errs.push(sw + ' 格式錯誤'); return; }
          if (s.heading != null && (typeof s.heading !== 'string' || s.heading.length > 200)) errs.push(sw + ' 標題格式錯誤（上限 200 字）');
          if (s.body != null && (typeof s.body !== 'string' || s.body.length > 20000)) errs.push(sw + ' 內文格式錯誤（上限 20000 字）');
          if (s.images != null && (!Array.isArray(s.images) || s.images.some(x => typeof x !== 'string'))) errs.push(sw + ' 圖片格式錯誤');
          else if ((s.images || []).some(x => !pool.has(x))) errs.push(sw + ' 用了不在這件作品圖片裡的圖');
          if (s.captions != null && (!Array.isArray(s.captions) || s.captions.some(x => typeof x !== 'string' || x.length > 300 || /[\r\n]/.test(x)))) errs.push(sw + ' 圖說要是單行文字（上限 300 字）');
          else if ((s.captions || []).length > (s.images || []).length) errs.push(sw + ' 圖說比圖片多');
        });
      }
    }
  });
  return errs;
}

export function validate(all) {
  const errs = [];
  const { site, board, az, teaching, consulting } = all;
  if (!site || !String(site.name || '').trim()) errs.push('網站名稱不能空白');
  if (site && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(site.email || '')) errs.push('聯絡 Email 格式不正確');
  if (site) for (const k of ['board', 'az', 'teaching', 'consulting', 'cv', 'email']) if (!site.nav || !String(site.nav[k] || '').trim()) errs.push('導覽文字「' + k + '」不能空白');
  if (!board || !Array.isArray(board.pins)) errs.push('項目資料格式錯誤');
  else errs.push(...validatePins(board.pins));
  if (!az || !Array.isArray(az.entries)) errs.push('A–Z 資料格式錯誤');
  if (!teaching || !Array.isArray(teaching.sections) || !teaching.sections.length) errs.push('教學頁至少要有一個段落');
  if (!consulting || !Array.isArray(consulting.plans) || consulting.plans.length !== 4) errs.push('諮詢方案必須是 4 個');
  else consulting.plans.forEach((p, i) => {
    if (!String(p.title || '').trim()) errs.push('方案 ' + (i + 1) + ' 名稱不能空白');
    for (const cur of CURRENCIES) {
      const v = p.price && p.price[cur];
      if (!Number.isInteger(v) || v < 0) errs.push('方案 ' + (i + 1) + ' 的 ' + cur + ' 價格必須是正整數');
    }
  });
  return errs;
}

export function renderAll(all, opts) {
  const out = {
    [PAGES.landing]: renderLanding(all.site, opts),
    [PAGES.board]: renderBoard(all.site, all.board, opts),
    [PAGES.az]: renderAZ(all.site, all.az, opts),
    [PAGES.teaching]: renderTeaching(all.site, all.teaching, opts),
    [PAGES.consulting]: renderConsulting(all.site, all.consulting, opts)
  };
  for (const p of visiblePins(all.board)) out[detailPath(p.slug)] = renderDetail(all.site, all.board, p, opts);
  return out;
}

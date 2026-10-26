// Shared page templates for yuchuntsai.com.
// Used by build/build.mjs at deploy time (Node) and by /admin for live preview (browser),
// so the preview is rendered with exactly the same markup as the public pages.
// Pure functions only: content objects in, HTML strings out. No DOM, no Node APIs.
// Locked design (fonts, colours, spacing, radius, column count) lives in the page CSS files,
// not in content, and cannot be changed from /admin.

// Board shards. content/board.json may list extra pin files in "shards" (e.g. ["board-2.json"]),
// each { "pins": [...] }; the full board is board.json's pins followed by each shard's pins, in order.
// Keeps every file well under the GitHub API upload limit. load(name) returns the parsed shard
// (sync or a Promise). The merged board has no "shards" key, so a save writes one complete board.json.
export const BOARD_SHARD_RE = /^board-\d+\.json$/;
export function mergeBoard(main, load) {
  if (!main || !Array.isArray(main.shards)) return main;
  const { shards, ...out } = main;
  out.pins = [...(main.pins || [])];
  const add = s => { if (!s || !Array.isArray(s.pins)) throw new Error('board shard has no pins'); out.pins.push(...s.pins); };
  const names = shards.map(f => { if (!BOARD_SHARD_RE.test(f)) throw new Error('bad board shard name: ' + f); return f; });
  const loaded = names.map(load);
  if (loaded.some(x => x && typeof x.then === 'function')) return Promise.all(loaded).then(a => { a.forEach(add); return out; });
  loaded.forEach(add);
  return out;
}

// Output paths. The site root (https://yuchuntsai.com/) is a minimal landing page;
// the pin board lives at /board/ and each visible pin gets a detail page at /board/<slug>/.
// A pin with draft: true still gets its detail page (shareable preview URL, marked noindex) but is not
// listed on /board/ (or anywhere else); visible: false hides it completely.
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

export function safeUrl(u) {
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
export function assetUrl(src, depth) {
  src = String(src || '');
  if (/^(https?:|data:|blob:|\/|\.\.?\/)/i.test(src)) return src;
  return '../'.repeat(depth) + src;
}

export function headExtra(opts) {
  return opts && opts.base ? '<base href="' + esc(opts.base) + '">' : '';
}

// Casual save/download guard for rendered pages. Image-file anchors (lightbox href="….webp") and any
// anchor with a download attribute become buttons that carry data-full, so the gallery can still open
// the file without a direct link. Every <img> gets draggable="false". Ordinary text links stay anchors.
const IMAGE_HREF = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
function attrValue(attrs, name) {
  const m = String(attrs).match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  if (!m) return null;
  return m[1] != null ? m[1] : m[2] != null ? m[2] : m[3];
}
function hasAttr(attrs, name) {
  return new RegExp('(?:^|\\s)' + name + '(?:\\s*=|\\s|$)', 'i').test(attrs);
}
function removeAttr(attrs, name) {
  return String(attrs).replace(new RegExp('(?:^|\\s)' + name + '(?:\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+))?(?=\\s|$)', 'ig'), '');
}
function addClass(attrs, cls) {
  const dq = String(attrs).match(/\bclass\s*=\s*"([^"]*)"/i);
  if (dq) {
    const parts = dq[1].split(/\s+/).filter(Boolean);
    if (!parts.includes(cls)) parts.push(cls);
    return attrs.replace(/\bclass\s*=\s*"[^"]*"/i, 'class="' + parts.join(' ') + '"');
  }
  const sq = String(attrs).match(/\bclass\s*=\s*'([^']*)'/i);
  if (sq) {
    const parts = sq[1].split(/\s+/).filter(Boolean);
    if (!parts.includes(cls)) parts.push(cls);
    return attrs.replace(/\bclass\s*=\s*'[^']*'/i, "class='" + parts.join(' ') + "'");
  }
  return attrs + ' class="' + cls + '"';
}
function isImageHref(href) {
  if (href == null) return false;
  const path = String(href).replace(/&amp;/gi, '&').split(/[?#]/)[0].trim();
  return IMAGE_HREF.test(path);
}
function withDraggable(tag) {
  if (/\bdraggable\s*=/i.test(tag)) return tag;
  return tag.replace(/\/?\s*>$/, m => ' draggable="false"' + (m.indexOf('/') >= 0 ? ' />' : '>'));
}
function withDraggableIn(html) {
  return String(html).replace(/<img\b[^>]*>/gi, withDraggable);
}
function hardenAnchor(chunk) {
  const m = chunk.match(/^<a\b([^>]*)>([\s\S]*)<\/a>$/i);
  if (!m) return chunk;
  let attrs = m[1];
  const inner = withDraggableIn(m[2]);
  const href = attrValue(attrs, 'href');
  const download = hasAttr(attrs, 'download');
  if (!isImageHref(href) && !download) return '<a' + attrs + '>' + inner + '</a>';
  attrs = removeAttr(removeAttr(removeAttr(attrs, 'href'), 'download'), 'target');
  attrs = removeAttr(attrs, 'rel');
  if (!hasAttr(attrs, 'type')) attrs += ' type="button"';
  if (isImageHref(href)) {
    attrs = addClass(attrs, 'zoom');
    if (!hasAttr(attrs, 'data-full')) attrs += ' data-full="' + href + '"';
    if (!hasAttr(attrs, 'draggable')) attrs += ' draggable="false"';
  }
  return '<button' + attrs + '>' + inner + '</button>';
}
export function hardenImages(html) {
  return String(html).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<img\b[^>]*>|<a\b[^>]*>[\s\S]*?<\/a>/gi, chunk => {
    if (/^<script\b/i.test(chunk) || /^<style\b/i.test(chunk)) return chunk;
    if (/^<img\b/i.test(chunk)) return withDraggable(chunk);
    return hardenAnchor(chunk);
  });
}
export function imgGuardTag(depth) {
  return '<script src="' + '../'.repeat(depth > 0 ? depth : 0) + 'assets/img-guard.js"></script>\n';
}
export function finishPage(html, depth) {
  let h = hardenImages(html);
  if (!h.includes('assets/img-guard.js')) {
    const tag = imgGuardTag(depth || 0);
    h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, tag + '</body>') : h + tag;
  }
  return h;
}

export function letterOf(title) {
  const m = String(title || '').match(/[A-Za-z]/);
  return m ? m[0].toLowerCase() : '#';
}

/* ---------- landing (site root) ---------- */
// Layout is fixed; only the name and the link labels come from content/site.json.
export function renderLanding(site, opts) {
  const n = site.nav;
  return finishPage('<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/">\n' +
    '<meta name="description" content="' + esc(SITE_DESCRIPTION) + '">\n' +
    '<link rel="alternate" type="application/atom+xml" title="Blog" href="blog/feed.xml">\n' +
    jsonLdScript(siteJsonLd()) +
    '<link rel="stylesheet" href="style.css' + cssV(opts) + '"></head><body class="landing">\n' +
    '<main>\n' +
    '  <h1>' + esc(site.name) + '</h1>\n' +
    '  <nav>\n' +
    '    <a href="board/">' + esc(n.board) + '</a>\n' +
    '    <a href="A-Z/">' + esc(n.az) + '</a>\n' +
    '    <a href="teaching/">' + esc(n.teaching) + '</a>\n' +
    '    <a href="consulting/">' + esc(n.consulting) + '</a>\n' +
    '    <a href="cv/">' + esc(n.cv) + '</a>\n' +
    '    <a href="blog/">' + esc(navBlog(n)) + '</a>\n' +
    '  </nav>\n' +
    '</main>\n' +
    '</body></html>\n', 0);
}

/* ---------- board (/board/) and pin detail pages (/board/<slug>/) ---------- */
// Top bar shared by the board and its detail pages. depth = directory depth below the root.
// here = the section the page belongs to ('board' by default, 'teaching', 'blog'); its link is marked .on
// and points to the section root (./ on the section index, ../ one level below).
export const navBlog = n => (n && String(n.blog || '').trim()) || 'blog';
export function topBar(site, depth, here) {
  const n = site.nav, up = '../'.repeat(depth), cur = here || 'board';
  const a = (key, dir, label) => cur === key
    ? '    <a class="on" href="' + (depth === 1 ? './' : '../'.repeat(depth - 1)) + '">' + esc(label) + '</a>\n'
    : '    <a href="' + up + dir + '/">' + esc(label) + '</a>\n';
  return '<header class="bar">\n' +
    '  <strong><a href="' + up + '">' + esc(site.name) + '</a></strong>\n' +
    '  <nav>\n' +
    a('board', 'board', n.board) +
    '    <a href="' + up + 'A-Z/">' + esc(n.az) + '</a>\n' +
    a('teaching', 'teaching', n.teaching) +
    '    <a href="' + up + 'consulting/">' + esc(n.consulting) + '</a>\n' +
    '    <a href="' + up + 'cv/">' + esc(n.cv) + '</a>\n' +
    a('blog', 'blog', navBlog(n)) +
    '  </nav>\n' +
    '</header>\n';
}

// Site-wide identity for search / answer engines (JSON-LD on the landing page, /cv/ and blog pages).
export const SITE_URL = 'https://yuchuntsai.com';
export const SITE_DESCRIPTION = 'Yu Chun Tsai — architecture & design portfolio mentor. 12,000+ hours of design teaching and design consultation since 2017, 370+ students, 1,800+ offers. 建築與設計作品集指導、留學申請諮詢。';
export function personJsonLd() {
  return { '@type': 'Person', '@id': SITE_URL + '/#person', name: 'Yu Chun Tsai', url: SITE_URL + '/cv/',
    jobTitle: 'Architecture & design portfolio mentor; Senior External Design Consultant, S&J Design (Hong Kong)',
    alumniOf: [{ '@type': 'CollegeOrUniversity', name: 'University of California, Berkeley' }, { '@type': 'CollegeOrUniversity', name: 'National Taiwan University' }],
    knowsAbout: ['architecture portfolio', 'design portfolio', 'art and design study abroad applications', 'school selection', 'statement of purpose', 'architecture education'] };
}
export function siteJsonLd() {
  return { '@context': 'https://schema.org', '@graph': [personJsonLd(),
    { '@type': 'WebSite', '@id': SITE_URL + '/#website', url: SITE_URL + '/', name: 'Yu Chun Tsai', inLanguage: ['zh-Hant', 'en'], publisher: { '@id': SITE_URL + '/#person' } }] };
}
// JSON-LD inside <script type="application/ld+json">; "<" is escaped so content cannot close the tag.
export const jsonLdScript = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>\n';

export const pinImages = p => (Array.isArray(p.images) ? p.images : []).filter(x => String(x || '').trim());
export const visiblePins = board => (board.pins || []).filter(p => p.visible !== false);
export const listedPins = board => visiblePins(board).filter(p => p.draft !== true);

// Application level of a board project (optional pin.level: "master" | "undergrad"; missing = master).
// Student work is credited "Student Project" / 學生作品 in its description; a pin without that credit and
// without an explicit level is the owner's own project: no label, listed only under "All" on /board/.
export const LEVELS = ['master', 'undergrad'];
export const LEVEL_FILTER = { all: { en: 'All', 'zh-Hant': '全部' }, master: { en: "Master's applications", 'zh-Hant': '碩士申請' }, undergrad: { en: 'Undergraduate applications', 'zh-Hant': '大學部申請' } };
export const LEVEL_LABEL = { master: { en: "Master's application portfolio", 'zh-Hant': '碩士申請作品' }, undergrad: { en: 'Undergraduate application portfolio', 'zh-Hant': '大學部申請作品' } };
export function pinLevel(p) {
  if (p && LEVELS.includes(p.level)) return p.level;
  const d = [p && p.description, p && p.i18n && p.i18n['zh-Hant'] && p.i18n['zh-Hant'].description].map(str).join('\n');
  return /student project|學生作品/i.test(d) ? 'master' : '';
}
const BOARD_LANGS = ['en', 'zh-Hant'];
const bl = (o, tag) => BOARD_LANGS.map(l => '<' + tag + ' data-l="' + l + '" lang="' + l + '">' + esc(o[l]) + '</' + tag + '>').join('');
// Board categories for every level (content/categories.json: { slug: "architecture" | ["architecture", "urban"] | ... }), loaded by the board
// page at runtime so the mapping lives apart from board.json. A master pin missing from it shows under All only.
export const CATEGORIES = ['architecture', 'landscape', 'urban', 'interior', 'stage'];
export const CATEGORY_FILTER = { all: { en: 'All', 'zh-Hant': '全部' }, architecture: { en: 'Architecture', 'zh-Hant': '建築' }, landscape: { en: 'Landscape', 'zh-Hant': '景觀' }, urban: { en: 'Urban', 'zh-Hant': '城市' }, interior: { en: 'Interior', 'zh-Hant': '室內' }, stage: { en: 'Stage', 'zh-Hant': '舞台' } };
// Master scales (content/scale.json: { slug: "S" | "M" | "L" | "XL" }, one per master pin), loaded by the board at
// runtime like categories.json. The scale row is shown only under 碩士申請; leaving that level resets it.
export const SCALES = ['S', 'M', 'L', 'XL'];
export const SCALE_FILTER = { all: { en: 'All scales', 'zh-Hant': '全部尺度' }, S: { en: 'S · Small', 'zh-Hant': 'S 小尺度' }, M: { en: 'M · Building', 'zh-Hant': 'M 單體建築' }, L: { en: 'L · Complex', 'zh-Hant': 'L 建築群' }, XL: { en: 'XL · Urban & landscape', 'zh-Hant': 'XL 城市地景' } };
export const SORTS = ['default', 'newest', 'oldest', 'az', 'za'];
export const SORT_LABEL = { default: { en: 'Default', 'zh-Hant': '預設' }, newest: { en: 'Newest', 'zh-Hant': '時間新→舊' }, oldest: { en: 'Oldest', 'zh-Hant': '時間舊→新' }, az: { en: 'A–Z', 'zh-Hant': '字母 A→Z' }, za: { en: 'Z–A', 'zh-Hant': '字母 Z→A' } };

// Project date from the pin's meta line (last paragraph of the English description, e.g.
// "Guangzhou, China | Campus architecture | Nov–Dec 2022 | Student Project | ..."), as year*100+month.
// A range counts from its start; "Spring term 2023–2024" is the spring of 2024; a season maps to its first
// month (Spring 3, Summer 6, Fall/Autumn 9, Winter 12); a bare year is month 0. No year = null (undated).
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };
export function pinMeta(p) {
  const parts = str(p && p.description).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
export function pinDate(p) {
  const m = pinMeta(p);
  if (!m.includes('|')) return null;
  const ok = y => y >= 1990 && y <= 2039;
  let r = /\b(spring|fall|autumn)\s+term\s+((?:19|20)\d\d)\s*[–-]\s*((?:19|20)\d\d)/i.exec(m);
  if (r) { const sp = /spring/i.test(r[1]), y = +(sp ? r[3] : r[2]); if (ok(y)) return y * 100 + (sp ? 2 : 9); }
  r = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|autumn|winter)[a-z]*\b[^|\d]*?((?:19|20)\d\d)\b/i.exec(m);
  if (r && ok(+r[2])) return +r[2] * 100 + MONTHS[r[1].toLowerCase()];
  r = /\b((?:19|20)\d\d)\b/.exec(m);
  if (r && ok(+r[1])) return +r[1] * 100;
  return null;
}

// Board order -> requested order. items: [{ i: board index, date: number|null, title }].
// Dated projects sort by date (ties keep board order); undated ones follow, in board (publish) order
// for "oldest" and reversed for "newest". Titles compare case- and accent-insensitively.
export const sortTitle = t => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '');
export function sortItems(items, how) {
  const a = items.slice();
  if (how === 'az' || how === 'za') {
    const d = how === 'az' ? 1 : -1;
    return a.sort((x, y) => d * sortTitle(x.title).localeCompare(sortTitle(y.title), 'en', { sensitivity: 'base', numeric: true }) || x.i - y.i);
  }
  if (how === 'newest' || how === 'oldest') {
    const d = how === 'oldest' ? 1 : -1, has = v => v !== null && v !== undefined && v !== '';
    return a.sort((x, y) => has(x.date) && has(y.date) ? d * (x.date - y.date) || x.i - y.i : has(x.date) ? -1 : has(y.date) ? 1 : d * (x.i - y.i));
  }
  return a.sort((x, y) => x.i - y.i);
}

// Hash state: "#master&cat=landscape&sort=newest" (cat works with any level, incl. "#cat=urban" for All); the bare "#master" / "#undergrad" of the level filter still works.
export function parseBoardHash(hash) {
  const st = { f: 'all', cat: 'all', scale: 'all', sort: 'default' };
  for (const t of String(hash || '').replace(/^#/, '').split('&')) {
    const [k, v] = t.split('=');
    if (v === undefined) { if (LEVELS.includes(k)) st.f = k; }
    else if (k === 'cat' && CATEGORIES.includes(v)) st.cat = v;
    else if (k === 'scale' && SCALES.includes(v)) st.scale = v;
    else if (k === 'sort' && SORTS.includes(v)) st.sort = v;
  }
  if (st.f !== 'master') st.scale = 'all';
  return st;
}
export function boardHash(st) {
  const t = [];
  if (st.f && st.f !== 'all') t.push(st.f);
  if (st.cat && st.cat !== 'all') t.push('cat=' + st.cat);
  if (st.f === 'master' && st.scale && st.scale !== 'all') t.push('scale=' + st.scale);
  if (st.sort && st.sort !== 'default') t.push('sort=' + st.sort);
  return t.length ? '#' + t.join('&') : '';
}
// Which pins are shown: pin = { level, cat, scale }.
export function pinShown(pin, st) {
  if (st.f !== 'all' && pin.level !== st.f) return false;
  if (st.f === 'master' && st.scale && st.scale !== 'all' && pin.scale !== st.scale) return false;
  return st.cat === 'all' || catList(pin.cat).includes(st.cat);
}
// A categories.json value is one category or a list of them (a pin matches if any entry matches).
export const catList = c => (Array.isArray(c) ? c : [c]).filter(x => CATEGORIES.includes(x));

const BOARD_FILTER_JS = '<script>(function(){var b=document.querySelector(".board"),L=' + JSON.stringify(LEVELS) + ',C=' + JSON.stringify(CATEGORIES) + ',S=' + JSON.stringify(SORTS) + ',Z=' + JSON.stringify(SCALES) + ',st={f:"all",cat:"all",scale:"all",sort:"default"},pins=[].slice.call(b.querySelectorAll(".pin"));' +
  'function parse(){var h=location.hash.slice(1).split("&"),s={f:"all",cat:"all",scale:"all",sort:"default"};h.forEach(function(t){var kv=t.split("=");if(kv.length<2){if(L.indexOf(t)>=0)s.f=t}else if(kv[0]==="cat"&&C.indexOf(kv[1])>=0)s.cat=kv[1];else if(kv[0]==="scale"&&Z.indexOf(kv[1])>=0)s.scale=kv[1];else if(kv[0]==="sort"&&S.indexOf(kv[1])>=0)s.sort=kv[1]});if(s.f!=="master")s.scale="all";return s}' +
  'function hash(){var t=[];if(st.f!=="all")t.push(st.f);if(st.cat!=="all")t.push("cat="+st.cat);if(st.f==="master"&&st.scale!=="all")t.push("scale="+st.scale);if(st.sort!=="default")t.push("sort="+st.sort);return t.length?"#"+t.join("&"):""}' +
  'function mark(a,v){[].forEach.call(document.querySelectorAll("["+a+"]"),function(x){var on=x.getAttribute(a)===v;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on?"true":"false")})}' +
  'function key(p){var d=p.getAttribute("data-date");return{p:p,i:+p.getAttribute("data-i"),date:d?+d:null,title:p.getAttribute("data-title")||""}}' +
  'function order(){var a=pins.map(key),s=st.sort,has=function(v){return v!==null};' +
  'if(s==="az"||s==="za"){var d=s==="az"?1:-1;a.sort(function(x,y){return d*x.title.localeCompare(y.title,"en",{sensitivity:"base",numeric:true})||x.i-y.i})}' +
  'else if(s==="newest"||s==="oldest"){var e=s==="oldest"?1:-1;a.sort(function(x,y){return has(x.date)&&has(y.date)?e*(x.date-y.date)||x.i-y.i:has(x.date)?-1:has(y.date)?1:e*(x.i-y.i)})}' +
  'else a.sort(function(x,y){return x.i-y.i});a.forEach(function(k){b.appendChild(k.p)})}' +
  'function apply(){mark("data-filter",st.f);mark("data-cat-filter",st.cat);mark("data-scale-filter",st.scale);mark("data-sort",st.sort);var sub=document.querySelector(".subfilters");if(sub)sub.hidden=false;var zr=document.querySelector(".scalefilters");if(zr)zr.hidden=st.f!=="master";order();' +
  'pins.forEach(function(p){p.hidden=st.f!=="all"&&!p.classList.contains("lv-"+st.f)||st.cat!=="all"&&(" "+(p.getAttribute("data-cat")||"")+" ").indexOf(" "+st.cat+" ")<0||st.f==="master"&&st.scale!=="all"&&p.getAttribute("data-scale")!==st.scale});b.setAttribute("data-scale",st.scale);b.setAttribute("data-filter",st.f);b.setAttribute("data-cat",st.cat);b.setAttribute("data-sort",st.sort);' +
  'var e=document.querySelector(".board-empty");if(e)e.hidden=!!b.querySelector(".pin:not([hidden])");if(b.classList.contains("masonry"))dispatchEvent(new Event("resize"))}' +
  'function save(){try{history.replaceState(null,"",hash()||location.pathname+location.search)}catch(z){}}' +
  'document.addEventListener("click",function(e){var c=e.target.closest&&e.target.closest("[data-filter],[data-cat-filter],[data-scale-filter],[data-sort]");if(!c)return;' +
  'if(c.hasAttribute("data-filter")){st.f=c.getAttribute("data-filter");if(st.f!=="master")st.scale="all"}else if(c.hasAttribute("data-cat-filter"))st.cat=c.getAttribute("data-cat-filter");else if(c.hasAttribute("data-scale-filter"))st.scale=c.getAttribute("data-scale-filter");else st.sort=c.getAttribute("data-sort");apply();save()});' +
  'st=parse();apply();' +
  'if(window.fetch)fetch("../content/categories.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():{}}).then(function(m){pins.forEach(function(p){var c=m[p.getAttribute("data-slug")];c=(Array.isArray(c)?c:[c]).filter(function(x){return C.indexOf(x)>=0});if(c.length)p.setAttribute("data-cat",c.join(" "))});apply()}).catch(function(){});if(window.fetch)fetch("../content/scale.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():{}}).then(function(m){pins.forEach(function(p){var z=m[p.getAttribute("data-slug")];if(Z.indexOf(z)>=0)p.setAttribute("data-scale",z)});apply()}).catch(function(){})})();</script>\n';

export function renderBoard(site, board, opts) {
  const n = site.nav;
  const pins = listedPins(board);
  const anyBig = pins.some(p => p.big);
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + ' — ' + esc(n.board) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/board/">\n' +
    langHead(BOARD_LANGS) +
    '<link rel="stylesheet" href="../style.css' + cssV(opts) + '"></head><body class="board-page">\n' +
    topBar(site, 1) +
    '<div class="board-tools"><div class="filters" role="group" aria-label="Filter">' +
    ['all', 'master', 'undergrad'].map(f => '<button type="button" data-filter="' + f + '"' + (f === 'all' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + bl(LEVEL_FILTER[f], 'span') + '</button>').join('') +
    '</div><div class="langs" role="group" aria-label="Language">' +
    BOARD_LANGS.map(l => '<button type="button" data-set-lang="' + l + '" lang="' + l + '" title="' + esc(LANG_NAME[l] || l) + '">' + esc(LANG_LABEL[l] || l) + '</button>').join('') + '</div></div>\n' +
    '<div class="board-tools sub scalefilters" hidden><div class="filters" role="group" aria-label="Scale">' +
    ['all', ...SCALES].map(z => '<button type="button" data-scale-filter="' + z + '"' + (z === 'all' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + bl(SCALE_FILTER[z], 'span') + '</button>').join('') +
    '</div></div>\n' +
    '<div class="board-tools sub"><div class="filters subfilters" role="group" aria-label="Category" hidden>' +
    ['all', ...CATEGORIES].map(c => '<button type="button" data-cat-filter="' + c + '"' + (c === 'all' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + bl(CATEGORY_FILTER[c], 'span') + '</button>').join('') +
    '</div><div class="sorts" role="group" aria-label="Sort">' +
    SORTS.map(o => '<button type="button" data-sort="' + o + '"' + (o === 'default' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + bl(SORT_LABEL[o], 'span') + '</button>').join('') + '</div></div>\n' +
    '<div class="board">\n';
  pins.forEach((p, i) => {
    const lv = pinLevel(p), d = pinDate(p);
    h += '  <a class="pin' + (p.big ? ' big' : '') + (lv ? ' lv-' + lv : '') + '" data-i="' + i + '" data-slug="' + esc(p.slug) + '"' + (d ? ' data-date="' + d + '"' : '') + ' data-title="' + esc(sortTitle(p.title)) + '" href="' + esc(p.slug) + '/"><img src="' + esc(assetUrl(pinImages(p)[0], 1)) + '" alt="" draggable="false"><span class="cap">' + esc(p.title) + '</span>' + schoolTags(p, 'span', CARD_SCHOOLS) + '</a>\n';
  });
  h += '</div>\n<p class="board-empty" hidden>' + bl({ en: 'No projects in this category yet.', 'zh-Hant': '這個類別目前還沒有作品。' }, 'span') + '</p>\n';
  if (board.foot) h += '<p class="foot">' + inline(board.foot) + '</p>\n';
  if (anyBig) h += BOARD_MASONRY;
  h += BOARD_FILTER_JS + LANG_SWITCH_JS + '</body></html>\n';
  return finishPage(h, 1);
}

// Plain-text description: blank line = new paragraph, single newline = line break. No markup.
export function paragraphs(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(x => x.trim()).filter(Boolean)
    .map(x => '<p>' + esc(x).replace(/\n/g, '<br>\n') + '</p>\n').join('');
}

// Languages a detail page can be read in. English is the source text (pin.title, pin.description,
// section heading/body/captions); other languages are optional translations in pin.i18n[lang] and
// section.i18n[lang] with the same keys. Any empty translated field falls back to English.
// The language switch only appears on pages that actually have a translation. To add a language
// (e.g. 'zh-Hans'), add it here with its labels; admin, validation and the switch follow.
export const LANGS = ['en', 'zh-Hant'];
export const LANG_LABEL = { en: 'EN', 'zh-Hant': '繁中' };
export const LANG_NAME = { en: 'English', 'zh-Hant': '繁體中文' };
const str = v => (typeof v === 'string' ? v : '');
const tr = (o, l, k) => str(o && o.i18n && o.i18n[l] && o.i18n[l][k]);

// Optional sections layout: pin.sections = [{ heading, body, images: [paths from pin.images], captions: [one line each], i18n }].
// One centred column: each section's text, then its images, all at the same width; every image sits in
// the same 4:3 box (whole image shown). One caption for several images = a shared caption under them.
// Images of the pin that no section uses still appear in the plain gallery after the sections.
export function pinSections(pin) {
  const pool = new Set(pinImages(pin));
  return (Array.isArray(pin.sections) ? pin.sections : []).filter(s => s && typeof s === 'object').map(s => {
    const imgs = [], caps = {};
    for (const l of LANGS) caps[l] = [];
    (Array.isArray(s.images) ? s.images : []).forEach((src, k) => {
      if (!pool.has(src)) return;
      imgs.push(src);
      for (const l of LANGS) {
        const arr = l === 'en' ? s.captions : s.i18n && s.i18n[l] && s.i18n[l].captions;
        caps[l].push(str(Array.isArray(arr) ? arr[k] : '').trim());
      }
    });
    const heading = {}, body = {};
    for (const l of LANGS) { heading[l] = (l === 'en' ? str(s.heading) : tr(s, l, 'heading')).trim(); body[l] = l === 'en' ? str(s.body) : tr(s, l, 'body'); }
    return { heading, body, images: imgs, captions: caps };
  }).filter(s => s.heading.en || s.body.en.trim() || s.images.length);
}

// Languages with at least one translated field on this pin (English always first).
export function pinLangs(pin) {
  const has = l => [tr(pin, l, 'title'), tr(pin, l, 'description')].some(x => x.trim()) ||
    (Array.isArray(pin.sections) ? pin.sections : []).some(s => s && [tr(s, l, 'heading'), tr(s, l, 'body')].some(x => x.trim()) ||
      (s && s.i18n && s.i18n[l] && Array.isArray(s.i18n[l].captions) ? s.i18n[l].captions : []).some(c => str(c).trim()));
  return LANGS.filter(l => l === 'en' || has(l));
}

// dims (optional, from build/build.mjs): { "<src>": [width, height] } read from the image files, so the
// browser reserves each image's own natural box before it loads (no layout jump, no fixed-ratio frame).
function galleryImg(src, alt, lazy, dims) {
  const u = esc(assetUrl(src, 2)), d = dims && dims[String(src)];
  return '<button type="button" class="zoom" draggable="false" data-full="' + u + '"><img src="' + u + '" alt="' + esc(alt) + '" draggable="false"' +
    (d ? ' width="' + d[0] + '" height="' + d[1] + '"' : '') + (lazy ? ' loading="lazy"' : '') + ' decoding="async"></button>';
}

// Click/tap an image: show the full file (the original asset, not a resized copy) in an overlay.
// The control is a button with data-full, not a link to the file. Tap the image or the backdrop,
// or press Esc, to close; the page never scrolls or navigates, and no history entry is added,
// so browser Back still leaves the page as usual.
const ZOOM_JS = '<div class="lb" hidden role="dialog" aria-modal="true" aria-label="Image"><img alt="" draggable="false"></div>\n' +
  '<script>(function(){var b=document.querySelector(".lb"),i=b.querySelector("img"),last=null;' +
  'function close(){if(b.hidden)return;b.hidden=true;i.removeAttribute("src");document.documentElement.classList.remove("lb-on");if(last)try{last.focus({preventScroll:true})}catch(e){}}' +
  'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest(".zoom");if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();last=a;var t=a.querySelector("img");i.alt=t?t.alt:"";i.src=a.getAttribute("data-full")||"";if(!i.src)return;b.hidden=false;document.documentElement.classList.add("lb-on")});' +
  'b.addEventListener("click",close);document.addEventListener("keydown",function(e){if(e.key==="Escape"||e.key==="Esc")close()})})();</script>\n';

// One value per language (empty = English). Identical values are written once, untagged;
// otherwise one copy per language tagged data-l, and the page CSS shows only the chosen one.
function perLang(langs, get, wrap) {
  const vals = langs.map(l => get(l) || get('en'));
  if (vals.every(v => v === vals[0])) return vals[0] ? wrap(vals[0], '') : '';
  return langs.map((l, i) => vals[i] ? wrap(vals[i], ' data-l="' + l + '" lang="' + l + '"') : '').join('');
}

// Picks the language before first paint: ?lang= (remembered), else the remembered choice, else the
// browser's. `fallback` is used when the browser is not Chinese (project pages pass nothing and stay
// on English; the blog passes zh-Hant so an unset visitor still reads Chinese).
export function langHead(langs, fallback = 'en') {
  const fb = langs.includes(fallback) ? fallback : (langs[0] || 'en');
  return '<style>' + langs.map(l => 'html:not([data-lang="' + l + '"]) [data-l="' + l + '"]').join(',') + '{display:none}</style>\n' +
    '<script>(function(){var L=' + JSON.stringify(langs) + ',d=document.documentElement,q=(/[?&]lang=([A-Za-z-]+)/.exec(location.search)||[])[1],s=null;' +
    'try{s=localStorage.getItem("lang")}catch(e){}' +
    'var n=(navigator.languages||[navigator.language||""]).join(",").toLowerCase(),z=L.filter(function(x){return x.indexOf("zh")===0})[0];' +
    'var l=L.indexOf(q)>=0?q:L.indexOf(s)>=0?s:(z&&/(^|,)zh/.test(n)?z:' + JSON.stringify(fb) + ');' +
    'if(L.indexOf(q)>=0){try{localStorage.setItem("lang",q)}catch(e){}}d.setAttribute("data-lang",l);d.lang=l})();</script>\n';
}
export const LANG_SWITCH_JS = '<script>(function(){var d=document.documentElement;function mark(){[].forEach.call(document.querySelectorAll("[data-set-lang]"),function(b){var on=b.getAttribute("data-set-lang")===d.getAttribute("data-lang");b.classList.toggle("on",on);b.setAttribute("aria-pressed",on?"true":"false")})}' +
  'document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-set-lang]");if(!b)return;var l=b.getAttribute("data-set-lang");d.setAttribute("data-lang",l);d.lang=l;try{localStorage.setItem("lang",l)}catch(x){}mark()});mark()})();</script>\n';

// ?v=<hash of style.css> (passed by build/build.mjs) so returning visitors fetch the new stylesheet.
export const cssV = opts => (opts && opts.v ? '?v=' + esc(opts.v) : '');

// Optional pin.admitted_schools = [{ "en": "Princeton", "zh-Hant": "普林斯頓" }, …] (or plain strings): schools the student was admitted to, filled ONLY
// from a real source (portfolio file name/cover, the student's own offer). Shown as tags on the board card and detail page.
// SCHOOL_ZH: Taiwan short names used on 繁中 pages when a pin's zh-Hant is missing or still the English label.
// SCAD and UCLA intentionally stay English on Chinese pages too. English pages always show `en` unchanged.
export const SCHOOL_ZH = { UCL: '倫敦大學學院', UIUC: '伊利諾香檳', 'UC Davis': '加大戴維斯', UCSB: '加大聖塔芭芭拉', UCI: '加大爾灣', 'UC Irvine': '加大爾灣',
  UCSD: '加大聖地牙哥', 'UC San Diego': '加大聖地牙哥', RISD: '羅德島設計', UBC: '英屬哥倫比亞', Pratt: '普瑞特', UAL: '倫敦藝大', IIT: '伊利諾理工',
  'UT Austin': '德州奧斯汀', UCSC: '加大聖塔克魯茲', MIT: '麻省理工', RMIT: '皇家墨爾本理工', WashU: '聖路易華盛頓', Amherst: '阿默斯特', USC: '南加大',
  Edinburgh: '愛丁堡', Manchester: '曼徹斯特', Sheffield: '雪菲爾', Syracuse: '雪城' };
export const SCHOOL_KEEP_EN = ['SCAD', 'UCLA'];
const withZh = x => (x['zh-Hant'] && x['zh-Hant'] !== x.en) || !SCHOOL_ZH[x.en.trim()] ? x : { ...x, 'zh-Hant': SCHOOL_ZH[x.en.trim()] };
export const pinSchools = p => (Array.isArray(p && p.admitted_schools) ? p.admitted_schools
  .map(x => (typeof x === 'string' ? { en: x } : x)).filter(x => x && typeof x.en === 'string' && x.en.trim()).map(withZh) : []);
// max (board card): show the first `max` schools, then one 「等 N 校」/"+N more" tag; the detail page passes no max and lists all.
export const CARD_SCHOOLS = 4;
export function schoolTags(p, wrap, max) {
  const all = pinSchools(p);
  if (!all.length) return '';
  const s = max > 0 && all.length > max ? all.slice(0, max) : all, rest = all.length - s.length;
  return '<' + wrap + ' class="schools">' + s.map(x => '<span class="school">' + (x['zh-Hant'] && x['zh-Hant'] !== x.en ? bl(x, 'span') : esc(x.en)) + '</span>').join('') +
    (rest ? '<span class="school more">' + bl({ en: '+' + rest + ' more', 'zh-Hant': '等 ' + rest + ' 校' }, 'span') + '</span>' : '') + '</' + wrap + '>';
}

export function renderDetail(site, board, pin, opts) {
  const n = site.nav, teach = !!(opts && opts.kind === 'teaching');
  const backLabel = teach ? n.teaching : n.board;
  const imgs = pinImages(pin).slice(0, MAX_PIN_IMAGES);
  const secs = pinSections(pin);
  const langs = secs.length ? pinLangs(pin) : ['en'];
  const multi = langs.length > 1;
  const forced = multi && opts && langs.includes(opts.lang) ? opts.lang : '';
  const alt = src => pin.title + (imgs.length > 1 ? '（' + (imgs.indexOf(src) + 1) + '／' + imgs.length + '）' : '');
  let h = (multi ? '<!doctype html><html lang="' + (forced || 'en') + '" data-lang="' + (forced || 'en') + '"><head>' : '<!doctype html><html lang="zh-Hant"><head>') +
    headExtra(opts) + '<meta charset="utf-8"><title>' + esc(pin.title) + ' — ' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    (pin.draft === true ? '<meta name="robots" content="noindex,nofollow">\n' : '<link rel="canonical" href="https://yuchuntsai.com/' + (teach ? 'teaching/' : 'board/') + esc(pin.slug) + '/">\n') +
    (multi ? (forced ? '<style>' + langs.map(l => 'html:not([data-lang="' + l + '"]) [data-l="' + l + '"]').join(',') + '{display:none}</style>\n' : langHead(langs)) : '') +
    '<link rel="stylesheet" href="../../style.css' + cssV(opts) + '"></head><body class="detail">\n' +
    topBar(site, 2, teach ? 'teaching' : 'board') +
    '<main' + (secs.length ? ' class="has-sections"' : '') + '>\n';
  const back = '<p class="back"><a href="../">← ' + esc(backLabel) + '</a></p>';
  const lv = teach ? '' : pinLevel(pin);
  const levelLine = lv ? '  <p class="level">' + (multi ? perLang(langs, l => LEVEL_LABEL[lv][l], (v, a) => '<span' + a + '>' + esc(v) + '</span>') : esc(LEVEL_LABEL[lv].en)) + '</p>\n' : '';
  if (multi) {
    h += '  <div class="lang-row">' + back + '<div class="langs" role="group" aria-label="Language">' +
      langs.map(l => '<button type="button" data-set-lang="' + l + '" lang="' + l + '" title="' + esc(LANG_NAME[l] || l) + '">' + esc(LANG_LABEL[l] || l) + '</button>').join('') + '</div></div>\n';
  } else h += '  ' + back + '\n';
  if (secs.length) {
    h += levelLine;
    h += '  <h1>' + perLang(langs, l => (l === 'en' ? str(pin.title) : tr(pin, l, 'title')).trim(), (v, a) => (a ? '<span' + a + '>' + esc(v) + '</span>' : esc(v))) + '</h1>\n';
    h += perLang(langs, l => paragraphs(l === 'en' ? pin.description : tr(pin, l, 'description')), (v, a) => '<div class="desc"' + a + '>\n' + v + '</div>\n');
  } else {
    h += levelLine + '  <h1>' + esc(pin.title) + '</h1>\n';
    const desc = paragraphs(pin.description);
    if (desc) h += '<div class="desc">\n' + desc + '</div>\n';
  }
  if (!teach && pinSchools(pin).length) h += '  <p class="schools-row"><span class="schools-h">Admitted · 錄取</span>' + schoolTags(pin, 'span') + '</p>\n';
  let rest = imgs, shown = 0;
  if (secs.length) {
    const used = new Set();
    const cap = (s, k) => perLang(langs, l => s.captions[l][k], (v, a) => '<figcaption' + a + '>' + esc(v) + '</figcaption>');
    for (const s of secs) {
      h += '<section class="sec">\n';
      const head = perLang(langs, l => s.heading[l], (v, a) => '<h2' + a + '>' + esc(v) + '</h2>\n');
      const body = perLang(langs, l => paragraphs(s.body[l]), (v, a) => (a ? '<div' + a + '>\n' + v + '</div>\n' : v));
      if (head || body) h += '<div class="sec-text">\n' + head + body + '</div>\n';
      if (s.images.length) {
        const filled = s.captions.en.map((c, k) => langs.some(l => s.captions[l][k]));
        const shared = s.images.length === 1 || (filled[0] && filled.filter(Boolean).length === 1);
        if (shared) {
          h += '<figure class="sec-media"><div class="sec-imgs">' + s.images.map(src => galleryImg(src, alt(src), shown++ > 0, opts && opts.dims)).join('') + '</div>' + cap(s, 0) + '</figure>\n';
        } else {
          h += '<div class="sec-media"><div class="sec-imgs">' + s.images.map((src, k) => '<figure>' + galleryImg(src, alt(src), shown++ > 0, opts && opts.dims) + cap(s, k) + '</figure>').join('') + '</div></div>\n';
        }
        s.images.forEach(x => used.add(x));
      }
      h += '</section>\n';
    }
    rest = imgs.filter(x => !used.has(x));
  }
  if (rest.length || !secs.length) {
    h += '<div class="gallery">\n';
    rest.forEach(src => { h += '  ' + galleryImg(src, alt(src), shown++ > 0, opts && opts.dims) + '\n'; });
    h += '</div>\n';
  }
  h += '<p class="back end"><a href="../">← ' + esc(backLabel) + '</a></p>\n' +
    '</main>\n' + ZOOM_JS + (multi ? LANG_SWITCH_JS : '') + '</body></html>\n';
  return finishPage(h, 2);
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
      if (p.hidden) return;
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
    '    <a href="../blog/">' + esc(navBlog(n)) + '</a>\n' +
    (withEmail ? '    <a href="mailto:' + esc(site.email) + '">' + esc(n.email) + '</a>\n' : '') +
    '  </nav>\n' +
    '</aside>\n';
}

// A–Z entries: the hand-written content/az.json entries plus, generated, every listed board pin
// (/board/<slug>/) and every teaching workshop (/teaching/<slug>/), so new pins appear by themselves.
// Each letter is sorted like the board's A–Z sort; generated entries carry a small kind tag.
export function azEntries(az, board, teaching, blog) {
  const out = ((az && az.entries) || []).map(e => Object.assign({}, e));
  for (const s of teachingStudios(teaching)) {
    const en = String(s.subtitle || '').trim(), zh = String(s.title || '').trim();
    out.push({ title: en ? en + (zh ? '（' + zh + '）' : '') : zh, link: '../teaching/' + s.slug + '/', kind: 'workshop' });
  }
  for (const p of (board ? listedPins(board) : [])) if (String(p.title || '').trim()) out.push({ title: p.title, link: '../board/' + p.slug + '/', kind: 'board' });
  // Blog posts (content/blog.json): listed under the English title when there is one, else the Chinese one.
  for (const p of (blog && Array.isArray(blog.posts) ? blog.posts : []).filter(p => p && p.slug && p.visible !== false && p.draft !== true)) {
    const t = p.title, en = String((t && typeof t === 'object' ? t.en : '') || '').trim(), zh = String((t && typeof t === 'object' ? t['zh-Hant'] : t) || '').trim();
    if (en || zh) out.push({ title: en ? en + (zh ? '（' + zh + '）' : '') : zh, link: '../blog/' + p.slug + '/', kind: 'blog' });
  }
  return out;
}
const AZ_KIND = { board: 'board', workshop: 'workshop', blog: 'blog' };
export function renderAZ(site, az, opts, board, teaching, blog) {
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="stylesheet" href="style.css"></head><body>\n' +
    sideNav(site, true, 'az') +
    '<main>\n';
  const cmp = (x, y) => sortTitle(x.title).localeCompare(sortTitle(y.title), 'en', { sensitivity: 'base', numeric: true });
  for (const g of groupAZ(azEntries(az, board, teaching, blog))) {
    h += '<section><h2>' + esc(g.label) + '</h2><ul>\n';
    for (const e of g.entries.slice().sort(cmp)) h += '  <li><a href="' + esc(safeUrl(e.link)) + '">' + esc(e.title) + '</a>' + (AZ_KIND[e.kind] ? ' <span class="az-k">' + AZ_KIND[e.kind] + '</span>' : '') + '</li>\n';
    h += '</ul></section>\n';
  }
  h += '</main>\n</body></html>\n';
  return finishPage(h, 1);
}

/* ---------- teaching (/teaching/) ---------- */
// Studio sections (type "studio", with a slug) turn /teaching/ into a wall of cards in the /board/ style,
// grouped under "group" sections; each studio gets a detail page /teaching/<slug>/ rendered like a
// project page (pin-shaped: title, description, images, sections). Without studios the page is the
// original text page.
export const teachingStudios = t => (t && Array.isArray(t.sections) ? t.sections : []).filter(s => s && s.type === 'studio' && s.slug);
export const teachingDetailPath = slug => 'teaching/' + slug + '/index.html';
export function studioPin(s) {
  const imgs = [];
  for (const x of [s.cover, ...(Array.isArray(s.sections) ? s.sections.flatMap(q => (q && Array.isArray(q.images) ? q.images : [])) : [])]) if (x && !imgs.includes(x)) imgs.push(x);
  const head = [s.subtitle, s.meta].filter(x => String(x || '').trim()).join('\n');
  return { slug: s.slug, title: s.title, description: [head, s.description].filter(x => String(x || '').trim()).join('\n\n'), images: imgs,
    sections: [{ heading: '', body: '', images: s.cover ? [s.cover] : [], captions: [s.coverCaption || ''] }, ...(Array.isArray(s.sections) ? s.sections : [])] };
}
export function renderTeachingDetail(site, t, s, opts) {
  return renderDetail(site, { pins: [] }, studioPin(s), Object.assign({}, opts, { kind: 'teaching' }));
}
function textBlock(s) {
  let x = '<h2>' + esc(s.title) + '</h2>\n';
  if (s.body) x += String(s.body).split(/\n\s*\n/).map(p => '<p>' + inline(p.trim()) + '</p>\n').join('');
  const items = (s.items || []).filter(it => String(it).trim());
  if (items.length) x += '<ul>\n' + items.map(it => '  <li>' + inline(it) + '</li>\n').join('') + '</ul>\n';
  return x;
}
// Bilingual teaching-philosophy section (type "philosophy"): heading, lead, subheading and groups of
// titled points; every text is { "zh-Hant": ..., "en": ... }. Its EN / 繁中 buttons use the same
// language switch as project pages (?lang=, remembered in localStorage); the rest of the page is untouched.
export const hasPhilosophy = t => (t && Array.isArray(t.sections) ? t.sections : []).some(s => s && s.type === 'philosophy');
const biText = (o, tag) => LANGS.map(l => '<' + tag + ' data-l="' + l + '" lang="' + l + '">' + esc(str(o && o[l])) + '</' + tag + '>').join('');
export function philosophyBlock(s) {
  const groups = Array.isArray(s.groups) ? s.groups : [];
  let x = '<section class="t-text t-philo">\n<div class="t-philo-top"><h2>' + biText(s.heading || { 'zh-Hant': s.title, en: s.title }, 'span') + '</h2>' +
    '<div class="langs" role="group" aria-label="Language">' + LANGS.map(l => '<button type="button" data-set-lang="' + l + '" lang="' + l + '" title="' + esc(LANG_NAME[l]) + '">' + esc(LANG_LABEL[l]) + '</button>').join('') + '</div></div>\n';
  if (s.lead) x += '<p class="t-philo-lead">' + biText(s.lead, 'span') + '</p>\n';
  if (s.subheading) x += '<h3 class="t-philo-sub">' + biText(s.subheading, 'span') + '</h3>\n';
  if (groups.length) x += '<div class="t-philo-cols">\n' + groups.map(g => '<div class="t-philo-col"><h4>' + biText(g.title, 'span') + '</h4>\n<ul>\n' +
    (Array.isArray(g.items) ? g.items : []).map(it => '  <li>' + LANGS.map(l => '<span data-l="' + l + '" lang="' + l + '"><strong>' + esc(str(it.title && it.title[l])) + '</strong>' + esc(str(it.body && it.body[l])) + '</span>').join('') + '</li>\n').join('') +
    '</ul></div>\n').join('') + '</div>\n';
  return x + '</section>\n';
}
function renderTeachingWall(site, t, opts) {
  const n = site.nav, secs = t.sections || [];
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>' + esc(site.name) + ' — ' + esc(n.teaching) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<link rel="canonical" href="https://yuchuntsai.com/teaching/">\n' +
    (hasPhilosophy(t) ? langHead(LANGS) : '') +
    '<link rel="stylesheet" href="../style.css' + cssV(opts) + '"></head><body class="teach-wall">\n' +
    topBar(site, 1, 'teaching');
  let open = '';
  secs.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'studio' && s.slug) {
      if (open !== 'board') { h += '<div class="board">\n'; open = 'board'; }
      h += '  <a class="pin" href="' + esc(s.slug) + '/"><img src="' + esc(assetUrl(s.cover, 1)) + '" alt="" draggable="false"' + (i > 4 ? ' loading="lazy"' : '') + '><span class="cap">' + esc(s.title) + (s.subtitle ? '<small>' + esc(s.subtitle) + '</small>' : '') + '</span></a>\n';
      return;
    }
    if (open === 'board') { h += '</div>\n'; open = ''; }
    if (s.type === 'philosophy') { h += philosophyBlock(s); return; }
    if (s.type === 'group') {
      h += '<section class="t-cat"><h2>' + esc(s.title) + (s.subtitle ? ' <small>' + esc(s.subtitle) + '</small>' : '') + '</h2>' + (s.body ? '<p>' + inline(s.body) + '</p>' : '') + '</section>\n';
    } else {
      h += '<section class="t-text' + (i === 0 ? ' t-top' : '') + '">\n' + textBlock(s) + '</section>\n';
    }
  });
  if (open === 'board') h += '</div>\n';
  if (t.closing) h += '<p class="t-closing">' + inline(t.closing) + '</p>\n';
  return finishPage(h + (hasPhilosophy(t) ? LANG_SWITCH_JS : '') + '</body></html>\n', 1);
}
export function renderTeaching(site, t, opts) {
  if (teachingStudios(t).length) return renderTeachingWall(site, t, opts);
  const secs = t.sections || [];
  const first = secs[0] ? secs[0].title : '';
  let h = '<!doctype html><html lang="zh-Hant"><head>' + headExtra(opts) + '<meta charset="utf-8"><title>Teaching — ' + esc(first) + '</title>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    (hasPhilosophy(t) ? langHead(LANGS) : '') +
    '<link rel="stylesheet" href="../A-Z/style.css"></head><body>\n' +
    sideNav(site, false, 'teaching') +
    '<main class="doc teaching">\n';
  if (t.note) h += '<p class="note">' + esc(t.note) + '</p>\n';
  let shown = 0;
  const imgs = s => (Array.isArray(s.images) ? s.images : []).map(String).filter(x => x.trim());
  h += secs.map((s, i) => {
    if (s.type === 'philosophy') return philosophyBlock(s);
    // Category heading: groups the studio sections that follow it (optional, newer content).
    if (s.type === 'group') {
      let g = '<section class="t-group">\n<h2 class="t-group-h">' + esc(s.title) + '</h2>\n';
      if (s.subtitle) g += '<p class="t-sub">' + esc(s.subtitle) + '</p>\n';
      if (s.body) g += String(s.body).split(/\n\s*\n/).map(p => '<p>' + inline(p.trim()) + '</p>\n').join('');
      return g + '</section>\n';
    }
    const rich = !!(s.subtitle || s.meta || imgs(s).length);
    let x = (i === 0 ? '<h2>' : rich ? '<h2 class="t-h">' : '<h2 style="font-size:22px;margin-top:2em">') + esc(s.title) + '</h2>\n';
    if (s.subtitle) x += '<p class="t-sub">' + esc(s.subtitle) + '</p>\n';
    if (s.meta) x += '<p class="t-meta">' + esc(s.meta) + '</p>\n';
    if (s.body) x += String(s.body).split(/\n\s*\n/).map(p => '<p>' + inline(p.trim()) + '</p>\n').join('');
    const items = (s.items || []).filter(it => String(it).trim());
    if (items.length) x += '<ul' + (rich ? ' class="t-list"' : '') + '>\n' + items.map(it => '  <li>' + inline(it) + '</li>\n').join('') + '</ul>\n';
    const im = imgs(s);
    if (im.length) {
      const caps = Array.isArray(s.captions) ? s.captions : [];
      x += '<div class="t-imgs">\n' + im.map((src, k) => {
        const u = esc(assetUrl(src, 1)), c = String(caps[k] || '').trim();
        return '<figure><button type="button" class="zoom" draggable="false" data-full="' + u + '"><img src="' + u + '" alt="' + esc(c || s.title) + '" draggable="false"' + (shown++ > 0 ? ' loading="lazy"' : '') + '></button>' + (c ? '<figcaption>' + esc(c) + '</figcaption>' : '') + '</figure>\n';
      }).join('') + '</div>\n';
    }
    return rich ? '<section class="t-studio">\n' + x + '</section>\n' : x;
  }).join('\n');
  if (t.closing) h += '\n<p style="margin-top:2em">' + inline(t.closing) + '</p>\n';
  h += '</main>\n' + (shown ? ZOOM_JS : '') + (hasPhilosophy(t) ? LANG_SWITCH_JS : '') + '</body></html>\n';
  return finishPage(h, 1);
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
  return finishPage(`<!doctype html>
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
    <a href="../blog/">${esc(navBlog(n))}</a>
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
`, 1);
}

/* ---------- static doc pages (cv/index.html, A-Z/*.html) ---------- */
export function fillPlaceholders(html, site) {
  return html.replace(/\{\{name\}\}/g, esc(site.name)).replace(/\{\{email\}\}/g, esc(site.email));
}

/* ---------- validation (shared by build and admin; the Worker mirrors the rest) ---------- */
// Board pins: imported by worker/worker.js too (wrangler bundles this file), so all three agree.
// Translations: o.i18n = { <lang>: { <text key>: string, captions?: [one line each] } } for the non-English LANGS.
function checkI18n(o, keys, nCaps, who, errs) {
  if (o.i18n == null) return;
  if (typeof o.i18n !== 'object' || Array.isArray(o.i18n)) { errs.push(who + ' 的翻譯格式錯誤'); return; }
  for (const [l, t] of Object.entries(o.i18n)) {
    const wl = who + '（' + (LANG_NAME[l] || l) + '）';
    if (l === 'en' || !LANGS.includes(l)) { errs.push(who + ' 有不支援的語言「' + l + '」'); continue; }
    if (!t || typeof t !== 'object' || Array.isArray(t)) { errs.push(wl + ' 翻譯格式錯誤'); continue; }
    for (const k of Object.keys(t)) {
      if (k === 'captions' && nCaps >= 0) {
        const c = t.captions;
        if (!Array.isArray(c) || c.some(x => typeof x !== 'string' || x.length > 300 || /[\r\n]/.test(x))) errs.push(wl + ' 圖說要是單行文字（上限 300 字）');
        else if (c.length > nCaps) errs.push(wl + ' 圖說比圖片多');
      } else if (!(k in keys)) errs.push(wl + ' 有不認得的欄位「' + k + '」');
      else if (typeof t[k] !== 'string' || t[k].length > keys[k]) errs.push(wl + ' 的' + k + '格式錯誤（上限 ' + keys[k] + ' 字）');
    }
  }
}

export function validatePins(pins) {
  const errs = [], seen = new Set();
  pins.forEach((p, i) => {
    const who = '作品 ' + (i + 1) + (p && p.title ? '「' + p.title + '」' : '');
    if (!p || typeof p !== 'object') { errs.push(who + ' 格式錯誤'); return; }
    if (typeof p.title !== 'string' || !p.title.trim()) errs.push(who + ' 標題不能空白');
    if (typeof p.slug !== 'string' || !SLUG_RE.test(p.slug) || p.slug.length > 60) errs.push(who + ' 的網址代稱只能用小寫英文、數字和 -（例如 studio-model）');
    else if (seen.has(p.slug)) errs.push(who + ' 的網址代稱「' + p.slug + '」重複了');
    else seen.add(p.slug);
    if (p.level != null && !LEVELS.includes(p.level)) errs.push(who + ' 的申請類別只能是 master（碩士）或 undergrad（大學部）');
    if (p.draft != null && typeof p.draft !== 'boolean') errs.push(who + ' 的草稿設定格式錯誤');
    if (p.description != null && typeof p.description !== 'string') errs.push(who + ' 說明格式錯誤');
    else if (String(p.description || '').length > 20000) errs.push(who + ' 說明太長（上限 20000 字）');
    const imgs = Array.isArray(p.images) ? p.images : null;
    if (!imgs || !imgs.length) errs.push(who + ' 至少要有一張圖片');
    else {
      if (imgs.length > MAX_PIN_IMAGES) errs.push(who + ' 最多 ' + MAX_PIN_IMAGES + ' 張圖片（現在 ' + imgs.length + ' 張）');
      if (imgs.some(x => typeof x !== 'string' || !x.trim())) errs.push(who + ' 有空白的圖片');
      else if (imgs.some(x => /^(data|blob|javascript):/i.test(x))) errs.push(who + ' 有圖片還沒上傳');
    }
    checkI18n(p, { title: 200, description: 20000 }, -1, who, errs);
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
          checkI18n(s, { heading: 200, body: 20000 }, (s.images || []).length, sw, errs);
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
  if (teaching && Array.isArray(teaching.sections)) teaching.sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') { errs.push('教學頁段落 ' + (i + 1) + ' 格式錯誤'); return; }
    if (s.images !== undefined && (!Array.isArray(s.images) || s.images.some(x => typeof x !== 'string'))) errs.push('教學頁段落「' + (s.title || i + 1) + '」的圖片必須是路徑清單');
    if (s.captions !== undefined && !Array.isArray(s.captions)) errs.push('教學頁段落「' + (s.title || i + 1) + '」的圖說必須是清單');
    if (s.type === 'philosophy') {
      const bi = o => !!o && LANGS.every(l => String(o[l] || '').trim());
      const nm = '教學頁理念段落「' + (s.title || i + 1) + '」';
      if (!bi(s.heading) || !bi(s.lead)) errs.push(nm + '的標題與導言需要中英文');
      if (!Array.isArray(s.groups) || s.groups.some(g => !g || !bi(g.title) || !Array.isArray(g.items) || g.items.some(it => !it || !bi(it.title) || !bi(it.body)))) errs.push(nm + '的條目每項都需要中英文標題與內文');
    }
    if (s.type === 'studio') {
      const nm = '教學頁工作營「' + (s.title || i + 1) + '」';
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug || '')) errs.push(nm + '的網址代稱只能用小寫英文、數字和連字號');
      if (!String(s.title || '').trim()) errs.push(nm + '的標題不能空白');
      if (!String(s.cover || '').trim()) errs.push(nm + '需要封面圖片');
      if (s.sections !== undefined && (!Array.isArray(s.sections) || s.sections.some(q => !q || typeof q !== 'object' || (q.images !== undefined && !Array.isArray(q.images))))) errs.push(nm + '的內頁段落格式錯誤');
      if (studioPin(s).images.length > MAX_PIN_IMAGES) errs.push(nm + '最多 ' + MAX_PIN_IMAGES + ' 張圖片');
    }
  });
  const slugs = teachingStudios(teaching).map(s => s.slug);
  if (new Set(slugs).size !== slugs.length) errs.push('教學頁工作營的網址代稱不能重複');
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
    [PAGES.az]: renderAZ(all.site, all.az, opts, all.board, all.teaching, all.blog),
    [PAGES.teaching]: renderTeaching(all.site, all.teaching, opts),
    [PAGES.consulting]: renderConsulting(all.site, all.consulting, opts)
  };
  for (const p of visiblePins(all.board)) out[detailPath(p.slug)] = renderDetail(all.site, all.board, p, opts);
  for (const s of teachingStudios(all.teaching)) out[teachingDetailPath(s.slug)] = renderTeachingDetail(all.site, all.teaching, s, opts);
  return out;
}

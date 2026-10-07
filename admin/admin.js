// /admin — edit content/*.json, preview with the site's own templates, save via the Worker (/api).
// Without the Worker ("no Worker yet" mode) editing + preview work; save offers JSON download instead.
import { renderLanding, renderBoard, renderDetail, renderAZ, renderTeaching, renderConsulting, groupAZ, validate, CURRENCIES, PAGE_DIRS, detailDir, pinImages, uniqueSlug, SLUG_RE, MAX_PIN_IMAGES, LANGS, LANG_NAME } from './render.js';

const FILES = ['site', 'board', 'az', 'teaching', 'consulting'];
const LABEL = { site: '網站', board: '項目', az: 'A–Z', teaching: '教學', consulting: '諮詢' };
const PREVIEW_FOR = { site: 'landing', board: 'board', az: 'az', teaching: 'teaching', consulting: 'consulting' };
const API = '/api';
const MAX_IMAGE = 8 * 1024 * 1024;
const UPLOAD_BATCH_FILES = 10;               // images per /api/upload request (one commit each)
const UPLOAD_BATCH_BYTES = 24 * 1024 * 1024; // keep each request well under Cloudflare's body limit
// data: URL of a not-yet-uploaded image -> { name, type } (original file name / MIME type)
const pending = new Map();
const isPending = src => String(src).startsWith('data:');
// repo path of a just-uploaded image -> its data: URL, so admin thumbnails show before Pages redeploys
const uploaded = new Map();

const state = { mode: 'offline', user: '', tab: 'board', data: {}, saved: {}, busy: false, openPin: null, detailPin: null, editLang: 'en' };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const clone = o => JSON.parse(JSON.stringify(o));
// Strip editor-only keys (leading underscore) before saving/downloading.
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
const ser = o => JSON.stringify(clean(o), null, 2) + '\n';
const isDirty = n => ser(state.data[n]) !== state.saved[n];
const dirtyFiles = () => FILES.filter(isDirty);
function move(arr, i, j) { if (j < 0 || j >= arr.length) return; const [x] = arr.splice(i, 1); arr.splice(j, 0, x); }

function field(label, value, oninput, opts = {}) {
  const input = opts.multiline
    ? el('textarea', { rows: opts.rows || 3, oninput: e => oninput(e.target.value, e.target) })
    : el('input', { type: opts.type || 'text', inputmode: opts.inputmode, oninput: e => oninput(e.target.value, e.target) });
  input.value = value == null ? '' : value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  return el('label', { class: 'field' }, el('span', {}, label), input, opts.hint ? el('p', { class: 'hint' }, opts.hint) : null);
}
const MARKUP_HINT = '可用 **粗體** 和 [文字](連結)。';

/* ---------- load ---------- */
async function detectApi() {
  try {
    const r = await fetch(API + '/health', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', redirect: 'manual' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return false;
    const j = await r.json();
    if (j && j.ok) { state.user = j.user || ''; return true; }
  } catch (e) { /* not connected */ }
  return false;
}

async function load() {
  state.mode = (await detectApi()) ? 'online' : 'offline';
  let files;
  if (state.mode === 'online') {
    const r = await fetch(API + '/content', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('讀取內容失敗（' + r.status + '）');
    files = (await r.json()).files;
  } else {
    files = {};
    for (const n of FILES) {
      const r = await fetch('../content/' + n + '.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('讀取 content/' + n + '.json 失敗（' + r.status + '）');
      files[n] = await r.json();
    }
  }
  for (const n of FILES) { state.data[n] = clone(files[n]); state.saved[n] = ser(files[n]); }
  const st = $('status');
  if (state.mode === 'online') {
    st.className = 'status';
    st.textContent = '已連線儲存服務。儲存後約 1–2 分鐘網站會更新。';
    $('who').textContent = state.user ? '登入：' + state.user : '';
  } else {
    st.className = 'status warn';
    st.textContent = '儲存服務尚未連線（Cloudflare Worker 還沒設定）。現在可以編輯和預覽，但「儲存」只能先下載 JSON 備份，不會改到網站。';
  }
}

/* ---------- tabs & editor ---------- */
function renderTabs() {
  const nav = $('tabs');
  nav.replaceChildren(...FILES.map(n => el('button', {
    type: 'button', class: n === state.tab ? 'on' : null,
    onclick: () => { state.tab = n; $('previewPage').value = PREVIEW_FOR[n]; renderTabs(); renderEditor(); updatePreview(true); }
  }, LABEL[n], isDirty(n) ? el('span', { class: 'dot' }, ' •') : null)));
}

function renderEditor() {
  const ed = $('editor');
  const fn = { site: editSite, board: editBoard, az: editAZ, teaching: editTeaching, consulting: editConsulting }[state.tab];
  ed.replaceChildren(...fn(state.data[state.tab]));
}

function changed(rerender) {
  if (rerender) renderEditor();
  renderTabs();
  schedulePreview();
  updateSaveMsg();
}

/* site */
function editSite(s) {
  const navNames = { board: '項目', az: 'A–Z 索引', teaching: '教學', consulting: '諮詢', cv: '履歷', email: 'Email 連結' };
  return [
    el('h2', {}, '網站'),
    el('p', { class: 'hint' }, '名稱、導覽列文字和聯絡 Email 會套用到所有頁面。首頁（yuchuntsai.com）只顯示這個名稱和前五個導覽連結，版面固定。字型、顏色、間距、圓角和欄數固定不能改。'),
    field('名稱', s.name, v => { s.name = v; changed(); }),
    field('聯絡 Email', s.email, v => { s.email = v; changed(); }, { type: 'email', hint: '諮詢頁「索取付款指示」和 A–Z、履歷頁的 email 連結都寄到這裡。' }),
    el('h3', {}, '導覽列文字'),
    ...Object.keys(navNames).map(k => field(navNames[k], s.nav[k], v => { s.nav[k] = v; changed(); }))
  ];
}

/* board */
// Each pin = one work: title, URL slug, optional plain-text description, 1–10 images (first = cover).
// Pin objects are tracked by identity (state.openPin / state.detailPin), so reordering keeps the editor open.
let dragFrom = null;
function editBoard(b) {
  if (!b.pins.includes(state.openPin)) state.openPin = null;
  const rows = [];
  b.pins.forEach((p, i) => {
    const imgs = pinImages(p);
    const open = state.openPin === p;
    const title = el('input', { type: 'text', placeholder: '標題', 'aria-label': '標題', oninput: e => {
      p.title = e.target.value;
      if (p._autoSlug) { p.slug = uniqueSlug(p.title, otherSlugs(b, p)); const s = document.querySelector('[data-slug-for="' + i + '"]'); if (s) s.value = p.slug; }
      changed();
    } });
    title.value = p.title || '';
    const row = el('div', { class: 'row' + (p.visible === false ? ' hidden' : '') + (open ? ' open' : ''), draggable: 'true' },
      el('span', { class: 'handle', title: '拖曳排序' }, '≡'),
      el('img', { class: 'thumb', src: thumbSrc(imgs[0]), alt: '' }),
      el('div', { class: 'grow' },
        title,
        el('div', { class: 'ctl', style: 'margin-top:6px;gap:12px;flex-wrap:wrap' },
          el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: p.visible !== false, onchange: e => { p.visible = e.target.checked; changed(true); } }), '顯示'),
          el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!p.big, onchange: e => { p.big = e.target.checked; changed(); } }), '大圖（跨兩欄）'),
          el('span', { class: 'muted' }, imgs.length + ' 張圖'),
          imgs.some(isPending) ? el('span', { class: 'tag' }, '有新圖，儲存時上傳') : null)),
      el('div', { class: 'ctl' },
        el('button', { type: 'button', class: 'small', title: '上移', disabled: i === 0, onclick: () => { move(b.pins, i, i - 1); changed(true); } }, '↑'),
        el('button', { type: 'button', class: 'small', title: '下移', disabled: i === b.pins.length - 1, onclick: () => { move(b.pins, i, i + 1); changed(true); } }, '↓'),
        el('button', { type: 'button', class: 'small' + (open ? ' on' : ''), 'aria-expanded': open ? 'true' : 'false', onclick: () => { state.openPin = open ? null : p; if (!open) showDetail(p); renderEditor(); } }, open ? '收合' : '編輯內頁'),
        el('button', { type: 'button', class: 'small', title: '刪除', onclick: () => { if (confirm('從「項目」頁移除「' + (p.title || '這件作品') + '」和它的內頁？（圖檔本身不會被刪除）')) { b.pins.splice(i, 1); changed(true); } } }, '刪除')));
    row.addEventListener('dragstart', e => { dragFrom = i; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { if (dragFrom == null) return; e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('over'); if (dragFrom != null && dragFrom !== i) { move(b.pins, dragFrom, i); changed(true); } dragFrom = null; });
    rows.push(row);
    if (open) rows.push(pinEditor(b, p, i));
  });
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, style: 'display:none', onchange: e => { newPin(b, e.target.files); e.target.value = ''; } });
  return [
    el('h2', {}, '項目'),
    el('p', { class: 'hint' }, '每件作品在「項目」頁上是一張圖，點進去是它的內頁（標題、說明、最多 ' + MAX_PIN_IMAGES + ' 張圖，可選擇加上圖文段落）。拖曳或用 ↑↓ 排序（由左上往下排）。按「編輯內頁」改網址、說明和圖片。取消「顯示」會先藏起來（內頁也不發布），不會刪掉。'),
    el('div', { class: 'addbar' }, el('button', { type: 'button', onclick: () => file.click() }, '新增作品…'), file,
      el('span', { class: 'muted' }, '可一次選多張圖（第一張當封面）。共 ' + b.pins.length + ' 件，顯示 ' + b.pins.filter(p => p.visible !== false).length + ' 件')),
    ...rows,
    field('頁尾說明', b.foot, v => { b.foot = v; changed(); }, { multiline: true, rows: 2, hint: '留白就不顯示。' + MARKUP_HINT })
  ];
}

function otherSlugs(b, p) { return new Set(b.pins.filter(x => x !== p).map(x => x.slug)); }
function slugProblem(b, p) {
  if (!SLUG_RE.test(p.slug || '') || p.slug.length > 60) return '只能用小寫英文、數字和 -，例如 studio-model';
  if (otherSlugs(b, p).has(p.slug)) return '跟另一件作品重複了';
  return '';
}

function pinEditor(b, p, i) {
  if (!Array.isArray(p.images)) p.images = [];
  const L = state.editLang, LT = L === 'en' ? '' : '・' + LANG_NAME[L];
  const imgs = p.images;
  const slugMsg = el('p', { class: 'hint err' }, slugProblem(b, p));
  const slugIn = el('input', { type: 'text', 'data-slug-for': String(i), spellcheck: 'false', autocapitalize: 'off', oninput: e => {
    p.slug = e.target.value.trim(); delete p._autoSlug;
    const prob = slugProblem(b, p); slugMsg.textContent = prob; e.target.classList.toggle('bad', !!prob);
    url.textContent = 'yuchuntsai.com/board/' + (p.slug || '…') + '/';
    changed();
  } });
  slugIn.value = p.slug || '';
  if (slugProblem(b, p)) slugIn.classList.add('bad');
  const url = el('span', {}, 'yuchuntsai.com/board/' + (p.slug || '…') + '/');
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, style: 'display:none', onchange: e => { addPinImages(p, e.target.files); e.target.value = ''; } });
  const full = imgs.length >= MAX_PIN_IMAGES;
  const tiles = imgs.map((src, k) => el('div', { class: 'tile' + (k === 0 ? ' cover' : '') },
    el('img', { src: thumbSrc(src), alt: '' }),
    el('span', { class: 'cap' }, k === 0 ? '封面' : String(k + 1), isPending(src) ? ' · 新' : ''),
    el('div', { class: 'tbtn' },
      el('button', { type: 'button', class: 'small', title: '往前', disabled: k === 0, onclick: () => { move(imgs, k, k - 1); changed(true); } }, '←'),
      el('button', { type: 'button', class: 'small', title: '往後', disabled: k === imgs.length - 1, onclick: () => { move(imgs, k, k + 1); changed(true); } }, '→'),
      el('button', { type: 'button', class: 'small', title: '移除這張', disabled: imgs.length === 1, onclick: () => { imgs.splice(k, 1); dropFromSections(p, src); changed(true); } }, '×'))));
  return el('div', { class: 'pinedit' },
    el('label', { class: 'field' }, el('span', {}, '網址代稱'), slugIn, el('p', { class: 'hint' }, '內頁網址：', url, '。發布後最好不要再改，舊連結會失效。'), slugMsg),
    langPicker(),
    L !== 'en' ? field('標題' + LT, tget(p, L, 'title'), v => { tset(p, L, 'title', v); changed(); }, { placeholder: p.title || '', hint: '留白就顯示英文標題。「項目」頁上的卡片一律用英文標題。' }) : null,
    field('說明（選填）' + LT, tget(p, L, 'description'), v => { tset(p, L, 'description', v); changed(); }, { multiline: true, rows: 6, placeholder: L !== 'en' ? p.description || '' : '', hint: L !== 'en' ? '留白就顯示英文說明。純文字，空一行分段。' : '純文字。空一行分段，換行會照樣顯示。留白就只顯示標題和圖片。' }),
    el('div', { class: 'field' },
      el('span', {}, '圖片（' + imgs.length + '／' + MAX_PIN_IMAGES + '）第一張是「項目」頁上的封面'),
      el('div', { class: 'tiles' }, ...tiles),
      el('div', { class: 'addbar' },
        el('button', { type: 'button', disabled: full, onclick: () => file.click() }, '新增圖片…'), file,
        el('span', { class: 'muted' }, full ? '已達 ' + MAX_PIN_IMAGES + ' 張上限，要換圖請先移除一張。' : '還可以加 ' + (MAX_PIN_IMAGES - imgs.length) + ' 張。原樣上傳，不裁切；單張 8 MB 以內。'))),
    sectionsEditor(p));
}

/* interleaved sections (optional): heading, text, images picked from the pin's own images, one caption per image */
function dropFromSections(p, src) {
  for (const s of Array.isArray(p.sections) ? p.sections : []) {
    if (!s || !Array.isArray(s.images)) continue;
    for (let k = s.images.length - 1; k >= 0; k--) if (s.images[k] === src) { for (const a of capLists(s)) a.splice(k, 1); s.images.splice(k, 1); }
    tprune(s);
  }
}

/* translations: English lives in the plain keys, other languages in o.i18n[lang] (an empty field falls back to English) */
const tget = (o, l, k) => (l === 'en' ? o[k] : o.i18n && o.i18n[l] && o.i18n[l][k]) || '';
function tset(o, l, k, v) {
  if (l === 'en') { o[k] = v; return; }
  o.i18n = o.i18n || {};
  const t = o.i18n[l] = o.i18n[l] || {};
  if (String(v).trim()) t[k] = v; else delete t[k];
  tprune(o);
}
function tprune(o) {
  if (!o.i18n) return;
  for (const l of Object.keys(o.i18n)) {
    const t = o.i18n[l];
    if (Array.isArray(t.captions) && !t.captions.some(c => String(c || '').trim())) delete t.captions;
    if (!Object.keys(t).length) delete o.i18n[l];
  }
  if (!Object.keys(o.i18n).length) delete o.i18n;
}
// Every caption list of a section (English + translations), padded to the image count, so image moves keep them aligned.
function capLists(s) {
  if (!Array.isArray(s.captions)) s.captions = [];
  const out = [s.captions];
  for (const t of Object.values(s.i18n || {})) if (t && Array.isArray(t.captions)) out.push(t.captions);
  for (const a of out) while (a.length < s.images.length) a.push('');
  return out;
}
function capList(s, l) {
  if (l === 'en') return s.captions;
  s.i18n = s.i18n || {};
  const t = s.i18n[l] = s.i18n[l] || {};
  if (!Array.isArray(t.captions)) t.captions = [];
  while (t.captions.length < s.images.length) t.captions.push('');
  return t.captions;
}
function langPicker() {
  return el('div', { class: 'field' }, el('span', {}, '編輯語言'),
    el('div', { class: 'seg' }, ...LANGS.map(l => el('button', { type: 'button', class: 'small' + (state.editLang === l ? ' on' : ''), 'aria-pressed': state.editLang === l ? 'true' : 'false', onclick: () => { state.editLang = l; renderEditor(); updatePreview(false); } }, LANG_NAME[l] || l))),
    el('p', { class: 'hint' }, '英文是原文。切換到其他語言後，標題、說明、段落標題、內文和圖說都可以另外填；留白的欄位會顯示英文。網址、圖片和排列各語言共用。有翻譯時，內頁右上角會出現語言切換，記住訪客上次的選擇。'));
}
function sectionsEditor(p) {
  const L = state.editLang, LT = L === 'en' ? '' : '・' + LANG_NAME[L];
  const secs = Array.isArray(p.sections) ? p.sections : [];
  const pool = p.images;
  const box = el('div', { class: 'field secs' },
    el('span', {}, '圖文段落（選填，' + secs.length + ' 段）'),
    el('p', { class: 'hint' }, '有段落時，內頁改成單欄：上面的「說明」當導言放最前面，每段先文字、後圖片，文字和圖片同寬；每張圖都放在同樣大小的 4:3 框裡（整張顯示，不裁切），電腦和手機都一樣。圖片從這件作品的圖片裡選，跟上面共用 ' + MAX_PIN_IMAGES + ' 張上限。每張圖下面一行圖說；同一段有多張圖、只填第一個圖說，就當成整排共用的圖說。沒被段落用到的圖會排在最後。'));
  secs.forEach((s, k) => {
    if (!Array.isArray(s.images)) s.images = [];
    capLists(s);
    const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, style: 'display:none', onchange: async e => {
      const items = await readImages(e.target.files, MAX_PIN_IMAGES - pool.length); e.target.value = '';
      if (!items.length) return;
      for (const x of items) { pool.push(x.url); s.images.push(x.url); }
      capLists(s); tprune(s);
      changed(true);
    } });
    const pick = el('div', { class: 'secpick' }, ...pool.map(src => {
      const at = s.images.indexOf(src);
      return el('button', { type: 'button', class: at >= 0 ? 'on' : null, title: at >= 0 ? '從這段拿掉' : '放進這段', onclick: () => {
        if (at >= 0) { for (const a of capLists(s)) a.splice(at, 1); s.images.splice(at, 1); } else { s.images.push(src); capLists(s); }
        tprune(s); changed(true);
      } }, el('img', { src: thumbSrc(src), alt: '' }), at >= 0 ? el('span', {}, String(at + 1)) : null);
    }));
    const caps = s.images.map((src, j) => el('div', { class: 'seccap' },
      el('img', { src: thumbSrc(src), alt: '' }),
      el('input', { type: 'text', placeholder: L !== 'en' ? (s.captions[j] || (j === 0 ? '圖說' + LT : '')) : (j === 0 ? '圖說（一行）' : '圖說（留白 = 用第一個當共用圖說）'), 'aria-label': '圖 ' + (j + 1) + ' 圖說' + LT, value: (L === 'en' ? s.captions[j] : tget(s, L, 'captions')[j]) || '', oninput: e => { const a = capList(s, L); a[j] = e.target.value.replace(/[\r\n]+/g, ' '); if (L !== 'en') tprune(s); changed(); } }),
      el('button', { type: 'button', class: 'small', title: '往前', disabled: j === 0, onclick: () => { const ls = capLists(s); move(s.images, j, j - 1); ls.forEach(a => move(a, j, j - 1)); changed(true); } }, '←'),
      el('button', { type: 'button', class: 'small', title: '往後', disabled: j === s.images.length - 1, onclick: () => { const ls = capLists(s); move(s.images, j, j + 1); ls.forEach(a => move(a, j, j + 1)); changed(true); } }, '→')));
    box.append(el('div', { class: 'card sec' },
      el('div', { class: 'head' }, el('h3', {}, '段落 ' + (k + 1) + (s.heading ? '：' + s.heading : '')),
        el('div', { class: 'ctl' },
          el('button', { type: 'button', class: 'small', title: '上移', disabled: k === 0, onclick: () => { move(secs, k, k - 1); changed(true); } }, '↑'),
          el('button', { type: 'button', class: 'small', title: '下移', disabled: k === secs.length - 1, onclick: () => { move(secs, k, k + 1); changed(true); } }, '↓'),
          el('button', { type: 'button', class: 'small', title: '刪除段落', onclick: () => {
            if (!confirm('刪除段落 ' + (k + 1) + (s.heading ? '「' + s.heading + '」' : '') + '？（圖片還會留在這件作品裡）')) return;
            secs.splice(k, 1); if (!secs.length) delete p.sections; changed(true);
          } }, '刪除'))),
      field('標題（可留白）' + LT, tget(s, L, 'heading'), v => { tset(s, L, 'heading', v); changed(); }, { placeholder: L !== 'en' ? s.heading || '' : '' }),
      field('內文（可留白）' + LT, tget(s, L, 'body'), v => { tset(s, L, 'body', v); changed(); }, { multiline: true, rows: 4, placeholder: L !== 'en' ? s.body || '' : '', hint: L !== 'en' ? '留白就顯示英文內文。' : '純文字。空一行分段，換行會照樣顯示。' }),
      el('div', { class: 'secimgs' },
        el('span', { class: 'muted' }, '這段的圖（點選放進／拿掉）：'), pick,
        ...caps,
        el('div', { class: 'addbar' }, el('button', { type: 'button', class: 'small', disabled: pool.length >= MAX_PIN_IMAGES, onclick: () => file.click() }, '上傳新圖到這段…'), file))));
  });
  box.append(el('div', { class: 'addbar' }, el('button', { type: 'button', onclick: () => {
    if (!Array.isArray(p.sections)) p.sections = [];
    p.sections.push({ heading: '', body: '', images: [], captions: [] }); changed(true);
  } }, '新增圖文段落')));
  return box;
}

function thumbSrc(src) {
  src = String(src || '');
  if (uploaded.has(src)) return uploaded.get(src);
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  return '../' + src;
}

// Read files as data: URLs (kept in the browser until "儲存並發布"). Returns [] for rejected files.
async function readImages(files, room) {
  const list = Array.from(files || []);
  const bad = list.filter(f => !/^image\/(jpeg|png|webp|gif)$/.test(f.type) || f.size > MAX_IMAGE);
  const ok = list.filter(f => !bad.includes(f));
  const msgs = [];
  if (bad.length) msgs.push('這些檔案沒有加入（只接受 JPG／PNG／WebP／GIF，8 MB 以內）：\n' + bad.map(f => f.name).join('\n'));
  if (ok.length > room) msgs.push('每件作品最多 ' + MAX_PIN_IMAGES + ' 張圖，這次只加入前 ' + room + ' 張，沒加入：\n' + ok.slice(room).map(f => f.name).join('\n'));
  if (msgs.length) alert(msgs.join('\n\n'));
  const take = ok.slice(0, Math.max(0, room));
  const items = await Promise.all(take.map(f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ f, url: r.result }); r.onerror = rej; r.readAsDataURL(f); })));
  for (const { f, url } of items) pending.set(url, { name: f.name, type: f.type });
  return items;
}

async function newPin(b, files) {
  const items = await readImages(files, MAX_PIN_IMAGES);
  if (!items.length) return;
  const title = items[0].f.name.replace(/\.[^.]+$/, '');
  const p = { title, slug: uniqueSlug(title, otherSlugs(b, null)), description: '', images: items.map(x => x.url), visible: true, big: false, _autoSlug: true };
  b.pins.unshift(p);
  state.openPin = p;
  showDetail(p);
  changed(true);
}

async function addPinImages(p, files) {
  const items = await readImages(files, MAX_PIN_IMAGES - p.images.length);
  if (!items.length) return;
  p.images.push(...items.map(x => x.url));
  changed(true);
}

// Switch the preview to a pin's detail page.
function showDetail(p) {
  state.detailPin = p;
  $('previewPage').value = 'detail';
  updatePreview(true);
}

/* A–Z */
function editAZ(az) {
  const out = [el('h2', {}, 'A–Z 索引'), el('p', { class: 'hint' }, '依標題第一個英文字母自動分組，沒有條目的字母不會出現。同一個字母裡依下面的順序排。連結可填站內頁面（例如 ../teaching/、berkeley.html）或完整網址，沒有頁面就填 #。')];
  const idx = new Map(az.entries.map((e, i) => [e, i]));
  for (const g of groupAZ(az.entries)) {
    out.push(el('p', { class: 'letter' }, g.label));
    g.entries.forEach((e, k) => {
      const i = idx.get(e);
      const prev = g.entries[k - 1], next = g.entries[k + 1];
      const t = el('input', { type: 'text', placeholder: '標題', oninput: ev => { e.title = ev.target.value; changed(); }, onchange: () => changed(true) }); t.value = e.title;
      const l = el('input', { type: 'text', placeholder: '連結', oninput: ev => { e.link = ev.target.value; changed(); } }); l.value = e.link || '';
      out.push(el('div', { class: 'row' },
        el('div', { class: 'grow' }, t, l),
        el('div', { class: 'ctl' },
          el('button', { type: 'button', class: 'small', disabled: !prev, onclick: () => { swap(az.entries, i, idx.get(prev)); changed(true); } }, '↑'),
          el('button', { type: 'button', class: 'small', disabled: !next, onclick: () => { swap(az.entries, i, idx.get(next)); changed(true); } }, '↓'),
          el('button', { type: 'button', class: 'small', onclick: () => { if (confirm('刪除「' + e.title + '」？')) { az.entries.splice(i, 1); changed(true); } } }, '刪除'))));
    });
  }
  const nt = el('input', { type: 'text', placeholder: '新條目標題（英文開頭決定字母）' });
  const nl = el('input', { type: 'text', placeholder: '連結（選填，預設 #）' });
  out.push(el('h3', {}, '新增條目'), el('div', { class: 'row' }, el('div', { class: 'grow' }, nt, nl),
    el('button', { type: 'button', onclick: () => {
      if (!nt.value.trim()) { nt.focus(); return; }
      az.entries.push({ title: nt.value.trim(), link: nl.value.trim() || '#' }); changed(true);
    } }, '加入')));
  return out;
}
function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }

/* teaching */
function editTeaching(t) {
  const out = [el('h2', {}, '教學頁'), el('p', { class: 'hint' }, '第一段是頁面主標題和導言。條列每行一項。' + MARKUP_HINT),
    field('頁面小標', t.note, v => { t.note = v; changed(); })];
  t.sections.forEach((s, i) => {
    out.push(el('div', { class: 'card' },
      el('div', { class: 'head' }, el('h3', {}, i === 0 ? '主標題段落' : '段落 ' + (i + 1)),
        el('div', { class: 'ctl' },
          el('button', { type: 'button', class: 'small', disabled: i === 0, onclick: () => { move(t.sections, i, i - 1); changed(true); } }, '↑'),
          el('button', { type: 'button', class: 'small', disabled: i === t.sections.length - 1, onclick: () => { move(t.sections, i, i + 1); changed(true); } }, '↓'),
          el('button', { type: 'button', class: 'small', disabled: t.sections.length < 2, onclick: () => { if (confirm('刪除段落「' + s.title + '」？')) { t.sections.splice(i, 1); changed(true); } } }, '刪除'))),
      field('標題', s.title, v => { s.title = v; changed(); }),
      field('內文（空一行分段，可留白）', s.body, v => { s.body = v; changed(); }, { multiline: true, rows: 3 }),
      field('條列（每行一項，可留白）', (s.items || []).join('\n'), v => { s.items = v.split('\n').map(x => x.trim()).filter(Boolean); changed(); }, { multiline: true, rows: Math.max(3, (s.items || []).length + 1) })));
  });
  out.push(el('div', { class: 'addbar' }, el('button', { type: 'button', onclick: () => { t.sections.push({ title: '新段落', body: '', items: [] }); changed(true); } }, '新增段落')));
  out.push(field('結尾文字', t.closing, v => { t.closing = v; changed(); }, { multiline: true, rows: 2, hint: MARKUP_HINT }));
  return out;
}

/* consulting */
function editConsulting(c) {
  const out = [el('h2', {}, '諮詢頁'),
    field('標題', c.title, v => { c.title = v; changed(); }),
    field('導言', c.lead, v => { c.lead = v; changed(); }, { multiline: true, rows: 2 }),
    field('公告', c.notice, v => { c.notice = v; changed(); }, { multiline: true, rows: 4, hint: MARKUP_HINT }),
    el('h3', {}, '方案與價格'),
    el('p', { class: 'hint' }, '每個幣種各自填整數價格，不會自動換算匯率。')];
  c.plans.forEach((p, i) => {
    out.push(el('div', { class: 'card' },
      el('h3', {}, '方案 ' + (i + 1)),
      field('名稱', p.title, v => { p.title = v; changed(); }),
      field('說明', p.meta, v => { p.meta = v; changed(); }),
      el('div', { class: 'prices' }, ...CURRENCIES.map(cur => {
        const inp = el('input', { type: 'text', inputmode: 'numeric', oninput: e => {
          const raw = e.target.value.replace(/[,\s]/g, '');
          const ok = /^\d+$/.test(raw);
          e.target.classList.toggle('bad', !ok);
          p.price[cur] = ok ? parseInt(raw, 10) : raw;
          changed();
        } });
        inp.value = p.price[cur];
        return el('label', {}, cur, inp);
      }))));
  });
  out.push(el('h3', {}, '付款方式（勾選才會顯示）'),
    el('div', { class: 'pays' }, ...c.payments.map(pm => el('label', {}, el('input', { type: 'checkbox', checked: pm.enabled !== false, onchange: e => { pm.enabled = e.target.checked; changed(); } }), pm.label))),
    field('條款（每行一項）', (c.terms || []).join('\n'), v => { c.terms = v.split('\n').map(x => x.trim()).filter(Boolean); changed(); }, { multiline: true, rows: 4, hint: MARKUP_HINT }),
    field('價格說明', c.rateNote, v => { c.rateNote = v; changed(); }, { multiline: true, rows: 2 }),
    field('送出按鈕下方提示', c.checkoutHint, v => { c.checkoutHint = v; changed(); }),
    field('Email 草稿最後一行備註', c.mailNote, v => { c.mailNote = v; changed(); }));
  return out;
}

/* ---------- preview ---------- */
let previewTimer = null;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(() => updatePreview(false), 250); }
// The pin shown in the "項目內頁" preview: the one being edited, else the last one viewed, else the first.
function previewPin() {
  const pins = state.data.board ? state.data.board.pins : [];
  if (pins.includes(state.detailPin)) return state.detailPin;
  return pins.find(p => p.visible !== false) || pins[0] || null;
}
function updatePreview(resetScroll) {
  const sel = $('previewPage');
  const page = sel.value;
  const d = state.data;
  const pin = previewPin();
  const opt = sel.querySelector('option[value=detail]');
  opt.textContent = '項目內頁' + (pin ? '：' + (pin.title || pin.slug || '') : '');
  opt.disabled = !pin;
  const dir = page === 'detail' ? (pin ? detailDir(pin.slug || 'preview') : 'board/') : PAGE_DIRS[page];
  const base = new URL('../' + dir, location.href).pathname; // admin lives at /admin/
  const fn = {
    landing: () => renderLanding(d.site, { base }),
    board: () => renderBoard(d.site, d.board, { base }),
    detail: () => pin ? renderDetail(d.site, d.board, pin, { base, lang: state.editLang }) : '<p>還沒有作品。</p>',
    az: () => renderAZ(d.site, d.az, { base }),
    teaching: () => renderTeaching(d.site, d.teaching, { base }),
    consulting: () => renderConsulting(d.site, d.consulting, { base })
  }[page];
  const fr = $('preview');
  let y = 0;
  try { y = resetScroll ? 0 : fr.contentWindow.scrollY; } catch (e) { /* ignore */ }
  fr.onload = () => {
    try {
      const w = fr.contentWindow;
      if (y) w.scrollTo(0, y);
      // Links inside the preview don't leave /admin. Board pins open their detail preview,
      // and the detail page's board links go back to the board preview.
      w.document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href');
        if (page === 'board' && a.classList.contains('pin')) {
          const slug = href.replace(/\/$/, '');
          const p = d.board.pins.find(x => x.slug === slug);
          if (p) showDetail(p);
        } else if (page === 'detail' && (href === '../' || a.closest('.back'))) {
          sel.value = 'board'; updatePreview(true);
        }
      }, true);
    } catch (e) { /* ignore */ }
  };
  fr.srcdoc = fn();
}

/* ---------- save ---------- */
function updateSaveMsg(extra) {
  if (state.busy) return;
  const msg = $('saveMsg');
  const d = dirtyFiles();
  $('revertBtn').disabled = !d.length;
  $('saveBtn').disabled = !d.length;
  if (extra) { msg.replaceChildren(...[].concat(extra).filter(x => x != null)); return; }
  msg.textContent = d.length ? '尚未儲存：' + d.map(n => LABEL[n]).join('、') : '沒有未儲存的變更。';
}

function confirmSave() {
  const d = dirtyFiles();
  // New images are still data: URLs here; they get uploaded during save, so check them as if uploaded.
  const check = clean(state.data);
  const ph = x => (isPending(x) ? 'assets/pins/pending' : x);
  for (const p of check.board.pins || []) {
    if (Array.isArray(p.images)) p.images = p.images.map(ph);
    for (const s of Array.isArray(p.sections) ? p.sections : []) if (s && Array.isArray(s.images)) s.images = s.images.map(ph);
  }
  const errs = validate(check);
  if (errs.length) {
    updateSaveMsg([el('span', { class: 'err' }, '還不能儲存，請先修正：'), el('ul', {}, ...errs.map(x => el('li', { class: 'err' }, x)))]);
    return;
  }
  const pages = [...new Set(d.map(n => ({ site: '首頁、項目和內頁、A–Z、教學、諮詢', board: '項目和項目內頁', az: 'A–Z', teaching: '教學', consulting: '諮詢' }[n])))].join('、');
  updateSaveMsg([
    el('div', {}, '要儲存：' + d.map(n => LABEL[n]).join('、') + '。會更新的頁面：' + pages + '。請先在右側預覽確認（可切換頁面）。'),
    el('div', { class: 'dl' },
      el('button', { type: 'button', class: 'primary', onclick: doSave }, '確認儲存'),
      el('button', { type: 'button', onclick: () => updateSaveMsg() }, '取消'))
  ]);
}

async function doSave() {
  const d = dirtyFiles();
  if (state.mode !== 'online') return offlineSave(d);
  state.busy = true;
  $('saveBtn').disabled = $('revertBtn').disabled = true;
  const msg = $('saveMsg');
  try {
    // 1) upload new images (batches of up to 10 → one commit per batch), then swap the data: URLs for repo paths
    const todo = [...new Set(state.data.board.pins.flatMap(p => pinImages(p).filter(isPending)))];
    const done = new Map();
    let batch = [], bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      msg.textContent = '上傳圖片 ' + (done.size + 1) + '–' + (done.size + batch.length) + '／' + todo.length + '…';
      const fd = new FormData();
      for (const x of batch) fd.append('file', x.blob, x.name);
      const r = await apiFetch('/upload', { method: 'POST', body: fd });
      const paths = r.paths || (r.path ? [r.path] : []);
      if (paths.length !== batch.length) throw new Error('上傳回應不完整');
      batch.forEach((x, k) => { done.set(x.src, paths[k]); uploaded.set(paths[k], x.src); });
      batch = []; bytes = 0;
    };
    for (const src of todo) {
      const blob = await (await fetch(src)).blob();
      if (batch.length >= UPLOAD_BATCH_FILES || (batch.length && bytes + blob.size > UPLOAD_BATCH_BYTES)) await flush();
      const meta = pending.get(src) || { name: 'image.' + (blob.type.split('/')[1] || 'jpg') };
      batch.push({ src, blob, name: meta.name }); bytes += blob.size;
    }
    await flush();
    for (const p of state.data.board.pins) {
      if (Array.isArray(p.images)) p.images = p.images.map(x => done.get(x) || x);
      for (const s of Array.isArray(p.sections) ? p.sections : []) if (s && Array.isArray(s.images)) s.images = s.images.map(x => done.get(x) || x);
    }
    for (const k of done.keys()) pending.delete(k);
    // 2) commit changed JSON files one by one (Contents API, sequential to avoid conflicts)
    const commits = [];
    for (const n of dirtyFiles()) {
      msg.textContent = '儲存' + LABEL[n] + '…';
      const r = await apiFetch('/content/' + n, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: ser(state.data[n]) });
      state.saved[n] = ser(state.data[n]);
      if (r.commit) commits.push(r.commit);
    }
    state.busy = false;
    renderEditor(); renderTabs();
    updateSaveMsg([el('span', {}, '已儲存。網站約 1–2 分鐘後更新。'),
      commits.length ? el('span', { class: 'muted' }, ' 版本：' + commits.map(c => c.slice(0, 7)).join('、')) : null]);
  } catch (e) {
    state.busy = false;
    renderTabs();
    updateSaveMsg([el('span', { class: 'err' }, '儲存失敗：' + e.message), el('span', {}, ' 變更還在這個頁面上，可以再試一次，或先下載備份：'), downloadLinks(dirtyFiles())]);
  }
}

async function apiFetch(path, init) {
  let r;
  try { r = await fetch(API + path, Object.assign({ credentials: 'same-origin', redirect: 'manual', headers: {} }, init, { headers: Object.assign({ Accept: 'application/json', 'X-CMS': '1' }, (init && init.headers) || {}) })); }
  catch (e) { throw new Error('連不上儲存服務，可能是登入逾時，請重新整理頁面再登入。'); }
  if (r.type === 'opaqueredirect' || r.status === 0) throw new Error('登入逾時，請重新整理頁面再登入。');
  let j = null;
  try { j = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}

function offlineSave(d) {
  const hasPending = state.data.board.pins.some(p => pinImages(p).some(isPending));
  updateSaveMsg([
    el('div', {}, el('strong', {}, '儲存服務還沒連線，這次沒有存到網站。'), ' 可以先下載 JSON 備份，保存這次的修改：'),
    downloadLinks(d),
    hasPending ? el('div', { class: 'muted' }, '新加入的圖片需要儲存服務才能上傳，下載的項目 JSON 不含這幾張新圖（只有新圖的作品也不含）。') : null
  ]);
}

function downloadLinks(names) {
  const box = el('span', { class: 'dl' });
  for (const n of names) {
    let data = clean(state.data[n]);
    if (n === 'board') data.pins = data.pins.map(p => {
      if (Array.isArray(p.sections)) for (const s of p.sections) if (s && Array.isArray(s.images)) {
        const keep = s.images.map(x => !isPending(x));
        if (Array.isArray(s.captions)) s.captions = s.captions.filter((c, k) => keep[k] !== false);
        for (const t of Object.values(s.i18n || {})) if (t && Array.isArray(t.captions)) t.captions = t.captions.filter((c, k) => keep[k] !== false);
        s.images = s.images.filter((x, k) => keep[k]);
      }
      return Object.assign(p, { images: pinImages(p).filter(x => !isPending(x)) });
    }).filter(p => p.images.length);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    box.append(el('a', { href: url, download: n + '.json' }, el('button', { type: 'button', tabindex: '-1' }, '下載 ' + n + '.json')));
  }
  return box;
}

/* ---------- boot ---------- */
$('saveBtn').addEventListener('click', confirmSave);
$('revertBtn').addEventListener('click', () => {
  if (!confirm('放棄所有未儲存的變更？')) return;
  for (const n of FILES) state.data[n] = JSON.parse(state.saved[n]);
  state.openPin = state.detailPin = null;
  changed(true);
});
$('previewPage').addEventListener('change', () => updatePreview(true));
// Preview width: desktop (1280px, scaled to fit), fit to pane, or phone (390px). Column count follows the site's own breakpoints.
function sizePreview() {
  const stage = $('stage'), fr = $('preview'), v = $('previewWidth').value;
  const W = stage.clientWidth, H = stage.clientHeight;
  if (v === 'fit') { Object.assign(fr.style, { width: '100%', height: '100%', transform: '', left: '0' }); return; }
  const w = parseInt(v, 10), s = Math.min(1, W / w);
  Object.assign(fr.style, { width: w + 'px', height: (H / s) + 'px', transform: 'scale(' + s + ')', left: Math.max(0, (W - w * s) / 2) + 'px' });
}
$('previewWidth').addEventListener('change', sizePreview);
addEventListener('resize', sizePreview);
sizePreview();
addEventListener('beforeunload', e => { if (dirtyFiles().length) { e.preventDefault(); e.returnValue = ''; } });

load().then(() => { $('previewPage').value = PREVIEW_FOR[state.tab]; renderTabs(); renderEditor(); updatePreview(true); updateSaveMsg(); })
  .catch(e => { $('status').className = 'status warn'; $('status').textContent = '載入失敗：' + e.message; });

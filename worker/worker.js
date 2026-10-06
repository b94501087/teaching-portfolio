// yuchuntsai.com CMS save service (Cloudflare Worker).
// Route: yuchuntsai.com/api/*  — must sit behind Cloudflare Access (same Access app as /admin*).
//
//   GET  /api/health              → { ok, user }
//   GET  /api/content             → { ok, files: { site, board, az, teaching, consulting } }  (live from GitHub main)
//   PUT  /api/content/:name       → body = JSON for content/:name.json  → one commit
//   POST /api/upload              → multipart "file" × 1–10 (jpg/png/webp/gif, each ≤ 8 MB)
//                                   → ONE commit adding assets/pins/<file>… → { ok, paths, path, commit }
//   (The admin uploads all new images first, then PUTs content/board.json.)
//
// Content files are committed through the GitHub Contents API, image batches through the Git Data API
// (blobs → tree → commit → ref), all with env.GITHUB_TOKEN
// (fine-grained token: this repo only, Contents read/write). No secrets live in this file.
//
// Auth: if TEAM_DOMAIN + POLICY_AUD are set, the Cf-Access-Jwt-Assertion JWT is fully verified
// (RS256 signature against the team's certs, aud, iss, exp) and its email must equal ALLOWED_EMAIL.
// If they are not set, the Worker still requires Cf-Access-Authenticated-User-Email == ALLOWED_EMAIL
// (only trustworthy because Access sits in front of the route). Anything else → 403.

import { validatePins, MAX_PIN_IMAGES } from '../admin/render.js';

const CONTENT_FILES = ['site', 'board', 'az', 'teaching', 'consulting'];
const CURRENCIES = ['CNY', 'USD', 'EUR', 'TWD'];
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_JSON = 512 * 1024;
const MAX_UPLOAD_FILES = MAX_PIN_IMAGES;       // one pin's worth of images per request
const MAX_UPLOAD_TOTAL = 40 * 1024 * 1024;

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      const status = e.status || 500;
      return json({ ok: false, error: e.expose ? e.message : '儲存服務發生錯誤（' + status + '）' }, status);
    }
  }
};

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  const user = await authenticate(request, env);

  if (request.method !== 'GET') {
    // Same-origin only: browsers always send Origin on cross-site POST/PUT; require our own.
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN || ('https://' + url.host);
    if (origin && origin !== allowed) throw err(403, '不允許的來源');
    if (request.headers.get('X-CMS') !== '1') throw err(403, '缺少 X-CMS 標頭');
  }
  if (!env.GITHUB_TOKEN) throw err(503, '儲存服務尚未設定 GITHUB_TOKEN');

  if (request.method === 'GET' && path === '/api/health') return json({ ok: true, user });

  if (request.method === 'GET' && path === '/api/content') {
    const files = {};
    await Promise.all(CONTENT_FILES.map(async n => {
      const f = await ghGetFile(env, 'content/' + n + '.json');
      if (!f) throw err(500, '找不到 content/' + n + '.json');
      files[n] = JSON.parse(f.text);
    }));
    return json({ ok: true, files });
  }

  let m = path.match(/^\/api\/content\/([a-z]+)$/);
  if (m && request.method === 'PUT') {
    const name = m[1];
    if (!CONTENT_FILES.includes(name)) throw err(404, '不認得的內容檔：' + name);
    const raw = await request.text();
    if (raw.length > MAX_JSON) throw err(413, '內容太大');
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw err(400, 'JSON 格式錯誤'); }
    const problems = validate(name, data);
    if (problems.length) throw err(422, '內容檢查沒通過：' + problems.join('；'));
    const text = JSON.stringify(data, null, 2) + '\n';
    const commit = await ghPutFile(env, 'content/' + name + '.json', utf8ToBase64(text), 'CMS: update content/' + name + '.json', user);
    return json({ ok: true, commit });
  }

  if (path === '/api/upload' && request.method === 'POST') {
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_UPLOAD_TOTAL + 64 * 1024) throw err(413, '一次上傳的圖片太大（上限 40 MB）');
    const form = await request.formData();
    const list = form.getAll('file').filter(f => f && typeof f !== 'string');
    if (!list.length) throw err(400, '沒有收到檔案');
    if (list.length > MAX_UPLOAD_FILES) throw err(413, '一次最多上傳 ' + MAX_UPLOAD_FILES + ' 張圖片');
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const files = [];
    let total = 0;
    for (const file of list) {
      const ext = IMAGE_TYPES[file.type];
      if (!ext) throw err(415, '只接受 JPG／PNG／WebP／GIF：' + (file.name || ''));
      if (file.size > MAX_IMAGE) throw err(413, '圖片超過 8 MB：' + (file.name || ''));
      total += file.size;
      if (total > MAX_UPLOAD_TOTAL) throw err(413, '一次上傳的圖片太大（上限 40 MB）');
      const buf = new Uint8Array(await file.arrayBuffer());
      if (!sniffImage(buf, ext)) throw err(415, '檔案內容不是有效的圖片：' + (file.name || ''));
      const stem = String(file.name || 'image').replace(/\.[^.]*$/, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
      const rand = crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
      files.push({ path: 'assets/pins/' + stamp + '-' + rand + '-' + stem + '.' + ext, b64: bytesToBase64(buf) });
    }
    const paths = files.map(f => f.path);
    const message = files.length === 1 ? 'CMS: upload ' + paths[0] : 'CMS: upload ' + files.length + ' images';
    const commit = await ghCommitFiles(env, files, message, user);
    return json({ ok: true, paths, path: paths[0], commit });
  }

  throw err(404, '找不到這個 API');
}

/* ---------------- auth ---------------- */
async function authenticate(request, env) {
  const allowed = String(env.ALLOWED_EMAIL || '').toLowerCase();
  if (!allowed) throw err(500, '未設定 ALLOWED_EMAIL');
  let email = '';
  if (env.TEAM_DOMAIN && env.POLICY_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) throw err(403, '需要先通過 Cloudflare Access 登入');
    const claims = await verifyAccessJwt(token, env);
    email = String(claims.email || '').toLowerCase();
  } else {
    email = String(request.headers.get('Cf-Access-Authenticated-User-Email') || '').toLowerCase();
  }
  if (!email || email !== allowed) throw err(403, '這個帳號沒有編輯權限');
  return email;
}

let certCache = { at: 0, keys: null };
async function accessKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const r = await fetch('https://' + team + '/cdn-cgi/access/certs');
  if (!r.ok) throw err(503, '無法取得 Access 公鑰');
  const { keys } = await r.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

async function verifyAccessJwt(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) throw err(403, 'Access token 格式錯誤');
  const header = JSON.parse(b64urlToText(parts[0]));
  const payload = JSON.parse(b64urlToText(parts[1]));
  if (header.alg !== 'RS256') throw err(403, 'Access token 演算法不符');
  const team = String(env.TEAM_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  let keys = await accessKeys(team);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { certCache.keys = null; keys = await accessKeys(team); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw err(403, 'Access token 金鑰不符');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw err(403, 'Access token 簽章無效');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - 30) throw err(403, '登入已過期，請重新整理頁面');
  if (payload.nbf && payload.nbf > now + 30) throw err(403, 'Access token 尚未生效');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.POLICY_AUD)) throw err(403, 'Access token 對象不符');
  if (payload.iss && payload.iss !== 'https://' + team) throw err(403, 'Access token 發行者不符');
  return payload;
}

/* ---------------- validation (mirrors admin/render.js validate; board pins use the shared validatePins) ---------------- */
function validate(name, d) {
  const e = [];
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const str = v => typeof v === 'string';
  if (!isObj(d)) return ['最外層必須是物件'];
  if (name === 'site') {
    if (!str(d.name) || !d.name.trim()) e.push('網站名稱不能空白');
    if (!str(d.email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e.push('Email 格式不正確');
    if (!isObj(d.nav)) e.push('缺少 nav');
    else for (const k of ['board', 'az', 'teaching', 'consulting', 'cv', 'email']) if (!str(d.nav[k]) || !d.nav[k].trim()) e.push('導覽文字 ' + k + ' 不能空白');
  } else if (name === 'board') {
    if (!Array.isArray(d.pins)) e.push('缺少 pins');
    else e.push(...validatePins(d.pins)); // same rules as the admin and the build (admin/render.js)
  } else if (name === 'az') {
    if (!Array.isArray(d.entries)) e.push('缺少 entries');
    else d.entries.forEach((x, i) => { if (!isObj(x) || !str(x.title)) e.push('第 ' + (i + 1) + ' 條格式錯誤'); });
  } else if (name === 'teaching') {
    if (!Array.isArray(d.sections) || !d.sections.length) e.push('至少要有一個段落');
  } else if (name === 'consulting') {
    if (!Array.isArray(d.plans) || d.plans.length !== 4) e.push('方案必須是 4 個');
    else d.plans.forEach((p, i) => {
      if (!isObj(p) || !str(p.title) || !p.title.trim()) e.push('方案 ' + (i + 1) + ' 名稱不能空白');
      for (const c of CURRENCIES) if (!p.price || !Number.isInteger(p.price[c]) || p.price[c] < 0) e.push('方案 ' + (i + 1) + ' ' + c + ' 價格必須是整數');
    });
    if (!Array.isArray(d.payments)) e.push('缺少 payments');
  }
  return e;
}

/* ---------------- GitHub Contents API ---------------- */
function gh(env, path, init = {}) {
  const owner = env.GITHUB_OWNER, repo = env.GITHUB_REPO;
  return fetch('https://api.github.com/repos/' + owner + '/' + repo + path, Object.assign({}, init, {
    headers: Object.assign({
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yuchuntsai-cms-worker'
    }, init.headers || {})
  }));
}

async function ghGetFile(env, repoPath) {
  const branch = env.GITHUB_BRANCH || 'main';
  const r = await gh(env, '/contents/' + encodePath(repoPath) + '?ref=' + encodeURIComponent(branch));
  if (r.status === 404) return null;
  if (!r.ok) throw err(502, 'GitHub 讀取失敗（' + r.status + '）');
  const j = await r.json();
  let text;
  if (j.content) text = base64ToUtf8(j.content.replace(/\n/g, ''));
  else { // > 1 MB: fetch raw
    const raw = await gh(env, '/contents/' + encodePath(repoPath) + '?ref=' + encodeURIComponent(branch), { headers: { Accept: 'application/vnd.github.raw' } });
    text = await raw.text();
  }
  return { sha: j.sha, text };
}

async function ghPutFile(env, repoPath, contentB64, message, user) {
  const branch = env.GITHUB_BRANCH || 'main';
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await gh(env, '/contents/' + encodePath(repoPath) + '?ref=' + encodeURIComponent(branch));
    let sha;
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw err(502, 'GitHub 讀取失敗（' + cur.status + '）');
    const body = { message, content: contentB64, branch, committer: { name: 'yuchuntsai.com CMS', email: user } };
    if (sha) body.sha = sha;
    const r = await gh(env, '/contents/' + encodePath(repoPath), { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    if (r.ok) return (await r.json()).commit.sha;
    if ((r.status === 409 || r.status === 422) && attempt < 2) continue; // sha race: retry with fresh sha
    throw err(502, 'GitHub 寫入失敗（' + r.status + '）');
  }
  throw err(502, 'GitHub 寫入衝突，請再試一次');
}

// Add several files in a single commit (Git Data API). Retries if main moved in the meantime.
async function ghCommitFiles(env, files, message, user) {
  const branch = env.GITHUB_BRANCH || 'main';
  const call = async (path, init, what) => {
    const r = await gh(env, path, init ? { method: init.method, body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } } : {});
    if (!r.ok) { const e = err(502, 'GitHub ' + what + '失敗（' + r.status + '）'); e.ghStatus = r.status; throw e; }
    return r.json();
  };
  const blobs = [];
  for (const f of files) blobs.push((await call('/git/blobs', { method: 'POST', body: { content: f.b64, encoding: 'base64' } }, '上傳圖片')).sha);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await call('/git/ref/heads/' + encodeURIComponent(branch), null, '讀取分支');
    const head = ref.object.sha;
    const base = await call('/git/commits/' + head, null, '讀取版本');
    const tree = await call('/git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree: files.map((f, k) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[k] })) } }, '建立檔案樹');
    const commit = await call('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head], author: { name: 'yuchuntsai.com CMS', email: user }, committer: { name: 'yuchuntsai.com CMS', email: user } } }, '建立版本');
    try {
      await call('/git/refs/heads/' + encodeURIComponent(branch), { method: 'PATCH', body: { sha: commit.sha, force: false } }, '更新分支');
      return commit.sha;
    } catch (e) {
      if ((e.ghStatus === 409 || e.ghStatus === 422) && attempt < 2) continue; // main moved: rebuild on the new head
      throw e;
    }
  }
  throw err(502, 'GitHub 寫入衝突，請再試一次');
}

/* ---------------- utils ---------------- */
function err(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e; }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function utf8ToBase64(text) { return bytesToBase64(new TextEncoder().encode(text)); }
function base64ToUtf8(b64) { return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
function b64urlToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function b64urlToText(s) { return new TextDecoder().decode(b64urlToBytes(s)); }
function sniffImage(b, ext) {
  if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === 'gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (ext === 'webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

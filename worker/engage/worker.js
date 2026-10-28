// Public blog engagement API for yuchuntsai.com.
// Route: yuchuntsai.com/engage/*  — must NOT sit behind Cloudflare Access (unlike /api/* and /admin*).
//
//   GET  /engage/health
//   GET  /engage/counts?slug=
//   POST /engage/view       { slug, vid?, src?: "external"|"site"|"direct" }
//   POST /engage/like       { slug, vid, on }
//   POST /engage/bookmark   { slug, vid, on }
//   POST /engage/subscribe  { email, lang? }
//
// Reads from outside the site (external referrers and typed URLs) are counted the same as
// in-site visits. A visitor is debounced for VIEW_WINDOW_MS (12h) per browser id, with a
// per-IP cap so rotating ids cannot inflate the numbers. Likes and bookmarks are one per
// browser id; the same id toggling on/off moves the count by one.
//
// Storage is one D1 database (counts, marks, rate limits, subscribers). No KV.
// Addresses are hashed with RATE_SALT before they are stored.

export const VIEW_WINDOW_MS = 12 * 60 * 60 * 1000;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS counts (
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, kind)
)`,
  `CREATE TABLE IF NOT EXISTS marks (
  actor TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (actor, slug, kind)
)`,
  `CREATE TABLE IF NOT EXISTS rl (
  ip TEXT NOT NULL,
  bucket TEXT NOT NULL,
  n INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  PRIMARY KEY (ip, bucket)
)`,
  `CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  lang TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`
];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VID = /^[A-Za-z0-9_-]{8,80}$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const LANGS = new Set(['en', 'zh-Hant', 'zh-Hans']);

const schemaReady = new WeakMap();

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      const status = e.status || 500;
      const origin = originOf(request, env);
      return json({ ok: false, error: e.expose ? e.message : 'error' }, status, origin === false ? '' : origin);
    }
  }
};

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = originOf(request, env);

  if (request.method === 'OPTIONS') {
    if (origin === false) return json({ ok: false, error: 'origin' }, 403, '');
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'GET' && request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, originOk(origin));
  if (request.method === 'POST' && origin === false) return json({ ok: false, error: 'origin' }, 403, '');

  if (!env.DB) return json({ ok: false, error: 'no-db' }, 503, originOk(origin));
  await ensureSchema(env);

  if (request.method === 'GET' && path === '/engage/health') return json({ ok: true }, 200, originOk(origin));

  if (request.method === 'GET' && path === '/engage/counts') {
    const slug = cleanSlug(url.searchParams.get('slug'));
    return json({ ok: true, ...(await readCounts(env.DB, slug)) }, 200, originOk(origin));
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'not-found' }, 404, originOk(origin));
  if (!/application\/json/i.test(request.headers.get('Content-Type') || '')) return json({ ok: false, error: 'type' }, 415, originOk(origin));

  const body = await readJson(request);
  const ip = await hash(env, 'ip|' + (request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '0'));

  if (path === '/engage/view') return json(await addView(env, body, ip), 200, originOk(origin));
  if (path === '/engage/like') return json(await setMark(env, body, ip, 'like'), 200, originOk(origin));
  if (path === '/engage/bookmark') return json(await setMark(env, body, ip, 'bookmark'), 200, originOk(origin));
  if (path === '/engage/subscribe') return json(await subscribe(env, body, ip), 200, originOk(origin));

  return json({ ok: false, error: 'not-found' }, 404, originOk(origin));
}

async function ensureSchema(env) {
  let pending = schemaReady.get(env.DB);
  if (!pending) {
    pending = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql))).catch(e => {
      schemaReady.delete(env.DB);
      throw e;
    });
    schemaReady.set(env.DB, pending);
  }
  return pending;
}

async function addView(env, body, ip) {
  const slug = cleanSlug(body.slug);
  const vid = cleanVid(body.vid, false);
  await rate(env, ip, 'view', num(env, 'VIEW_LIMIT', 60), num(env, 'RATE_WINDOW_SEC', 3600));
  const actor = await hash(env, 'view|' + (vid || 'ip:' + ip));
  const now = clock(env);
  const windowMs = num(env, 'VIEW_WINDOW_MS', VIEW_WINDOW_MS);
  const prev = await env.DB.prepare('SELECT at FROM marks WHERE actor = ? AND slug = ? AND kind = ?').bind(actor, slug, 'view').first();
  let counted = false;
  if (!prev || now - Number(prev.at) >= windowMs) {
    await bump(env.DB, slug, 'view', 1);
    await env.DB.prepare(
      `INSERT INTO marks (actor, slug, kind, state, at) VALUES (?, ?, 'view', 1, ?)
       ON CONFLICT(actor, slug, kind) DO UPDATE SET state = 1, at = excluded.at`
    ).bind(actor, slug, now).run();
    counted = true;
  }
  // src is accepted so external, in-site, and direct visits all take this same path.
  return { ok: true, counted, ...(await readCounts(env.DB, slug)) };
}

async function setMark(env, body, ip, kind) {
  const slug = cleanSlug(body.slug);
  const vid = cleanVid(body.vid, true);
  if (typeof body.on !== 'boolean') throw err(400, 'bad-on');
  const limit = kind === 'like' ? num(env, 'LIKE_LIMIT', 40) : num(env, 'BOOKMARK_LIMIT', 40);
  await rate(env, ip, kind, limit, num(env, 'RATE_WINDOW_SEC', 3600));
  const actor = await hash(env, kind + '|' + vid);
  const now = clock(env);
  const row = await env.DB.prepare('SELECT state FROM marks WHERE actor = ? AND slug = ? AND kind = ?').bind(actor, slug, kind).first();
  const cur = row && Number(row.state) === 1 ? 1 : 0;
  const want = body.on ? 1 : 0;
  if (cur !== want) {
    await bump(env.DB, slug, kind, want === 1 ? 1 : -1);
    await env.DB.prepare(
      `INSERT INTO marks (actor, slug, kind, state, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(actor, slug, kind) DO UPDATE SET state = excluded.state, at = excluded.at`
    ).bind(actor, slug, kind, want, now).run();
  }
  return { ok: true, ...(await readCounts(env.DB, slug)) };
}

async function subscribe(env, body, ip) {
  const email = cleanEmail(body.email);
  const lang = LANGS.has(body.lang) ? body.lang : null;
  await rate(env, ip, 'subscribe', num(env, 'SUBSCRIBE_LIMIT', 8), num(env, 'RATE_WINDOW_SEC', 3600));
  const now = new Date(clock(env)).toISOString();
  await env.DB.prepare(
    `INSERT INTO subscribers (email, lang, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET lang = COALESCE(excluded.lang, subscribers.lang), updated_at = excluded.updated_at`
  ).bind(email, lang, now, now).run();
  return { ok: true };
}

async function bump(db, slug, kind, delta) {
  if (delta > 0) {
    await db.prepare(
      `INSERT INTO counts (slug, kind, n) VALUES (?, ?, 1)
       ON CONFLICT(slug, kind) DO UPDATE SET n = n + 1`
    ).bind(slug, kind).run();
    return;
  }
  await db.prepare(
    `UPDATE counts SET n = CASE WHEN n > 0 THEN n - 1 ELSE 0 END WHERE slug = ? AND kind = ?`
  ).bind(slug, kind).run();
}

async function readCounts(db, slug) {
  const { results } = await db.prepare('SELECT kind, n FROM counts WHERE slug = ?').bind(slug).all();
  const out = { views: 0, likes: 0, bookmarks: 0 };
  for (const row of results || []) {
    if (row.kind === 'view') out.views = Number(row.n) || 0;
    else if (row.kind === 'like') out.likes = Number(row.n) || 0;
    else if (row.kind === 'bookmark') out.bookmarks = Number(row.n) || 0;
  }
  return out;
}

async function rate(env, ip, bucket, limit, windowSec) {
  const now = Math.floor(clock(env) / 1000);
  const row = await env.DB.prepare('SELECT n, window_start FROM rl WHERE ip = ? AND bucket = ?').bind(ip, bucket).first();
  if (!row || now - Number(row.window_start) >= windowSec) {
    await env.DB.prepare(
      `INSERT INTO rl (ip, bucket, n, window_start) VALUES (?, ?, 1, ?)
       ON CONFLICT(ip, bucket) DO UPDATE SET n = 1, window_start = excluded.window_start`
    ).bind(ip, bucket, now).run();
    return;
  }
  if (Number(row.n) >= limit) throw err(429, 'rate');
  await env.DB.prepare('UPDATE rl SET n = n + 1 WHERE ip = ? AND bucket = ?').bind(ip, bucket).run();
}

function cleanSlug(s) {
  if (typeof s !== 'string' || s.length > 80 || !SLUG.test(s)) throw err(400, 'bad-slug');
  return s;
}
function cleanVid(s, required) {
  if (s == null || s === '') {
    if (required) throw err(400, 'vid-required');
    return '';
  }
  if (typeof s !== 'string' || !VID.test(s)) throw err(400, 'bad-vid');
  return s;
}
function cleanEmail(s) {
  if (typeof s !== 'string') throw err(400, 'bad-email');
  const email = s.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw err(400, 'bad-email');
  return email;
}

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > 4096) throw err(413, 'too-large');
  const text = await request.text();
  if (text.length > 4096) throw err(413, 'too-large');
  try { return JSON.parse(text || '{}'); } catch { throw err(400, 'bad-json'); }
}

function clock(env) {
  return typeof env.now === 'function' ? Number(env.now()) : Date.now();
}
function num(env, key, fallback) {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function hash(env, value) {
  const data = new TextEncoder().encode(String(env.RATE_SALT || 'yuchuntsai-engage') + '|' + value);
  const buf = await crypto.subtle.digest('SHA-256', data);
  let hex = '';
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, 32);
}

function originOf(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  const allowed = String(env.ALLOWED_ORIGIN || 'https://yuchuntsai.com');
  if (origin === allowed || origin === 'https://yuchuntsai.com') return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return false;
}
function originOk(origin) { return origin === false ? '' : origin; }

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}
function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function json(obj, status, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(origin || '')
  };
  return new Response(JSON.stringify(obj), { status, headers });
}

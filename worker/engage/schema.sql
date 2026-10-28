-- yuchuntsai.com engagement store (Cloudflare D1).
-- Counts, per-visitor marks, rate limits, and email subscribers.
-- The Worker also creates these tables on first request (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS counts (
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, kind)
);

CREATE TABLE IF NOT EXISTS marks (
  actor TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (actor, slug, kind)
);

CREATE TABLE IF NOT EXISTS rl (
  ip TEXT NOT NULL,
  bucket TEXT NOT NULL,
  n INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  PRIMARY KEY (ip, bucket)
);

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  lang TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

# worker/ — save service for /admin

Cloudflare Worker on `yuchuntsai.com/api/*`. Not part of the GitHub Pages artifact (build/build.mjs skips this folder).

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, user }` — /admin uses this to detect the service |
| GET | `/api/content` | current `content/*.json` from GitHub `main` |
| PUT | `/api/content/:name` | validates and commits `content/:name.json` (`site`, `board`, `az`, `teaching`, `consulting`) |
| POST | `/api/upload` | multipart `file` × 1–10 (JPG/PNG/WebP/GIF, each ≤ 8 MB, ≤ 40 MB total) → **one** commit adding `assets/pins/<timestamp>-<rand>-<name>.<ext>`, returns `{ paths }` |

On save, /admin first uploads all new images (batches of ≤ 10), then PUTs `content/board.json`.
Each commit triggers the Pages workflow, which re-renders the pages from the JSON (the last run wins).

Auth: Cloudflare Access app covering `yuchuntsai.com/admin*` and `yuchuntsai.com/api/*`
(team `blue-rain-ed1c.cloudflareaccess.com`, login: One-time PIN). The Worker verifies the Access JWT
(signature, `aud` = `POLICY_AUD`, `iss`, expiry) and requires the email claim to equal `ALLOWED_EMAIL`.
It does not depend on the login method. Writes additionally need `X-CMS: 1` and Origin `https://yuchuntsai.com`.

Deploy (from the repo root):

```sh
cd worker
npx wrangler login                    # browser login to the Cloudflare account that owns yuchuntsai.com
npx wrangler secret put GITHUB_TOKEN  # paste the fine-grained token (this repo only, Contents: Read and write)
npx wrangler deploy                   # creates/updates "yuchuntsai-cms" with route yuchuntsai.com/api/*
```

The route only takes effect while the yuchuntsai.com DNS records are proxied (orange cloud).

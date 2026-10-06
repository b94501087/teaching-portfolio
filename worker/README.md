# worker/ — save service for /admin

Cloudflare Worker on `yuchuntsai.com/api/*`. Not part of the GitHub Pages artifact (build/build.mjs skips this folder).

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, user }` — /admin uses this to detect the service |
| GET | `/api/content` | current `content/*.json` from GitHub `main` |
| PUT | `/api/content/:name` | validates and commits `content/:name.json` (`site`, `board`, `az`, `teaching`, `consulting`) |
| POST | `/api/upload` | multipart `file` (JPG/PNG/WebP/GIF ≤ 8 MB) → commits `assets/pins/<timestamp>-<name>.<ext>`, returns `{ path }` |

Each commit triggers the Pages workflow, which re-renders the pages from the JSON.

Setup: `npx wrangler secret put GITHUB_TOKEN`, then `npx wrangler deploy`. See the comments in `wrangler.toml`.

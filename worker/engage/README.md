# Blog engagement worker

Public API for read counts, likes, bookmark counts, and email subscribers on `yuchuntsai.com` blog posts.
GitHub Pages only serves the static site. This Worker is deployed separately and is not part of the Pages artifact (`build/build.mjs` skips `worker/`).

The CMS worker in `worker/worker.js` stays on `yuchuntsai.com/api/*` behind Cloudflare Access. This one uses `yuchuntsai.com/engage/*` and must stay public, because visitors are not logged in.

Storage is one D1 database (no KV): `counts`, `marks` (debounced views and one like / bookmark per browser id), `rl` (per-IP rate limits), and `subscribers`.

The browser debounces a read for 12 hours in `localStorage`. The Worker applies the same 12-hour window per browser id and a per-IP cap, so refreshing or rotating ids does not inflate the count. Visits from external links are counted the same way as in-site visits. If the API is unreachable, the pages hide the numbers and keep likes, bookmarks, and sharing on the device.

The only front-end config value is `ENGAGE_API` in `admin/blog.js` (`https://yuchuntsai.com/engage`). Change it only if this route changes, then rebuild the site.

## What to do in Cloudflare

Use the Cloudflare account that owns the `yuchuntsai.com` zone. The zone's DNS records must be proxied (orange cloud), the same way the CMS worker's route is.

From the repo root:

```sh
cd worker/engage
npx wrangler login
npx wrangler d1 create yuchuntsai-engage
```

`d1 create` prints a `database_id`. Paste it into `worker/engage/wrangler.toml`, replacing `00000000-0000-0000-0000-000000000000`.

```sh
npx wrangler d1 execute yuchuntsai-engage --remote --file=schema.sql
npx wrangler secret put RATE_SALT
```

`RATE_SALT` is a long random string. It is the salt for hashed browser ids and IP addresses. The Worker also creates the tables on first request, so a missed schema step still comes up; running the file makes the database ready before the first visitor.

```sh
npx wrangler deploy
```

That publishes the Worker named `yuchuntsai-engage` on the route `yuchuntsai.com/engage/*`.

Do not add `/engage/*` to the Cloudflare Access application. Access currently covers `/admin*` and `/api/*` only. If Access is applied to the whole hostname or to `/engage*`, browsers cannot call the API and the site hides the counts.

Check:

```sh
curl -s https://yuchuntsai.com/engage/health
```

A ready database returns `{"ok":true}`.

Optional local run:

```sh
npx wrangler d1 execute yuchuntsai-engage --local --file=schema.sql
npx wrangler dev
```

Subscribers are rows in the `subscribers` table:

```sh
npx wrangler d1 execute yuchuntsai-engage --remote --command "SELECT email, lang, created_at FROM subscribers ORDER BY created_at"
```

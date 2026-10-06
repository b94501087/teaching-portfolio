# yuchuntsai.com — teaching portfolio

Static site on GitHub Pages. Pages are rendered from `content/*.json` at deploy time
(`.github/workflows/pages.yml` runs `node build/build.mjs` and publishes `_site/`).

| URL | Source |
| --- | --- |
| `/` | pin board — `content/board.json` (template in `admin/render.js`, CSS `style.css`) |
| `/A-Z/` | A–Z index — `content/az.json` (letters grouped automatically); `/a-z/` redirects here |
| `/teaching/` | teaching page — `content/teaching.json` |
| `/consulting/` | price list — `content/consulting.json` |
| `/cv/`, `/A-Z/*.html` | static pages (`{{name}}` / `{{email}}` filled from `content/site.json`) |
| `/admin/` | editor with live preview; saves through the Worker in `worker/` (behind Cloudflare Access) |
| `/pins/`, `/board/`, `/ksteinfe/*` | redirect stubs to the new paths |

Site-wide name, nav labels and contact email: `content/site.json`.
Fonts, colours, spacing, radius and column count live only in the CSS files and are not editable from /admin.

Local preview: `node build/build.mjs && cd _site && python3 -m http.server`.

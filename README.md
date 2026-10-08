# yuchuntsai.com — teaching portfolio

Static site on GitHub Pages. Pages are rendered from `content/*.json` at deploy time
(`.github/workflows/pages.yml` runs `node build/build.mjs` and publishes `_site/`).

| URL | Source |
| --- | --- |
| `/` | landing page: name + links (name and link labels from `content/site.json`; layout fixed) |
| `/board/` | pin board — `content/board.json` (template in `admin/render.js`, CSS `style.css`) |
| `/board/<slug>/` | one detail page per visible pin: title, optional description, up to 10 images (first = board cover). Optional `sections` (`heading`, `body`, `images` picked from the pin's images, one-line `captions`) switch the page to one centred column: text then images at the same width, every image in the same 4:3 box. Optional translations in `i18n` (pin: `title`, `description`; section: `heading`, `body`, `captions`) for the languages in `LANGS` (`admin/render.js`; now English + 繁體中文) add an EN / 繁中 switch that remembers the visitor's choice; empty fields fall back to English. `draft: true` publishes the page at its URL for preview (marked noindex) without listing it on `/board/`; `visible: false` hides it completely |
| `/A-Z/` | A–Z index — `content/az.json` (letters grouped automatically); `/a-z/` redirects here |
| `/teaching/` | teaching page — `content/teaching.json` |
| `/consulting/` | price list — `content/consulting.json` |
| `/cv/`, `/A-Z/*.html` | static pages (`{{name}}` / `{{email}}` filled from `content/site.json`) |
| `/admin/` | editor with live preview; saves through the Worker in `worker/` (behind Cloudflare Access) |
| `/pins/` → `/board/`, `/ksteinfe/*` | redirect stubs to the new paths |

Site-wide name, nav labels and contact email: `content/site.json`.
Fonts, colours, spacing, radius and column count live only in the CSS files and are not editable from /admin.

The build adds `?v=<hash of style.css>` to the root stylesheet link so returning visitors get new CSS.

Local preview: `node build/build.mjs && cd _site && python3 -m http.server`.

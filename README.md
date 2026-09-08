# Carbo-AI Landing Page

Static site for the Carbo-AI iPhone app.

**Company:** LIFEX TECHNOLOGIES LLC  
**Live Site:** https://carboai.app/

## Structure

Ten published pages — six marketing (English at the root, Simplified Chinese under `zh/`) and four legal:

- `index.html` / `zh/index.html` - Homepage
- `how-it-works.html` / `zh/how-it-works.html` - How the carb estimate works (placeholder for now: `noindex`, and out of `sitemap.xml` until the real copy lands)
- `about.html` / `zh/about.html` - Support / FAQ (`about.html` is the App Store Support URL; the Chinese one is still a placeholder)
- `privacy.html`, `terms.html`, `privacy-zh.html`, `terms-zh.html` - Legal, frozen 2026-09-05 and mirrored in the app repo's `docs/legal`

Everything else:

- `assets/` - `tokens.css` (generated from the app's design tokens), `site.css`, `motion.css`, `site.js`, plus `img/` and the demo meal photos in `demo/`
- `tools/` - the gate, the CJK joiner, the screenshot runner and the asset pipeline, with their Node tests
- `sitemap.xml`, `robots.txt`, `_config.yml` (Jekyll `exclude:` — `tools/`, `docs/` and the demo photo notes are never served), `CNAME`

## Development

Open `index.html` in a browser to preview locally.

```bash
node tools/check-site.mjs                  # the gate: run it before every commit
node --test 'tools/**/*.test.mjs'          # tool tests (the quoted glob is required)
node tools/cjk-joiner.mjs zh/index.html    # rewrite Chinese headlines with U+2060
node tools/shoot.mjs index.html out/ label # full-page shots at 1280/768/375/320
```

`check-site.mjs` walks a hand-written manifest of all ten pages and fails on brand and claim
problems, broken links, a missing or one-sided `hreflang`, an incomplete `<head>`, a `noindex` page
listed in `sitemap.xml` (or a live page missing from it), and Chinese headings that skipped the
joiner. `shoot.mjs` exits 1 if any width overflows horizontally.

## Deployment

GitHub Pages auto-deploys from `main` branch. See `docs/DEPLOYMENT.md`.

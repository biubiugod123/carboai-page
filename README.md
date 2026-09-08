# Carbo-AI Landing Page

Static site for the Carbo-AI iPhone app.

**Company:** LIFEX TECHNOLOGIES LLC  
**Live Site:** https://carboai.app/

## Structure

Eight published pages — four marketing (English at the root, Simplified Chinese under `zh/`) and four legal:

- `index.html` / `zh/index.html` - Homepage
- `about.html` / `zh/about.html` - Support / FAQ (`about.html` is the App Store Support URL)
- `privacy.html`, `terms.html`, `privacy-zh.html`, `terms-zh.html` - Legal, frozen 2026-09-05 and mirrored in the app repo's `docs/legal`

Everything else:

- `assets/` - `tokens.css` (generated from the app's design tokens), `site.css`, `motion.css`, `site.js`, the demo's `demo-core.mjs` + `demo.js`, plus `img/` and the demo meal photos in `demo/`
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

`check-site.mjs` walks a hand-written manifest of all eight pages and fails on brand and claim
problems, broken links, an `hreflang` that is missing, one-sided or names no page but itself, an
incomplete `<head>`, a viewport that blocks pinch-zoom (WCAG 1.4.4 — the one rule the legal pages
are held to as well), a `noindex` page listed in `sitemap.xml` (or a live page missing from it), and
Chinese headings that skipped the joiner. `CHECK_SITE_PAGES="a.html,b.html:legal"` replaces the
manifest for one run — being *set* is what activates it, so an empty value is an error rather than a
quiet run of all eight. `shoot.mjs` exits 1 if any width overflows horizontally. Both follow the same
convention: **exit 0** clean, **1** findings, **2** a usage or config error.

## Deployment

GitHub Pages auto-deploys from `main` branch. See `docs/DEPLOYMENT.md`.

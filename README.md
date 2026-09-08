# Carbo-AI Landing Page

Static site for the Carbo-AI iPhone app.

**Company:** LIFEX TECHNOLOGIES LLC  
**Live Site:** https://carboai.app/

## Structure

- `index.html` - Homepage (Hero + Features)
- `about.html` - Support / FAQ (the App Store Support URL)
- `privacy.html` - Privacy policy
- `terms.html` - Terms of service

## Development

Open `index.html` in a browser to preview locally.
Run `node tools/check-site.mjs` before committing — it fails on brand, claim and broken-link problems.
Run `node --test 'tools/**/*.test.mjs'` for the tool tests (the quoted glob is required).
Chinese headlines and the hero bubble must carry U+2060: `node tools/cjk-joiner.mjs zh/index.html` rewrites them, and the gate rejects a `zh/` page that skipped it.

## Deployment

GitHub Pages auto-deploys from `main` branch. See `docs/DEPLOYMENT.md`.

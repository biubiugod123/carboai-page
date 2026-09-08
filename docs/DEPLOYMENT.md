# Deployment Guide

## GitHub Pages Setup

### Initial Setup

1. Push code to `main` branch:
   ```bash
   git push origin main
   ```

2. Enable GitHub Pages:
   - Go to repository Settings
   - Navigate to "Pages" section
   - Source: Select "Deploy from a branch"
   - Branch: Select `main` and `/` (root)
   - Click Save

3. Wait 1-2 minutes for deployment

4. Site will be live at: `https://carboai.app/`

### Updating the Site

Any push to `main` branch will automatically trigger a new deployment:

```bash
git add .
git commit -m "update: your change description"
git push origin main
```

Wait 1-2 minutes for changes to appear live.

### Custom Domain

The site already runs on one. The `CNAME` file at the repo root holds `carboai.app`, and
the registrar's DNS points the apex domain at GitHub Pages.

- **Don't delete `CNAME`.** Pages re-reads it on every build; a push without it drops the
  custom domain.
- **Changing the domain** means editing `CNAME`, updating DNS at the registrar, and
  re-entering the domain under Settings → Pages. GitHub's own custom-domain
  documentation has the current record values.

### Troubleshooting

- **404 errors:** Ensure file paths use lowercase and match exactly
- **Styles not loading:** Check file paths are relative (no leading `/`)
- **Changes not appearing:** Clear browser cache or wait a few minutes

## Why _config.yml exists

GitHub Pages builds the site with Jekyll, and the `exclude:` list in `_config.yml` is the only
reason `tools/`, `docs/` and `README.md` stay off the live site — without it `tools/check-site.mjs`,
which names vendors the site itself never mentions, would be readable at a public URL. Adding a
`.nojekyll` file turns Jekyll off and takes `exclude:` with it, so don't add one. A user-supplied
`exclude:` replaces Jekyll's defaults rather than extending them, which is why `Gemfile`,
`Gemfile.lock`, `node_modules` and `vendor` are listed again there.

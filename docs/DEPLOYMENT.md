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

4. Site will be live at: `https://biubiugod123.github.io/carboai-page/`

### Updating the Site

Any push to `main` branch will automatically trigger a new deployment:

```bash
git add .
git commit -m "update: your change description"
git push origin main
```

Wait 1-2 minutes for changes to appear live.

### Custom Domain (Optional)

To use a custom domain:

1. Add `CNAME` file to root:
   ```
   yourdomain.com
   ```

2. Configure DNS at your domain registrar:
   - Add CNAME record pointing to `biubiugod123.github.io`

3. In GitHub Pages settings, enter your custom domain

### Troubleshooting

- **404 errors:** Ensure file paths use lowercase and match exactly
- **Styles not loading:** Check file paths are relative (no leading `/`)
- **Changes not appearing:** Clear browser cache or wait a few minutes

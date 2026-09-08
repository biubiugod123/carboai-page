# Demo photo sources

Stock photos for the three-step section and the interactive demo. **Owner to replace with their own phone photos before launch** (spec D6), then re-run Task 14 to regenerate results.json.

| file | source page | photographer | licence |
|---|---|---|---|
| meal-1.jpg | https://unsplash.com/photos/stainless-steel-spoon-and-fork-on-blue-ceramic-bowl-gM1f9RI-eIo | Mahbub Majid | Unsplash License |
| meal-2.jpg | https://unsplash.com/photos/89x1gsvk_Pk | Jessie Maxwell | Unsplash License |
| meal-3.jpg | https://unsplash.com/photos/2LixKaNWzzY | Julia | Unsplash License |

Fetched from each page's own `https://images.unsplash.com/photo-<id>?w=1600&q=80` image URL:
unsplash.com answers a plain `curl` with 401, and the Download button's
`/photos/<id>/download?force=true` endpoint with 403. Originals stay out of git via
`assets/demo/src/` in .gitignore; the committed files are 1200 px wide (q80, progressive)
plus 240x240 thumbs.

meal-1 carries a faint dark-on-dark photographer's watermark in the bottom-right corner —
invisible at the size the step-1 card renders it, and gone once the owner's own photos land.

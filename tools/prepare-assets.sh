#!/usr/bin/env bash
# Crops/resizes app artwork into assets/img with Pillow only (no sips, no cwebp, no ImageMagick, no temp files).
# Everything is WebP: the hills are opaque q85, the mascot frames keep alpha (alpha_quality stays 100 = lossless).
# Committed outputs were produced with Pillow 12.1.1 — a Pillow/libwebp bump may change bytes without changing looks.
# Not generated here: favicon.svg / carbo.svg (vector, no master in this repo), the App Store badges, the home-en JPEGs, OG PNGs.
set -euo pipefail
APP="${APP:-/Users/jiantanghuang/Documents/Carb-AI/Carb-AI/project}"
[ -d "$APP/assets/mascot/carbo" ] || { echo "APP not found or has no mascot frames: $APP" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/assets/img"; mkdir -p "$OUT"

APP="$APP" OUT="$OUT" python3 - <<'PY'
import os
from PIL import Image
APP, OUT = os.environ['APP'], os.environ['OUT']
M = f'{APP}/assets/mascot/carbo'

# Hero stage background: the stage is a 520 CSS px square, so crop the top 1408×1408 of the hills and ship 1040×1040 (2×).
hills = Image.open(f'{APP}/image/header_bg.png').convert('RGB').crop((0, 0, 1408, 1408)).resize((1040, 1040), Image.LANCZOS)
hills.save(os.path.join(OUT, 'hero-hills.webp'), 'WEBP', quality=85, method=6)

# Mascot frames → WebP with alpha, sized by WIDTH for their largest slot:
#   idle + waving = the hero (~343 CSS px → 2× 686; source is 576, so no upscale — ship the source size)
#   working / failed = 128 CSS px tiles and ≤120 px cards (2× 256) → 288 leaves headroom
#   data = the 260 CSS px Pro illustration → 512
def convert(src, name, width):
    im = Image.open(src).convert('RGBA')
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name), 'WEBP', quality=85, method=6)
for i in (0, 3): convert(f'{M}/idle/0{i}.png', f'carbo-idle-{i}.webp', 576)
for i in range(4): convert(f'{M}/waving/0{i}.png', f'carbo-waving-{i}.webp', 576)
for i in range(6): convert(f'{M}/working/0{i}.png', f'carbo-working-{i}.webp', 288)
for i in range(8): convert(f'{M}/failed/0{i}.png', f'carbo-failed-{i}.webp', 288)
convert(f'{APP}/image/data.png', 'carbo-data.webp', 512)
PY

du -sh "$OUT"; ls "$OUT"

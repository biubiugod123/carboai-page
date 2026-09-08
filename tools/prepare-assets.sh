#!/usr/bin/env bash
# Crops/resizes app artwork into assets/img. Re-runnable. macOS sips for the opaque JPEG; Pillow for the transparent
# mascot frames (WebP q85 with alpha — a 576×624 PNG frame is ~290 KB, the WebP is ~30 KB). No cwebp/ImageMagick needed.
set -euo pipefail
APP="${APP:-/Users/jiantanghuang/Documents/Carb-AI/Carb-AI/project}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/assets/img"; mkdir -p "$OUT"
M="$APP/assets/mascot/carbo"

# Hero background: top 1408x1150 of the hills illustration (PIL — `sips -c` ignores --cropOffset and crops from the centre), then 1040 wide JPEG q80
python3 -c "from PIL import Image; Image.open('$APP/image/header_bg.png').crop((0, 0, 1408, 1150)).save('/tmp/hills.png')"
sips -Z 1040 -s format jpeg -s formatOptions 80 /tmp/hills.png --out "$OUT/hero-hills.jpg" >/dev/null

# Mascot frames → WebP with alpha. Widths: idle stays 576 (it is the hero); the rest are sized for tiles/cards.
APP="$APP" OUT="$OUT" M="$M" python3 - <<'PY'
import os
from PIL import Image
APP, OUT, M = os.environ['APP'], os.environ['OUT'], os.environ['M']
def convert(src, name, width):
    im = Image.open(src).convert('RGBA')
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name), 'WEBP', quality=85, method=6)
for i in range(6): convert(f'{M}/working/0{i}.png', f'carbo-working-{i}.webp', 448)
for i in (0, 3): convert(f'{M}/idle/0{i}.png', f'carbo-idle-{i}.webp', 576)
for i in range(8): convert(f'{M}/failed/0{i}.png', f'carbo-failed-{i}.webp', 384)
for i in range(4): convert(f'{M}/waving/0{i}.png', f'carbo-waving-{i}.webp', 640)
convert(f'{APP}/image/data.png', 'carbo-data.webp', 512)
PY

du -sh "$OUT"; ls "$OUT"

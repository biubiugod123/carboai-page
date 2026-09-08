#!/usr/bin/env bash
# Crops/resizes app artwork into assets/img with macOS sips. Re-runnable.
set -euo pipefail
APP="${APP:-/Users/jiantanghuang/Documents/Carb-AI/Carb-AI/project}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/assets/img"; mkdir -p "$OUT"
M="$APP/assets/mascot/carbo"

# Hero background: top 1408x1150 of the hills illustration (PIL — `sips -c` ignores --cropOffset and crops from the centre), then 1040 wide JPEG q80
python3 -c "from PIL import Image; Image.open('$APP/image/header_bg.png').crop((0, 0, 1408, 1150)).save('/tmp/hills.png')"
sips -Z 1040 -s format jpeg -s formatOptions 80 /tmp/hills.png --out "$OUT/hero-hills.jpg" >/dev/null

# Mascot frames (transparent PNG). idle stays at source size (576) — it is the hero; the rest are sized for tiles/cards.
for i in 0 1 2 3 4 5; do sips -Z 448 "$M/working/0$i.png" --out "$OUT/carbo-working-$i.png" >/dev/null; done
cp "$M/idle/00.png" "$OUT/carbo-idle-0.png"; cp "$M/idle/03.png" "$OUT/carbo-idle-3.png"
for i in 0 1 2 3 4 5 6 7; do sips -Z 384 "$M/failed/0$i.png" --out "$OUT/carbo-failed-$i.png" >/dev/null; done
for i in 0 1 2 3; do sips -Z 640 "$M/waving/0$i.png" --out "$OUT/carbo-waving-$i.png" >/dev/null; done
sips -Z 512 "$APP/image/data.png" --out "$OUT/carbo-data.png" >/dev/null

du -sh "$OUT"; ls "$OUT"

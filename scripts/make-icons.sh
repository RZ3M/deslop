#!/bin/sh
# Renders icons/icon{16,32,48,128}.png from the SVG sources: a zipped-mouth face.
# icon16.png comes from icon-small.svg, a bolder cut without zipper teeth, which blur away at 16 px.
#   sh scripts/make-icons.sh   (macOS: uses sips)
set -e
dir="$(cd "$(dirname "$0")/.." && pwd)/icons"
for size in 32 48 128; do
  sips -s format png -z "$size" "$size" "$dir/icon.svg" --out "$dir/icon$size.png" >/dev/null
done
sips -s format png -z 16 16 "$dir/icon-small.svg" --out "$dir/icon16.png" >/dev/null
echo "Wrote $dir/icon{16,32,48,128}.png"

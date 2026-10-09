"""Puts the `look` scenario's shots side by side: native size, then enlarged pixels.

Usage: python3 montage.py <shots dir>   (writes <shots dir>/look.png)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ZOOM = 6
GAP = 12

shots = sorted(p for p in Path(sys.argv[1]).glob('[0-9][0-9]-*.png'))
images = [Image.open(p).convert('RGB') for p in shots]
assert images, 'no shots'

tiles = []
for path, image in zip(shots, images):
    big = image.resize((image.width * ZOOM, image.height * ZOOM), Image.NEAREST)
    label = path.stem.split('-', 1)[1]
    tile = Image.new('RGB', (big.width, image.height + big.height + 3 * GAP), (24, 24, 28))
    draw = ImageDraw.Draw(tile)
    draw.text((0, 0), label, fill=(220, 220, 220))
    tile.paste(image, (0, GAP + 2))
    tile.paste(big, (0, image.height + 2 * GAP + 2))
    tiles.append(tile)

width = sum(t.width for t in tiles) + GAP * (len(tiles) - 1)
out = Image.new('RGB', (width, max(t.height for t in tiles)), (24, 24, 28))
x = 0
for tile in tiles:
    out.paste(tile, (x, 0))
    x += tile.width + GAP
out.save(Path(sys.argv[1]) / 'look.png')
print(Path(sys.argv[1]) / 'look.png')

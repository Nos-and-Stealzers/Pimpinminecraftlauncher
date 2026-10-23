"""Make labeled nearest-neighbor food contact sheets from verified exports.
Run after node.exe scripts/food-art.test.js:
  uv run --with pillow python scripts/food-art-preview.py [evidence-directory]
No game assets are copied into the art, and no instance files are touched.
"""
import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ['LOCALAPPDATA']) / 'hermes/cache/scratch/pimpin-item-art/food'
report = json.loads((root / 'verification.json').read_text())
names = [s['name'] for s in report['specs']]
try:
    font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 14)
    titlefont = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 22)
except OSError:
    font = ImageFont.load_default()
    titlefont = font

for size, style in [(16, 'Performance16'), (32, 'Pretty32')]:
    cols, cellw, cellh, header = 7, 170, 148, 88
    sheet = Image.new('RGBA', (cols * cellw, ((len(names) + cols - 1) // cols) * cellh + header), '#20252c')
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 12), f'PIMPIN / {style} / FOOD & CONSUMABLES', fill='#f3dfbd', font=titlefont)
    draw.text((18, 44), f'40 edible item IDs / 39 food textures + 10 related / {size}px native art', fill='#b7c4cb', font=font)
    draw.text((18, 64), 'Enchanted golden apple shares golden_apple + game glint. Potions shown tinted.', fill='#b7c4cb', font=font)
    for i, name in enumerate(names):
        cx, cy = (i % cols) * cellw, (i // cols) * cellh + header
        for y in range(0, 100, 8):
            for x in range(0, 100, 8):
                color = '#383e46' if (x // 8 + y // 8) % 2 else '#30363e'
                draw.rectangle((cx + 34 + x, cy + y, cx + 41 + x, cy + y + 7), fill=color)
        icon = Image.open(root / str(size) / f'{name}.png').convert('RGBA')
        if name in ('potion', 'splash_potion', 'lingering_potion'):
            overlay = Image.open(root / str(size) / 'potion_overlay.png').convert('RGBA')
            pixels = overlay.load()
            for y in range(size):
                for x in range(size):
                    r, g, b, a = pixels[x, y]
                    pixels[x, y] = (int(r * 0.68), int(g * 0.35), b, a)
            overlay.alpha_composite(icon)
            icon = overlay
        icon = icon.resize((96, 96), Image.Resampling.NEAREST)
        sheet.alpha_composite(icon, (cx + 36, cy + 2))
        # Native-size swatch exposes 16px readability without magnification.
        native = Image.open(root / str(size) / f'{name}.png').convert('RGBA')
        sheet.alpha_composite(native, (cx + 4, cy + 74))
        label = name.replace('_', ' ')
        words = label.split()
        lines, line = [], ''
        for word in words:
            if len(line + ' ' + word) > 20:
                lines.append(line)
                line = word
            else:
                line = (line + ' ' + word).strip()
        lines.append(line)
        for row, line in enumerate(lines):
            draw.text((cx + 6, cy + 108 + row * 16), line, fill='#e7e5da', font=font)
    target = root / f'food-contact-{size}.png'
    sheet.convert('RGB').save(target)
    print(target)

# Exact native-size inventory proof on contrasting backgrounds, enlarged only
# for display by a viewer if desired. Labels remain outside the art pixels.
native = Image.new('RGBA', (7 * 150, 7 * 66 + 48), '#c9c6b8')
draw = ImageDraw.Draw(native)
draw.text((12, 12), 'Native sizes: 16px left / 32px right (not scaled)', fill='#303039', font=titlefont)
for i, name in enumerate(names):
    x, y = (i % 7) * 150, (i // 7) * 66 + 48
    native.alpha_composite(Image.open(root / '16' / f'{name}.png').convert('RGBA'), (x + 16, y + 8))
    native.alpha_composite(Image.open(root / '32' / f'{name}.png').convert('RGBA'), (x + 56, y))
    draw.text((x + 4, y + 36), name[:20], fill='#303039', font=font)
native.convert('RGB').save(root / 'food-native-sizes.png')
print(root / 'food-native-sizes.png')

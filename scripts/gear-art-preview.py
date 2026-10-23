"""Render native and nearest-neighbor gear contact sheets (Pillow).
Run gear-art.test.js first, then:
uv run --python 3.11 --with pillow scripts/gear-art-preview.py <output-dir>
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1])
report = json.loads((root / 'gear-report.json').read_text())
font = ImageFont.load_default()
cols = 10
for style, size in [('fast', 16), ('pretty', 32)]:
    rows = [r for r in report['images'] if r['style'] == style]
    for scale, label in [(1, 'native'), (4, 'nearest4x')]:
        cw, ch = max(116, size * scale + 12), size * scale + 38
        sheet = Image.new('RGB', (cw * cols, ((len(rows) + cols - 1) // cols) * ch), '#171c28')
        draw = ImageDraw.Draw(sheet)
        for i, row in enumerate(rows):
            x, y = (i % cols) * cw, (i // cols) * ch
            draw.rectangle((x + 1, y + 1, x + cw - 2, y + ch - 2), fill='#262e3d')
            icon = Image.open(root / row['file']).convert('RGBA')
            icon = icon.resize((size * scale, size * scale), Image.Resampling.NEAREST)
            ox, oy = x + (cw - size * scale) // 2, y + 4
            sheet.paste(icon, (ox, oy), icon)
            # Two lines, readable labels; native images themselves remain unscaled.
            name = row['name']
            words = name.split('_')
            split = max(1, len(words) // 2)
            label_text = '_'.join(words[:split]) + '\n' + '_'.join(words[split:]) if len(name) > 17 else name
            draw.multiline_text((x + 5, y + size * scale + 7), label_text, fill='#d4dce8', font=font, spacing=1)
        target = root / f'gear-{style}-{label}.png'
        sheet.save(target)
        print(target)
# Dye proof: same neutral base and uncolored trim, tinted before compositing.
colors = [('undyed', (160, 101, 64)), ('red', (190, 44, 53)), ('cyan', (35, 173, 192)), ('purple', (143, 72, 180))]
for style, size in [('fast', 16), ('pretty', 32)]:
    scale = 5
    sheet = Image.new('RGB', (480, 480), '#262e3d')
    draw = ImageDraw.Draw(sheet)
    for row, kind in enumerate(['helmet', 'chestplate', 'leggings', 'boots']):
        base = Image.open(root / f'{style}-leather_{kind}.png').convert('RGBA')
        overlay = Image.open(root / f'{style}-leather_{kind}_overlay.png').convert('RGBA')
        for col, (name, tint) in enumerate(colors):
            tinted = base.copy()
            pixels = base.get_flattened_data() if hasattr(base, 'get_flattened_data') else base.getdata()
            tinted.putdata([(r*tint[0]//255, g*tint[1]//255, b*tint[2]//255, a) for r,g,b,a in pixels])
            tinted = Image.alpha_composite(tinted, overlay)
            # Normalize display size so both styles fit the dye grid.
            tinted = tinted.resize((80, 80), Image.Resampling.NEAREST)
            sheet.paste(tinted, (col*120+20, row*120+10), tinted)
            draw.text((col*120+10, row*120+95), f'{name} {kind}', fill='#d4dce8', font=font)
    target = root / f'gear-{style}-dye-proof.png'
    sheet.save(target)
    print(target)

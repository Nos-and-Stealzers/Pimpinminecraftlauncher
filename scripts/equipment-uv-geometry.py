"""Regenerate alpha-only UV data; never retain vanilla RGB artwork.
Run: uv run --with pillow python scripts/equipment-uv-geometry.py CACHE_JARS
Requires cached Mojang release client jars. This is an offline maintainer tool,
not a build/runtime dependency. Writes only the marked geometry data section.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile
from PIL import Image

repo = Path(__file__).resolve().parents[1]
root = Path(sys.argv[1])
jars = sorted((p for p in root.glob('*.jar') if re.fullmatch(r'\d+\.\d+(?:\.\d+)?', p.stem)), key=lambda p: tuple(map(int, p.stem.split('.'))))
if not jars:
    raise SystemExit('No cached release client jars')
required = {'1.8.9', '1.9', '1.13', '1.14', '1.16', '1.16.4', '1.17', '1.19', '1.21.1', '1.21.2', '1.21.8', '1.21.9', '26.1', '26.3'}
missing = required - {p.stem for p in jars}
if missing:
    raise SystemExit('Refusing incomplete UV history; missing boundary jars: ' + ', '.join(sorted(missing)))
masks, revisions, previous = {}, [], {}
for jar in jars:
    entries = {}
    with zipfile.ZipFile(jar) as z:
        for path in sorted(z.namelist()):
            relative = path.removeprefix('assets/minecraft/textures/')
            if not path.startswith('assets/minecraft/textures/') or not path.endswith('.png'):
                continue
            if not (relative.startswith('models/armor/') or relative.startswith('entity/equipment/humanoid') or relative in ('entity/elytra.png', 'entity/equipment/wings/elytra.png')):
                continue
            im = Image.open(io.BytesIO(z.read(path))).convert('RGBA')
            alpha = im.getchannel('A')
            assert set(alpha.tobytes()) <= {0, 255}, path
            key = hashlib.sha256(alpha.tobytes()).hexdigest()[:10]
            masks[key] = [im.width, im.height, [format(sum(1 << x for x in range(im.width) if alpha.getpixel((x, y))), 'x') for y in range(im.height)]]
            entries[relative] = key
    add = {path: key for path, key in entries.items() if previous.get(path) != key}
    remove = sorted(set(previous) - set(entries))
    if add or remove:
        since = jar.stem
        if since == '1.8.9':
            since = '1.8'  # same 1.8 release atlas
        revision = {'since': since, 'add': add}
        if remove:
            revision['remove'] = remove
        revisions.append(revision)
    previous = entries
source = repo / 'src/main/pack-art/equipment-art.js'
text = source.read_text(encoding='utf-8')
start = text.index('const UV_DATA = ')
end = text.index('// END MEASURED UV DATA', start)
data = {'masks': masks, 'revisions': revisions}
# One line per unique geometry keeps the data auditable without a 1000-line blob.
mask_rows = ',\n'.join('    ' + json.dumps(k) + ': ' + json.dumps(v, separators=(',', ':')) for k, v in masks.items())
rev_rows = ',\n'.join('    ' + json.dumps(r, separators=(',', ':')) for r in revisions)
encoded = 'const UV_DATA = {\n  masks: {\n' + mask_rows + '\n  },\n  revisions: [\n' + rev_rows + '\n  ],\n};\n'
source.write_text(text[:start] + encoded + text[end:], encoding='utf-8')
print(json.dumps({'jars': len(jars), 'uniqueAlphaMasks': len(masks), 'revisions': [r['since'] for r in revisions], 'lastVersion': jars[-1].stem}, indent=2))

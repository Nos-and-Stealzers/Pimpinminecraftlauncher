"""Insert midpoints between existing values on continuous shader sliders.
Only touches named, strength/height-style continuous defines. Enum-style
options (like AURORA) and integer step counts are left alone, on purpose.
Run: py scripts/shaderpacks/finer_sliders.py
"""
import os, re, sys

# continuous, art-directable values: midpoints just give the in-game slider
# more stop points between the current presets
CONTINUOUS = {
    'SHADOW_SOFTNESS', 'SSAO_STRENGTH', 'SSAO_RADIUS', 'SSS_STRENGTH',
    'CLOUD_AMOUNT', 'CLOUD_HEIGHT', 'CLOUD_THICKNESS', 'CLOUD_BRIGHTNESS',
    'GODRAY_STRENGTH', 'BLOOM_STRENGTH', 'VL_STRENGTH', 'VL_DISTANCE',
    'WAVE_STRENGTH', 'WATER_WAVE_HEIGHT', 'WATER_SPEED', 'WATER_REFRACTION',
    'WATER_FOG', 'FOG_DENSITY', 'AMBIENT_STRENGTH', 'MOON_BRIGHTNESS',
    'STAR_BRIGHTNESS', 'END_SKY', 'AURORA_BRIGHTNESS', 'BLOCKLIGHT_STRENGTH',
    'EMISSIVE_STRENGTH', 'EXPOSURE', 'SATURATION', 'NIGHT_DESAT', 'VIGNETTE',
    'SUN_SIZE',
}
LINE = re.compile(r'^(#define (\w+) [-\d.]+) // \[([^]]+)\]$')

def mid(a, b):
    x, y = float(a), float(b)
    m = (x + y) / 2
    s = round(m, 2)
    return f'{s:.2f}'.rstrip('0').rstrip('.')

def expand(match):
    head, name, values = match.group(1), match.group(2), match.group(3)
    if name not in CONTINUOUS:
        return match.group(0)
    nums = values.split()
    if len(nums) < 2 or any(v for v in nums if not re.fullmatch(r'-?\d+(\.\d+)?', v)):
        return match.group(0)
    out = []
    for i, v in enumerate(nums):
        out.append(v)
        if i + 1 < len(nums):
            m = mid(v, nums[i + 1])
            if m not in out and m != v:
                out.append(m)
    return f'{head} // [{chr(32).join(out)}]'

for pack in sorted(os.listdir(os.environ.get('SHADERPACK_OUT') or
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'resources', 'shaderpacks'))):
    path = os.path.join('resources', 'shaderpacks', pack, 'shaders', 'lib', 'settings.glsl')
    if not os.path.exists(path):
        continue
    lines = [LINE.sub(expand, line) for line in open(path, encoding='utf-8').read().splitlines() if line.strip()]
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('updated', path)

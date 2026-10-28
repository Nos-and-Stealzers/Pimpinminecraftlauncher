"""Expand canonical coarse slider choices once, during shader generation.

Pure helper: never reads or rewrites generated packs. Regenerate with
python scripts/shaderpacks/gen.py (SHADERPACK_OUT redirects output).
Do not feed already-expanded settings back into this helper.
"""
import re
from decimal import Decimal

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
LINE = re.compile(r'^(#define (\w+) [-\d.]+) // \[([^]]+)\]$', re.M)

def mid(a, b):
    # Keep the release's two-decimal float rounding so existing stops survive
    # unchanged (for example, 0.7/0.85 rounds to 0.77 rather than 0.78).
    x, y = float(a), float(b)
    m = (x + y) / 2
    s = round(m, 2)
    return f'{s:.2f}'.rstrip('0').rstrip('.')

def expand(match):
    head, name, values = match.group(1), match.group(2), match.group(3)
    if name not in CONTINUOUS:
        return match.group(0)
    nums = values.split()
    if any(not re.fullmatch(r'-?\d+(\.\d+)?', v) for v in nums):
        raise ValueError(f'{name}: slider choices must be numeric')
    numbers = [Decimal(v) for v in nums]
    if any(a >= b for a, b in zip(numbers, numbers[1:])):
        raise ValueError(f'{name}: slider choices must be strictly increasing')
    out = []
    for i, v in enumerate(nums):
        out.append(v)
        if i + 1 < len(nums):
            m = mid(v, nums[i + 1])
            # Numeric strict bounds avoid duplicates with either rounded endpoint.
            if numbers[i] < Decimal(m) < numbers[i + 1]:
                out.append(m)
    return f'{head} // [{chr(32).join(out)}]'

def expand_settings(coarse_settings):
    """Expand only allowlisted choices, preserving defaults and all other text."""
    return LINE.sub(expand, coarse_settings)


if __name__ == '__main__':
    raise SystemExit('Standalone rewriting was removed. Run python scripts/shaderpacks/gen.py instead; SHADERPACK_OUT is supported.')

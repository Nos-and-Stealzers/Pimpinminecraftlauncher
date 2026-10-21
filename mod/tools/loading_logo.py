"""Draws the Pimpin loading-screen logo (assets/pimpin/textures/gui/loading.png).

Same layout as vanilla mojangstudios.png: a 1024x256 wordmark cut in two, left half
on top, right half underneath, white on transparent (the game tints and fades it).
Run: python mod/tools/loading_logo.py
"""
import os
import struct
import zlib

# Bold glyphs for the big word (2px stems, variable width) and a thin 5x7 set for the small one.
BOLD = {
    'P': ["111110", "110011", "110011", "111110", "110000", "110000", "110000"],
    'I': ["111111", "001100", "001100", "001100", "001100", "001100", "111111"],
    'M': ["1100011", "1110111", "1111111", "1101011", "1100011", "1100011", "1100011"],
    'N': ["1100011", "1110011", "1111011", "1101111", "1100111", "1100011", "1100011"],
}
THIN = {
    'C': ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'I': ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
}

W, H = 1024, 256
pix = [[0] * W for _ in range(H)]


def word(text, font, cell, x0, y0, trim=True):
    x = x0
    for ch in text:
        rows = font[ch]
        last = len(rows[0]) - 1
        for r, row in enumerate(rows):
            for c, bit in enumerate(row):
                if bit != '1':
                    continue
                for yy in range(cell):
                    for xx in range(cell):
                        # nick the outer corners so the big letters aren't plain rectangles
                        if trim and r in (0, 6) and c in (0, last):
                            dx = xx if c == 0 else cell - 1 - xx
                            dy = yy if r == 0 else cell - 1 - yy
                            if dx + dy < cell // 3:
                                continue
                        pix[y0 + r * cell + yy][x + c * cell + xx] = 255
        x += (last + 2) * cell


def width(text, font, cell):
    return sum((len(font[ch][0]) + 1) * cell for ch in text) - cell


big = 19
wide = width("PIMPIN", BOLD, big)
x = (W - wide) // 2
word("PIMPIN", BOLD, big, x, 30)
small = 8
word("CLIENT", THIN, small, x + wide - width("CLIENT", THIN, small), 30 + 7 * big + 16, trim=False)

# Split: left half on top, right half below.
out = [row[:512] for row in pix] + [row[512:] for row in pix]

raw = b''.join(b'\x00' + b''.join(bytes((255, 255, 255, a)) for a in row) for row in out)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 512, 512, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
dest = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'pimpin', 'textures', 'gui', 'loading.png')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'wb').write(png)
print(os.path.abspath(dest))

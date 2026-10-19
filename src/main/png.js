// Minimal RGBA image + PNG encoder (no native deps) used to draw the Pimpin
// resource pack textures in the main process.
const zlib = require('zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Parse '#rgb', '#rrggbb' or '#rrggbbaa' into [r, g, b, a]. */
function rgba(hex) {
  if (Array.isArray(hex)) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) : 255];
}

class Image {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || color == null) return;
    const [r, g, b, a] = rgba(color);
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  get(x, y) {
    const i = (((y + this.h) % this.h) * this.w + ((x + this.w) % this.w)) * 4;
    return [...this.data.slice(i, i + 4)];
  }

  fill(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, fn(x, y));
    return this;
  }

  /** Paste another image at (dx, dy). */
  blit(img, dx, dy) {
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) this.set(dx + x, dy + y, img.get(x, y));
    return this;
  }

  /** Copy of a w×h region starting at (x, y). */
  crop(x, y, w, h = w) {
    const out = new Image(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.set(i, j, this.get(x + i, y + j));
    return out;
  }

  toPNG() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.w, 0);
    header.writeUInt32BE(this.h, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA
    const raw = Buffer.alloc(this.h * (this.w * 4 + 1));
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.data.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

module.exports = { Image, rgba };

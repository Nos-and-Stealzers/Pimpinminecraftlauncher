// Minimal PNG decoder (8-bit, colour types 0/2/3/4/6, no interlace) for the
// pack check and contact-sheet scripts.
const zlib = require('zlib');
const { Image } = require('../../src/main/png');
function decode(buf) {
  let p = 8; let w; let h; let bd; let ct; let pal = null; let trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8); const d = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced'); }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = Math.max(1, (ch * bd) >> 3); const stride = Math.ceil((w * ch * bd) / 8);
  const out = Buffer.alloc(stride * h); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)); const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  const img = new Image(w, h);
  const sample = (y, i) => { // i-th sample in row for bd<8
    if (bd === 8) return out[y * stride + i];
    const bit = i * bd; return (out[y * stride + (bit >> 3)] >> (8 - bd - (bit & 7))) & ((1 << bd) - 1);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c;
    if (ct === 6) c = [...out.slice(y * stride + x * 4, y * stride + x * 4 + 4)];
    else if (ct === 2) c = [...out.slice(y * stride + x * 3, y * stride + x * 3 + 3), 255];
    else if (ct === 0) { const g = bd === 8 ? out[y * stride + x] : Math.round(sample(y, x) * 255 / ((1 << bd) - 1)); c = [g, g, g, 255]; }
    else if (ct === 4) { const g = out[y * stride + x * 2]; c = [g, g, g, out[y * stride + x * 2 + 1]]; }
    else { const k = sample(y, x); c = [pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2], trns && k < trns.length ? trns[k] : 255]; }
    img.set(x, y, c);
  }
  return img;
}
module.exports = { decode };

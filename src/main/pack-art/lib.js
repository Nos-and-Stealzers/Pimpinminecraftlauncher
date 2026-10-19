// Pixel-art toolkit for the Pimpin packs. Everything is drawn into palette
// *index* maps first (like a pixel artist working with a fixed palette), then
// converted to RGBA. Palettes are hue-shifted ramps: shadows lean towards
// blue/purple, highlights towards warm yellow. Light always comes from the
// top-left. All randomness is seeded so every build is identical.
const { Image, rgba } = require('../png');

// ---------------------------------------------------------------- random --
function rng(seed) {
  let s = (Math.imul(seed + 0x9e37, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 4; i++) next();
  return {
    f: next,
    i: (n) => Math.floor(next() * n),
    range: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

// ----------------------------------------------------------------- color --
function toHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

function fromHsv(h, s, v, a = 255) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), a];
}

/** Rotate hue `h` towards `target` by at most `amount` degrees. */
function towards(h, target, amount) {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
}

/**
 * A hue-shifted ramp of `n` shades, darkest first. The base colour sits at
 * index `mid` (default the middle). `contrast` is how far the ends move in
 * value, `hue` how many degrees the ends rotate (shadows → 250°, highlights
 * → 55°), `tint` adds saturation to the ends so even greys pick up a cool
 * shadow / warm light.
 */
function ramp(base, n, { contrast = 0.45, hue = 14, tint = 0.06, mid = (n - 1) / 2, satLight = -0.12, satDark = 0.1, cold = 250, warm = 55 } = {}) {
  const [h, s, v] = toHsv(rgba(base));
  return Array.from({ length: n }, (_, i) => {
    const t = mid === 0 ? i / (n - 1) : i <= mid ? (i - mid) / mid : (i - mid) / (n - 1 - mid); // -1..1
    const k = Math.abs(t);
    const hh = s < 0.05 && tint === 0 ? h : towards(h, t < 0 ? cold : warm, k * hue);
    const ss = s + (t < 0 ? satDark : satLight) * k + tint * k;
    const vv = t < 0 ? v * (1 - contrast * k) : v + (1 - v) * contrast * k * 1.1;
    return fromHsv(hh, s < 0.05 && tint === 0 ? 0 : ss, vv);
  });
}

const hex = (c) => rgba(c);
const mixc = (a, b, t) => [0, 1, 2, 3].map((i) => Math.round((a[i] ?? 255) + ((b[i] ?? 255) - (a[i] ?? 255)) * t));

// ------------------------------------------------------- index-map canvas --
/**
 * A canvas of palette indices. -1 = transparent. `wrap` makes every write
 * tile seamlessly (block textures); entity textures use wrap=false.
 */
class Px {
  constructor(w, h = w, wrap = true, fill = 0) {
    this.w = w;
    this.h = h;
    this.wrap = wrap;
    this.d = new Int16Array(w * h).fill(fill);
  }

  idx(x, y) {
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  get(x, y) {
    const i = this.idx(x, y);
    return i < 0 ? -1 : this.d[i];
  }

  set(x, y, v) {
    const i = this.idx(x, y);
    if (i >= 0 && v != null) this.d[i] = v;
    return this;
  }

  /** add `dv` to a pixel's index, clamped to [lo, hi] */
  bump(x, y, dv, lo = 0, hi = 99) {
    const v = this.get(x, y);
    if (v >= 0) this.set(x, y, Math.max(lo, Math.min(hi, v + dv)));
    return this;
  }

  fill(v) {
    if (typeof v === 'function') {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.d[y * this.w + x] = v(x, y);
    } else this.d.fill(v);
    return this;
  }

  rect(x, y, w, h, v) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof v === 'function' ? v(i, j) : v);
    return this;
  }

  hline(x, y, len, v) {
    return this.rect(x, y, len, 1, v);
  }

  vline(x, y, len, v) {
    return this.rect(x, y, 1, len, v);
  }

  /** Draw a stamp: rows of chars, `map` char -> index (or fn(oldIndex)). */
  stamp(x, y, rows, map) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (!(ch in map)) return;
      const m = map[ch];
      this.set(x + i, y + j, typeof m === 'function' ? m(this.get(x + i, y + j)) : m);
    }));
    return this;
  }

  clone() {
    const c = new Px(this.w, this.h, this.wrap);
    c.d.set(this.d);
    return c;
  }

  /** Convert to an RGBA Image using `pal`. Transparent pixels get `bg` rgb with alpha 0. */
  toImage(pal, bg = [0, 0, 0]) {
    const img = new Image(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const v = this.d[i];
      const c = v < 0 ? [...bg, 0] : pal[Math.max(0, Math.min(pal.length - 1, v))];
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = c[3] ?? 255;
    }
    return img;
  }
}

// --------------------------------------------------------------- shapes --
/** Points of a jagged blob (wrapped by the canvas). */
function blob(r, cx, cy, rx, ry, rough = 0.35) {
  const pts = [];
  const wob = Array.from({ length: 8 }, () => 1 - rough / 2 + r.f() * rough);
  for (let y = -Math.ceil(ry) - 1; y <= ry + 1; y++) {
    for (let x = -Math.ceil(rx) - 1; x <= rx + 1; x++) {
      const a = Math.atan2(y, x);
      const k = wob[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8];
      if ((x / (rx * k)) ** 2 + (y / (ry * k)) ** 2 <= 1) pts.push([cx + x, cy + y]);
    }
  }
  return pts;
}

/**
 * Paint a set of points as a bevelled lump: body index `v`, top/left edge
 * `v + hi`, bottom/right edge `v - lo`. Optional `drop` paints a one-pixel
 * shadow just outside the bottom/right edge (relative to what is there).
 */
function lump(px, pts, v, { hi = 1, lo = 1, drop = 0, max = 99, min = 0, outline = null } = {}) {
  const key = (x, y) => `${((x % px.w) + px.w) % px.w},${((y % px.h) + px.h) % px.h}`;
  const set = new Set(pts.map(([x, y]) => key(x, y)));
  const has = (x, y) => set.has(key(x, y));
  if (drop || outline != null) {
    for (const [x, y] of pts) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        if (has(x + dx, y + dy)) continue;
        if (outline != null) px.set(x + dx, y + dy, outline);
        else px.bump(x + dx, y + dy, -drop, min, max);
      }
    }
  }
  for (const [x, y] of pts) {
    let c = v;
    const tl = !has(x - 1, y) || !has(x, y - 1);
    const br = !has(x + 1, y) || !has(x, y + 1);
    if (tl && !br) c = v + hi;
    else if (br && !tl) c = v - lo;
    px.set(x, y, Math.max(min, Math.min(max, c)));
  }
  return px;
}

/** Tileable Voronoi labels for an S×S tile; `sx`,`sy` stretch distances. */
function cells(r, S, n, { sx = 1, sy = 1, minDist = 0 } = {}) {
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 4000) {
    const p = [r.f() * S, r.f() * S];
    const ok = pts.every(([a, b]) => {
      const dx = Math.min(Math.abs(a - p[0]), S - Math.abs(a - p[0]));
      const dy = Math.min(Math.abs(b - p[1]), S - Math.abs(b - p[1]));
      return Math.hypot(dx, dy) >= minDist;
    });
    if (ok) pts.push(p);
  }
  const lab = new Px(S, S, true);
  lab.fill((x, y) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach(([px, py], i) => {
      let dx = Math.abs(x + 0.5 - px);
      let dy = Math.abs(y + 0.5 - py);
      dx = Math.min(dx, S - dx) * sx;
      dy = Math.min(dy, S - dy) * sy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
  return { lab, n: pts.length, pts };
}

/** Tileable value noise in [0,1). */
function noise(S, c, seed, cy = c) {
  const r = rng(seed);
  const g = Array.from({ length: cy }, () => Array.from({ length: c }, r.f));
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = ((((x / S) * c) % c) + c) % c;
    const fy = ((((y / S) * cy) % cy) + cy) % cy;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = sm(fx - x0);
    const ty = sm(fy - y0);
    const G = (i, j) => g[(j + cy) % cy][(i + c) % c];
    const a = G(x0, y0) + (G(x0 + 1, y0) - G(x0, y0)) * tx;
    const b = G(x0, y0 + 1) + (G(x0 + 1, y0 + 1) - G(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** Remove lonely single pixels (a pixel unlike all 4 neighbours takes the majority). */
function despeckle(px, keep = () => false) {
  const src = px.clone();
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const v = src.get(x, y);
      if (keep(v)) continue;
      const n = [src.get(x - 1, y), src.get(x + 1, y), src.get(x, y - 1), src.get(x, y + 1)];
      if (n.every((k) => k !== v)) {
        const counts = {};
        n.forEach((k) => (counts[k] = (counts[k] || 0) + 1));
        const [best, cnt] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (cnt >= 3) px.set(x, y, Number(best));
      }
    }
  }
  return px;
}

/** Nearest-neighbour scale of an Image. */
function upscale(img, k) {
  const o = new Image(img.w * k, img.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const i = ((Math.floor(y / k) * img.w) + Math.floor(x / k)) * 4;
    const j = (y * o.w + x) * 4;
    o.data[j] = img.data[i];
    o.data[j + 1] = img.data[i + 1];
    o.data[j + 2] = img.data[i + 2];
    o.data[j + 3] = img.data[i + 3];
  }
  return o;
}

/** Draw an RGBA image over another with alpha blending. */
function over(dst, src, dx = 0, dy = 0) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const tx = dx + x;
    const ty = dy + y;
    if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
    const i = (y * src.w + x) * 4;
    const a = src.data[i + 3] / 255;
    if (!a) continue;
    const j = (ty * dst.w + tx) * 4;
    const da = dst.data[j + 3] / 255;
    const oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) dst.data[j + c] = Math.round((src.data[i + c] * a + dst.data[j + c] * da * (1 - a)) / (oa || 1));
    dst.data[j + 3] = Math.round(oa * 255);
  }
  return dst;
}

module.exports = { rng, ramp, hex, mixc, toHsv, fromHsv, Px, blob, lump, cells, noise, despeckle, upscale, over, Image, rgba };

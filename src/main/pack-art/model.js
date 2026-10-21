// Box-UV painting for entity textures. A model box (u, v, w, h, d) unfolds
// into six faces on the texture exactly like the game's cube UV mapping;
// painters work per face in fine pixels (k = 2 for the 2× "Pretty" canvases).
const { Px, ramp, rng, noise } = require('./lib');

class Pal {
  constructor() {
    this.c = [];
  }

  /** Add a ramp; returns a material { at(level), mid, n, o }. */
  add(colors, mid = Math.floor((colors.length - 1) / 2)) {
    const o = this.c.length;
    this.c.push(...colors);
    const n = colors.length;
    return { o, n, mid, at: (l) => o + Math.max(0, Math.min(n - 1, Math.round(l))) };
  }

  ramp(base, n, opts = {}) {
    return this.add(ramp(base, n, opts), opts.mid ?? Math.floor((n - 1) / 2));
  }
}

class Model {
  constructor(W, H, k = 1) {
    this.W = W;
    this.H = H;
    this.k = k;
    this.P = k > 1;
    this.px = new Px(W * k, H * k, false, -1);
    this.pal = new Pal();
  }

  static faces(u, v, w, h, d) {
    return {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],
      front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h],
      back: [u + 2 * d + w, v + d, w, h],
    };
  }

  /** Paint every face of a box (or only the named ones). */
  box(u, v, w, h, d, paint, only = null) {
    for (const [name, [x, y, fw, fh]] of Object.entries(Model.faces(u, v, w, h, d))) {
      if (only && !only.includes(name)) continue;
      paint(this.face(name, x, y, fw, fh), name);
    }
    return this;
  }

  face(name, x, y, w, h) {
    const { k, px } = this;
    const X = x * k;
    const Y = y * k;
    const W = w * k;
    const H = h * k;
    const inside = (fx, fy) => fx >= 0 && fy >= 0 && fx < W && fy < H;
    const F = {
      name, w, h, k, W, H, x, y, P: this.P, side: name !== 'top' && name !== 'bottom',
      /** fine pixel */
      f: (fx, fy, i) => {
        if (inside(fx, fy) && i != null) px.set(X + fx, Y + fy, i);
      },
      g: (fx, fy) => (inside(fx, fy) ? px.get(X + fx, Y + fy) : -2),
      /** unit-rect (scaled by k); a function value gets rect-relative fine coords */
      u: (ux, uy, uw, uh, i) => {
        for (let j = 0; j < uh * k; j++) for (let q = 0; q < uw * k; q++) F.f(ux * k + q, uy * k + j, typeof i === 'function' ? i(q, j) : i);
      },
      fill: (fn) => {
        for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) F.f(fx, fy, typeof fn === 'function' ? fn(fx, fy) : fn);
      },
      /** stamp rows of chars in unit pixels (each char = k×k) */
      stamp: (ux, uy, rows, map) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch in map) F.u(ux + i, uy + j, 1, 1, map[ch]);
      })),
      /** stamp rows of chars in fine pixels */
      fstamp: (fx, fy, rows, map) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch in map) F.f(fx + i, fy + j, map[ch]);
      })),
    };
    return F;
  }

  /** Raw unit rectangle (for regions that aren't a simple box). */
  rect(x, y, w, h, i) {
    const { k } = this;
    for (let j = 0; j < h * k; j++) for (let q = 0; q < w * k; q++) this.px.set(x * k + q, y * k + j, typeof i === 'function' ? i(q, j) : i);
    return this;
  }

  /** Copy a unit rectangle to another place (e.g. mirrored limbs). */
  copy(sx, sy, w, h, dx, dy) {
    const { k } = this;
    const tmp = [];
    for (let j = 0; j < h * k; j++) for (let q = 0; q < w * k; q++) tmp.push([q, j, this.px.get(sx * k + q, sy * k + j)]);
    for (const [q, j, v] of tmp) this.px.set(dx * k + q, dy * k + j, v);
    return this;
  }

  toImage() {
    return this.px.toImage(this.pal.c);
  }
}

/**
 * Standard coat: flat base, light top edge and a soft shadow at the bottom
 * of side faces, top faces one step lighter, bottom faces one darker; in the
 * 2× style a few clustered fur strokes.
 */
function coat(F, m, { seed = 1, fur = 0.5, lift = 0, shadow = true } = {}) {
  const r = rng(seed + F.name.length * 31 + F.W * 7 + F.H);
  const b = m.mid + lift;
  const base = F.name === 'top' ? b + 1 : F.name === 'bottom' ? b - 1 : b;
  F.fill(m.at(base));
  if (F.side && shadow) {
    for (let x = 0; x < F.W; x++) {
      F.f(x, F.H - 1, m.at(base - 1));
      if (F.P) F.f(x, 0, m.at(base + 1));
    }
  }
  if (F.P && fur > 0) {
    // short fur strokes on a jittered grid: a lit tip over a shaded root
    const step = Math.max(3, Math.round(5 / fur));
    for (let gy = 1; gy < F.H - 2; gy += step) for (let gx = 0; gx < F.W; gx += step) {
      if (r.chance(0.3)) continue;
      const x = gx + r.i(step - 1);
      const y = gy + r.i(Math.max(1, step - 2));
      F.f(x, y, m.at(base + 1));
      F.f(x, y + 1, m.at(base - 1));
    }
  }
}

/** Blotchy patches (cow spots, mud, rot) using bevelled clusters, in fine px. */
function patches(F, m, { seed = 1, count = 2, size = 3, lift = 0 } = {}) {
  const r = rng(seed + F.W * 13 + F.H * 7 + F.name.length);
  for (let i = 0; i < count; i++) {
    const cx = r.i(F.W);
    const cy = r.i(F.H);
    const rx = (size * 0.6 + r.f() * size * 0.7) * F.k;
    const ry = (size * 0.45 + r.f() * size * 0.6) * F.k;
    const wob = Array.from({ length: 6 }, () => 0.75 + r.f() * 0.4);
    for (let y = -Math.ceil(ry); y <= ry; y++) {
      for (let x = -Math.ceil(rx); x <= rx; x++) {
        const a = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 6) % 6;
        if ((x / (rx * wob[a])) ** 2 + (y / (ry * wob[a])) ** 2 > 1) continue;
        const edge = (x / (rx * wob[a])) ** 2 + (y / (ry * wob[a])) ** 2 > 0.55;
        const g = F.g(cx + x, cy + y);
        if (g === -2) continue;
        F.f(cx + x, cy + y, m.at(m.mid + lift + (edge && F.P && y < 0 ? 1 : 0)));
      }
    }
  }
}

/**
 * Wool: offset rows of round curls (scallops). Each curl has a lit crest and
 * a shaded underside; no random specks, so it reads as one soft material.
 */
function fleece(F, m, { lift = 0 } = {}) {
  const b = m.mid + lift + (F.name === 'bottom' ? -1 : F.name === 'top' ? 1 : 0);
  F.fill(m.at(b));
  if (F.k === 1) {
    for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
      const row = Math.floor(y / 2);
      const cx = (x + (row % 2) * 2) % 4;
      if (y % 2 === 1 && (cx === 0 || cx === 3)) F.f(x, y, m.at(b - 1));
      else if (y % 2 === 0 && (cx === 1 || cx === 2)) F.f(x, y, m.at(b + 1));
    }
    return;
  }
  // 2× curls: 4×3 cells, crest 2px, body, shade arc
  const CURL = ['.hh.', 'hbbs', 'sbbs'];
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    const row = Math.floor(y / 3);
    const ch = CURL[y % 3][(x + (row % 2) * 2) % 4];
    if (ch === 'h') F.f(x, y, m.at(b + 1));
    else if (ch === 's') F.f(x, y, m.at(b - 1));
  }
}

/**
 * Spots laid out over the whole texture (not per face) so they continue
 * round the body like real markings. Quantised to whole model units, with
 * a lit top edge in the 2× style.
 */
function spots(F, m, { seed = 1, thr = 0.62, scale = 5, lift = 0 } = {}) {
  const nz = noise(64, scale, seed);
  const on = (ux, uy) => nz(F.x + ux, F.y + uy) > thr;
  for (let uy = 0; uy < F.h; uy++) for (let ux = 0; ux < F.w; ux++) {
    if (!on(ux, uy)) continue;
    const edge = !on(ux, uy - 1);
    F.u(ux, uy, 1, 1, (q, j) => m.at(m.mid + lift + (F.P && edge && j === 0 ? 1 : 0)));
  }
}

/** Ragged hem: clear the last unit rows of a side face in a fixed tooth pattern. */
function hem(F, depth = 1, period = 3) {
  if (!F.side) return;
  for (let ux = 0; ux < F.w; ux++) {
    const cut = (ux % period === 1 ? depth : ux % period === 2 ? Math.max(0, depth - 1) : 0);
    if (cut) F.u(ux, F.h - cut, 1, cut, -1);
  }
}

/** Long shaggy hair: vertical strands of varying shade with a ragged hem. */
function shag(F, m, { seed = 1, hem = 2 } = {}) {
  const r = rng(seed + F.W * 5 + F.H);
  let x = 0;
  while (x < F.W) {
    const w = r.range(1, 2) * F.k;
    const v = m.mid + r.pick([-1, 0, 0, 1]);
    const cut = F.H - r.i(hem * F.k + 1);
    for (let i = 0; i < w; i++) {
      for (let y = 0; y < F.H; y++) F.f(x + i, y, y >= cut ? -1 : m.at(y === 0 ? v + 1 : y === cut - 1 ? v - 1 : v));
    }
    x += w;
  }
}

module.exports = { Pal, Model, coat, patches, fleece, spots, hem, shag };

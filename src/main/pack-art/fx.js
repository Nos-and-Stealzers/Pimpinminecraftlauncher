// Liquids, fire and other "effect" textures, plus sky, crosshair and icon.
const { Px, ramp, rng, noise, strip, Image, rgba, mixc, hex } = require('./lib');

const T = {};
const isP = (st) => st === 'looks';

/**
 * Animated liquid: frames stacked vertically. Two drifting noise fields are
 * quantised into a few flat bands; the upper edge of each bright band gets a
 * highlight crest, so it reads like painted ripples rather than blur.
 */
function liquid(S, st, { frames, seed, pal, levels, flow = false, crest = true }) {
  const n1 = noise(S, 3, seed);
  const n2 = noise(S, 5, seed + 50);
  const n3 = noise(S, 2, seed + 90);
  const img = new Image(S, S * frames);
  for (let f = 0; f < frames; f++) {
    const t = (f / frames) * S;
    const q = new Px(S);
    q.fill((x, y) => {
      const v = flow
        ? n1(x, y - t * 2) * 0.55 + n2(x + 1, y - t) * 0.3 + n3(x, y - t) * 0.15
        : n1(x + t, y) * 0.45 + n2(x, y + t) * 0.35 + n3(x - t, y - t) * 0.2;
      return Math.max(0, Math.min(levels - 1, Math.floor(((v - 0.22) / 0.56) * levels)));
    });
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = q.get(x, y);
        if (crest && v >= levels - 2 && q.get(x, y - 1) < v) v = levels; // crest highlight
        img.set(x, f * S + y, pal[Math.min(pal.length - 1, v)]);
      }
    }
  }
  return img;
}

const waterPal = (st) => {
  const P = isP(st);
  return ramp('#b4b4b4', P ? 6 : 4, { contrast: P ? 0.4 : 0.18, hue: 0, tint: 0 }).map((c, i, a) => [c[0], c[1], c[2], i === a.length - 1 ? (P ? 200 : 180) : P ? 170 : 165]);
};
const lavaPal = (st) => {
  const P = isP(st);
  return P
    ? ['#8a1f0c', '#b83310', '#de5a14', '#f58a1c', '#ffb531', '#ffd968', '#fff2b0'].map(rgba)
    : ['#b0310f', '#d64f14', '#f2801c', '#ffae2e', '#ffd25a'].map(rgba);
};

T.water_still = (S, st) => liquid(S, st, { frames: isP(st) ? 32 : 1, seed: 40, pal: waterPal(st), levels: isP(st) ? 5 : 3 });
T.water_flow = (S, st) => liquid(S * 2, st, { frames: isP(st) ? 32 : 1, seed: 41, pal: waterPal(st), levels: isP(st) ? 5 : 3, flow: true });
T.lava_still = (S, st) => liquid(S, st, { frames: isP(st) ? 32 : 1, seed: 42, pal: lavaPal(st), levels: isP(st) ? 6 : 4 });
T.lava_flow = (S, st) => liquid(S * 2, st, { frames: isP(st) ? 32 : 1, seed: 43, pal: lavaPal(st), levels: isP(st) ? 6 : 4, flow: true });

/** Low fire: a row of hand-shaped flame tongues in the bottom part only. */
function flames(colors, height = 0.45, seed = 60) {
  return (S) => {
    const k = S / 16;
    const r = rng(seed);
    const pal = colors.map(rgba);
    const px = new Px(S, S, false, -1);
    const tongues = [];
    for (let x = 0; x < S;) {
      const w = r.range(3, 5) * k;
      tongues.push([x, w, Math.round(S * height * (0.55 + r.f() * 0.45))]);
      x += w - k;
    }
    for (const [x0, w, h] of tongues) {
      for (let i = 0; i < w; i++) {
        const c = Math.abs(i - (w - 1) / 2) / (w / 2); // 0 centre .. 1 edge
        const hh = Math.round(h * (1 - c * c * 0.75));
        for (let y = 0; y < hh; y++) {
          const t = y / hh;
          const band = t > 0.8 ? 0 : t > 0.45 ? 1 : 2;
          const cur = px.get(x0 + i, S - 1 - y);
          px.set(x0 + i, S - 1 - y, Math.max(cur, c > 0.6 ? Math.min(band, 1) : band));
        }
      }
    }
    // white-hot core at the base
    for (let x = 0; x < S; x++) if (px.get(x, S - 1) === 2 && px.get(x, S - 3) === 2) px.set(x, S - 1, 3);
    return px.toImage(pal);
  };
}
/**
 * Pretty fire: two noise fields scroll upwards and are cut off by a height
 * falloff, then quantised into flat colour bands (dark rim, body, hot core).
 * The scroll covers exactly one noise period, so the loop is seamless.
 */
function liveFire(S, colors, seed, height = 0.85, frames = 32) {
  const pal = colors.map(rgba);
  const n1 = noise(S, 6, seed, 2);
  const n2 = noise(S, 9, seed + 9, 5);
  const out = [];
  for (let f = 0; f < frames; f++) {
    const t = (f / frames) * S;
    const px = new Px(S, S, false, -1);
    px.fill((x, y) => {
      const u = 1 - y / (S - 1); // 0 bottom .. 1 top
      const v = n1(x, y + t) * 0.62 + n2(x, y + t * 2) * 0.38 - (u ** 1.3 / height) * 0.9 + 0.14;
      if (v < 0.14) return -1;
      return v < 0.22 ? 0 : v < 0.4 ? 1 : v < 0.64 ? 2 : 3;
    });
    out.push(px.toImage(pal));
  }
  const img = strip(out);
  img.meta = { animation: { frametime: 1 } };
  return img;
}
const fire = (colors, h, seed, liveH) => (S, st) => (isP(st) ? liveFire(S, colors, seed, liveH) : flames(colors, h, seed)(S));
T.fire_0 = fire(['#c4300c', '#ff8f1f', '#ffd24a', '#fff6c8'], 0.45, 60, 0.9);
T.fire_1 = fire(['#b8280a', '#ff7f1a', '#ffc640', '#fff6c8'], 0.38, 61, 0.8);
T.soul_fire_0 = fire(['#16658a', '#2fb8d8', '#7ff0f8', '#e8ffff'], 0.45, 62, 0.9);
T.soul_fire_1 = fire(['#125d80', '#28a8cc', '#70e8f4', '#e8ffff'], 0.38, 63, 0.8);
T.campfire_fire = fire(['#c4300c', '#ff8f1f', '#ffd24a', '#fff6c8'], 0.6, 64, 1);

T.nether_portal = (S, st, seed = 70) => {
  const n = noise(S, 3, seed);
  const P = isP(st);
  const pal = (P ? ['#2e0660', '#4a1194', '#6a24c4', '#8d48e6', '#c49af8'] : ['#3d0a7a', '#5a16a8', '#7b2ed0', '#a86cf2']).map((c) => [...rgba(c).slice(0, 3), P ? 190 : 200]);
  const c = (S - 1) / 2;
  const frame = (ph) => new Image(S).fill((x, y) => {
    const a = Math.atan2(y - c, x - c);
    const d = Math.hypot(x - c, y - c) / S;
    const v = (Math.sin(a * 2 + d * 14 - ph) * 0.5 + 0.5) * 0.6 + n(x, y) * 0.4;
    return pal[Math.min(pal.length - 1, Math.floor(v * pal.length))];
  });
  if (!P) return frame(0);
  const img = strip(Array.from({ length: 32 }, (_, i) => frame((i / 32) * Math.PI * 2)));
  img.meta = { animation: { frametime: 2, interpolate: true } };
  return img;
};

T.magma_block = (S, st, seed = 71) => {
  const k = S / 16;
  const r = rng(seed);
  const pal = ['#3b1410', '#5a2117', '#7a3020', '#c2481a', '#ff8a24', '#ffc860'].map(rgba);
  const px = new Px(S).fill(2);
  // plates separated by glowing cracks
  for (let i = 0; i < 5; i++) {
    let x = r.i(S);
    let y = r.i(S);
    for (let j = 0; j < S; j++) {
      px.set(x, y, 4);
      if (j % 3 === 0) px.set(x + 1, y, 3);
      if (r.chance(0.5)) x++;
      else y++;
    }
  }
  for (let i = 0; i < 6; i++) px.set(r.i(S), r.i(S), 5);
  for (let i = 0; i < 8 * k; i++) px.set(r.i(S), r.i(S), 1);
  if (!isP(st)) return px.toImage(pal);
  // Pretty: the cracks breathe (dim, bright, dim)
  const dim = pal.map((c, i) => (i >= 3 ? mixc(c, pal[2], 0.45) : c));
  const img = strip([px.toImage(dim), px.toImage(pal), px.toImage(dim)]);
  img.meta = { animation: { frametime: 12, interpolate: true } };
  return img;
};

T.sea_lantern = (S, st) => {
  const k = S / 16;
  const pal = ['#8fb8ac', '#b6d8cc', '#d9efe7', '#f4fffb'].map(rgba);
  if (isP(st)) {
    // Pretty: the four glowing cores pulse one after another
    const frames = [0, 1, 2, 3, 4].map((f) => {
      const img = T.sea_lantern(S, 'perf');
      [[0, 0], [S / 2, 0], [S / 2, S / 2], [0, S / 2]].forEach(([qx, qy], i) => {
        if (i !== f % 4) return;
        for (let y = 0; y < 4 * k; y++) for (let x = 0; x < 4 * k; x++) img.set(qx + k + x, qy + k + y, x < k || y < k ? pal[3] : [255, 255, 255, 255]);
      });
      return img;
    });
    const img = strip(frames);
    img.meta = { animation: { frametime: 6, interpolate: true } };
    return img;
  }
  const px = new Px(S).fill(2);
  for (let i = 0; i < S; i++) {
    px.set(i, 0, 1).set(0, i, 1).set(i, S / 2, 1).set(S / 2, i, 1);
    px.set(i, S / 2 - 1, 0).set(S / 2 - 1, i, 0).set(i, S - 1, 0).set(S - 1, i, 0);
  }
  for (const [qx, qy] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) px.rect(qx + 2 * k, qy + 2 * k, 2 * k, 2 * k, 3);
  return px.toImage(pal);
};

T.prismarine = (S, st, seed = 72, colors = null) => {
  if (isP(st)) {
    // Pretty: slow shift between teal and blue-violet, like the real block
    const shades = [['#3f7a70', '#5a9a8a', '#76b2a0', '#98ccb8'], ['#3f6a7a', '#5a8a9e', '#76a2b8', '#98bcd0'], ['#4a5f80', '#647aa4', '#8094bc', '#a2b0d4']];
    const img = strip([0, 1, 2, 1].map((i) => T.prismarine(S, 'perf', seed, shades[i])));
    img.meta = { animation: { frametime: 60, interpolate: true } };
    return img;
  }
  const r = rng(seed);
  const pal = (colors || ['#3f7a70', '#5a9a8a', '#76b2a0', '#98ccb8']).map(rgba);
  const k = S / 16;
  const px = new Px(S).fill(1);
  for (let y = 0; y < S; y += 4 * k) for (let x = 0; x < S; x += 4 * k) {
    const v = r.pick([1, 2, 2]);
    px.rect(x, y, 4 * k, 4 * k, v);
    px.hline(x, y, 4 * k, v + 1);
    px.vline(x + 4 * k - 1, y, 4 * k, 0);
  }
  return px.toImage(pal);
};

// ------------------------------------------------------------- the sky --
T.sun = (S, st) => {
  const P = isP(st);
  const img = new Image(32);
  const pal = P ? ['#ff9fc8', '#ffc078', '#ffe7a0', '#fff8dc'].map(rgba) : ['#fff1c0', '#fff8e0'].map(rgba);
  const c = 15.5;
  return img.fill((x, y) => {
    const d = Math.max(Math.abs(x - c), Math.abs(y - c));
    const corner = Math.abs(x - c) > 4 && Math.abs(y - c) > 4;
    if (P) {
      if (d < 4) return pal[3];
      if (d < 6) return corner ? pal[1] : pal[2];
      if (d < 8 && !(Math.abs(x - c) > 6 && Math.abs(y - c) > 6)) return [...pal[0].slice(0, 3), 150];
      return [0, 0, 0, 0];
    }
    if (d < 6) return d < 4 ? pal[1] : pal[0];
    return [0, 0, 0, 0];
  });
};

T.moon_phases = () => {
  const img = new Image(128, 64);
  const lit = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];
  const pal = ['#9aa0bc', '#c4c8dc', '#e4e6f0'].map(rgba);
  for (let p = 0; p < 8; p++) {
    const ox = (p % 4) * 32;
    const oy = Math.floor(p / 4) * 32;
    for (let y = 10; y < 22; y++) {
      for (let x = 10; x < 22; x++) {
        const u = (x - 10 + 0.5) / 12;
        const on = p < 4 ? u < lit[p] || p === 0 : u > 1 - lit[p];
        const crater = (x - 13) ** 2 + (y - 14) ** 2 < 3 || (x - 18) ** 2 + (y - 18) ** 2 < 2 || (x - 17) ** 2 + (y - 12) ** 2 < 1.5;
        const edge = x === 10 || y === 10 || x === 21 || y === 21;
        img.set(ox + x, oy + y, on ? (crater ? pal[0] : edge ? pal[1] : pal[2]) : [40, 40, 60, 120]);
      }
    }
  }
  return img;
};

T.crosshair = (S, st) => {
  const img = new Image(15);
  const w = [255, 255, 255, 255];
  img.set(7, 7, w);
  const gap = st === 'looks' ? 2 : 1;
  for (let i = gap + 1; i <= gap + 3; i++) {
    img.set(7 + i, 7, w);
    img.set(7 - i, 7, w);
    img.set(7, 7 + i, w);
    img.set(7, 7 - i, w);
  }
  return img;
};

T.clear = () => new Image(16).fill(() => [0, 0, 0, 0]);

/** Pack icon: the pack's emblem on a gradient tile. */
T.pack_icon = (st) => {
  const img = new Image(64);
  const bg = st === 'looks' ? ['#b56cff', '#ff4fb8'] : ['#2ee59d', '#18c2d8'];
  img.fill((x, y) => mixc(rgba(bg[0]), rgba(bg[1]), (x + y) / 126));
  const emblem = st === 'looks'
    ? ['....1111....', '...122221...', '..12222221..', '.1222222221.', '122222222221', '.1222222221.', '..12222221..', '...122221...', '....1221....', '.....11.....']
    : ['......111...', '.....121....', '....1221....', '...12221....', '..122221111.', '.1222222221.', '.1111122221.', '....12221...', '...1221.....', '...121......', '..11........'];
  const s = 4;
  const ox = 32 - (emblem[0].length * s) / 2;
  const oy = 32 - (emblem.length * s) / 2;
  emblem.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === '.') return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) img.set(ox + rx * s + dx, oy + ry * s + dy, ch === '1' ? '#170b25' : '#ffffff');
  }));
  return img;
};

module.exports = { T };

// Procedural, original textures for the Pimpin resource packs. Nothing here is
// copied from Mojang: every texture is drawn from noise, cells and palettes.
// Two styles: 'perf' (16×16, clean & calm, no animations) and 'looks'
// (32×32, rich shading, smooth animated water and lava).
const { Image, rgba } = require('./png');

// ------------------------------------------------------------- helpers --
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c, f, a = c[3] ?? 255) => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f), a];
const mix = (a, b, t) => [0, 1, 2, 3].map((i) => clamp((a[i] ?? 255) + ((b[i] ?? 255) - (a[i] ?? 255)) * t));
const gray = (v, a = 255) => [clamp(v), clamp(v), clamp(v), a];
const smooth = (t) => t * t * (3 - 2 * t);

/** Tileable value noise in [0,1] with `cx`×`cy` cells across an S×S tile. */
function valueNoise(S, cx, cy, seed) {
  const r = rng(seed);
  const grid = Array.from({ length: cy }, () => Array.from({ length: cx }, r));
  return (x, y) => {
    const fx = (((x / S) * cx) % cx + cx) % cx;
    const fy = (((y / S) * cy) % cy + cy) % cy;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const g = (i, j) => grid[(j + cy) % cy][(i + cx) % cx];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** Layered noise: big soft blotches plus fine grain. */
function fbm(S, seed, layers = [[2, 0.5], [4, 0.3], [8, 0.2]]) {
  const fns = layers.map(([c, w], i) => [valueNoise(S, c, c, seed + i * 101), w]);
  return (x, y) => fns.reduce((sum, [f, w]) => sum + f(x, y) * w, 0);
}

/** Tileable Voronoi cells: returns { id, d1, d2, dx, dy } per pixel. */
function voronoi(S, n, seed) {
  const r = rng(seed);
  const pts = Array.from({ length: n }, () => [r() * S, r() * S, r()]);
  return (x, y) => {
    let d1 = Infinity;
    let d2 = Infinity;
    let best = 0;
    let bdx = 0;
    let bdy = 0;
    pts.forEach(([px, py], i) => {
      for (let ox = -S; ox <= S; ox += S) {
        for (let oy = -S; oy <= S; oy += S) {
          const dx = x + 0.5 - (px + ox);
          const dy = y + 0.5 - (py + oy);
          const d = Math.hypot(dx, dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = i;
            bdx = dx;
            bdy = dy;
          } else if (d < d2) d2 = d;
        }
      }
    });
    return { id: best, v: pts[best][2], d1, d2, dx: bdx, dy: bdy };
  };
}

const grain = (seed) => {
  const r = rng(seed);
  const cache = new Map();
  return (x, y) => {
    const k = `${x},${y}`;
    if (!cache.has(k)) cache.set(k, r());
    return cache.get(k);
  };
};

// ------------------------------------------------------------- painters --
const T = {};
const amp = (st) => (st === 'looks' ? 1 : 0.35);

T.stone = (S, st, seed = 1, base = [127, 127, 127]) => {
  const n = fbm(S, seed);
  const g = grain(seed + 7);
  const img = new Image(S).fill((x, y) => shade(base, 0.82 + (n(x, y) - 0.5) * 0.45 * amp(st) + (g(x, y) - 0.5) * 0.12 * amp(st) + 0.18));
  if (st === 'looks') {
    // a couple of hairline cracks
    const r = rng(seed + 3);
    for (let c = 0; c < 2; c++) {
      let x = Math.floor(r() * S);
      let y = Math.floor(r() * S);
      for (let i = 0; i < S / 2; i++) {
        img.set(x % S, y % S, shade(base, 0.68));
        x += r() < 0.6 ? 1 : 0;
        y += r() < 0.5 ? 1 : r() < 0.5 ? -1 : 0;
        y = (y + S) % S;
      }
    }
  }
  return img;
};

T.deepslate = (S, st, seed = 2) => {
  const n = valueNoise(S, 2, 8, seed);
  const g = grain(seed);
  return new Image(S).fill((x, y) => shade([80, 80, 86], 0.85 + (n(x, y) - 0.5) * 0.5 * amp(st) + (g(x, y) - 0.5) * 0.1 + 0.15));
};

T.cobblestone = (S, st, seed = 3) => {
  const v = voronoi(S, Math.round(S / (st === 'looks' ? 2.6 : 3.2)), seed);
  const g = grain(seed);
  const gap = S / 16;
  return new Image(S).fill((x, y) => {
    const c = v(x, y);
    if (c.d2 - c.d1 < gap) return gray(58);
    const base = st === 'looks' ? 100 + c.v * 55 : 112 + c.v * 22;
    const light = st === 'looks' ? 1.1 - (c.d1 / (S / 3)) * 0.35 - ((c.dx + c.dy) / S) * 0.9 : 1.02 - ((c.dx + c.dy) / S) * 0.25;
    return gray(base * light + (g(x, y) - 0.5) * 14 * amp(st));
  });
};

T.dirt = (S, st, seed = 4) => {
  const n = fbm(S, seed);
  const g = grain(seed + 1);
  return new Image(S).fill((x, y) => {
    const k = g(x, y);
    const base = shade([134, 96, 67], 0.8 + (n(x, y) - 0.5) * 0.5 * amp(st) + 0.2);
    if (st === 'looks' && k > 0.94) return shade(base, 1.25);
    if (st === 'looks' && k < 0.06) return shade(base, 0.7);
    return base;
  });
};

function fringe(S, seed) {
  const r = rng(seed);
  return Array.from({ length: S }, () => Math.round(S * (3 / 16) + r() * S * (2.5 / 16)));
}

T.grass_block_top = (S, st, seed = 5) => {
  const n = fbm(S, seed);
  const g = grain(seed);
  const img = new Image(S).fill((x, y) => gray(150 + (n(x, y) - 0.5) * 60 * amp(st) + (g(x, y) - 0.5) * 26 * amp(st)));
  if (st === 'looks') {
    const r = rng(seed + 9);
    for (let i = 0; i < S * 2; i++) {
      const x = Math.floor(r() * S);
      const y = Math.floor(r() * S);
      const v = r() < 0.5 ? 185 : 118;
      img.set(x, y, gray(v));
      img.set(x, (y + 1) % S, gray(v * 0.95));
    }
  }
  return img;
};

T.grass_block_side = (S, st, seed = 6) => {
  const img = T.dirt(S, st, seed);
  const f = fringe(S, seed);
  for (let x = 0; x < S; x++) for (let y = 0; y < f[x]; y++) img.set(x, y, shade([107, 158, 66], 0.9 + (y / f[x]) * 0.15));
  return img;
};

T.grass_block_side_overlay = (S, st, seed = 6) => {
  const f = fringe(S, seed);
  const g = grain(seed + 2);
  return new Image(S).fill((x, y) => (y < f[x] ? gray(160 - (y / f[x]) * 25 + (g(x, y) - 0.5) * 30 * amp(st)) : [0, 0, 0, 0]));
};

T.sand = (S, st, seed = 7) => {
  const n = fbm(S, seed);
  const g = grain(seed);
  return new Image(S).fill((x, y) => {
    const ripple = st === 'looks' ? Math.sin(((x + y * 0.45) / S) * Math.PI * 6) * 0.035 : 0;
    return shade([219, 207, 142], 0.9 + (n(x, y) - 0.5) * 0.18 * amp(st) + (g(x, y) - 0.5) * 0.08 * amp(st) + ripple + 0.1);
  });
};

T.gravel = (S, st, seed = 8) => {
  const v = voronoi(S, Math.round(S / 1.7), seed);
  const pal = [[128, 124, 122], [104, 100, 99], [150, 142, 135], [118, 108, 98], [90, 88, 90]];
  return new Image(S).fill((x, y) => {
    const c = v(x, y);
    if (c.d2 - c.d1 < S / 20) return [72, 70, 70, 255];
    return shade(pal[c.id % pal.length], 1.08 - (c.dx + c.dy) / S * (st === 'looks' ? 0.9 : 0.3));
  });
};

T.oak_log = (S, st, seed = 9) => {
  const n = valueNoise(S, 8, 2, seed);
  const g = grain(seed);
  return new Image(S).fill((x, y) => {
    const groove = Math.abs(Math.sin(((x + n(x, y) * 3) / S) * Math.PI * 4));
    const f = 0.7 + groove * 0.35 * (st === 'looks' ? 1 : 0.5) + (g(x, y) - 0.5) * 0.08;
    return shade([104, 81, 48], f);
  });
};

T.oak_log_top = (S, st, seed = 10) => {
  const c = (S - 1) / 2;
  return new Image(S).fill((x, y) => {
    const d = Math.max(Math.abs(x - c), Math.abs(y - c)) * 0.6 + Math.hypot(x - c, y - c) * 0.4;
    if (d > S / 2 - S / 16 - 0.5) return shade([104, 81, 48], 0.85);
    const ring = Math.floor(d / (S / (st === 'looks' ? 12 : 8))) % 2;
    return ring ? [178, 144, 90, 255] : [158, 124, 74, 255];
  });
};

T.oak_planks = (S, st, seed = 11) => {
  const n = valueNoise(S, 2, 16, seed);
  const r = rng(seed);
  const rows = 4;
  const bh = S / rows;
  const tones = Array.from({ length: rows }, () => 0.9 + r() * 0.16);
  const joints = Array.from({ length: rows }, () => Math.floor(r() * S));
  return new Image(S).fill((x, y) => {
    const row = Math.floor(y / bh);
    if (y % bh === bh - 1 || x === joints[row]) return [96, 74, 42, 255];
    const grainV = st === 'looks' ? (n(x * 0.25, y) - 0.5) * 0.22 : (n(x, y) - 0.5) * 0.06;
    return shade([170, 136, 84], tones[row] + grainV);
  });
};

T.oak_leaves = (S, st, seed = 12) => {
  const v = voronoi(S, Math.round(S / 2.2), seed);
  const r = grain(seed);
  return new Image(S).fill((x, y) => {
    const c = v(x, y);
    if (c.d2 - c.d1 < S / 22 && r(x, y) < 0.75) return [0, 0, 0, 0];
    const light = 1.12 - (c.dx + c.dy) / S * 1.2;
    return gray((110 + c.v * 50) * light);
  });
};

T.glass = (S, st) =>
  new Image(S).fill((x, y) => {
    const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
    if (edge) return [222, 240, 246, st === 'looks' ? 210 : 160];
    if (st === 'looks') {
      const d = x + y;
      if ((d > S * 0.35 && d < S * 0.42) || (d > S * 0.5 && d < S * 0.53)) return [255, 255, 255, 80];
    }
    return [0, 0, 0, 0];
  });

T.bricks = (S, st, seed = 13) => {
  const r = rng(seed);
  const rh = S / 4;
  const bw = S / 2;
  const tones = Array.from({ length: 8 }, () => 0.85 + r() * 0.25);
  const g = grain(seed);
  return new Image(S).fill((x, y) => {
    const row = Math.floor(y / rh);
    const off = row % 2 ? bw / 2 : 0;
    const col = Math.floor(((x + off) % S) / bw);
    if (y % rh === rh - 1 || (x + off) % bw === 0) return [176, 166, 156, 255];
    const top = y % rh === 0 && st === 'looks' ? 1.12 : 1;
    return shade([150, 76, 58], tones[(row * 2 + col) % 8] * top + (g(x, y) - 0.5) * 0.1 * amp(st));
  });
};

T.snow = (S, st, seed = 14) => {
  const n = fbm(S, seed);
  return new Image(S).fill((x, y) => [clamp(238 + (n(x, y) - 0.5) * 22 * amp(st)), clamp(245 + (n(x, y) - 0.5) * 16 * amp(st)), 255, 255]);
};

/** Ore = stone/deepslate base + gem clusters with a highlight. */
function ore(colors, deep = false, oreSeed = 20) {
  return (S, st, seed = oreSeed) => {
    const img = deep ? T.deepslate(S, st, seed) : T.stone(S, st, seed);
    const [dark, mid, light] = colors.map(rgba);
    const r = rng(seed + 31);
    const clusters = st === 'looks' ? 6 : 4;
    for (let c = 0; c < clusters; c++) {
      const cx = Math.floor(r() * S);
      const cy = Math.floor(r() * S);
      const rad = S / (st === 'looks' ? 12 : 10) + r() * S / 18;
      for (let y = -Math.ceil(rad); y <= rad; y++) {
        for (let x = -Math.ceil(rad); x <= rad; x++) {
          const d = Math.hypot(x, y) + r() * 0.8;
          if (d > rad) continue;
          const px = (cx + x + S) % S;
          const py = (cy + y + S) % S;
          img.set(px, py, d > rad - 1 ? dark : x + y < -rad * 0.6 && st === 'looks' ? light : mid);
        }
      }
    }
    return img;
  };
}

const ORES = {
  coal_ore: ['#1c1c1c', '#333333', '#555555'],
  iron_ore: ['#a8826a', '#d8af93', '#f2dccb'],
  gold_ore: ['#c99a10', '#fcdb3a', '#fff6a8'],
  diamond_ore: ['#1fa3a8', '#5decf5', '#d8fffb'],
  emerald_ore: ['#0c8a3b', '#17dd62', '#a6ffc8'],
  redstone_ore: ['#7a0000', '#e01010', '#ff8a8a'],
  lapis_ore: ['#0e2f7a', '#2152c4', '#7ea5ff'],
  copper_ore: ['#9a4a2e', '#e0734f', '#7fd8b8'],
};
Object.entries(ORES).forEach(([name, colors], i) => {
  T[name] = ore(colors, false, 100 + i * 17);
  T[`deepslate_${name}`] = ore(colors, true, 300 + i * 17);
});

/** Animated liquid: frames stacked vertically. `flow` moves it downwards. */
function liquid(S, st, { frames, seed, color, flow = false }) {
  const n1 = fbm(S, seed, [[2, 0.55], [4, 0.3], [8, 0.15]]);
  const n2 = fbm(S, seed + 50, [[4, 0.6], [8, 0.4]]);
  const img = new Image(S, S * frames);
  for (let f = 0; f < frames; f++) {
    const t = (f / frames) * S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const v = flow ? n1(x, y - t * 2) * 0.6 + n2(x, y - t) * 0.4 : n1(x + t, y) * 0.55 + n2(x, y + t) * 0.45;
        img.set(x, f * S + y, color(v, x, y));
      }
    }
  }
  return img;
}

const waterColor = (st) => (v) => gray(170 + (v - 0.5) * (st === 'looks' ? 90 : 30), st === 'looks' ? 175 : 165);
const lavaColor = (st) => (v) => {
  const k = (v - 0.3) * (st === 'looks' ? 1.8 : 1.2);
  if (k > 0.75) return mix([255, 170, 40, 255], [255, 236, 130, 255], (k - 0.75) * 4);
  if (k > 0.35) return mix([214, 82, 18, 255], [255, 170, 40, 255], (k - 0.35) / 0.4);
  return mix([150, 30, 8, 255], [214, 82, 18, 255], Math.max(0, k) / 0.35);
};

T.water_still = (S, st) => liquid(S, st, { frames: st === 'looks' ? 32 : 1, seed: 40, color: waterColor(st) });
T.water_flow = (S, st) => liquid(S * 2, st, { frames: st === 'looks' ? 32 : 1, seed: 41, color: waterColor(st), flow: true });
T.lava_still = (S, st) => liquid(S, st, { frames: st === 'looks' ? 32 : 1, seed: 42, color: lavaColor(st) });
T.lava_flow = (S, st) => liquid(S * 2, st, { frames: st === 'looks' ? 32 : 1, seed: 43, color: lavaColor(st), flow: true });

/** Flames that only fill the bottom part of the texture ("low fire"). */
function flames(palette, height = 0.45) {
  return (S, _st, seed = 60) => {
    const n = valueNoise(S, 6, 1, seed);
    const [c0, c1, c2] = palette.map(rgba);
    return new Image(S).fill((x, y) => {
      const h = S * height * (0.55 + n(x, 0) * 0.45);
      const fromBottom = S - 1 - y;
      if (fromBottom > h) return [0, 0, 0, 0];
      const t = fromBottom / h;
      return t < 0.4 ? mix(c0, c1, t / 0.4) : mix(c1, c2, (t - 0.4) / 0.6);
    });
  };
}
T.fire_0 = flames(['#fff3b0', '#ffa21f', '#d8380f']);
T.fire_1 = flames(['#fff3b0', '#ff8c1a', '#c42a0a'], 0.38);
T.soul_fire_0 = flames(['#e8ffff', '#4fe3f0', '#1f7fa8']);
T.soul_fire_1 = flames(['#e8ffff', '#3ad0e8', '#16658a'], 0.38);
T.campfire_fire = flames(['#fff3b0', '#ffa21f', '#d8380f'], 0.6);

T.nether_portal = (S, st, seed = 70) => {
  const n = fbm(S, seed);
  return new Image(S).fill((x, y) => mix([70, 10, 140, 180], [170, 80, 255, 200], n(x, y)));
};
T.magma_block = (S, st, seed = 71) => {
  const v = voronoi(S, Math.round(S / 3), seed);
  return new Image(S).fill((x, y) => {
    const c = v(x, y);
    return c.d2 - c.d1 < S / 12 ? [255, 140, 30, 255] : shade([110, 36, 20], 0.8 + c.v * 0.3);
  });
};
T.sea_lantern = (S) => new Image(S).fill((x, y) => ((x % (S / 2)) === 0 || (y % (S / 2)) === 0 ? [170, 210, 200, 255] : [228, 244, 238, 255]));
T.prismarine = (S, st, seed = 72) => {
  const n = fbm(S, seed);
  return new Image(S).fill((x, y) => mix([70, 130, 120, 255], [110, 178, 160, 255], n(x, y)));
};

// ------------------------------------------------------------- the sky --
T.sun = (S, st) => {
  const img = new Image(32);
  const c = 15.5;
  return img.fill((x, y) => {
    const d = Math.max(Math.abs(x - c), Math.abs(y - c));
    if (d < 6) return st === 'looks' ? (d < 4 ? [255, 246, 196, 255] : [255, 196, 120, 255]) : [255, 250, 220, 255];
    if (d < 8 && st === 'looks') return [255, 120, 190, 150];
    return [0, 0, 0, 0];
  });
};

T.moon_phases = () => {
  const img = new Image(128, 64);
  const lit = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];
  const g = grain(90);
  for (let p = 0; p < 8; p++) {
    const ox = (p % 4) * 32;
    const oy = Math.floor(p / 4) * 32;
    for (let y = 10; y < 22; y++) {
      for (let x = 10; x < 22; x++) {
        const u = (x - 10 + 0.5) / 12; // 0..1 across the moon
        // Waning phases keep the left side lit, waxing phases the right side.
        const on = p < 4 ? u < lit[p] || p === 0 : u > 1 - lit[p];
        const crater = (x - 13) ** 2 + (y - 14) ** 2 < 3 || (x - 18) ** 2 + (y - 18) ** 2 < 2;
        const base = clamp(222 + (g(x, y) - 0.5) * 30 - (crater ? 30 : 0));
        img.set(ox + x, oy + y, on ? [base, base, clamp(base + 10), 255] : [40, 40, 60, 120]);
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

/** Pack icon: a little block with the pack's emblem. */
T.pack_icon = (st) => {
  const img = new Image(64);
  const bg = st === 'looks' ? ['#b56cff', '#ff4fb8'] : ['#2ee59d', '#18c2d8'];
  img.fill((x, y) => mix(rgba(bg[0]), rgba(bg[1]), (x + y) / 126));
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

module.exports = { T, ORES };

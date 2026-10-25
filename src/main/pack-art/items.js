// Item textures (tools, food, materials, bow and arrow). Every item is built
// from geometric shapes in 16-unit space and rasterised at the pack's
// resolution, so the 32× versions get smooth curves while outlines stay one
// pixel wide (the Faithful rule for doubled textures). All items share one
// outline colour and the same top-left light, so the inventory reads as a set.
const { Px, ramp, rgba, mixc, palette, shadeRegions } = require('./lib');

const OUTLINE = '#22181f';
const MATERIALS = {
  wooden: { head: '#a87a45', n: 4 },
  stone: { head: '#8b8b90', n: 4 },
  iron: { head: '#c9cbd1', n: 5, shine: true },
  golden: { head: '#f2c53a', n: 5, shine: true },
  diamond: { head: '#4fdcdc', n: 5, shine: true },
  netherite: { head: '#4b4049', n: 5, shine: true },
};
const STICK = '#7d5631';

// rotated coordinates for the 45° tool layout: a runs along the handle
// (bottom-left -> top-right), b across it
const rot = (x, y, ox, oy) => {
  const dx = x - ox;
  const dy = y - oy;
  return [(dx - dy) / Math.SQRT2, (dx + dy) / Math.SQRT2];
};

/** Rasterise regions (shape functions in 16-unit space) into an item image. */
function item(S, regions, { outline = OUTLINE, extra = [] } = {}) {
  const k = S / 16;
  const pal = palette();
  const out = pal.add([rgba(outline)]);
  const px = new Px(S, S, false, -1);
  const regs = regions.map((r) => {
    const m = pal.add(ramp(r.color, r.n || 4, { contrast: r.contrast ?? 0.5, hue: r.hue ?? 18, mid: r.mid }), r.mid);
    // sample at the pixel centre in unit space; a 1-px inset keeps room for the outline
    const has = (x, y) => x >= 1 && y >= 1 && x < S - 1 && y < S - 1 && r.shape((x + 0.5) / k, (y + 0.5) / k);
    return { has, m, base: r.base, flat: r.flat };
  });
  shadeRegions(px, regs, out.at(0));
  for (const fx of extra) fx(px, regs, k, pal);
  return px.toImage(pal.c);
}

/** A bright streak along the middle of a region (polished metal / gems). */
const streak = (regIndex, test) => (px, regs, k) => {
  const r = regs[regIndex];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    if (r.has(x, y) && test((x + 0.5) / k, (y + 0.5) / k) && r.has(x - 1, y) && r.has(x, y - 1)) px.set(x, y, r.m.at(r.m.n - 1));
  }
};

/**
 * Material texture on a head region: grain streaks on wood, a few pits on
 * stone, nothing on polished metal (they get the streak instead).
 */
const matDetail = (regIndex, mat) => (px, regs, k) => {
  if (mat !== 'wooden' && mat !== 'stone') return;
  const r = regs[regIndex];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    if (!r.has(x, y) || !r.has(x - 1, y) || !r.has(x + 1, y) || !r.has(x, y - 1) || !r.has(x, y + 1)) continue;
    const ux = (x + 0.5) / k;
    const uy = (y + 0.5) / k;
    if (mat === 'wooden' && Math.abs(((ux - uy) * 0.9) % 3.2) < (k > 1 ? 0.32 : 0.5) && (x + y) % 3 !== 0) px.set(x, y, r.m.at(r.m.mid - 1));
    if (mat === 'stone' && ((x * 7 + y * 13) % 11 === 0)) px.set(x, y, r.m.at(r.m.mid - 1));
  }
};
/** Light the outer (cutting / striking) edge of a tool head one shade up. */
const edgeLight = (regIndex, kind) => (px, regs, k) => {
  if (kind !== 'axe') return;
  const r = regs[regIndex];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    if (!r.has(x, y)) continue;
    const [a, b] = rot((x + 0.5) / k, (y + 0.5) / k, 2.4, 13.6);
    if (b < -3.6 && (!r.has(x - 1, y) || !r.has(x, y - 1) || !r.has(x - 1, y - 1))) px.set(x, y, r.m.at(r.m.n - 1));
  }
};

const handle = (from, to, w = 0.75) => (x, y) => {
  const [a, b] = rot(x, y, ...from);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return a >= 0 && a <= len && Math.abs(b) <= w;
};

function tool(kind, mat) {
  const M = MATERIALS[mat];
  const head = { color: M.head, n: M.n, contrast: mat === 'netherite' ? 0.6 : 0.5 };
  const stick = { color: STICK, n: 4 };
  return (S) => {
    if (kind === 'sword') {
      const blade = (x, y) => {
        const [a, b] = rot(x, y, 4.2, 11.8);
        return a > 0.8 && a < 12.2 && Math.abs(b) <= 1.25 - Math.max(0, a - 10.6) * 0.8;
      };
      const guard = (x, y) => {
        const [a, b] = rot(x, y, 4.2, 11.8);
        return a > -0.2 && a < 1.4 && Math.abs(b) <= 3;
      };
      const grip = (x, y) => {
        const [a, b] = rot(x, y, 4.2, 11.8);
        return a > -4.2 && a <= 0 && Math.abs(b) <= 0.75;
      };
      const pommel = (x, y) => Math.hypot(x - 1.6, y - 14.4) <= 1.3;
      return item(S, [
        { ...stick, shape: grip },
        { ...head, shape: blade },
        { color: mat === 'wooden' ? '#6a4626' : mat === 'golden' ? '#c58a1e' : '#5a4636', n: 3, shape: guard },
        { color: mat === 'netherite' ? '#6b5560' : '#5a4636', n: 3, shape: pommel },
      ], { extra: [matDetail(1, mat), ...(M.shine ? [streak(1, (x, y) => Math.abs(rot(x, y, 4.2, 11.8)[1] + 0.35) < 0.4 && rot(x, y, 4.2, 11.8)[0] < 10.5)] : [])] });
    }
    const end = kind === 'shovel' ? [9.4, 6.6] : [11, 5];
    const regions = [{ ...stick, shape: handle([2.4, 13.6], end) }];
    if (kind === 'pickaxe') {
      regions.push({
        ...head,
        shape: (x, y) => {
          const d = Math.hypot(x - 1.5, y - 14.5);
          const ang = Math.atan2(14.5 - y, x - 1.5); // 0 = right, pi/2 = up
          const t = Math.min(ang - 0.06, Math.PI / 2 - 0.06 - ang); // distance from the arc ends
          // thick in the middle, drawn out to sharp points
          const thick = t < 0 ? -1 : Math.min(1.45, 0.3 + t * 1.6);
          return Math.abs(d - 12.1 - Math.max(0, 0.5 - t) * 0.6) <= thick;
        },
      });
      // a binding collar where the haft meets the head
      regions.push({ color: mat === 'golden' ? '#8a5a1c' : '#4a3424', n: 3, shape: (x, y) => {
        const [a, b] = rot(x, y, 2.4, 13.6);
        return a > 9.6 && a < 11.4 && Math.abs(b) <= 1.25;
      } });
    } else if (kind === 'axe') {
      regions.push({
        ...head,
        shape: (x, y) => {
          const [a, b] = rot(x, y, 2.4, 13.6);
          // the bit flares out from the haft to a curved cutting edge on the
          // upper-left; a short square poll sits behind the haft
          const c = 10.8;
          if (b < -0.3 && b > -5.2) {
            const w = 1.3 + (-b - 0.3) * 0.42;
            const edge = -5.2 + ((a - c) / (w + 0.01)) ** 2 * 0.9;
            return Math.abs(a - c) <= w && b > edge;
          }
          return a > c - 1.3 && a < c + 1.3 && b >= -0.3 && b < 1.9;
        },
      });
    } else {
      regions.push({
        ...head,
        shape: (x, y) => {
          const [a, b] = rot(x, y, 2.4, 13.6);
          const tip = 15.8;
          // a rounded spade: straight shoulders, curved point
          return a > 9.2 && a < tip && Math.abs(b) <= Math.min(2.6, Math.sqrt(Math.max(0, tip - a)) * 1.5);
        },
      });
    }
    const extra = [matDetail(1, mat), edgeLight(1, kind)];
    if (M.shine) extra.push(streak(1, kind === 'pickaxe' ? (x, y) => Math.abs(Math.hypot(x - 1.5, y - 14.5) - 12.6) < 0.35 : (x, y) => Math.abs(rot(x, y, 2.4, 13.6)[1] + (kind === 'axe' ? 2.4 : 0)) < 0.35));
    return item(S, regions, { extra });
  };
}

const I = {};
for (const mat of Object.keys(MATERIALS)) for (const kind of ['sword', 'pickaxe', 'axe', 'shovel']) I[`${mat}_${kind}`] = tool(kind, mat);

I.stick = (S) => item(S, [{ color: STICK, n: 4, shape: handle([2.6, 13.4], [13.4, 2.6], 0.75) }]);

I.apple = (S) => item(S, [
  { color: '#d8322c', n: 5, mid: 2, shape: (x, y) => {
    const dx = x - 8;
    const dy = y - 9.6;
    // two lobes on top meeting in a dip
    return (dx * dx) / 30 + (dy * dy) / 26 <= 1 && !(y < 5.6 && Math.abs(dx) < 1.2);
  } },
  { color: '#6a4426', n: 3, shape: (x, y) => x > 7.4 && x < 8.8 && y > 2.2 && y < 6.2 },
  { color: '#58a234', n: 3, shape: (x, y) => Math.hypot((x - 10.6) * 0.8, (y - 3.8) * 1.4) < 1.9 },
], { extra: [(px, regs, k) => {
  // soft shine on the upper-left cheek
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    const ux = (x + 0.5) / k;
    const uy = (y + 0.5) / k;
    if (regs[0].has(x, y) && Math.hypot(ux - 5.2, uy - 8) < (k > 1 ? 1.2 : 0.9)) px.set(x, y, regs[0].m.at(4));
  }
}] });

I.bread = (S) => item(S, [
  { color: '#c88a3e', n: 5, mid: 2, shape: (x, y) => {
    const [a, b] = rot(x, y, 8, 8);
    return (a * a) / 42 + (b * b) / 10 <= 1;
  } },
], { extra: [(px, regs, k) => {
  // three scores across the crust with a pale inner edge
  const r = regs[0];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    if (!r.has(x, y)) continue;
    const [a, b] = rot((x + 0.5) / k, (y + 0.5) / k, 8, 8);
    for (const c of [-3.2, 0, 3.2]) {
      if (Math.abs(a - c - b * 0.5) < 0.42 && Math.abs(b) < 1.6) px.set(x, y, r.m.at(0));
      else if (Math.abs(a - c - b * 0.5 + 0.7) < 0.35 && Math.abs(b) < 1.6) px.set(x, y, r.m.at(4));
    }
  }
}] });

I.cooked_beef = (S) => {
  // a T-bone shaped steak: seared meat, a band of fat along the top-left rim,
  // two diagonal grill marks and a bone poking out at the lower right
  const meat = (x, y) => {
    const dx = x - 8;
    const dy = y - 8.4;
    const ang = Math.atan2(dy, dx);
    return Math.hypot(dx / 6.6, dy / 5.4) <= 1 + 0.08 * Math.sin(ang * 3 + 1);
  };
  return item(S, [
    { color: '#e2c79a', n: 3, shape: meat },
    { color: '#86431f', n: 5, mid: 2, shape: (x, y) => meat(x + 0.9, y + 0.9) && meat(x - 0.4, y - 0.4) },
    { color: '#efe6d4', n: 3, shape: (x, y) => Math.hypot(x - 12.6, y - 12.4) < 1.5 || (Math.abs((x - y) - 0.2) < 0.9 && x > 10 && x < 12.4) },
  ], { extra: [(px, regs, k) => {
    const r = regs[1];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const ux = (x + 0.5) / k;
      const uy = (y + 0.5) / k;
      if (!r.has(x, y) || !r.has(x - 1, y) || !r.has(x + 1, y)) continue;
      const d = (ux + uy) - 16.4;
      if (Math.abs(Math.abs(d) - 2.2) < (k > 1 ? 0.4 : 0.55)) px.set(x, y, r.m.at(0));
      else if (Math.hypot(ux - 6, uy - 6.6) < (k > 1 ? 1 : 0.8)) px.set(x, y, r.m.at(4));
    }
  }] });
};

I.coal = (S) => item(S, [
  { color: '#3a383f', n: 5, mid: 2, contrast: 0.6, shape: (x, y) => {
    const dx = x - 8;
    const dy = y - 8.4;
    const ang = Math.atan2(dy, dx);
    // an irregular chunk: polygon-ish radius that changes with the angle
    const rr = 5 + 0.55 * Math.cos(ang * 3 + 0.6) + 0.3 * Math.sin(ang * 5);
    return Math.hypot(dx, dy) <= rr;
  } },
], { extra: [(px, regs, k) => {
  // three flat facets: lit top-left plane, mid plane, shaded lower plane, plus glints
  const r = regs[0];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    if (!r.has(x, y)) continue;
    const ux = (x + 0.5) / k;
    const uy = (y + 0.5) / k;
    const inner = r.has(x - 1, y) && r.has(x, y - 1) && r.has(x + 1, y) && r.has(x, y + 1);
    if (!inner) continue;
    if (ux + uy < 14) px.set(x, y, r.m.at(3));
    else if (uy - ux > 2.2) px.set(x, y, r.m.at(1));
    if (Math.hypot(ux - 6.4, uy - 5.6) < (k > 1 ? 0.75 : 0.6)) px.set(x, y, r.m.at(4));
  }
}] });

const gem = (color, shape, lit) => (S) => item(S, [{ color, n: 5, mid: 2, contrast: 0.55, shape }], {
  extra: [(px, regs, k) => {
    const r = regs[0];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const ux = (x + 0.5) / k;
      const uy = (y + 0.5) / k;
      if (r.has(x, y) && lit(ux, uy)) px.set(x, y, r.m.at(3));
      if (r.has(x, y) && lit(ux - 0.9, uy - 0.9) && !lit(ux, uy)) px.set(x, y, r.m.at(4));
    }
  }],
});
I.diamond = gem('#46d6dc', (x, y) => {
  const dy = y - 7.4;
  const dx = x - 8;
  return dy < 0 ? Math.abs(dx) < 6 + dy * 0.6 && dy > -4 : Math.abs(dx) + dy * 0.85 < 6;
}, (x, y) => y < 5.2 && x < 8);
I.emerald = gem('#2fc46a', (x, y) => Math.abs(x - 8) < 3.6 && Math.abs(y - 8) < 6.4 - Math.max(0, Math.abs(x - 8) - 1.2) * 1.1, (x, y) => x < 7 && y < 8);

const ingot = (color) => (S) => item(S, [{ color, n: 5, mid: 2, contrast: 0.55, shape: (x, y) => {
  // a bar seen from above at an angle: trapezoid with a bevelled top face
  const [a, b] = rot(x, y, 8, 8);
  return Math.abs(a) < 6 - Math.max(0, b) * 0.4 && b > -2.4 && b < 2.6;
} }], { extra: [(px, regs, k) => {
  const r = regs[0];
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    const [a, b] = rot((x + 0.5) / k, (y + 0.5) / k, 8, 8);
    if (!r.has(x, y)) continue;
    if (b < -0.6 && Math.abs(a) < 4.6) px.set(x, y, r.m.at(3)); // top face
    if (b < -1.3 && Math.abs(a) < 3.8 && a < 0) px.set(x, y, r.m.at(4));
    if (b > 1.4) px.set(x, y, r.m.at(1));
  }
}] });
I.iron_ingot = ingot('#d6d7db');
I.gold_ingot = ingot('#f2c53a');

// arrow: shaft, flint head, white fletching
const arrowRegions = (ox, oy, len = 13.2) => [
  { color: STICK, n: 4, shape: (x, y) => {
    const [a, b] = rot(x, y, ox, oy);
    return a > 1.2 && a < len - 2 && Math.abs(b) <= 0.6;
  } },
  { color: '#e8e4dc', n: 3, shape: (x, y) => {
    const [a, b] = rot(x, y, ox, oy);
    return a >= 0 && a < 3.4 && Math.abs(b) <= 1.6 - (a > 2.2 ? (a - 2.2) : 0) && Math.abs(b) > 0.2;
  } },
  { color: '#5a5a62', n: 4, shape: (x, y) => {
    const [a, b] = rot(x, y, ox, oy);
    return a >= len - 2.6 && a < len && Math.abs(b) <= (len - a) * 0.75;
  } },
];
I.arrow = (S) => item(S, arrowRegions(2, 14));

/** Bow: a curved limb with grip wrap, a taut string, and an arrow when drawn. */
const BOW_C = [3.4, 12.6];
const BOW_R = 9.6;
const bow = (draw) => (S) => {
  const half = BOW_R * Math.SQRT1_2; // chord: half length and distance from the centre
  const pull = draw * 1.2;
  const limb = (w) => (x, y) => {
    const d = Math.hypot(x - BOW_C[0], y - BOW_C[1]);
    const ang = Math.atan2(BOW_C[1] - y, x - BOW_C[0]);
    return Math.abs(d - BOW_R) < w && ang > -0.02 && ang < Math.PI / 2 + 0.02;
  };
  const regions = [
    { color: '#8a5c30', n: 4, shape: limb(0.9) },
    { color: '#ece6da', n: 2, flat: true, shape: (x, y) => {
      const [a, b] = rot(x, y, ...BOW_C);
      return Math.abs(b) < half && Math.abs(a - half + pull * (1 - Math.abs(b) / half)) < 0.5;
    } },
    { color: '#4a2f1e', n: 3, shape: (x, y) => limb(1.1)(x, y) && Math.abs(Math.atan2(BOW_C[1] - y, x - BOW_C[0]) - Math.PI / 4) < 0.14 },
  ];
  if (draw > 0) {
    const a0 = half - pull;
    regions.push(...arrowRegions(BOW_C[0] + a0 * Math.SQRT1_2, BOW_C[1] - a0 * Math.SQRT1_2, 10.4));
  }
  return item(S, regions);
};
I.bow = bow(0);
I.bow_pulling_0 = bow(1);
I.bow_pulling_1 = bow(2);
I.bow_pulling_2 = bow(3);

// legacy (pre-1.13) item file names
const LEGACY_ITEMS = {
  wooden_sword: 'wood_sword', wooden_pickaxe: 'wood_pickaxe', wooden_axe: 'wood_axe', wooden_shovel: 'wood_shovel',
  golden_sword: 'gold_sword', golden_pickaxe: 'gold_pickaxe', golden_axe: 'gold_axe', golden_shovel: 'gold_shovel',
  cooked_beef: 'beef_cooked', bow: 'bow_standby',
};

module.exports = { I, LEGACY_ITEMS, MATERIALS, item, streak, matDetail, OUTLINE, STICK };

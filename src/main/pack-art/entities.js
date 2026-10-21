// Block-entity and extra mob textures: chests, villager, husk, drowned.
// Same rules as the other mobs: real box-UV layouts, original designs.
const { hex } = require('./lib');
const { Model, coat, fleece, hem } = require('./model');

const K = (st) => (st === 'looks' ? 2 : 1);

// ------------------------------------------------------------------- chest --
/**
 * Oak chest: planked sides inside a darker frame, iron corner caps, and a
 * brass latch. `parts` lists which halves to paint: 'single', 'left', 'right'
 * (1.15+ double chest halves) or 'double' (the old 128×64 sheet).
 */
function chest(st, part = 'single') {
  const W = part === 'double' ? 128 : 64;
  const m = new Model(W, 64, K(st));
  const { P } = m;
  const wood = m.pal.ramp('#a8763f', 5, { contrast: 0.5, hue: 16 });
  const frame = m.pal.ramp('#5e3d22', 3, { contrast: 0.4, hue: 14 });
  const iron = m.pal.ramp('#8e9298', 3, { contrast: 0.5, hue: 16 });
  const brass = m.pal.ramp('#e0b44a', 3, { contrast: 0.5, hue: 18 });
  const inner = m.pal.ramp('#3a2617', 2, { contrast: 0.3 });
  const width = part === 'double' ? 30 : part === 'single' ? 14 : 15;

  const side = (lid) => (F) => {
    if ((F.name === 'bottom' && lid) || (F.name === 'top' && !lid)) {
      // inside of the chest: dark boards
      F.fill(inner.at(1));
      for (let ux = 0; ux < F.w; ux += 3) F.u(ux, 0, 1, F.h, inner.at(0));
      return;
    }
    coat(F, wood, { seed: 7 + F.w, fur: 0, shadow: false });
    // horizontal boards on sides, long boards on top/bottom
    if (F.side) for (let uy = lid ? 2 : 3; uy < F.h; uy += lid ? 3 : 4) F.u(0, uy, F.w, 1, wood.at(1));
    else for (let uy = 3; uy < F.h; uy += 4) F.u(0, uy, F.w, 1, wood.at(1));
    if (P) {
      // grain: a darker streak in every board, offset so it doesn't stripe
      for (let uy = 1; uy < F.h; uy += 3) F.f(((uy * 7) % Math.max(1, F.W - 6)) + 2, uy * 2 + 1, wood.at(1));
    }
    // frame round the face
    F.u(0, 0, F.w, 1, frame.at(2));
    F.u(0, 0, 1, F.h, frame.at(2));
    F.u(0, F.h - 1, F.w, 1, frame.at(0));
    F.u(F.w - 1, 0, 1, F.h, frame.at(0));
    if (P) {
      F.fstamp(0, 0, ['ab', 'b.'], { a: iron.at(2), b: iron.at(1) });
      F.fstamp(F.W - 2, F.H - 2, ['.b', 'bc'], { b: iron.at(1), c: iron.at(0) });
    } else if (F.w > 4 && F.h > 4) {
      F.u(0, 0, 1, 1, iron.at(2));
      F.u(F.w - 1, F.h - 1, 1, 1, iron.at(0));
    }
  };
  m.box(0, 0, width, 5, 14, side(true));
  m.box(0, 19, width, 10, 14, side(false));
  // latch (1 or 2 wide)
  const lw = part === 'left' || part === 'right' ? 1 : 2;
  m.box(0, 0, lw, 4, 1, (F) => {
    F.fill(brass.at(1));
    if (F.side) {
      F.u(0, 0, F.w, 1, brass.at(2));
      F.u(0, F.h - 1, F.w, 1, brass.at(0));
      if (F.name === 'front') F.u(0, 2, F.w, 1, frame.at(0)); // keyhole
    }
  });
  return m.toImage();
}

// -------------------------------------------------------- zombie variants --
const ZOMBIES = {
  husk: { skin: '#a28d63', shirt: '#7d6a45', pants: '#5d4a33', shoe: '#3d3026', eye: '#e8d27a', wrap: '#cbbd94' },
  drowned: { skin: '#5ba59c', shirt: '#3f7c86', pants: '#465f72', shoe: '#2f3a3e', eye: '#7ff2ff', wrap: null },
};

function zombieLike(st, kind) {
  const c = ZOMBIES[kind];
  const m = new Model(64, 64, K(st));
  const { P } = m;
  const skin = m.pal.ramp(c.skin, 5, { contrast: 0.5, hue: 18 });
  const shirt = m.pal.ramp(c.shirt, 5, { contrast: 0.5, hue: 16 });
  const pants = m.pal.ramp(c.pants, 5, { contrast: 0.5, hue: 14 });
  const shoe = m.pal.ramp(c.shoe, 3, { contrast: 0.4 });
  const dark = m.pal.add([hex('#120e18'), hex('#2b2232')]);
  const glow = m.pal.add([hex(c.eye), hex('#ffffff')]);
  const wrap = c.wrap ? m.pal.ramp(c.wrap, 3, { contrast: 0.35, hue: 16 }) : null;
  const S = skin.mid;

  m.box(0, 0, 8, 8, 8, (F) => {
    coat(F, skin, { seed: 3, fur: 0.25 });
    if (wrap && (F.side || F.name === 'top')) {
      // desert head-wrap over the top half
      F.u(0, 0, F.w, 3, (q, j) => wrap.at(j < F.k ? 2 : 1));
      F.u(0, 3, F.w, 1, wrap.at(0));
      if (F.name === 'top') F.fill(wrap.at(2));
    }
    if (kind === 'drowned' && F.name === 'top') F.u(2, 2, 3, 2, skin.at(S - 1));
    if (F.name !== 'front') return;
    F.u(1, 4, 2, 1, dark.at(0));
    F.u(5, 4, 2, 1, dark.at(0));
    F.u(2, 4, 1, 1, glow.at(0));
    F.u(5, 4, 1, 1, glow.at(0));
    if (P) {
      F.f(4, 8, glow.at(1));
      F.f(10, 8, glow.at(1));
    }
    F.u(2, 6, 4, 1, dark.at(1));
    F.u(3, 6, 1, 1, skin.at(S + 2));
    if (kind === 'drowned') F.u(1, 7, 1, 1, skin.at(S - 2));
  });
  m.box(16, 16, 8, 12, 4, (F) => {
    coat(F, shirt, { seed: 7, fur: 0.3 });
    if (F.side) {
      F.u(0, 10, F.w, 2, pants.at(pants.mid));
      F.u(0, 9, F.w, 1, (x) => ((x >> (P ? 1 : 0)) % 2 ? shirt.at(shirt.mid - 1) : skin.at(S - 1)));
    }
    if (F.name === 'front') {
      F.u(3, 0, 2, 2, skin.at(S));
      if (kind === 'drowned') F.stamp(1, 5, ['a.', 'aa', '.a'], { a: skin.at(S - 1) });
    }
    if (F.name === 'bottom') F.fill(pants.at(pants.mid - 1));
  });
  const arm = (F) => {
    coat(F, skin, { seed: 9, fur: 0.2 });
    if (F.side) {
      F.u(0, 0, F.w, 3, shirt.at(shirt.mid));
      F.u(0, 3, F.w, 1, (x) => ((x >> (P ? 1 : 0)) % 2 ? shirt.at(shirt.mid - 1) : skin.at(S - 1)));
      if (wrap) F.u(0, 8, F.w, 2, (q, j) => wrap.at(j < F.k ? 2 : 1));
      F.u(0, 11, F.w, 1, skin.at(S - 1));
    }
    if (F.name === 'top') F.fill(shirt.at(shirt.mid + 1));
  };
  const leg = (F) => {
    coat(F, pants, { seed: 13, fur: 0.3 });
    if (F.side) {
      F.u(0, 10, F.w, 2, shoe.at(1));
      F.u(0, 11, F.w, 1, shoe.at(0));
      if (kind === 'drowned') F.u(0, 7, F.w, 3, (q, j) => ((q >> (P ? 1 : 0)) % 3 ? -1 : skin.at(S)));
    }
    if (F.name === 'bottom') F.fill(shoe.at(0));
  };
  m.box(40, 16, 4, 12, 4, arm);
  m.box(0, 16, 4, 12, 4, leg);
  m.box(32, 48, 4, 12, 4, arm);
  m.box(16, 48, 4, 12, 4, leg);
  return m.toImage();
}

/** Drowned outer layer: hanging kelp strands on the head and shoulders. */
function drownedOuter(st) {
  const m = new Model(64, 64, K(st));
  const kelp = m.pal.ramp('#4e8f3a', 4, { contrast: 0.5, hue: 18 });
  const strands = (F, lens) => {
    F.fill(-1);
    if (F.name === 'top') {
      for (let ux = 0; ux < F.w; ux += 2) F.u(ux, 0, 1, F.h, kelp.at(2 + (ux % 4 ? 0 : 1)));
      return;
    }
    if (!F.side) return;
    for (let ux = 0; ux < F.w; ux++) {
      const len = lens[(ux + F.name.length) % lens.length];
      if (!len) continue;
      F.u(ux, 0, 1, len, (q, j) => kelp.at(j === 0 ? 3 : j >= len * F.k - F.k ? 0 : 1 + (ux % 2)));
    }
  };
  m.box(0, 0, 8, 8, 8, (F) => strands(F, [3, 0, 5, 2, 0, 4, 6, 0]));
  m.box(16, 16, 8, 12, 4, (F) => strands(F, [2, 0, 0, 3, 0, 0, 1, 0]));
  m.box(40, 16, 4, 12, 4, (F) => strands(F, [2, 0, 3, 0]));
  m.box(0, 16, 4, 12, 4, (F) => strands(F, [0, 0, 0, 0]));
  m.box(32, 48, 4, 12, 4, (F) => strands(F, [0, 2, 0, 3]));
  m.box(16, 48, 4, 12, 4, (F) => strands(F, [0, 0, 0, 0]));
  return m.toImage();
}

// ---------------------------------------------------------------- villager --
function villager(st) {
  const m = new Model(64, 64, K(st));
  const { P } = m;
  const skin = m.pal.ramp('#bd8d6c', 5, { contrast: 0.45, hue: 16 });
  const robe = m.pal.ramp('#6d4c34', 5, { contrast: 0.5, hue: 16 });
  const dark = m.pal.add([hex('#1a1216'), hex('#3a2a24'), hex('#f2efe6'), hex('#3f8f4a')]);
  const S = skin.mid;
  // head (8×10×8) with a long brow and green eyes
  m.box(0, 0, 8, 10, 8, (F) => {
    coat(F, skin, { seed: 31, fur: 0.15 });
    if (F.name === 'top' || F.side) F.u(0, 0, F.w, F.name === 'top' ? F.h : 1, (q, j) => skin.at(S - 1));
    if (F.name !== 'front') return;
    F.u(1, 3, 6, 1, dark.at(1));
    F.u(1, 4, 2, 1, dark.at(2));
    F.u(5, 4, 2, 1, dark.at(2));
    F.u(2, 4, 1, 1, dark.at(3));
    F.u(5, 4, 1, 1, dark.at(3));
    F.u(3, 8, 2, 1, skin.at(S - 2));
  });
  // big nose (2×4×2)
  m.box(24, 0, 2, 4, 2, (F) => {
    F.fill(skin.at(S));
    if (F.side) {
      F.u(0, 0, 1, F.h, skin.at(S + 1));
      F.u(0, 3, F.w, 1, skin.at(S - 1));
    }
    if (F.name === 'bottom') F.fill(skin.at(S - 2));
  });
  const robeFace = (F) => {
    coat(F, robe, { seed: 33, fur: 0.4 });
    if (F.side) {
      // a lighter collar and a stitched hem
      F.u(0, 0, F.w, 1, robe.at(robe.mid + 1));
      F.u(0, F.h - 1, F.w, 1, robe.at(robe.mid - 2));
      if (P) for (let x = 0; x < F.W; x += 3) F.f(x, F.H - 3, robe.at(robe.mid + 1));
    }
  };
  m.box(16, 20, 8, 12, 6, robeFace);
  m.box(0, 38, 8, 18, 6, robeFace);
  // folded arms: sleeves (4×8×4) and the hands bar (8×4×4)
  m.box(44, 22, 4, 8, 4, (F) => {
    coat(F, robe, { seed: 35, fur: 0.3 });
    if (F.side) F.u(0, F.h - 1, F.w, 1, robe.at(robe.mid - 1));
  });
  m.box(40, 38, 8, 4, 4, (F) => {
    coat(F, robe, { seed: 37, fur: 0.3 });
    if (F.name === 'front') F.u(2, 0, 4, 4, (q, j) => skin.at(j < F.k ? S + 1 : S));
  });
  m.box(0, 22, 4, 12, 4, (F) => {
    coat(F, robe, { seed: 39, fur: 0.2, lift: -1 });
    if (F.side) F.u(0, 10, F.w, 2, dark.at(1));
  });
  return m.toImage();
}

module.exports = {
  chest,
  husk: (st) => zombieLike(st, 'husk'),
  drowned: (st) => zombieLike(st, 'drowned'),
  drowned_outer: drownedOuter,
  villager,
};

// Mob textures. Each painter draws onto the mob's real box-UV layout (see
// Model.faces) at the vanilla canvas size, or 2× for the Pretty pack (the
// game scales entity UVs with the image, so HD works as long as the aspect
// ratio matches). Designs are original Pimpin takes on each mob.
const { hex, rng } = require('./lib');
const { Model, coat, patches, fleece, shag } = require('./model');

const K = (st) => (st === 'looks' ? 2 : 1);

// ------------------------------------------------------------------ zombie --
function zombie(st) {
  const m = new Model(64, 64, K(st));
  const { P } = m;
  const skin = m.pal.ramp('#5f9c58', 5, { contrast: 0.5, hue: 18 });
  const shirt = m.pal.ramp('#2f8994', 5, { contrast: 0.5, hue: 16 });
  const pants = m.pal.ramp('#4a3f8e', 5, { contrast: 0.5, hue: 14 });
  const shoe = m.pal.ramp('#4a3b33', 3, { contrast: 0.4 });
  const dark = m.pal.add([hex('#120e18'), hex('#2b2232')]);
  const glow = m.pal.add([hex('#b7e04a'), hex('#f2ffb0')]);
  const S = skin.mid;

  m.box(0, 0, 8, 8, 8, (F) => {
    coat(F, skin, { seed: 3, fur: 0.25 });
    patches(F, skin, { seed: 5, count: F.name === 'top' ? 3 : 1, size: 2, lift: -1 });
    if (F.name === 'top' || F.side) F.u(0, 0, 8, 1, (x) => ((x >> (P ? 1 : 0)) % 3 ? skin.at(S - 2) : skin.at(S - 1))); // thin scalp
    if (F.name !== 'front') return;
    F.u(1, 2, 2, 1, skin.at(S - 1));
    F.u(5, 2, 2, 1, skin.at(S - 1));
    F.u(1, 3, 2, 1, dark.at(0));
    F.u(5, 3, 2, 1, dark.at(0));
    if (P) {
      F.f(4, 6, glow.at(1));
      F.f(4, 7, glow.at(0));
      F.f(11, 6, glow.at(1));
      F.f(11, 7, glow.at(0));
      F.u(1, 4, 2, 1, (x, y) => (y === 0 ? skin.at(S - 1) : skin.at(S)));
      F.u(5, 4, 2, 1, (x, y) => (y === 0 ? skin.at(S - 1) : skin.at(S)));
      F.fstamp(6, 9, ['ab', '..'], { a: skin.at(S + 1), b: skin.at(S + 1) });
      F.fstamp(6, 10, ['cddc'], { c: skin.at(S - 1), d: dark.at(1) });
      F.u(2, 6, 4, 1, dark.at(1));
      F.fstamp(5, 12, ['ab.ab.'], { a: skin.at(S + 2), b: skin.at(S + 1) });
      F.fstamp(4, 13, ['.x..x...'], { x: dark.at(0) });
    } else {
      F.u(2, 3, 1, 1, glow.at(0));
      F.u(5, 3, 1, 1, glow.at(0));
      F.u(3, 4, 2, 1, skin.at(S - 1));
      F.u(2, 6, 4, 1, dark.at(1));
      F.u(3, 6, 1, 1, skin.at(S + 2));
    }
  });

  // torso: torn shirt over the belt line
  m.box(16, 16, 8, 12, 4, (F) => {
    coat(F, shirt, { seed: 7, fur: 0.4 });
    if (F.side) {
      F.u(0, 10, F.w, 2, pants.at(pants.mid));
      F.u(0, 11, F.w, 1, pants.at(pants.mid - 1));
      F.u(0, 9, F.w, 1, (x) => ((x >> (P ? 1 : 0)) % 2 ? shirt.at(shirt.mid - 1) : skin.at(S - 1)));
    }
    if (F.name === 'bottom') F.fill(pants.at(pants.mid - 1));
    if (F.name === 'front') {
      F.u(3, 0, 2, 1, skin.at(S));
      F.stamp(5, 4, ['ab', 'bc'], { a: skin.at(S), b: skin.at(S - 1), c: shirt.at(0) });
      F.stamp(1, 7, ['a'], { a: shirt.at(0) });
    }
    if (F.name === 'back') F.stamp(2, 3, ['.a', 'ab'], { a: skin.at(S - 1), b: shirt.at(0) });
    if (F.name === 'top') F.u(3, 1, 2, 2, skin.at(S));
  });

  // arms: ragged sleeve then rotting skin
  m.box(40, 16, 4, 12, 4, (F) => {
    coat(F, skin, { seed: 9, fur: 0.3 });
    if (F.side) {
      F.u(0, 0, F.w, 4, shirt.at(shirt.mid));
      F.u(0, 4, F.w, 1, (x) => ((x >> (P ? 1 : 0)) % 2 ? shirt.at(shirt.mid - 1) : skin.at(S - 1)));
      F.u(0, 11, F.w, 1, skin.at(S - 1));
      if (P) F.f(1, 0, shirt.at(shirt.mid + 1));
    }
    if (F.name === 'top') F.fill(shirt.at(shirt.mid + 1));
    if (F.name === 'bottom') F.fill(skin.at(S - 1));
    patches(F, skin, { seed: 11, count: F.side ? 1 : 0, size: 1.5, lift: -1 });
  });

  // legs: trousers and worn shoes
  m.box(0, 16, 4, 12, 4, (F) => {
    coat(F, pants, { seed: 13, fur: 0.4 });
    if (F.side) {
      F.u(0, 10, F.w, 2, shoe.at(1));
      F.u(0, 11, F.w, 1, shoe.at(0));
      if (F.name === 'front') F.u(1, 6, 1, 1, pants.at(pants.mid - 1));
    }
    if (F.name === 'bottom') F.fill(shoe.at(0));
  });

  // Newer game versions read separate left limbs from the lower half.
  m.copy(40, 16, 16, 16, 32, 48);
  m.copy(0, 16, 16, 16, 16, 48);
  return m.toImage();
}

// ---------------------------------------------------------------- skeleton --
function skeleton(st) {
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const bone = m.pal.ramp('#d9d4c4', 5, { contrast: 0.5, hue: 22 });
  const dark = m.pal.add([hex('#1d1922'), hex('#3d3644')]);
  const B = bone.mid;

  m.box(0, 0, 8, 8, 8, (F) => {
    coat(F, bone, { seed: 21, fur: 0.15 });
    if (F.name === 'top' && P) F.fstamp(5, 3, ['a..', '.a.', '.aa', '...a'], { a: bone.at(B - 1) });
    if (F.name !== 'front') return;
    // deep sockets with a lit rim below
    for (const ex of [1, 5]) {
      F.u(ex, 2, 2, 2, dark.at(0));
      F.u(ex, 4, 2, 1, bone.at(B + 1));
      if (P) {
        F.f(ex * 2, 4, dark.at(1));
        F.f(ex * 2 + 3, 7, dark.at(1));
      }
    }
    F.u(3, 5, 2, 1, (x) => (P ? (x === 1 || x === 2 ? dark.at(0) : bone.at(B - 1)) : dark.at(0)));
    // teeth
    F.u(1, 6, 6, 1, (x) => (P ? (x % 3 === 2 ? dark.at(0) : bone.at(B + 1)) : x % 2 ? dark.at(1) : bone.at(B + 1)));
    F.u(1, 7, 6, 1, bone.at(B - 1));
  });

  // ribcage with real gaps (the game renders skeletons as cutout)
  m.box(16, 16, 8, 12, 4, (F) => {
    if (!F.side) return coat(F, bone, { seed: 23, fur: 0 });
    F.fill(-1);
    const rib = (y) => F.u(0, y, F.w, 1, (x, fy) => (fy % (P ? 2 : 1) === 0 || !P ? bone.at(B + (P && fy % 2 === 0 ? 1 : 0)) : bone.at(B - 1)));
    rib(0);
    [2, 4, 6].forEach(rib);
    F.u(0, 9, F.w, 3, bone.at(B));
    F.u(0, 11, F.w, 1, bone.at(B - 1));
    if (F.name === 'front' || F.name === 'back') {
      F.u(3, 0, 2, 12, bone.at(B - 1));
      F.u(3, 0, 1, 12, bone.at(B));
      F.u(3, 10, 2, 1, dark.at(1));
    }
  });

  const limb = (F) => {
    coat(F, bone, { seed: 25, fur: 0 });
    if (!F.side) return;
    F.u(0, 5, F.w, 2, bone.at(B + 1));
    F.u(0, 7, F.w, 1, bone.at(B - 1));
    F.u(0, 0, F.w, 1, bone.at(B - 1));
    if (P) F.f(F.W - 1, 11, bone.at(B - 2));
  };
  m.box(40, 16, 2, 12, 2, limb);
  m.box(0, 16, 2, 12, 2, limb);
  return m.toImage();
}

// ----------------------------------------------------------------- creeper --
function camo(F, g, seed, levels = [1, 2, 2, 3, 3, 4]) {
  const r = rng(seed + F.W * 3 + F.H * 5 + F.name.length);
  const grid = [];
  for (let y = 0; y < F.h; y++) {
    grid.push([]);
    for (let x = 0; x < F.w; x++) {
      let v = r.pick(levels);
      if (x && r.chance(0.45)) v = grid[y][x - 1];
      else if (y && r.chance(0.3)) v = grid[y - 1][x];
      grid[y].push(v);
      F.u(x, y, 1, 1, g.at(v + (F.name === 'top' ? 1 : F.name === 'bottom' ? -1 : 0)));
    }
  }
  if (F.P) {
    // bevel the 2×2 cells: lighter cells catch light on their top-left pixel
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const v = grid[y][x];
      if (v >= 3) F.f(x * 2, y * 2, g.at(v + 1));
      if (v <= 1) F.f(x * 2 + 1, y * 2 + 1, g.at(v - 1));
    }
  }
}

function creeper(st) {
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const g = m.pal.ramp('#56ad4c', 6, { contrast: 0.6, hue: 22 });
  const face = m.pal.add([hex('#0f130f'), hex('#26302a'), hex('#4f6b4c')]);
  m.box(0, 0, 8, 8, 8, (F) => {
    camo(F, g, 31);
    if (F.name !== 'front') return;
    F.u(1, 2, 2, 2, face.at(0));
    F.u(5, 2, 2, 2, face.at(0));
    F.u(3, 4, 2, 1, face.at(0));
    F.u(2, 5, 4, 2, face.at(0));
    F.u(3, 6, 2, 1, face.at(1));
    F.u(2, 7, 1, 1, face.at(0));
    F.u(5, 7, 1, 1, face.at(0));
    if (P) {
      F.f(2, 4, face.at(2));
      F.f(10, 4, face.at(2));
      F.f(6, 13, face.at(2));
      F.f(9, 13, face.at(2));
    }
  });
  m.box(16, 16, 8, 12, 4, (F) => camo(F, g, 33));
  m.box(0, 16, 4, 6, 4, (F) => {
    camo(F, g, 35, [1, 1, 2, 2, 3]);
    if (F.side) F.u(0, 5, F.w, 1, g.at(0));
    if (F.name === 'bottom') F.fill(g.at(0));
  });
  return m.toImage();
}

// ------------------------------------------------------------------ spider --
function spider(st, eyesOnly = false) {
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const hair = m.pal.ramp('#43352f', 5, { contrast: 0.55, hue: 16 });
  const eye = m.pal.ramp('#d8262c', 3, { contrast: 0.5, hue: 20 });
  const fang = m.pal.ramp('#c9bba0', 2, { contrast: 0.3 });
  const H = hair.mid;
  const eyes = (F) => {
    const big = (x, y) => {
      F.u(x, y, 2, 2, eye.at(1));
      F.u(x, y + 1, 2, 1, eye.at(0));
      F.f(x * F.k, y * F.k, eye.at(2));
    };
    big(1, 3);
    big(5, 3);
    for (const [x, y] of [[0, 2], [7, 2], [3, 2], [4, 2], [2, 5], [5, 5]]) {
      F.u(x, y, 1, 1, eye.at(P ? 1 : 1));
      if (P) F.f(x * 2, y * 2, eye.at(2));
    }
  };
  if (eyesOnly) {
    m.box(32, 4, 8, 8, 8, (F) => eyes(F), ['front']);
    return m.toImage();
  }
  m.box(32, 4, 8, 8, 8, (F) => {
    coat(F, hair, { seed: 41, fur: 0.9 });
    if (F.name !== 'front') return;
    eyes(F);
    F.u(2, 7, 1, 1, fang.at(1));
    F.u(5, 7, 1, 1, fang.at(1));
    if (P) {
      F.f(5, 15, fang.at(0));
      F.f(10, 15, fang.at(0));
    }
  });
  m.box(0, 0, 6, 6, 6, (F) => coat(F, hair, { seed: 43, fur: 0.9, lift: -1 }));
  m.box(0, 12, 10, 8, 12, (F) => {
    coat(F, hair, { seed: 45, fur: 1 });
    if (F.name === 'top' || F.name === 'bottom') {
      // a pale hourglass marking down the back
      for (const y of [2, 5, 8]) {
        F.u(4, y, 2, 1, hair.at(H + 2));
        F.u(3, y + 1, 1, 1, hair.at(H + 1));
        F.u(6, y + 1, 1, 1, hair.at(H + 1));
      }
    }
  });
  m.box(18, 0, 16, 2, 2, (F) => {
    coat(F, hair, { seed: 47, fur: 0.4, shadow: false });
    if (!F.side || F.w < 16) return;
    for (const x of [5, 10]) F.u(x, 0, 1, F.h, hair.at(H + 1));
    F.u(0, 0, 2, F.h, hair.at(H - 1));
    F.u(14, 0, 2, F.h, hair.at(H - 1));
  });
  return m.toImage();
}

// ---------------------------------------------------------------- enderman --
function enderman(st, eyesOnly = false) {
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const skin = m.pal.ramp('#1e1826', 5, { contrast: 0.5, hue: 10, tint: 0.05 });
  const eye = m.pal.add([hex('#a447d8'), hex('#df84ff'), hex('#fbd8ff')]);
  const eyes = (F) => {
    F.u(0, 4, 3, 1, (x) => eye.at([0, 1, 2][Math.floor(x / F.k)]));
    F.u(5, 4, 3, 1, (x) => eye.at([2, 1, 0][Math.floor(x / F.k)]));
  };
  if (eyesOnly) {
    m.box(0, 0, 8, 8, 8, eyes, ['front']);
    return m.toImage();
  }
  const S = skin.mid;
  m.box(0, 0, 8, 8, 8, (F) => {
    coat(F, skin, { seed: 51, fur: 0.4 });
    if (F.name !== 'front') return;
    eyes(F);
    if (P) {
      F.u(0, 3, 3, 1, (x, y) => (y === 1 ? skin.at(S - 1) : skin.at(S)));
      F.u(5, 3, 3, 1, (x, y) => (y === 1 ? skin.at(S - 1) : skin.at(S)));
    }
  });
  m.box(0, 16, 8, 8, 8, (F) => {
    coat(F, skin, { seed: 53, fur: 0.4 });
    if (F.name === 'front') F.u(1, 6, 6, 1, skin.at(S - 1));
  });
  m.box(32, 16, 8, 12, 4, (F) => coat(F, skin, { seed: 55, fur: 0.5 }));
  m.box(56, 0, 2, 30, 2, (F) => {
    coat(F, skin, { seed: 57, fur: 0.3 });
    if (F.side) F.u(0, 14, F.w, 1, skin.at(S + 1));
  });
  return m.toImage();
}

// --------------------------------------------------------------------- cow --
const COWS = {
  temperate: { hide: '#ece5d8', spot: '#3c2b24', muzzle: '#e3a49c', horn: '#d6cdbc', hoof: '#3a3130', spots: 3 },
  warm: { hide: '#9b4b2f', spot: '#6a2c1c', muzzle: '#d8a089', horn: '#4f4440', hoof: '#2e2422', spots: 1 },
  cold: { hide: '#8e6c4b', spot: '#5c432f', muzzle: '#a68e80', horn: '#bfb6a8', hoof: '#2e2826', spots: 2 },
};

function cow(st, variant = 'temperate', tall = false) {
  const c = COWS[variant];
  const m = new Model(64, tall ? 64 : 32, K(st));
  const { P } = m;
  const hide = m.pal.ramp(c.hide, 5, { contrast: 0.45, hue: 16 });
  const spot = m.pal.ramp(c.spot, 3, { contrast: 0.35, hue: 14 });
  const muz = m.pal.ramp(c.muzzle, 3, { contrast: 0.4, hue: 14 });
  const horn = m.pal.ramp(c.horn, 3, { contrast: 0.4, hue: 14 });
  const hoof = m.pal.ramp(c.hoof, 2, { contrast: 0.3 });
  const dark = m.pal.add([hex('#121014'), hex('#f4f2ec')]);
  const sp = (F, n, size) => patches(F, spot, { seed: 61 + n, count: n, size });

  m.box(0, 0, 8, 8, 6, (F) => {
    coat(F, hide, { seed: 60, fur: 0.4 });
    if (F.name === 'top' && c.spots > 1) sp(F, 1, 2.5);
    if (F.name !== 'front') return;
    if (c.spots > 1) patches(F, spot, { seed: 70, count: 1, size: 2.2 });
    for (const ex of [1, 6]) {
      F.u(ex, 3, 1, 1, dark.at(0));
      if (P) F.f(ex * 2 + (ex === 1 ? 0 : 1), 6, dark.at(1));
    }
    // soft nose on the lower face
    F.u(2, 5, 4, 3, muz.at(1));
    F.u(2, 5, 4, 1, muz.at(2));
    F.u(2, 7, 4, 1, muz.at(0));
    F.u(2, 6, 1, 1, muz.at(0));
    F.u(5, 6, 1, 1, muz.at(0));
  });
  m.box(22, 0, 1, 3, 1, (F) => {
    F.fill(horn.at(1));
    if (F.side) F.u(0, 0, 1, 1, horn.at(2));
  });
  m.box(18, 4, 12, 18, 10, (F) => {
    coat(F, hide, { seed: 62, fur: variant === 'cold' ? 1.2 : 0.6 });
    if (c.spots) sp(F, c.spots + (F.w * F.h > 150 ? 1 : 0), 4.5);
  });
  m.box(52, 0, 4, 6, 1, (F) => {
    F.fill(muz.at(1));
    if (F.side) F.u(0, 5, F.w, 1, muz.at(0));
  });
  m.box(0, 16, 4, 12, 4, (F) => {
    coat(F, hide, { seed: 63, fur: 0.4 });
    if (F.side) {
      F.u(0, 10, F.w, 2, hoof.at(1));
      F.u(0, 9, F.w, 1, hide.at(hide.mid - 1));
    }
    if (F.name === 'bottom') F.fill(hoof.at(0));
  });
  if (tall) {
    // 1.21.5+ model: separate muzzle box
    m.box(1, 33, 6, 3, 1, (F) => {
      F.fill(muz.at(1));
      if (F.name === 'top') F.fill(muz.at(2));
      if (F.name === 'front') {
        F.u(0, 0, 6, 1, muz.at(2));
        F.u(1, 1, 1, 1, muz.at(0));
        F.u(4, 1, 1, 1, muz.at(0));
      }
    });
    if (variant === 'warm') {
      // long curved horns
      m.rect(27, 0, 20, 4, (x, y) => horn.at(y < m.k * 2 ? 2 : 1));
      m.rect(27, 0, 2, 4, horn.at(0));
      m.rect(45, 0, 2, 4, horn.at(0));
    }
    if (variant === 'cold') {
      m.rect(0, 32, 8, 16, (x, y) => horn.at(y % (4 * m.k) === 0 ? 2 : 1));
      m.rect(8, 32, 16, 5, (x, y) => hide.at(hide.mid + (y < m.k ? 1 : (x + y) % (3 * m.k) === 0 ? -1 : 0)));
      m.rect(10, 34, 6, 3, muz.at(1));
      m.rect(11, 35, 1, 1, muz.at(0));
      m.rect(14, 35, 1, 1, muz.at(0));
      // shaggy coat panels with a ragged lower fringe
      shag(m.face('top', 30, 32, 24, 9), hide, { seed: 64, hem: 0 });
      shag(m.face('right', 20, 42, 10, 18), hide, { seed: 65 });
      shag(m.face('left', 43, 42, 21, 18), hide, { seed: 66 });
    }
  }
  return m.toImage();
}

// --------------------------------------------------------------------- pig --
const PIGS = {
  temperate: { skin: '#eea19c', snout: '#e4847f', mud: null },
  warm: { skin: '#c8783f', snout: '#a75a2e', mud: '#6e4026' },
  cold: { skin: '#e6cfb4', snout: '#d39c8b', mud: null, coat: '#f2e7d4' },
};

function pig(st, variant = 'temperate', tall = false) {
  const c = PIGS[variant];
  const m = new Model(64, tall ? 64 : 32, K(st));
  const { P } = m;
  const skin = m.pal.ramp(c.skin, 5, { contrast: 0.42, hue: 16 });
  const snout = m.pal.ramp(c.snout, 3, { contrast: 0.45, hue: 14 });
  const dark = m.pal.add([hex('#141116'), hex('#f6f3ee')]);
  const mud = c.mud ? m.pal.ramp(c.mud, 3, { contrast: 0.3 }) : null;
  const S = skin.mid;

  m.box(0, 0, 8, 8, 8, (F) => {
    coat(F, skin, { seed: 80, fur: 0.4 });
    if (mud && F.name === 'top') patches(F, mud, { seed: 81, count: 1, size: 2 });
    if (F.name !== 'front') return;
    F.u(1, 3, 1, 1, dark.at(1));
    F.u(2, 3, 1, 1, dark.at(0));
    F.u(5, 3, 1, 1, dark.at(0));
    F.u(6, 3, 1, 1, dark.at(1));
    F.u(0, 5, 1, 1, skin.at(S + 1));
    F.u(7, 5, 1, 1, skin.at(S + 1));
    if (P) {
      F.f(4, 6, dark.at(1));
      F.f(11, 6, dark.at(1));
    }
  });
  m.box(16, 16, 4, 3, 1, (F) => {
    F.fill(snout.at(1));
    if (F.name === 'front') {
      F.u(0, 0, 4, 1, snout.at(2));
      if (P) {
        F.fstamp(1, 2, ['aa..aa', 'ab..ab'], { a: snout.at(0), b: dark.at(0) });
      } else {
        F.u(0, 1, 1, 1, snout.at(0));
        F.u(3, 1, 1, 1, snout.at(0));
      }
    }
  });
  m.box(28, 8, 10, 16, 8, (F) => {
    coat(F, skin, { seed: 82, fur: 0.7 });
    if (mud) patches(F, mud, { seed: 83, count: 2, size: 3.5 });
    else patches(F, skin, { seed: 84, count: 1, size: 2.5, lift: -1 });
  });
  m.box(0, 16, 4, 6, 4, (F) => {
    coat(F, skin, { seed: 85, fur: 0.3 });
    if (F.side) F.u(0, 5, F.w, 1, snout.at(0));
    if (F.name === 'bottom') F.fill(snout.at(0));
    if (mud && F.side) F.u(0, 4, F.w, 1, mud.at(1));
  });
  if (tall && variant === 'cold') {
    const wool = m.pal.ramp(c.coat, 4, { contrast: 0.35, hue: 18 });
    const fluff = (x0, y0, w, h) => fleece(m.face('front', x0, y0, w, h), wool, { seed: x0 + y0, gaps: 0.2 });
    fluff(16, 24, 12, 8);
    fluff(36, 32, 20, 8);
    fluff(28, 40, 8, 16);
    fluff(46, 40, 18, 16);
  }
  return m.toImage();
}

// ------------------------------------------------------------------- sheep --
function sheep(st) {
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const face = m.pal.ramp('#d4bfae', 5, { contrast: 0.42, hue: 16 });
  const body = m.pal.ramp('#e4cdc4', 4, { contrast: 0.35, hue: 16 });
  const dark = m.pal.add([hex('#141116'), hex('#f6f3ee'), hex('#c98c86')]);
  const F0 = face.mid;
  m.box(0, 0, 6, 6, 8, (F) => {
    coat(F, face, { seed: 90, fur: 0.4 });
    if (F.name !== 'front') return;
    F.u(0, 2, 1, 1, dark.at(1));
    F.u(1, 2, 1, 1, dark.at(0));
    F.u(4, 2, 1, 1, dark.at(0));
    F.u(5, 2, 1, 1, dark.at(1));
    F.u(2, 4, 2, 1, dark.at(2));
    F.u(2, 5, 2, 1, face.at(F0 - 1));
  });
  m.box(28, 8, 8, 16, 6, (F) => coat(F, body, { seed: 91, fur: 0.4 }));
  m.box(0, 16, 4, 12, 4, (F) => {
    coat(F, face, { seed: 92, fur: 0.3 });
    if (F.side) F.u(0, 10, F.w, 2, face.at(0));
    if (F.name === 'bottom') F.fill(face.at(0));
  });
  return m.toImage();
}

/** Wool layer (tinted by the game): near-white curls in bevelled clusters. */
function wool(st, kind = 'fur') {
  const m = new Model(64, 32, K(st));
  const w = m.pal.ramp('#f1efea', 5, { contrast: 0.32, hue: 20, mid: 3 });
  const curls = (seed, lift = 0) => (F) => fleece(F, w, { seed, lift });
  if (kind === 'undercoat') {
    m.box(0, 0, 6, 6, 8, curls(100, -1));
    m.box(0, 16, 4, 4, 4, curls(101, -1));
    // sparse tufts on the body: little 2×2 clumps, not single specks
    m.box(28, 8, 8, 16, 6, (F) => {
      const r = rng(102 + F.W);
      F.fill(-1);
      for (let i = 0; i < (F.w * F.h) / 10; i++) F.u(r.i(F.w - 1), r.i(F.h - 1), 2, 2, w.at(w.mid - (r.chance(0.5) ? 1 : 0)));
    });
    return m.toImage();
  }
  m.box(0, 0, 6, 6, 6, curls(103));
  m.box(28, 8, 8, 16, 6, curls(104));
  m.box(0, 16, 4, 6, 4, curls(105));
  return m.toImage();
}

// ----------------------------------------------------------------- chicken --
const CHICKENS = {
  temperate: { feather: '#f3f1ea', beak: '#f2b632', wattle: '#d8323a', leg: '#f0a43a' },
  warm: { feather: '#c9763e', beak: '#f2c54a', wattle: '#c8282e', leg: '#e8963a' },
  cold: { feather: '#b9bcc4', beak: '#e8b04a', wattle: '#c03a44', leg: '#d89a4a', fluff: '#dfe2e8' },
};

function chicken(st, variant = 'temperate') {
  const c = CHICKENS[variant];
  const m = new Model(64, 32, K(st));
  const { P } = m;
  const fe = m.pal.ramp(c.feather, 5, { contrast: 0.4, hue: 20 });
  const beak = m.pal.ramp(c.beak, 3, { contrast: 0.45, hue: 18 });
  const wat = m.pal.ramp(c.wattle, 3, { contrast: 0.4, hue: 14 });
  const leg = m.pal.ramp(c.leg, 3, { contrast: 0.45, hue: 16 });
  const dark = m.pal.add([hex('#121014')]);
  m.box(0, 0, 4, 6, 3, (F) => {
    coat(F, fe, { seed: 110, fur: 0.4 });
    if (F.name === 'front') {
      F.u(0, 1, 1, 1, dark.at(0));
      F.u(3, 1, 1, 1, dark.at(0));
    }
    if (F.name === 'right' || F.name === 'left') F.u(1, 1, 1, 1, dark.at(0));
  });
  m.box(14, 0, 4, 2, 2, (F) => {
    F.fill(beak.at(1));
    if (F.side) F.u(0, 0, F.w, 1, beak.at(2));
    if (F.name === 'bottom') F.fill(beak.at(0));
  });
  m.box(14, 4, 2, 2, 2, (F) => {
    F.fill(wat.at(1));
    if (F.side) F.u(0, 1, F.w, 1, wat.at(0));
  });
  m.box(0, 9, 6, 8, 6, (F) => {
    coat(F, fe, { seed: 111, fur: 0.8 });
    if (F.name === 'back' || F.name === 'bottom') F.u(0, F.name === 'back' ? 6 : 0, F.w, 2, fe.at(fe.mid - 1));
  });
  m.box(24, 13, 1, 4, 6, (F) => {
    coat(F, fe, { seed: 112, fur: 0.4 });
    if (F.side && F.w > 1) F.u(0, 3, F.w, 1, fe.at(fe.mid - 1));
  });
  // legs: a thin shank on every side and splayed toes underneath
  m.box(26, 0, 3, 5, 3, (F) => {
    F.fill(-1);
    if (F.side) {
      F.u(1, 0, 1, 5, leg.at(1));
      F.u(0, 4, 3, 1, leg.at(0));
      if (P) F.f(2, 0, leg.at(2));
    } else if (F.name === 'bottom') F.stamp(0, 0, ['#.#', '.#.', '###'], { '#': leg.at(0) });
  });
  if (variant === 'cold') {
    const fl = m.pal.ramp(c.fluff, 3, { contrast: 0.3, hue: 20 });
    const fluff = (x0, y0, w, h) => fleece(m.face('front', x0, y0, w, h), fl, { seed: x0 + y0, gaps: 0.2 });
    fluff(44, 0, 16, 7);
    // ragged feather tips along the top edge
    m.rect(44, 0, 16, 1, (x) => (Math.floor(x / m.k) % 3 === 1 ? fl.at(2) : -1));
    fluff(38, 14, 10, 3);
    fluff(50, 25, 14, 7);
  }
  return m.toImage();
}

module.exports = {
  zombie,
  skeleton,
  creeper,
  spider: (st) => spider(st),
  spider_eyes: (st) => spider(st, true),
  enderman: (st) => enderman(st),
  enderman_eyes: (st) => enderman(st, true),
  cow,
  pig,
  sheep,
  sheep_fur: (st) => wool(st, 'fur'),
  sheep_undercoat: (st) => wool(st, 'undercoat'),
  chicken,
};

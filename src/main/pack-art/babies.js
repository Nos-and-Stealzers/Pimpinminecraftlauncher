// Baby mob textures for 26.1+, where babies got their own models and texture
// files. Box layouts (texOffs + box sizes) follow the game's baby models so
// the art lands on the right UV islands; the paint is original and uses the
// same colour ramps as the adult Pimpin mobs so a family looks related.
const { hex } = require('./lib');
const { Model, coat, fleece } = require('./model');

const K = (st) => (st === 'looks' ? 2 : 1);

// ------------------------------------------------------------- zombies --
const ZB = {
  zombie: { skin: '#5f9c58', shirt: '#2f8994', pants: '#4a3f8e', shoe: '#4a3b33', eye: '#b7e04a' },
  husk: { skin: '#a28d63', shirt: '#7d6a45', pants: '#5d4a33', shoe: '#3d3026', eye: '#e8d27a', wrap: '#cbbd94' },
  drowned: { skin: '#5ba59c', shirt: '#3f7c86', pants: '#465f72', shoe: '#2f3a3e', eye: '#7ff2ff' },
};
function zombieBaby(st, kind) {
  const c = ZB[kind];
  const m = new Model(64, 64, K(st));
  const skin = m.pal.ramp(c.skin, 5, { contrast: 0.5, hue: 18 });
  const shirt = m.pal.ramp(c.shirt, 5, { contrast: 0.5, hue: 16 });
  const pants = m.pal.ramp(c.pants, 5, { contrast: 0.5, hue: 14 });
  const shoe = m.pal.ramp(c.shoe, 3, { contrast: 0.4 });
  const dark = m.pal.add([hex('#120e18'), hex('#2b2232')]);
  const glow = m.pal.add([hex(c.eye), hex('#ffffff')]);
  const wrap = c.wrap ? m.pal.ramp(c.wrap, 3, { contrast: 0.35, hue: 16 }) : null;
  const S = skin.mid;
  // head 6×6×6
  m.box(3, 3, 6, 6, 6, (F) => {
    coat(F, skin, { seed: 3, fur: 0.2 });
    if (wrap && (F.side || F.name === 'top')) {
      F.u(0, 0, F.w, 2, (q, j) => wrap.at(j < F.k ? 2 : 1));
      if (F.name === 'top') F.fill(wrap.at(2));
    } else if (F.side) F.u(0, 0, F.w, 1, skin.at(S - 1));
    if (F.name !== 'front') return;
    F.u(1, 3, 1, 1, dark.at(0));
    F.u(4, 3, 1, 1, dark.at(0));
    if (F.P) {
      F.f(2, 6, glow.at(0));
      F.f(8, 6, glow.at(0));
    } else {
      F.u(1, 3, 1, 1, glow.at(0));
      F.u(4, 3, 1, 1, glow.at(0));
    }
    F.u(2, 5, 2, 1, dark.at(1));
  });
  // body 4×5×2
  m.box(16, 16, 4, 5, 2, (F) => {
    coat(F, shirt, { seed: 7, fur: 0.3 });
    if (F.side) F.u(0, 4, F.w, 1, pants.at(pants.mid));
    if (F.name === 'bottom') F.fill(pants.at(pants.mid - 1));
    if (F.name === 'front') F.u(1, 0, 2, 1, skin.at(S));
  });
  const arm = (F) => {
    coat(F, skin, { seed: 9, fur: 0.2 });
    if (F.side) F.u(0, 0, F.w, 2, shirt.at(shirt.mid));
    if (F.name === 'top') F.fill(shirt.at(shirt.mid + 1));
    if (wrap && F.side) F.u(0, 3, F.w, 1, wrap.at(1));
  };
  const leg = (F) => {
    coat(F, pants, { seed: 13, fur: 0.3 });
    if (F.side) F.u(0, 3, F.w, 1, shoe.at(1));
    if (F.name === 'bottom') F.fill(shoe.at(0));
  };
  m.box(36, 16, 2, 5, 2, arm);
  m.box(28, 16, 2, 5, 2, arm);
  m.box(8, 16, 2, 4, 2, leg);
  m.box(0, 16, 2, 4, 2, leg);
  return m.toImage();
}
/** Drowned baby outer layer: kelp on the head (outer head box) and shoulders. */
function drownedOuterBaby(st) {
  const m = new Model(64, 64, K(st));
  const kelp = m.pal.ramp('#4e8f3a', 4, { contrast: 0.5, hue: 18 });
  const strands = (F, lens) => {
    if (F.name === 'top') {
      for (let ux = 0; ux < F.w; ux += 2) F.u(ux, 0, 1, F.h, kelp.at(2 + (ux % 4 ? 0 : 1)));
      return;
    }
    if (!F.side) return;
    for (let ux = 0; ux < F.w; ux++) {
      const len = lens[(ux + F.name.length) % lens.length];
      if (len) F.u(ux, 0, 1, Math.min(len, F.h), (q, j) => kelp.at(j === 0 ? 3 : 1 + (ux % 2)));
    }
  };
  m.box(35, 3, 6, 6, 6, (F) => strands(F, [3, 0, 4, 2, 0, 5]));
  m.box(16, 16, 4, 5, 2, (F) => strands(F, [2, 0, 1, 0]));
  m.box(36, 16, 2, 5, 2, (F) => strands(F, [2, 0]));
  m.box(28, 16, 2, 5, 2, (F) => strands(F, [0, 2]));
  m.box(8, 16, 2, 4, 2, (F) => strands(F, [1, 0]));
  m.box(0, 16, 2, 4, 2, (F) => strands(F, [0, 1]));
  return m.toImage();
}

// ------------------------------------------------------------- villager --
function villagerBaby(st) {
  const m = new Model(64, 64, K(st));
  const skin = m.pal.ramp('#bd8d6c', 5, { contrast: 0.45, hue: 16 });
  const robe = m.pal.ramp('#6d4c34', 5, { contrast: 0.5, hue: 16 });
  const dark = m.pal.add([hex('#1a1216'), hex('#3a2a24'), hex('#f2efe6'), hex('#3f8f4a')]);
  const S = skin.mid;
  m.box(0, 0, 8, 8, 7, (F) => {
    coat(F, skin, { seed: 31, fur: 0.15 });
    if (F.name === 'top') F.fill(skin.at(S - 1));
    if (F.name !== 'front') return;
    F.u(1, 3, 6, 1, dark.at(1));
    F.u(1, 4, 2, 1, dark.at(2));
    F.u(5, 4, 2, 1, dark.at(2));
    F.u(2, 4, 1, 1, dark.at(3));
    F.u(5, 4, 1, 1, dark.at(3));
    F.u(3, 7, 2, 1, skin.at(S - 2));
  });
  m.box(23, 0, 2, 2, 1, (F) => {
    F.fill(skin.at(S));
    if (F.side) F.u(0, 1, F.w, 1, skin.at(S - 1));
  });
  const robeFace = (F) => {
    coat(F, robe, { seed: 33, fur: 0.4 });
    if (F.side) F.u(0, F.h - 1, F.w, 1, robe.at(robe.mid - 2));
  };
  m.box(0, 15, 4, 5, 3, robeFace);
  // (the robe skirt box at 16,21 is left clear like the game's own texture)
  const sleeve = (F) => {
    coat(F, robe, { seed: 35, fur: 0.3 });
    if (F.side) F.u(0, F.h - 1, F.w, 1, skin.at(S));
  };
  m.box(36, 15, 2, 4, 2, sleeve);
  m.box(16, 15, 2, 4, 2, sleeve);
  m.box(24, 17, 4, 2, 2, (F) => coat(F, skin, { seed: 37, fur: 0 }));
  const leg = (F) => {
    coat(F, robe, { seed: 39, fur: 0.2, lift: -1 });
    if (F.name === 'bottom') F.fill(dark.at(1));
  };
  m.box(8, 23, 2, 3, 2, leg);
  m.box(0, 23, 2, 3, 2, leg);
  return m.toImage();
}

// ---------------------------------------------------------- farm animals --
const COWS = {
  temperate: { hide: '#ece5d8', spot: '#3c2b24', muzzle: '#e3a49c', horn: '#d6cdbc', hoof: '#3a3130' },
  warm: { hide: '#9b4b2f', spot: '#6a2c1c', muzzle: '#d8a089', horn: '#4f4440', hoof: '#2e2422' },
  cold: { hide: '#8e6c4b', spot: '#5c432f', muzzle: '#a68e80', horn: '#bfb6a8', hoof: '#2e2826' },
};
function cowBaby(st, variant) {
  const c = COWS[variant];
  const m = new Model(64, 64, K(st));
  const hide = m.pal.ramp(c.hide, 5, { contrast: 0.45, hue: 16 });
  const spot = m.pal.ramp(c.spot, 3, { contrast: 0.4, hue: 14 });
  const muzzle = m.pal.ramp(c.muzzle, 3, { contrast: 0.4, hue: 14 });
  const horn = m.pal.ramp(c.horn, 3, { contrast: 0.35 });
  const hoof = m.pal.ramp(c.hoof, 2, { contrast: 0.3 });
  const dark = m.pal.add([hex('#16110f'), hex('#ffffff')]);
  const patch = (F, list) => {
    if (variant !== 'temperate') return;
    for (const [x, y, w, h] of list) if (x < F.w && y < F.h) F.u(x, y, Math.min(w, F.w - x), Math.min(h, F.h - y), spot.at(1));
  };
  m.box(0, 18, 6, 6, 5, (F) => {
    coat(F, hide, { seed: 41, fur: 0.3 });
    if (F.name === 'front') {
      F.u(1, 2, 1, 1, dark.at(0));
      F.u(4, 2, 1, 1, dark.at(0));
      if (F.P) {
        F.f(2, 4, dark.at(1));
        F.f(8, 4, dark.at(1));
      }
      patch(F, [[0, 0, 2, 2]]);
    }
    if (F.name === 'right') patch(F, [[2, 1, 2, 2]]);
  });
  m.box(8, 29, 1, 2, 1, (F) => F.fill(horn.at(F.name === 'top' ? 2 : 1)));
  m.box(4, 29, 1, 2, 1, (F) => F.fill(horn.at(F.name === 'top' ? 2 : 1)));
  m.box(12, 29, 4, 3, 1, (F) => {
    coat(F, muzzle, { seed: 43, fur: 0 });
    if (F.name === 'front') {
      F.u(0, 1, 1, 1, muzzle.at(0));
      F.u(3, 1, 1, 1, muzzle.at(0));
    }
  });
  m.box(0, 0, 8, 6, 12, (F) => {
    coat(F, hide, { seed: 45, fur: 0.4 });
    if (F.name === 'top') patch(F, [[1, 2, 3, 3], [5, 7, 2, 3]]);
    if (F.name === 'right') patch(F, [[2, 1, 4, 3], [8, 2, 3, 2]]);
    if (F.name === 'left') patch(F, [[5, 0, 4, 3], [1, 3, 2, 2]]);
    if (F.name === 'back') patch(F, [[2, 2, 3, 2]]);
  });
  const leg = (F) => {
    coat(F, hide, { seed: 47, fur: 0.2 });
    if (F.side) F.u(0, F.h - 1, F.w, 1, hoof.at(1));
    if (F.name === 'bottom') F.fill(hoof.at(0));
  };
  for (const [u, v] of [[22, 18], [34, 18], [22, 27], [34, 27]]) m.box(u, v, 3, 6, 3, leg);
  return m.toImage();
}

const PIGS = {
  temperate: { skin: '#eea19c', snout: '#e4847f' },
  warm: { skin: '#c8783f', snout: '#a75a2e', mud: '#6e4026' },
  cold: { skin: '#e6cfb4', snout: '#d39c8b', coat: '#f2e7d4' },
};
function pigBaby(st, variant) {
  const c = PIGS[variant];
  const m = new Model(32, 32, K(st));
  const skin = m.pal.ramp(c.skin, 5, { contrast: 0.42, hue: 16 });
  const snout = m.pal.ramp(c.snout, 3, { contrast: 0.4, hue: 14 });
  const mud = c.mud ? m.pal.ramp(c.mud, 2, { contrast: 0.3 }) : null;
  const fluff = c.coat ? m.pal.ramp(c.coat, 3, { contrast: 0.3 }) : null;
  const dark = m.pal.add([hex('#1c1214'), hex('#ffffff')]);
  m.box(0, 0, 7, 6, 9, (F) => {
    if (fluff) fleece(F, fluff);
    else coat(F, skin, { seed: 51, fur: 0.25 });
    if (mud && F.side) F.u(0, F.h - 2, F.w, 2, (q, j) => mud.at(j < F.k ? 1 : 0));
  });
  m.box(0, 15, 7, 6, 6, (F) => {
    coat(F, skin, { seed: 53, fur: 0.2 });
    if (F.name === 'front') {
      F.u(1, 2, 1, 1, dark.at(0));
      F.u(5, 2, 1, 1, dark.at(0));
      if (F.P) {
        F.f(2, 4, dark.at(1));
        F.f(10, 4, dark.at(1));
      }
    }
  });
  m.box(6, 27, 3, 2, 1, (F) => {
    coat(F, snout, { seed: 55, fur: 0 });
    if (F.name === 'front') {
      F.u(0, 1, 1, 1, snout.at(0));
      F.u(2, 1, 1, 1, snout.at(0));
    }
  });
  const leg = (F) => {
    coat(F, skin, { seed: 57, fur: 0, lift: -1 });
    if (F.name === 'bottom') F.fill(snout.at(0));
  };
  for (const [u, v] of [[0, 0], [23, 0], [0, 4], [23, 4]]) m.box(u, v, 2, 2, 2, leg);
  return m.toImage();
}

const CHICKENS = {
  temperate: { feather: '#f3e6a6', beak: '#f2b632', leg: '#f0a43a' },
  warm: { feather: '#d89a52', beak: '#f2c54a', leg: '#e8963a' },
  cold: { feather: '#c8ccd4', beak: '#e8b04a', leg: '#d89a4a' },
};
function chickenBaby(st, variant) {
  const c = CHICKENS[variant];
  const m = new Model(16, 16, K(st));
  const fe = m.pal.ramp(c.feather, 4, { contrast: 0.35, hue: 16 });
  const beak = m.pal.ramp(c.beak, 2, { contrast: 0.3 });
  const leg = m.pal.ramp(c.leg, 2, { contrast: 0.3 });
  const dark = m.pal.add([hex('#16110f')]);
  m.box(0, 0, 4, 4, 4, (F) => {
    coat(F, fe, { seed: 61, fur: 0 });
    if (F.name === 'front') {
      F.u(0, 1, 1, 1, dark.at(0));
      F.u(3, 1, 1, 1, dark.at(0));
    }
  });
  m.box(10, 8, 2, 1, 1, (F) => F.fill(beak.at(F.name === 'top' ? 1 : 0)));
  m.box(2, 2, 1, 2, 0, (F) => F.fill(leg.at(1)));
  m.box(0, 2, 1, 2, 0, (F) => F.fill(leg.at(1)));
  m.box(0, 1, 1, 0, 1, (F) => F.fill(leg.at(0)));
  m.box(0, 0, 1, 0, 1, (F) => F.fill(leg.at(0)));
  m.box(6, 8, 1, 0, 2, (F) => F.fill(fe.at(1)));
  m.box(4, 8, 1, 0, 2, (F) => F.fill(fe.at(1)));
  return m.toImage();
}

function sheepBaby(st) {
  const m = new Model(64, 32, K(st));
  const skin = m.pal.ramp('#d8c2ae', 5, { contrast: 0.4, hue: 16 });
  const dark = m.pal.add([hex('#1c1416'), hex('#ffffff'), hex('#e8a0a0')]);
  m.box(0, 0, 5, 5, 5, (F) => {
    coat(F, skin, { seed: 71, fur: 0.1 });
    if (F.name === 'front') {
      F.u(1, 2, 1, 1, dark.at(0));
      F.u(3, 2, 1, 1, dark.at(0));
      if (F.P) {
        F.f(2, 4, dark.at(1));
        F.f(6, 4, dark.at(1));
      }
      F.u(2, 4, 1, 1, dark.at(2));
    }
  });
  m.box(0, 10, 6, 4, 9, (F) => coat(F, skin, { seed: 73, fur: 0.2 }));
  const leg = (F) => {
    coat(F, skin, { seed: 75, fur: 0, lift: -1 });
    if (F.name === 'bottom') F.fill(skin.at(0));
  };
  for (const [u, v] of [[0, 23], [24, 12], [8, 23], [24, 5]]) m.box(u, v, 2, 5, 2, leg);
  return m.toImage();
}
/** Baby wool (grayscale-ish white, tinted by the sheep's dye colour in game). */
function sheepWoolBaby(st) {
  const m = new Model(64, 32, K(st));
  const wool = m.pal.ramp('#e9e9ec', 4, { contrast: 0.22, hue: 18, mid: 2 });
  m.box(0, 0, 5, 5, 5, (F) => {
    fleece(F, wool);
    if (F.name === 'front') F.u(0, 2, F.w, 3, -1); // a woolly fringe; keep the face free
  });
  m.box(0, 10, 6, 4, 9, (F) => fleece(F, wool));
  const legWool = (F) => {
    if (F.name === 'bottom') return;
    fleece(F, wool);
    if (F.side) F.u(0, 3, F.w, F.h - 3, -1);
  };
  for (const [u, v] of [[0, 23], [24, 12], [8, 23], [24, 5]]) m.box(u, v, 2, 5, 2, legWool);
  return m.toImage();
}

module.exports = { zombieBaby, drownedOuterBaby, villagerBaby, cowBaby, pigBaby, chickenBaby, sheepBaby, sheepWoolBaby };

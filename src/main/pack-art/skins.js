// Default player skins, Pimpin style. Every character is an original design on
// the standard 64×64 skin layout (with the second layer used sparingly for
// hair volume, caps, hoods and cuffs). Wide and slim (3 px arm) variants.
const { hex, mixc } = require('./lib');
const { Model, coat } = require('./model');

// Layout of a 64×64 skin: [base box, overlay box] per part.
const PARTS = {
  head: [[0, 0, 8, 8, 8], [32, 0, 8, 8, 8]],
  body: [[16, 16, 8, 12, 4], [16, 32, 8, 12, 4]],
  rarm: [[40, 16, 4, 12, 4], [40, 32, 4, 12, 4]],
  larm: [[32, 48, 4, 12, 4], [48, 48, 4, 12, 4]],
  rleg: [[0, 16, 4, 12, 4], [0, 32, 4, 12, 4]],
  lleg: [[16, 48, 4, 12, 4], [0, 48, 4, 12, 4]],
};

const CHARACTERS = {
  steve: { skin: '#c58b62', hair: '#3b2416', eyes: '#6a4bd8', hairStyle: 'short', top: '#6b3bcc', topStyle: 'hoodie', pants: '#2b3348', shoes: '#ececec', accent: '#f5c542', chain: true, stubble: true },
  alex: { skin: '#efc39d', hair: '#cf5f28', eyes: '#2f9a5c', hairStyle: 'ponytail', top: '#1f9b92', topStyle: 'jacket', inner: '#f2efe8', pants: '#80603d', shoes: '#4a3326', accent: '#e8e2d2' },
  ari: { skin: '#e2b088', hair: '#2b1c16', eyes: '#3a6fd0', hairStyle: 'bun', top: '#e0577a', topStyle: 'tee', pants: '#3d4a9c', shoes: '#f2f2f2', accent: '#ffffff' },
  efe: { skin: '#7b4a2e', hair: '#151013', eyes: '#3b2414', hairStyle: 'curly', top: '#f2b432', topStyle: 'tee', pants: '#30343d', shoes: '#d84a3a', accent: '#ffffff' },
  kai: { skin: '#d4a078', hair: '#17131b', eyes: '#2b2b35', hairStyle: 'cap', cap: '#c8323a', top: '#3a7ad4', topStyle: 'jacket', inner: '#202028', pants: '#2a2a31', shoes: '#f2f2f2', accent: '#f2f2f2' },
  makena: { skin: '#5b3525', hair: '#1c1414', eyes: '#3b2414', hairStyle: 'braids', top: '#2ea86a', topStyle: 'tee', pants: '#4b3a6c', shoes: '#efe5d6', accent: '#f5c542' },
  noor: { skin: '#c99870', hair: '#4e3326', eyes: '#3b6b3a', hairStyle: 'long', top: '#8b4fc9', topStyle: 'hoodie', pants: '#2c3a4b', shoes: '#2a2a2e', accent: '#f0d9ff' },
  sunny: { skin: '#f1c7a6', hair: '#e7c35a', eyes: '#2f7fd8', hairStyle: 'spiky', top: '#ff8a3a', topStyle: 'hoodie', pants: '#3a6aa8', shoes: '#ffffff', accent: '#ffffff' },
  zuri: { skin: '#8a5535', hair: '#2a1a14', eyes: '#3b2414', hairStyle: 'puff', top: '#d23c6e', topStyle: 'tee', pants: '#3a2f2a', shoes: '#f5c542', accent: '#f5c542', chain: true },
};

// hair coverage: [front fringe rows (string per row), side rows, back rows]
const HAIR = {
  short: { fringe: ['hhhhhhhh', 'hhhh.hhh', 'h......h'], side: 3, back: 6 },
  spiky: { fringe: ['hhhhhhhh', 'h.hh.hh.', '.h..h...'], side: 2, back: 5 },
  ponytail: { fringe: ['hhhhhhhh', 'hhhhhh..', 'hhh.....'], side: 4, back: 6, frame: true },
  bun: { fringe: ['hhhhhhhh', 'h.hhhh.h', 'h......h'], side: 3, back: 6 },
  curly: { fringe: ['hhhhhhhh', 'hhhhhhhh', 'h.h..h.h'], side: 3, back: 6 },
  cap: { fringe: ['hhhhhhhh', 'h......h', '........'], side: 2, back: 5 },
  braids: { fringe: ['hhhhhhhh', 'hhh..hhh', 'h......h'], side: 8, back: 8, frame: true, stripes: true },
  long: { fringe: ['hhhhhhhh', 'hhhhh.hh', 'hh.....h'], side: 8, back: 8, frame: true },
  puff: { fringe: ['hhhhhhhh', 'hhhhhhhh', 'h......h'], side: 3, back: 6 },
};

function skin(name, slim = false) {
  const c = CHARACTERS[name];
  const hs = HAIR[c.hairStyle];
  const m = new Model(64, 64, 1);
  const sk = m.pal.ramp(c.skin, 5, { contrast: 0.36, hue: 14 });
  const hr = m.pal.ramp(c.hair, 4, { contrast: 0.5, hue: 16, mid: 1 });
  const top = m.pal.ramp(c.top, 5, { contrast: 0.45, hue: 16 });
  const inner = m.pal.ramp(c.inner || c.top, 3, { contrast: 0.3 });
  const pants = m.pal.ramp(c.pants, 4, { contrast: 0.45, hue: 14 });
  const shoe = m.pal.ramp(c.shoes, 3, { contrast: 0.3, hue: 12, mid: 1 });
  const acc = m.pal.ramp(c.accent, 3, { contrast: 0.4, hue: 18 });
  const cap = m.pal.ramp(c.cap || c.top, 3, { contrast: 0.4 });
  const eyes = m.pal.add([hex('#f4f2ee'), hex(c.eyes), mixc(hex(c.eyes), [10, 8, 20, 255], 0.5)]);
  const lip = m.pal.add([mixc(hex(c.skin), [150, 50, 60, 255], 0.35)]);
  const S = sk.mid;
  const H = hr.mid;
  const aw = slim ? 3 : 4;

  // --------------------------------------------------------------- head --
  m.box(...PARTS.head[0], (F) => {
    coat(F, sk, { fur: 0, shadow: F.name !== 'front' });
    if (F.name === 'top') {
      F.fill(hr.at(H));
      F.u(2, 2, 3, 1, hr.at(H + 1));
      F.u(5, 5, 2, 1, hr.at(H + 1));
      return;
    }
    if (F.name === 'bottom') return;
    if (F.name === 'front') {
      hs.fringe.forEach((row, y) => [...row].forEach((ch, x) => ch === 'h' && F.u(x, y, 1, 1, hr.at(y === 0 ? H : y === hs.fringe.length - 1 ? H - 1 : H))));
      if (hs.frame) for (let y = 2; y < 7; y++) {
        F.u(0, y, 1, 1, hr.at(H - 1));
        F.u(7, y, 1, 1, hr.at(H - 1));
      }
      // brows, eyes, nose, mouth
      F.u(1, 3, 2, 1, hr.at(0));
      F.u(5, 3, 2, 1, hr.at(0));
      F.u(1, 4, 1, 1, eyes.at(0));
      F.u(2, 4, 1, 1, eyes.at(1));
      F.u(5, 4, 1, 1, eyes.at(1));
      F.u(6, 4, 1, 1, eyes.at(0));
      F.u(3, 5, 2, 1, sk.at(S - 1));
      F.u(3, 4, 1, 1, sk.at(S + 1));
      F.u(3, 6, 2, 1, lip.at(0));
      F.u(2, 6, 1, 1, sk.at(S - 1));
      F.u(5, 6, 1, 1, sk.at(S - 1));
      if (c.stubble) {
        F.u(1, 7, 6, 1, sk.at(S - 2));
        F.u(2, 6, 1, 1, sk.at(S - 2));
        F.u(5, 6, 1, 1, sk.at(S - 2));
      } else F.u(1, 7, 6, 1, sk.at(S - 1));
      return;
    }
    // sides & back
    const rows = F.name === 'back' ? hs.back : hs.side;
    for (let y = 0; y < Math.min(8, rows); y++) {
      F.u(0, y, 8, 1, (x) => {
        if (hs.stripes) return hr.at(x % 2 ? H - 1 : H);
        return hr.at(y === rows - 1 ? H - 1 : H);
      });
    }
    if (F.name === 'right') F.u(7, rows, 1, 1, hr.at(H - 1));
    if (F.name === 'left') F.u(0, rows, 1, 1, hr.at(H - 1));
    if (F.name !== 'back' && rows < 6) {
      // ear
      const ex = F.name === 'right' ? 4 : 3;
      F.u(ex, 4, 1, 2, sk.at(S - 1));
    }
  });

  // hat layer: only where the style needs volume
  m.box(...PARTS.head[1], (F) => {
    F.fill(-1);
    const style = c.hairStyle;
    if (style === 'cap') {
      if (F.name === 'top') F.fill(cap.at(1));
      if (F.side) F.u(0, 0, 8, 2, (x, y) => cap.at(y === 0 ? 2 : 1));
      if (F.name === 'front') {
        F.u(0, 2, 8, 1, cap.at(0));
        F.u(3, 0, 2, 1, acc.at(2));
      }
      if (F.name === 'back') F.u(3, 1, 2, 1, -1);
    }
    if (style === 'curly' || style === 'puff') {
      const rows = style === 'puff' ? 3 : 2;
      if (F.name === 'top') F.fill((x, y) => hr.at((x + y) % 3 ? H : H + 1));
      if (F.side) F.u(0, 0, 8, rows, (x, y) => ((x + y * 2) % 5 === 4 && y === rows - 1 ? -1 : hr.at((x + y) % 3 ? H : H + 1)));
      if (F.name === 'front') F.u(1, rows, 6, 1, -1);
    }
    if (style === 'bun' && F.name === 'back') F.stamp(2, 0, ['.aa.', 'abba', '.aa.'], { a: hr.at(H), b: hr.at(H + 1) });
    if (style === 'ponytail' && F.name === 'back') {
      F.stamp(3, 3, ['ab', 'aa', 'ab', 'aa', '.a'], { a: hr.at(H), b: hr.at(H + 1) });
      F.u(3, 2, 2, 1, acc.at(1));
    }
    if (style === 'spiky' && F.name === 'top') F.fill((x, y) => ((x + y) % 3 === 0 ? hr.at(H + 1) : -1));
  });

  // --------------------------------------------------------------- body --
  m.box(...PARTS.body[0], (F) => {
    coat(F, top, { fur: 0 });
    if (F.name === 'bottom') return F.fill(pants.at(1));
    if (F.side) {
      F.u(0, 11, F.w, 1, pants.at(1));
      F.u(0, 10, F.w, 1, top.at(top.mid - 1));
    }
    if (F.name === 'front') {
      if (c.topStyle === 'jacket') {
        F.u(2, 0, 4, 10, inner.at(1));
        F.u(2, 0, 1, 10, top.at(top.mid - 1));
        F.u(5, 0, 1, 10, top.at(top.mid - 1));
        F.u(3, 0, 2, 1, sk.at(S));
        F.u(1, 7, 1, 1, top.at(top.mid - 1));
      } else if (c.topStyle === 'hoodie') {
        F.u(2, 0, 4, 1, top.at(top.mid - 1));
        F.u(3, 0, 2, 1, sk.at(S - 1));
        F.u(3, 1, 1, 3, acc.at(1));
        F.u(4, 1, 1, 2, acc.at(1));
        F.u(2, 6, 4, 1, top.at(top.mid - 1));
        F.u(2, 7, 4, 2, top.at(top.mid + 1));
        F.u(2, 9, 4, 1, top.at(top.mid - 1));
      } else {
        F.u(3, 0, 2, 1, sk.at(S));
        F.u(2, 0, 1, 1, top.at(top.mid - 1));
        F.u(5, 0, 1, 1, top.at(top.mid - 1));
        F.u(1, 4, 1, 3, top.at(top.mid - 1));
      }
      if (c.chain) {
        F.stamp(2, 1, ['a..a', 'a..a', '.ab.', '.cc.'], { a: acc.at(1), b: acc.at(2), c: acc.at(1) });
      }
      F.u(0, 11, 8, 1, pants.at(0));
      F.u(3, 11, 2, 1, acc.at(1));
    }
    if (F.name === 'back' && c.topStyle === 'hoodie') {
      F.u(1, 0, 6, 3, top.at(top.mid + 1));
      F.u(2, 3, 4, 1, top.at(top.mid - 1));
    }
  });
  if (c.topStyle === 'hoodie') {
    // the hood gets a little depth on the jacket layer
    m.box(...PARTS.body[1], (F) => {
      F.fill(-1);
      if (F.name === 'back') F.u(1, 0, 6, 2, (x, y) => top.at(top.mid + (y ? 0 : 1)));
      if (F.name === 'top') F.u(0, 2, 8, 2, top.at(top.mid + 1));
    });
  }

  // --------------------------------------------------------------- arms --
  const sleeve = c.topStyle === 'tee' ? 4 : 11;
  const arm = (F) => {
    coat(F, top, { fur: 0, shadow: false });
    if (F.name === 'bottom') return F.fill(sk.at(S - 1));
    if (!F.side) return;
    F.u(0, sleeve, F.w, 12 - sleeve, sk.at(S));
    F.u(0, sleeve - 1, F.w, 1, c.topStyle === 'jacket' ? acc.at(1) : top.at(top.mid - 1));
    F.u(0, 11, F.w, 1, sk.at(S - 1));
    if (sleeve > 4) F.u(0, 5, F.w, 1, top.at(top.mid - 1));
  };
  m.box(40, 16, aw, 12, 4, arm);
  m.box(32, 48, aw, 12, 4, arm);
  if (c.topStyle === 'jacket') {
    // rolled cuffs on the sleeve layer
    const cuff = (F) => {
      F.fill(-1);
      if (F.side) F.u(0, 8, F.w, 2, (x, y) => top.at(top.mid + (y ? -1 : 1)));
    };
    m.box(40, 32, aw, 12, 4, cuff);
    m.box(48, 48, aw, 12, 4, cuff);
  }

  // --------------------------------------------------------------- legs --
  const leg = (F) => {
    coat(F, pants, { fur: 0, shadow: false });
    if (F.name === 'bottom') return F.fill(shoe.at(0));
    if (!F.side) return;
    F.u(0, 10, F.w, 1, shoe.at(1));
    F.u(0, 11, F.w, 1, shoe.at(0));
    F.u(0, 9, F.w, 1, pants.at(0));
    if (F.name === 'front') {
      F.u(1, 10, 2, 1, shoe.at(2));
    }
  };
  m.box(0, 16, 4, 12, 4, leg);
  m.box(16, 48, 4, 12, 4, leg);
  return m.toImage();
}

const SKIN_NAMES = Object.keys(CHARACTERS);

module.exports = { skin, SKIN_NAMES, CHARACTERS };

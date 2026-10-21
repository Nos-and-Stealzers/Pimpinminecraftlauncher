// Original characters. UV painting shares the pack's box tools, not its skins.
const { Model, coat } = require('./pack-art/model');

const CHARACTERS = [
  { id: 'explorer', name: 'Moss, the explorer', outfit: 'Explorer', model: 'classic', description: 'Ochre field jacket, sea-green scarf and a strapped trail pack.', skin: '#bd815d', hair: '#382d2b', top: '#c79949', pants: '#384e51', boots: '#594135', accent: '#5ac4b5' },
  { id: 'mechanic', name: 'Rivet, the mechanic', outfit: 'Mechanic', model: 'classic', description: 'Indigo overalls, copper goggles and a well-stocked tool belt.', skin: '#815039', hair: '#231e28', top: '#537593', pants: '#343e5e', boots: '#302e38', accent: '#e9a55f' },
  { id: 'ranger', name: 'Fern, the ranger', outfit: 'Ranger', model: 'slim', description: 'Pine cloak, auburn braid and a brass leaf clasp.', skin: '#dca582', hair: '#9b4e35', top: '#496d53', pants: '#4b4144', boots: '#493329', accent: '#dbc878' },
  { id: 'hoodie', name: 'Plum, off duty', outfit: 'Cozy hoodie', model: 'slim', description: 'Lilac knit, cream drawstrings and mint-soled sneakers.', skin: '#764936', hair: '#302832', top: '#a18db7', pants: '#414555', boots: '#e5ded3', accent: '#9fd3c0' },
  { id: 'astronaut', name: 'Orbit, the astronaut', outfit: 'Astronaut', model: 'classic', description: 'Ivory pressure suit, amber visor and coral mission stripes.', skin: '#b77a55', hair: '#3b3030', top: '#d9e1dd', pants: '#aebec0', boots: '#536478', accent: '#e77e60' },
  { id: 'knight', name: 'Flint, the knight', outfit: 'Knight', model: 'classic', description: 'Blue-steel plate, burgundy tabard and a golden sun crest.', skin: '#c99a7c', hair: '#4c3b34', top: '#849eaf', pants: '#4d657a', boots: '#354857', accent: '#d6ba69' },
];

function skin(id) {
  const c = CHARACTERS.find((entry) => entry.id === id);
  if (!c) throw new Error('Unknown wardrobe character');
  const m = new Model(64, 64);
  const ramp = (color) => m.pal.ramp(color, 5, { contrast: 0.32, hue: 8 });
  const skinTone = ramp(c.skin), hair = ramp(c.hair), cloth = ramp(c.top);
  const pants = ramp(c.pants), boot = ramp(c.boots), accent = ramp(c.accent);
  const dark = ramp('#273342'), cream = ramp('#eee6d1'), red = ramp('#8f4050');
  const aw = c.model === 'slim' ? 3 : 4;
  const base = (face, material) => coat(face, material, { fur: 0 });
  const line = (f, x, y, w, h, color, level = 2) => f.u(x, y, w, h, color.at(level));

  m.box(0, 0, 8, 8, 8, (f) => {
    base(f, skinTone);
    if (f.name === 'top' || f.name === 'back') return base(f, hair);
    if (f.name === 'bottom') return;
    line(f, 0, 0, 8, 2, hair);
    if (f.name !== 'front') {
      line(f, 0, 2, 8, 1, hair, 1);
      line(f, f.name === 'left' ? 0 : 7, 3, 1, 2, hair);
      return;
    }
    f.stamp(0, 2, c.id === 'hoodie' ? ['hh....hh', 'h......h'] : ['hh.h...h'], { h: hair.at(2) });
    line(f, 1, 4, 2, 1, cream, 3); line(f, 5, 4, 2, 1, cream, 3);
    line(f, 2, 4, 1, 1, dark); line(f, 5, 4, 1, 1, dark);
    line(f, 3, 5, 2, 1, skinTone, 1);
    line(f, 3, 6, 2, 1, skinTone, 0);
    if (c.id === 'mechanic') line(f, 1, 7, 6, 1, hair, 1);
  });
  m.box(32, 0, 8, 8, 8, (f) => {
    if (c.id === 'astronaut') {
      base(f, cloth);
      if (f.name === 'front') {
        line(f, 0, 1, 8, 6, dark);
        line(f, 1, 2, 6, 4, accent, 1);
        line(f, 1, 2, 5, 1, cream, 3);
        line(f, 1, 3, 1, 2, accent, 4);
        line(f, 6, 5, 1, 1, dark, 1);
      } else if (f.side) line(f, 2, 3, 4, 2, accent);
    } else if (c.id === 'knight') {
      base(f, cloth);
      if (f.name === 'front') {
        line(f, 1, 2, 6, 5, dark, 0);
        line(f, 1, 3, 6, 1, dark, 1);
        line(f, 3, 0, 2, 8, cloth, 4);
        line(f, 1, 5, 1, 2, cloth); line(f, 6, 5, 1, 2, cloth);
      }
      if (f.name === 'top') line(f, 3, 0, 2, 8, accent);
    } else if (c.id === 'ranger') {
      if (f.name === 'top' || f.name === 'back') base(f, cloth);
      if (f.name === 'left' || f.name === 'right') {
        base(f, cloth); line(f, f.name === 'left' ? 0 : 6, 2, 2, 6, hair);
      }
      if (f.name === 'front') {
        line(f, 0, 0, 8, 1, cloth); line(f, 0, 1, 1, 7, cloth); line(f, 7, 1, 1, 7, cloth);
      }
      if (f.name === 'back') {
        line(f, 3, 2, 2, 6, hair); line(f, 3, 6, 2, 1, accent);
      }
    } else if (c.id === 'mechanic') {
      if (f.side) line(f, 0, 2, 8, 1, dark);
      if (f.name === 'front') {
        line(f, 0, 0, 8, 2, accent, 1);
        line(f, 1, 0, 2, 2, dark); line(f, 5, 0, 2, 2, dark);
        line(f, 1, 0, 1, 1, cream, 3); line(f, 5, 0, 1, 1, cream, 3);
      }
    } else {
      if (f.name === 'top') base(f, hair);
      if (f.name === 'back') line(f, 0, 0, 8, c.id === 'hoodie' ? 5 : 3, hair);
      if (f.name === 'front') {
        f.stamp(0, 0, ['hhhhhhhh', 'hhh..hhh', '.h....h.'], { h: hair.at(2) });
      }
    }
  });

  m.box(16, 16, 8, 12, 4, (f) => {
    base(f, cloth);
    if (!f.side) return;
    line(f, 0, 11, f.w, 1, pants, 0);
    if (f.name === 'front') {
      if (c.id === 'explorer') {
        line(f, 3, 1, 2, 9, cream, 1);
        line(f, 0, 1, 8, 2, accent); line(f, 5, 3, 2, 4, accent, 1);
        line(f, 1, 6, 2, 3, cloth, 1); line(f, 5, 8, 2, 2, cloth, 1);
      } else if (c.id === 'mechanic') {
        line(f, 1, 0, 1, 5, pants); line(f, 6, 0, 1, 5, pants);
        line(f, 1, 4, 6, 7, pants); line(f, 2, 5, 4, 3, pants, 3);
        line(f, 1, 3, 1, 1, accent); line(f, 6, 3, 1, 1, accent);
        line(f, 0, 9, 8, 2, boot); line(f, 5, 8, 1, 3, cream); line(f, 6, 9, 1, 2, accent);
      } else if (c.id === 'ranger') {
        for (let y = 0; y < 9; y++) line(f, Math.min(7, y), y, 1, 1, boot);
        line(f, 0, 0, 8, 2, cloth, 1); line(f, 3, 1, 2, 1, accent);
        line(f, 0, 9, 8, 1, boot); line(f, 5, 9, 2, 1, accent);
      } else if (c.id === 'hoodie') {
        line(f, 2, 0, 4, 1, cloth, 0);
        line(f, 2, 1, 1, 4, cream); line(f, 5, 1, 1, 3, cream);
        line(f, 1, 7, 6, 3, cloth, 1); line(f, 2, 7, 4, 1, cloth, 3);
        line(f, 0, 11, 8, 1, accent);
      } else if (c.id === 'astronaut') {
        line(f, 1, 3, 6, 5, dark); line(f, 2, 4, 4, 2, pants);
        line(f, 2, 4, 1, 1, accent); line(f, 4, 6, 1, 1, accent);
        line(f, 0, 9, 8, 2, accent);
      } else {
        line(f, 2, 0, 4, 11, red); line(f, 0, 0, 8, 1, cloth, 4);
        f.stamp(2, 3, ['.aa.', 'aaaa', '.aa.', '.aa.'], { a: accent.at(2) });
        line(f, 0, 10, 8, 1, boot); line(f, 3, 10, 2, 1, accent);
      }
    }
    if (f.name === 'back') {
      if (c.id === 'explorer' || c.id === 'astronaut') {
        line(f, 1, 2, 6, 8, c.id === 'explorer' ? boot : dark);
        line(f, 2, 3, 4, 4, c.id === 'explorer' ? cloth : pants);
        line(f, 1, 7, 6, 1, accent);
      }
      if (c.id === 'ranger') {
        line(f, 0, 0, 8, 10, cloth, 1); line(f, 2, 1, 4, 8, cloth);
        line(f, 0, 10, 8, 1, accent, 1);
      }
      if (c.id === 'hoodie') { line(f, 1, 0, 6, 3, cloth, 1); line(f, 2, 0, 4, 2, cloth, 3); }
      if (c.id === 'mechanic') { line(f, 1, 0, 1, 10, pants); line(f, 6, 0, 1, 10, pants); line(f, 0, 9, 8, 2, boot); }
      if (c.id === 'knight') line(f, 2, 0, 4, 11, red);
    }
  });
  m.box(16, 32, 8, 12, 4, (f) => {
    if (f.name === 'back' && ['explorer', 'astronaut', 'hoodie'].includes(c.id)) {
      line(f, 1, 1, 6, c.id === 'hoodie' ? 2 : 8, c.id === 'explorer' ? boot : cloth);
      if (c.id !== 'hoodie') line(f, 2, 4, 4, 1, accent);
    }
  });
  for (const [u, v, ou, ov] of [[40, 16, 40, 32], [32, 48, 48, 48]]) {
    m.box(u, v, aw, 12, 4, (f) => {
      base(f, cloth);
      if (f.name === 'bottom') return base(f, ['astronaut', 'knight'].includes(c.id) ? boot : skinTone);
      if (!f.side) return;
      line(f, 0, 10, f.w, 2, ['astronaut', 'knight'].includes(c.id) ? boot : skinTone);
      line(f, 0, c.id === 'mechanic' ? 6 : 9, f.w, 1, accent);
      if (c.id === 'mechanic') line(f, 0, 7, f.w, 3, skinTone);
      if (c.id === 'knight') { line(f, 0, 0, f.w, 3, cloth, 3); line(f, 0, 6, f.w, 1, cloth, 0); }
    });
    m.box(ou, ov, aw, 12, 4, (f) => {
      if (f.side && ['knight', 'mechanic'].includes(c.id)) line(f, 0, c.id === 'knight' ? 0 : 5, f.w, 2, cloth, 3);
    });
  }
  for (const [u, v] of [[0, 16], [16, 48]]) {
    m.box(u, v, 4, 12, 4, (f) => {
      base(f, pants);
      if (f.name === 'bottom') return base(f, boot);
      if (!f.side) return;
      line(f, 0, 8, f.w, 4, boot);
      line(f, 0, 11, f.w, 1, c.id === 'hoodie' ? accent : boot, 0);
      if (f.name === 'front') {
        line(f, 1, 1, 2, 5, pants, 3);
        line(f, 1, 9, 2, 1, c.id === 'hoodie' ? cream : boot, 3);
        if (c.id === 'astronaut') line(f, 0, 6, 4, 2, accent);
        if (c.id === 'knight') { line(f, 0, 5, 4, 2, cloth); line(f, 1, 5, 2, 1, cloth, 4); }
      }
    });
  }
  return m.toImage();
}

module.exports = { CHARACTERS, skin };

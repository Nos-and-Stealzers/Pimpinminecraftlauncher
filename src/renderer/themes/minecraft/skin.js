// Home skin extras for the Minecraft style: poses, idle turning and a
// grass-block stand. Hooks into the shared CSS-3D model from js/skin3d.js;
// wardrobe previews are left alone.
import { onSkinMount } from '../../js/skin3d.js';
import { texUrl } from './textures.js';

let cfg = { pose: 'idle', turn: 'sway', pedestal: 'grass', reduced: false };
let unhook = null;

const homeStages = () => [...document.querySelectorAll('.home-skin .mc-stage')].filter(s => s.pimpinSkin);

function cube(S, w, h, d, faces) {
  const box = document.createElement('div');
  box.className = 'mc-pedestal';
  Object.assign(box.style, { width: `${w}px`, height: `${h}px`, left: `${-(w - 16 * S) / 2}px`, top: `${32 * S}px` });
  const face = (cls, fw, fh, img, transform, pos = '0 0') => {
    const f = document.createElement('i');
    f.className = `pf ${cls}`;
    Object.assign(f.style, { width: `${fw}px`, height: `${fh}px`, left: `${(w - fw) / 2}px`, top: `${(h - fh) / 2}px`, transform, backgroundImage: `url("${img}")`, backgroundSize: `${16 * S}px ${16 * S}px`, backgroundPosition: pos });
    box.append(f);
  };
  face('top', w, d, faces.top, `rotateX(90deg) translateZ(${h / 2}px)`);
  for (const [cls, rot] of [['front', 0], ['right', 90], ['back', 180], ['left', 270]]) {
    face(cls, cls === 'front' || cls === 'back' ? w : d, h, faces.side, `rotateY(${rot}deg) translateZ(${(cls === 'front' || cls === 'back' ? d : w) / 2}px)`);
  }
  return box;
}

function decorate(ctl) {
  const { stage, model, spin, scale: S } = ctl;
  if (!stage.closest('.home-skin')) return;
  for (const c of [...model.classList]) if (c.startsWith('pose-')) model.classList.remove(c);
  model.classList.add(`pose-${cfg.pose}`);
  model.style.setProperty('--s', `${S}px`);
  stage.classList.toggle('mc-on-stand', cfg.pedestal === 'grass');
  spin.querySelector('.mc-pedestal')?.remove();
  if (cfg.pedestal === 'grass') {
    // a thin grass slab: wide enough for both feet, short enough to fit the card
    const w = 16 * S;
    spin.append(cube(S, w, 6 * S, w, { top: texUrl('grass_top'), side: texUrl('grass_side') }));
  }
  const base = -25;
  ctl.setIdleTurn(cfg.reduced || cfg.turn === 'still' ? null
    : cfg.turn === 'spin' ? (t, yaw) => yaw + 0.25
      : (t, yaw) => yaw + ((base + Math.sin(t / 2600) * 24) - yaw) * 0.03);
}

function undecorate(ctl) {
  const { stage, model, spin } = ctl;
  for (const c of [...model.classList]) if (c.startsWith('pose-')) model.classList.remove(c);
  stage.classList.remove('mc-on-stand');
  spin.querySelector('.mc-pedestal')?.remove();
  ctl.setIdleTurn(null);
}

export function updateSkin(next) {
  cfg = { ...cfg, ...next };
  if (!unhook) unhook = onSkinMount(decorate);
  for (const stage of homeStages()) decorate(stage.pimpinSkin);
}

export function removeSkin() {
  unhook?.();
  unhook = null;
  for (const stage of homeStages()) undecorate(stage.pimpinSkin);
}

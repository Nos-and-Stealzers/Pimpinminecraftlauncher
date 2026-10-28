// Block icons for the sidebar and instance icons, plus the optional card
// tilt. Both decorate existing launcher DOM and undo themselves completely.
import { blockIconUrl } from './textures.js';

const SIDE = { Home: 'grass', Library: 'bookshelf', Instances: 'crafting', Servers: 'furnace', Wardrobe: 'chest', Settings: 'command' };
const HOME_BY_PRESET = { overworld: 'grass', nether: 'nylium', end: 'endstone' };
const INSTANCE = { violet: 'amethyst', crimson: 'redstone', emerald: 'emerald', ocean: 'diamond', gold: 'gold', grass: 'grass', night: 'night', pack: 'bookshelf' };

let observer = null;
let queued = 0;
let preset = 'overworld';

const img = (kind) => {
  const node = document.createElement('img');
  node.className = 'mc-block-ico';
  node.alt = '';
  node.decoding = 'async';
  node.draggable = false;
  node.src = blockIconUrl(kind);
  node.dataset.kind = kind;
  return node;
};

function decorate() {
  queued = 0;
  for (const item of document.querySelectorAll('.side-item:not([data-mc-block])')) {
    const kind = item.getAttribute('aria-label') === 'Home' ? HOME_BY_PRESET[preset] : SIDE[item.getAttribute('aria-label')];
    if (!kind) continue;
    item.dataset.mcBlock = kind;
    item.prepend(img(kind));
  }
  for (const icon of document.querySelectorAll('.inst-icon:not([data-mc-block])')) {
    if (icon.querySelector('img')) { icon.dataset.mcBlock = 'image'; continue; }
    const key = [...icon.classList].find(c => c.startsWith('ic-'))?.slice(3);
    const kind = INSTANCE[key] || 'grass';
    icon.dataset.mcBlock = kind;
    icon.append(img(kind));
  }
}

const schedule = () => { if (!queued) queued = requestAnimationFrame(decorate); };

export function enableBlocks(nextPreset) {
  if (nextPreset !== preset) { preset = nextPreset; undecorate(); }
  if (!observer) {
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  decorate();
}

function undecorate() {
  for (const node of document.querySelectorAll('.mc-block-ico')) node.remove();
  for (const node of document.querySelectorAll('[data-mc-block]')) delete node.dataset.mcBlock;
}

export function disableBlocks() {
  observer?.disconnect();
  observer = null;
  if (queued) cancelAnimationFrame(queued);
  queued = 0;
  undecorate();
}

// ------------------------------------------------------------------ tilt --
const TILT = '.inst-card, .tile, .feature, .card.news, .proj';
let tiltCard = null;
let tiltOn = false;
const reset = (card) => { card.style.transform = ''; card.classList.remove('mc-tilting'); };
function onMove(e) {
  if (document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const card = e.target.closest?.(TILT) || null;
  if (tiltCard && tiltCard !== card) reset(tiltCard);
  tiltCard = card;
  if (!card) return;
  const r = card.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  const max = r.width > 360 ? 2 : 4;
  card.classList.add('mc-tilting');
  card.style.transform = `perspective(700px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
}
const onLeave = () => { if (tiltCard) reset(tiltCard); tiltCard = null; };

export function setTilt(on) {
  if (on === tiltOn) return;
  tiltOn = on;
  if (on) {
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
  } else {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    onLeave();
  }
}

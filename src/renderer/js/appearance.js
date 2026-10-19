// Applies the look & feel settings: UI style, font, background, accent,
// corners, scale, animations and the optional Minecraft-style click sound.
import { el } from './dom.js';
import { api, state } from './state.js';
import { panorama } from './panorama.js';
import { installTextureVars } from './textures.js';

export const PRESETS = {
  modern: { uiStyle: 'modern', font: 'default', background: 'glow', accent: 'violet', corners: 'round', blockIcons: false, skinPedestal: 'glow' },
  og: { uiStyle: 'classic', font: 'pixel', background: 'panorama', accent: 'grass', corners: 'sharp', blockIcons: true, skinPedestal: 'block', uiSounds: true },
  nether: { uiStyle: 'classic', font: 'pixel', background: 'nether', accent: 'redstone', corners: 'sharp', blockIcons: true, skinPedestal: 'block', uiSounds: true },
  end: { uiStyle: 'modern', font: 'default', background: 'end', accent: 'amethyst', corners: 'round', blockIcons: true, skinPedestal: 'glow' },
};

let current = {};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  return m ? m[1] : null;
}

function renderBackdrop(kind) {
  const root = document.querySelector('.backdrop');
  root.querySelector('.panorama')?.remove();
  root.dataset.bg = kind;
  if (kind === 'panorama') root.prepend(panorama());
}

export function applyAppearance(s = state.settings) {
  if (!s) return;
  const b = document.body;
  b.dataset.accent = s.accent || 'violet';
  b.dataset.style = s.uiStyle || 'modern';
  b.dataset.font = s.font || 'default';
  b.classList.toggle('sharp', s.corners === 'sharp');
  b.classList.toggle('no-anim', s.animations === false);
  b.classList.toggle('no3d', s.effects3d === false);
  b.classList.toggle('block-icons', Boolean(s.blockIcons));
  b.classList.toggle('no-blur', s.blur === false);
  const custom = s.accent === 'custom';
  for (const [k, v] of [['--a1', s.customA1], ['--a2', s.customA2], ['--a3', s.customA2]]) {
    if (custom && hexToRgb(v)) b.style.setProperty(k, v);
    else b.style.removeProperty(k);
  }
  if ((s.background || 'glow') !== current.background) renderBackdrop(s.background || 'glow');
  if (s.uiScale !== current.uiScale) api.call('window:zoom', (s.uiScale || 100) / 100).catch(() => {});
  current = { ...s };
}

// ---------------------------------------------------------------- sounds --
let audio = null;
function click() {
  const vol = (state.settings?.soundVolume ?? 60) / 100;
  if (!vol) return;
  audio = audio || new AudioContext();
  const t = audio.currentTime;
  // A short wooden "tock" like the Minecraft menu button.
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1150, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.05);
  gain.gain.setValueAtTime(0.18 * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  osc.connect(filter).connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

export function installSounds() {
  document.addEventListener('pointerdown', (e) => {
    if (!state.settings?.uiSounds) return;
    if (e.target.closest('button:not(:disabled), .rail-item, .inst-card, .switch, .seg button, .card.proj, .file-row')) click();
  }, true);
}

export function installAppearance() {
  installTextureVars();
  installSounds();
  document.querySelector('.backdrop')?.append(el('div', { class: 'bg-texture' }));
}

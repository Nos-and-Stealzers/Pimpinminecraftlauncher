// Theme, accent colour, heading font, motion and UI scale from settings.
// Theme lives in the old `uiStyle` key so existing settings files keep working.
import { api, state } from './state.js';

export const THEMES = [
  ['modern', 'Dark'],
  ['midnight', 'Midnight'],
  ['light', 'Light'],
];
export const ACCENTS = {
  violet: '#8f5cf7',
  blue: '#3b82f6',
  green: '#22a55b',
  orange: '#e5762b',
  red: '#dc4545',
  pink: '#d9469b',
};
// accents from the old theme picker
const OLD_ACCENTS = { crimson: 'red', redstone: 'red', emerald: 'green', grass: 'green', ocean: 'blue', diamond: 'blue', gold: 'orange', amethyst: 'violet', netherite: 'violet' };

export const themeName = (s = state.settings) => (THEMES.some(([k]) => k === s?.uiStyle) ? s.uiStyle : 'modern');
export const accentName = (s = state.settings) => (s?.accent === 'custom' ? 'custom' : ACCENTS[s?.accent] ? s.accent : OLD_ACCENTS[s?.accent] || 'violet');

let lastScale = null;

export function applyAppearance(s = state.settings) {
  if (!s) return;
  const b = document.body;
  const theme = themeName(s);
  b.dataset.theme = theme === 'modern' ? 'dark' : theme;
  b.dataset.accent = accentName(s);
  b.dataset.font = s.font === 'pixel' ? 'pixel' : 'default';
  b.classList.toggle('reduce-motion', s.animations === false);
  if (accentName(s) === 'custom' && /^#[0-9a-f]{6}$/i.test(s.customA1 || '')) {
    b.style.setProperty('--accent', s.customA1);
    b.style.setProperty('--accent-hi', `color-mix(in srgb, ${s.customA1} 85%, #fff)`);
  } else {
    b.style.removeProperty('--accent');
    b.style.removeProperty('--accent-hi');
  }
  const scale = s.uiScale || 100;
  if (scale !== lastScale) {
    lastScale = scale;
    api.call('window:zoom', scale / 100).catch(() => {});
  }
}

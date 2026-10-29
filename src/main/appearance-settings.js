// Appearance is data, never arbitrary CSS. Shared store-side validation on load/save.
const APPEARANCE_DEFAULTS = Object.freeze({
  uiStyle: 'modern', accent: 'violet', customA1: '#8f5cf7', font: 'default',
  uiScale: 100, animations: true, density: 'comfortable', textSize: 100,
  sidebarWidth: 232, sidebarMode: 'auto',
  // UI gradient: blend the accent into a second colour across accent surfaces.
  // On by default now that the launcher ships with it; toggle it off for a flat accent.
  gradient: true, customA2: '#ff4fb8', gradientAngle: 135,
  // Optional Minecraft style (src/renderer/themes/minecraft). Off unless the
  // user turns on mcStyle; the other mc* keys only take effect while it is on.
  // Legacy pre-v3 keys (background, blockIcons, effects3d, skinPose...) are
  // deliberately not read, so old settings files never switch it on.
  mcStyle: false, mcPreset: 'overworld', mcBackground: 'panorama', mcButtons: 'stone',
  mcCorners: 'blocky', mcFont: 'headings', mcBlockIcons: true, mcTilt: false,
  mcSkinPose: 'idle', mcSkinTurn: 'sway', mcSkinPedestal: 'grass',
  mcScene: 'island', mcMobs: true, mcMobCount: 2, mcSceneSpeed: 1,
});
const enums = {
  uiStyle: ['modern', 'midnight', 'light', 'system'],
  accent: ['violet', 'blue', 'green', 'orange', 'red', 'pink', 'custom'],
  font: ['default', 'pixel'], density: ['comfortable', 'compact'], sidebarMode: ['auto', 'expanded', 'compact'],
  mcPreset: ['overworld', 'nether', 'end'],
  mcScene: ['island', 'oneblock'],
  mcBackground: ['panorama', 'tiles', 'plain'],
  mcButtons: ['stone', 'wood'],
  mcCorners: ['blocky', 'rounded'],
  mcFont: ['headings', 'all', 'system'],
  mcSkinPose: ['idle', 'walk', 'run', 'zombie', 'sit', 'dance'],
  mcSkinTurn: ['still', 'sway', 'spin'],
  mcSkinPedestal: ['none', 'grass'],
};
const booleans = ['gradient', 'animations', 'mcStyle', 'mcBlockIcons', 'mcTilt', 'mcMobs'];
// Keys owned by the removable Minecraft style. Sending null for each one
// (with mcStyle false) resets them through this normalizer.
const MINECRAFT_KEYS = Object.freeze(Object.keys(APPEARANCE_DEFAULTS).filter(key => /^mc[A-Z]/.test(key)));
const aliases = { crimson: 'red', redstone: 'red', emerald: 'green', grass: 'green', ocean: 'blue', diamond: 'blue', gold: 'orange', amethyst: 'violet', netherite: 'violet' };
function normalizeAppearance(source) {
  const s = source && typeof source === 'object' ? source : {};
  const result = { ...APPEARANCE_DEFAULTS };
  for (const [key, values] of Object.entries(enums)) {
    const value = key === 'accent' ? aliases[s[key]] || s[key] : s[key];
    if (values.includes(value)) result[key] = value;
  }
  if (typeof s.customA1 === 'string' && /^#[0-9a-f]{6}$/i.test(s.customA1)) result.customA1 = s.customA1.toLowerCase();
  if (typeof s.customA2 === 'string' && /^#[0-9a-f]{6}$/i.test(s.customA2)) result.customA2 = s.customA2.toLowerCase();
  for (const key of booleans) if (typeof s[key] === 'boolean') result[key] = s[key];
  if (typeof s.gradientAngle === 'number' && Number.isFinite(s.gradientAngle)) result.gradientAngle = Math.round(Math.min(360, Math.max(0, s.gradientAngle)));
  for (const [key, min, max] of [['uiScale', 80, 130], ['textSize', 90, 120], ['sidebarWidth', 190, 300]]) {
    if (typeof s[key] === 'number' && Number.isFinite(s[key])) result[key] = Math.round(Math.min(max, Math.max(min, s[key])));
  }
  if (typeof s.mcMobCount === 'number' && Number.isFinite(s.mcMobCount)) result.mcMobCount = Math.round(Math.min(3, Math.max(1, s.mcMobCount)));
  if (typeof s.mcSceneSpeed === 'number' && Number.isFinite(s.mcSceneSpeed)) result.mcSceneSpeed = Math.round(Math.min(1.5, Math.max(0.5, s.mcSceneSpeed)) * 100) / 100;
  return result;
}
module.exports = { APPEARANCE_DEFAULTS, MINECRAFT_KEYS, normalizeAppearance };

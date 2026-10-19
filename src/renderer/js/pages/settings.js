// Global launcher settings.
import { el, icon, errorToast, toast, switchEl, seg } from '../dom.js';
import { cube3d } from '../fx3d.js';
import { PRESETS } from '../appearance.js';
import { updateModal } from '../qol.js';
import { api, state, updateSettings } from '../state.js';

const ACCENTS = [
  ['violet', 'linear-gradient(135deg,#b56cff,#ff4fb8)'],
  ['crimson', 'linear-gradient(135deg,#ff4d6d,#ff8a3d)'],
  ['emerald', 'linear-gradient(135deg,#2ee59d,#18c2d8)'],
  ['ocean', 'linear-gradient(135deg,#4d8dff,#3fd5ff)'],
  ['gold', 'linear-gradient(135deg,#ffb627,#ff7b39)'],
  ['grass', 'linear-gradient(135deg,#7cbd4a,#3c8527)'],
  ['redstone', 'linear-gradient(135deg,#ff3b2f,#a3150b)'],
  ['diamond', 'linear-gradient(135deg,#7af0ea,#2fa8e0)'],
  ['amethyst', 'linear-gradient(135deg,#c9a1ff,#7a4fc0)'],
  ['netherite', 'linear-gradient(135deg,#8d7f86,#3d3439)'],
];
const PRESET_INFO = [
  ['modern', 'Pimpin Modern', 'Glassy, glowing and smooth.', 'amethyst'],
  ['og', 'OG Minecraft', 'Pixel font, stone buttons, 3D island panorama.', 'grass'],
  ['nether', 'Nether', 'Classic style in redstone and netherrack.', 'netherrack'],
  ['end', 'The End', 'Purple void with 3D block icons.', 'purpur'],
];
const BACKGROUNDS = [
  ['glow', 'Glow'],
  ['panorama', '3D panorama'],
  ['dirt', 'Dirt (classic)'],
  ['nether', 'Nether'],
  ['end', 'The End'],
  ['plain', 'Plain'],
];
const row = (title, desc, control) => el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, title), desc ? el('span', {}, desc) : null), control);

export function render(page, _params, navigate) {
  const s = state.settings;
  const save = (patch, msg) => updateSettings(patch).then(() => msg && toast(msg)).catch(errorToast);

  const total = s.totalMemory;
  const mem = el('input', { type: 'range', min: 1024, max: Math.max(2048, total - 1024), step: 256, value: s.memoryMax });
  const memVal = el('div', { class: 'mem-val' }, `${(s.memoryMax / 1024).toFixed(1)} GB`);
  mem.addEventListener('input', () => (memVal.textContent = `${(mem.value / 1024).toFixed(1)} GB`));
  mem.addEventListener('change', () => save({ memoryMax: Number(mem.value) }));

  const jvm = el('textarea', { class: 'input', rows: 2 }, s.jvmArgs);
  jvm.addEventListener('change', () => save({ jvmArgs: jvm.value.trim() }, 'JVM arguments saved'));
  const java = el('input', { class: 'input', placeholder: 'Automatic — the right Java is downloaded per version', value: s.javaPath });
  java.addEventListener('change', () => save({ javaPath: java.value.trim() }));
  const width = el('input', { class: 'input', type: 'number', value: s.width });
  const height = el('input', { class: 'input', type: 'number', value: s.height });
  width.addEventListener('change', () => save({ width: Number(width.value) || 1280 }));
  height.addEventListener('change', () => save({ height: Number(height.value) || 720 }));

  const accentRow = el('div', { class: 'accent-pick' });
  const c1 = el('input', { type: 'color', value: s.customA1 || '#b56cff', title: 'Custom colour 1' });
  const c2 = el('input', { type: 'color', value: s.customA2 || '#ff4fb8', title: 'Custom colour 2' });
  const saveCustom = () => save({ accent: 'custom', customA1: c1.value, customA2: c2.value }).then(drawAccents);
  c1.addEventListener('input', saveCustom);
  c2.addEventListener('input', saveCustom);
  const drawAccents = () =>
    accentRow.replaceChildren(
      ...ACCENTS.map(([k, bg]) =>
        el('button', { class: state.settings.accent === k ? 'on' : '', style: { background: bg }, title: k, onclick: async () => { await save({ accent: k }); drawAccents(); } }),
      ),
      el('span', { class: `custom-accent${state.settings.accent === 'custom' ? ' on' : ''}`, title: 'Custom colours' }, c1, c2),
    );
  drawAccents();

  const pick = (key, options) => seg(options.map(([value, label]) => ({ value, label })), state.settings[key] ?? options[0][0], (v) => save({ [key]: v }));
  const scale = el('input', { type: 'range', min: 80, max: 130, step: 5, value: s.uiScale || 100 });
  const scaleVal = el('div', { class: 'mem-val' }, `${s.uiScale || 100}%`);
  scale.addEventListener('input', () => (scaleVal.textContent = `${scale.value}%`));
  scale.addEventListener('change', () => save({ uiScale: Number(scale.value) }));
  const vol = el('input', { type: 'range', min: 0, max: 100, step: 5, value: s.soundVolume ?? 60 });
  vol.addEventListener('change', () => save({ soundVolume: Number(vol.value) }));

  const presets = el('div', { class: 'preset-grid' }, PRESET_INFO.map(([key, name, desc, block]) =>
    el('button', {
      class: 'preset',
      onclick: async () => {
        await save(PRESETS[key], `${name} theme applied`);
        navigate('settings');
      },
    }, el('div', { class: 'preset-block' }, cube3d(block, 34, true)), el('b', {}, name), el('span', {}, desc))));

  const bgGrid = el('div', { class: 'bg-grid' });
  const drawBgs = () => bgGrid.replaceChildren(...BACKGROUNDS.map(([k, label]) =>
    el('button', { class: `bg-tile bg-${k}${(state.settings.background || 'glow') === k ? ' on' : ''}`, onclick: async () => { await save({ background: k }); drawBgs(); } }, el('span', {}, label))));
  drawBgs();

  page.append(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { class: 'page-title' }, 'Settings'), el('p', { class: 'page-sub' }, 'Defaults for every instance. Instances can override memory, Java and resolution.'))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('sparkle'), 'Theme presets'),
      presets),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('palette'), 'Appearance'),
      row('Style', 'Classic gives you stone buttons, dark panels and text shadows like the in-game menus.', pick('uiStyle', [['modern', 'Modern'], ['classic', 'Classic Minecraft']])),
      row('Font', null, pick('font', [['default', 'Default'], ['pixel', 'Pixel']])),
      row('Corners', null, pick('corners', [['round', 'Rounded'], ['sharp', 'Blocky']])),
      el('div', { class: 'field' }, 'Background', bgGrid),
      row('Accent colour', 'Pick a preset or your own two colours.', accentRow),
      row('UI size', 'Scale the whole launcher.', el('div', { class: 'set-row', style: { width: '280px' } }, scale, scaleVal)),
      row('Glass blur', 'Frosted-glass panels. Turn off on slower PCs.', switchEl(s.blur !== false, (v) => save({ blur: v })))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('cube'), '3D & motion'),
      row('Animations', 'Page transitions, floating blocks and the turning panorama.', switchEl(s.animations !== false, (v) => save({ animations: v }))),
      row('3D card tilt', 'Cards lean towards the mouse with a soft glare.', switchEl(s.effects3d !== false, (v) => save({ effects3d: v }))),
      row('Block icons', 'Use 3D Minecraft blocks for the sidebar and instance icons.', switchEl(Boolean(s.blockIcons), (v) => save({ blockIcons: v })))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('user'), 'Home screen'),
      row('Your skin', null, pick('skinMode', [['3d', '3D model'], ['2d', 'Picture'], ['off', 'Hidden']])),
      row('Pose', 'Click the 3D model to wave.', pick('skinPose', [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['zombie', 'Zombie'], ['sit', 'Sit'], ['dance', 'Dance']])),
      row('Turning', null, pick('skinSpin', [['sway', 'Sway'], ['spin', 'Spin'], ['still', 'Still']])),
      row('Stand on', null, pick('skinPedestal', [['glow', 'Glow'], ['block', 'Grass block']])),
      row('Client features', 'Show the one-click mod tiles on Home.', switchEl(s.showFeatures !== false, (v) => save({ showFeatures: v }))),
      row('Minecraft news', null, switchEl(s.showNews !== false, (v) => save({ showNews: v }))),
      row('Open on', 'The page the launcher starts on.', pick('startPage', [['home', 'Home'], ['library', 'Library'], ['instances', 'Instances'], ['servers', 'Servers']]))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('bolt'), 'Sound'),
      row('Click sounds', 'A Minecraft-style click on buttons.', switchEl(Boolean(s.uiSounds), (v) => save({ uiSounds: v }))),
      row('Volume', null, el('div', { class: 'set-row', style: { width: '280px' } }, vol))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('cpu'), 'Java & memory'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Maximum memory'), el('span', {}, `Your PC has ${(total / 1024).toFixed(1)} GB. 4–6 GB is plenty for most modded play.`))),
      el('div', { class: 'set-row' }, mem, memVal),
      el('label', { class: 'field' }, 'JVM arguments', jvm),
      el('label', { class: 'field' }, el('span', {}, 'Java executable ', el('span', { class: 'hint' }, '(leave empty for automatic)')),
        el('div', { class: 'row' }, java, el('button', { class: 'btn', onclick: async () => { const p = await api.call('dialog:pickJava'); if (p) { java.value = p; save({ javaPath: p }, 'Java path saved'); } } }, 'Browse')))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('monitor'), 'Game window'),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } }, el('label', { class: 'field' }, 'Width', width), el('label', { class: 'field' }, 'Height', height)),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Start in fullscreen')), switchEl(s.fullscreen, (v) => save({ fullscreen: v })))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('layout'), 'Launcher'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Hide launcher while playing'), el('span', {}, 'It comes back when the game closes.')), switchEl(s.closeOnLaunch, (v) => save({ closeOnLaunch: v }))),
      row('Keep running in the tray', 'Closing the window keeps Pimpin in the system tray, with a quick Play button.', switchEl(Boolean(s.minimizeToTray), (v) => save({ minimizeToTray: v }))),
      state.info?.platform !== 'linux' ? row('Start with my computer', 'Opens quietly in the tray when you log in.', switchEl(Boolean(s.launchOnStartup), (v) => save({ launchOnStartup: v }))) : null,
      row('Desktop notifications', 'When a server is online, the game crashes or an update is ready — only while Pimpin is in the background.', switchEl(s.notifications !== false, (v) => save({ notifications: v }))),
      row('Welcome tour', 'Run the first-time setup again.', el('button', { class: 'btn sm', onclick: async () => { await save({ onboarded: false }); const { onboarding } = await import('../qol.js'); onboarding(navigate); } }, icon('sparkle'), 'Start')),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Data folder'), el('span', {}, s.root)), el('button', { class: 'btn sm', onclick: () => api.call('shell:openRoot') }, icon('folder'), 'Open'))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('download'), 'Updates'),
      row('Install updates automatically', 'Downloads in the background and installs when you close the launcher.', switchEl(s.autoUpdate !== false, (v) => save({ autoUpdate: v }))),
      row('Update channel', 'Beta gets test builds first. They can be less stable.', pick('updateChannel', [['stable', 'Stable'], ['beta', 'Beta']])),
      row(`Version ${state.info?.version || ''}`, null, el('button', { class: 'btn sm primary', onclick: () => updateModal() }, icon('refresh'), 'Check for updates'))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('info'), 'About'),
      el('div', { class: 'muted', style: { lineHeight: 1.6 } },
        `Pimpin Launcher ${state.info?.version || ''} · ${state.info?.platform} ${state.info?.arch}`, el('br'),
        'Content library powered by Modrinth. Paper servers by PaperMC, Purpur by PurpurMC. Not affiliated with Mojang or Microsoft.')),
  );
}

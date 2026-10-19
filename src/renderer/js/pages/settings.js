// Global launcher settings.
import { el, icon, errorToast, toast, switchEl } from '../dom.js';
import { api, state, updateSettings } from '../state.js';

const ACCENTS = [
  ['violet', 'linear-gradient(135deg,#b56cff,#ff4fb8)'],
  ['crimson', 'linear-gradient(135deg,#ff4d6d,#ff8a3d)'],
  ['emerald', 'linear-gradient(135deg,#2ee59d,#18c2d8)'],
  ['ocean', 'linear-gradient(135deg,#4d8dff,#3fd5ff)'],
  ['gold', 'linear-gradient(135deg,#ffb627,#ff7b39)'],
];

export function render(page) {
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
  const drawAccents = () =>
    accentRow.replaceChildren(
      ...ACCENTS.map(([k, bg]) =>
        el('button', { class: state.settings.accent === k ? 'on' : '', style: { background: bg }, title: k, onclick: async () => { await save({ accent: k }); drawAccents(); } }),
      ),
    );
  drawAccents();

  page.append(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { class: 'page-title' }, 'Settings'), el('p', { class: 'page-sub' }, 'Defaults for every instance. Instances can override memory, Java and resolution.'))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('palette'), 'Appearance'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Accent colour'), el('span', {}, 'Pick the vibe for the whole launcher.')), accentRow),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, '3D effects'), el('span', {}, 'Your 3D skin on Home (drag to spin), floating blocks and cards that tilt towards the mouse.')), switchEl(s.effects3d !== false, (v) => save({ effects3d: v })))),
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
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Data folder'), el('span', {}, s.root)), el('button', { class: 'btn sm', onclick: () => api.call('shell:openRoot') }, icon('folder'), 'Open'))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('info'), 'About'),
      el('div', { class: 'muted', style: { lineHeight: 1.6 } },
        `Pimpin Launcher ${state.info?.version || ''} · ${state.info?.platform} ${state.info?.arch}`, el('br'),
        'Content library powered by Modrinth. Paper servers by PaperMC, Purpur by PurpurMC. Not affiliated with Mojang or Microsoft.')),
  );
}

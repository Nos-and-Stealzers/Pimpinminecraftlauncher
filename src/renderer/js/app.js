// App shell: navigation rail, title bar, task progress pill and routing.
import { el, icon, clear, fmtBytes, toast, modal } from './dom.js';
import { api, state, notify, subscribe, refreshSettings, refreshAccounts, refreshInstances, refreshServers, selectedInstance } from './state.js';
import { accountButton, playInstance, stopInstance } from './components.js';
import { installTilt, blockIcon } from './fx3d.js';
import { installAppearance, applyAppearance } from './appearance.js';
import * as home from './pages/home.js';
import * as library from './pages/library.js';
import * as instances from './pages/instances.js';
import * as servers from './pages/servers.js';
import * as settings from './pages/settings.js';

const PAGES = {
  home: { mod: home, label: 'Home', icon: 'home', block: 'grass' },
  library: { mod: library, label: 'Library', icon: 'library', block: 'bookshelf' },
  instances: { mod: instances, label: 'Instances', icon: 'layers', block: 'crafting' },
  servers: { mod: servers, label: 'Servers', icon: 'server', block: 'furnace' },
  settings: { mod: settings, label: 'Settings', icon: 'settings', block: 'command' },
};

let current = { page: 'home', params: {} };
let cleanup = null;

export function navigate(page, params = {}) {
  current = { page, params };
  render();
}
window.pimpinNavigate = navigate;

function render() {
  cleanup?.();
  cleanup = null;
  renderRail();
  const view = document.getElementById('view');
  const page = el('section', { class: 'page' });
  clear(view, page);
  cleanup = PAGES[current.page].mod.render(page, current.params, navigate) || null;
}

function renderRail() {
  const rail = document.getElementById('rail');
  const sel = selectedInstance();
  const running = sel && state.game[sel.id]?.state === 'running';
  const preparing = sel && state.game[sel.id]?.state === 'preparing';
  clear(
    rail,
    Object.entries(PAGES).map(([key, p]) =>
      el('button', { class: `rail-item${current.page === key ? ' active' : ''}`, onclick: () => navigate(key) }, state.settings?.blockIcons ? blockIcon(p.block, 22) : icon(p.icon), p.label),
    ),
    el('div', { class: 'rail-spacer' }),
    sel
      ? el(
          'button',
          {
            class: `rail-play${running ? ' running' : ''}${preparing ? ' busy' : ''}`,
            id: 'rail-play',
            title: running ? `Stop ${sel.name}` : preparing ? 'Launching…' : `Play ${sel.name}`,
            onclick: () => (running ? stopInstance(sel.id) : preparing ? null : playInstance(sel.id)),
          },
          preparing ? el('span', { class: 'spin' }) : icon(running ? 'stop' : 'play'),
        )
      : null,
  );
}

function renderAccount() {
  clear(document.getElementById('account-slot'), accountButton());
}

// ------------------------------------------------------------ task pill --
let pillTimer;
function showProgress(p) {
  const slot = document.getElementById('task-pill');
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const detail = p.bytes ? `${fmtBytes(p.done)} / ${fmtBytes(p.total)}` : p.total > 1 ? `${p.done}/${p.total}` : '';
  clear(
    slot,
    el('div', { class: 'task-pill' }, el('span', { class: 'spin' }), el('span', {}, p.stage), el('div', { class: 'bar' }, el('i', { style: { width: `${pct}%` } })), detail ? el('span', { class: 'dim' }, detail) : null),
  );
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => slot.replaceChildren(), 2500);
}

// --------------------------------------------------------------- events --
function wireEvents() {
  document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => api.call(`window:${b.dataset.win}`)));

  api.on('game:progress', (p) => {
    const wasPreparing = state.game[p.id]?.state === 'preparing';
    state.game[p.id] = { ...(state.game[p.id] || {}), state: 'preparing', progress: p };
    showProgress(p);
    const ring = document.getElementById('rail-play');
    if (ring) ring.style.setProperty('--p', p.total ? Math.round((p.done / p.total) * 100) : 0);
    notify(wasPreparing ? 'game-progress' : 'game');
  });
  api.on('task:progress', showProgress);
  api.on('server:progress', showProgress);
  api.on('game:state', async (s) => {
    state.game[s.id] = { state: s.state };
    document.body.classList.toggle('game-running', Object.values(state.game).some((g) => g.state === 'running'));
    if (s.state === 'stopped') {
      if (s.crashed) showCrash(s.id);
      document.getElementById('task-pill').replaceChildren();
    }
    await refreshInstances();
    notify('game');
  });
  api.on('server:state', async (s) => {
    state.server[s.id] = { state: s.state, ready: s.ready };
    if (s.error) toast(s.error, 'err');
    await refreshServers();
  });
  api.on('server:players', (p) => {
    const s = state.servers.find((x) => x.id === p.id);
    if (s) s.online = p.online;
    notify('server-players');
  });
  api.on('instances:changed', async () => {
    await refreshInstances();
    notify('instances-content');
  });
  api.on('toast', (t) => toast(t.text, t.kind));
  api.on('update:state', renderUpdate);
  api.on('window:state', (w) => document.body.classList.toggle('maximized', w.maximized));

  subscribe((topic) => {
    if (topic === 'accounts' || topic === 'settings') renderAccount();
    if (topic === 'instances' || topic === 'game' || topic === 'settings') renderRail();
    if (topic === 'settings') applyAppearance();
  });
}

// ------------------------------------------------------------- updates --
function renderUpdate(u) {
  const slot = document.getElementById('update-slot');
  if (u.state === 'downloading') {
    clear(slot, el('div', { class: 'update-pill dl', title: `Downloading Pimpin ${u.version}` }, icon('download'), `Updating ${u.percent || 0}%`));
  } else if (u.state === 'ready') {
    clear(slot, el('button', { class: 'update-pill', title: `Restart to install Pimpin ${u.version}`, onclick: () => api.call('update:install') }, icon('refresh'), 'Restart to update'));
  } else {
    slot.replaceChildren();
  }
}

// --------------------------------------------------------------- crashes --
async function showCrash(id) {
  const inst = state.instances.find((i) => i.id === id);
  let info;
  try {
    info = await api.call('instances:crashInfo', id);
  } catch {
    toast('Minecraft closed unexpectedly. Check the instance console for details.', 'err', 8000);
    return;
  }
  const log = el('div', { class: 'console small' }, info.tail.map((l) => el('div', { class: /ERROR|Exception|FATAL/.test(l) ? 'l-err' : /WARN/.test(l) ? 'l-warn' : '' }, l)));
  const m = modal({
    title: `${inst?.name || 'Minecraft'} crashed`,
    wide: true,
    body: [
      el('p', { class: 'muted', style: { margin: 0 } }, info.report?.description ? `Minecraft reported: ${info.report.description}` : `The game exited with code ${info.code}.`),
      info.hints.map((h) => el('div', { class: 'crash-hint' }, el('b', {}, icon('alert'), h.title), h.text ? el('pre', {}, h.text) : null)),
      log,
    ],
    actions: [
      el('button', { class: 'btn ghost', onclick: () => { navigator.clipboard.writeText(info.tail.join('\n')); toast('Log copied — paste it to whoever is helping you'); } }, icon('layout'), 'Copy log'),
      info.report ? el('button', { class: 'btn', onclick: () => api.call('shell:showItem', id, 'crash-reports', info.report.file) }, icon('folder'), 'Crash report') : null,
      el('button', { class: 'btn primary', onclick: () => { m.close(); navigate('instances', { id, tab: 'content' }); } }, icon('puzzle'), 'Manage mods'),
    ].filter(Boolean),
  });
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
}

async function boot() {
  wireEvents();
  installTilt();
  installAppearance();
  state.info = await api.call('app:info');
  document.body.classList.add(`os-${state.info.platform}`);
  await Promise.all([refreshSettings(), refreshAccounts(), refreshInstances(), refreshServers()]);
  applyAppearance();
  if (PAGES[state.settings.startPage]) current = { page: state.settings.startPage, params: {} };
  for (const i of state.instances) if (i.running) state.game[i.id] = { state: 'running' };
  renderAccount();
  render();
  renderUpdate(await api.call('update:get'));
}

boot().catch((err) => {
  console.error(err);
  toast(`Failed to start: ${err.message}`, 'err', 10000);
});

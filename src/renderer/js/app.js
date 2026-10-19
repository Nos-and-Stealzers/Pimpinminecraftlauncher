// App shell: navigation rail, title bar, task progress pill and routing.
import { el, icon, clear, fmtBytes, toast } from './dom.js';
import { api, state, notify, subscribe, refreshSettings, refreshAccounts, refreshInstances, refreshServers, selectedInstance } from './state.js';
import { accountButton, playInstance, stopInstance } from './components.js';
import * as home from './pages/home.js';
import * as library from './pages/library.js';
import * as instances from './pages/instances.js';
import * as servers from './pages/servers.js';
import * as settings from './pages/settings.js';

const PAGES = {
  home: { mod: home, label: 'Home', icon: 'home' },
  library: { mod: library, label: 'Library', icon: 'library' },
  instances: { mod: instances, label: 'Instances', icon: 'layers' },
  servers: { mod: servers, label: 'Servers', icon: 'server' },
  settings: { mod: settings, label: 'Settings', icon: 'settings' },
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
  clear(
    rail,
    Object.entries(PAGES).map(([key, p]) =>
      el('button', { class: `rail-item${current.page === key ? ' active' : ''}`, onclick: () => navigate(key) }, icon(p.icon), p.label),
    ),
    el('div', { class: 'rail-spacer' }),
    sel
      ? el(
          'button',
          {
            class: `rail-play${running ? ' running' : ''}`,
            title: running ? `Stop ${sel.name}` : `Play ${sel.name}`,
            onclick: () => (running ? stopInstance(sel.id) : playInstance(sel.id)),
          },
          icon(running ? 'stop' : 'play'),
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
    state.game[p.id] = { ...(state.game[p.id] || {}), state: 'preparing', progress: p };
    showProgress(p);
    notify('game-progress');
  });
  api.on('task:progress', showProgress);
  api.on('server:progress', showProgress);
  api.on('game:state', async (s) => {
    state.game[s.id] = { state: s.state };
    if (s.state === 'stopped') {
      if (s.crashed) toast(`Minecraft closed unexpectedly (exit code ${s.code}). Check the instance console for details.`, 'err', 8000);
      document.getElementById('task-pill').replaceChildren();
    }
    await refreshInstances();
    notify('game');
  });
  api.on('server:state', async (s) => {
    state.server[s.id] = { state: s.state };
    if (s.error) toast(s.error, 'err');
    await refreshServers();
  });
  api.on('instances:changed', async () => {
    await refreshInstances();
    notify('instances-content');
  });
  api.on('toast', (t) => toast(t.text, t.kind));

  subscribe((topic) => {
    if (topic === 'accounts' || topic === 'settings') renderAccount();
    if (topic === 'instances' || topic === 'game' || topic === 'settings') renderRail();
  });
}

async function boot() {
  wireEvents();
  state.info = await api.call('app:info');
  document.body.classList.add(`os-${state.info.platform}`);
  await Promise.all([refreshSettings(), refreshAccounts(), refreshInstances(), refreshServers()]);
  for (const i of state.instances) if (i.running) state.game[i.id] = { state: 'running' };
  renderAccount();
  render();
}

boot().catch((err) => {
  console.error(err);
  toast(`Failed to start: ${err.message}`, 'err', 10000);
});

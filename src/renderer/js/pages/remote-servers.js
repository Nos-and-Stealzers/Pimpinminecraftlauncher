// Remote servers: servers that run somewhere else. A hosting panel
// (Pterodactyl / Pelican), any server with RCON, a server on another PC
// running Pimpin Launcher, or just an address to watch. Mounted from the
// Servers page ("Remote" view); the backend is src/main/remote/.
import { el, icon, clear, modal, errorToast, toast, confirmModal, switchEl, fmtBytes, fmtDuration } from '../dom.js';
import { api, state, selectInstance, selectedInstance } from '../state.js';
import { playInstance, newInstanceModal } from '../components.js';
import { consoleView } from './instances.js';

const KINDS = {
  pterodactyl: { label: 'Hosting panel', short: 'Panel', icon: 'globe', desc: 'Pterodactyl or Pelican, with a client API key from your host.' },
  pimpin: { label: 'Another PC with Pimpin', short: 'Pimpin PC', icon: 'monitor', desc: 'A server on a friend\'s or your other PC that has Share this PC on.' },
  rcon: { label: 'RCON', short: 'RCON', icon: 'terminal', desc: 'Any server with enable-rcon. Run commands, no live log.' },
  address: { label: 'Address only', short: 'Address', icon: 'wifi', desc: 'Watch any server: online, players, version and MOTD.' },
};
const POWER_LABEL = { start: ['Start', 'play'], stop: ['Stop', 'stop'], restart: ['Restart', 'refresh'], kill: ['Kill', 'x'] };

const statuses = {}; // id -> last status from the backend
let connections = [];
const listeners = new Set();
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  api.on('remote:status', (s) => {
    if (!s?.id) return;
    statuses[s.id] = s.live ? { ...(statuses[s.id] || {}), ...s } : s;
    for (const fn of listeners) fn(s.id);
  });
}
const onStatus = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

async function loadConnections() {
  connections = await api.call('remote:list');
  return connections;
}
const refreshStatus = (id) => api.call('remote:status', id).then((s) => (statuses[id] = s)).catch(() => null);

// ----------------------------------------------------------- helpers --
const versionOf = (c, s) => c.mcVersion || s?.remote?.mcVersion || s?.ping?.version?.name?.match(/\d+\.\d+(?:\.\d+)?/)?.[0] || null;

function chipFor(s) {
  const st = s?.state;
  if (!s) return el('span', { class: 'chip' }, el('span', { class: 'spin xs' }), 'Checking');
  if (st === 'online') return el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Online');
  if (st === 'starting' || st === 'stopping') return el('span', { class: 'chip warn' }, el('span', { class: 'spin xs' }), st === 'starting' ? 'Starting' : 'Stopping');
  if (st === 'error') return el('span', { class: 'chip bad', title: s.error || '' }, icon('alert'), 'Unreachable');
  if (st === 'offline') return el('span', { class: 'chip' }, 'Offline');
  return el('span', { class: 'chip' }, 'Unknown');
}

function faviconIcon(c, s, size = '') {
  const fav = s?.ping?.favicon;
  return el('div', { class: `inst-icon ${size} ${s?.state === 'online' ? 'ic-emerald' : 'ic-night'}` }, fav ? el('img', { src: fav, alt: '' }) : icon(KINDS[c.kind]?.icon || 'server'));
}

const subtitle = (c, s) => {
  const where = c.kind === 'pterodactyl' ? (s?.address || new URL(c.panelUrl).host) : c.kind === 'pimpin' ? c.host : c.kind === 'rcon' ? c.address || c.host : c.address;
  return `${KINDS[c.kind].short} · ${where}`;
};

const copy = (text) => {
  navigator.clipboard.writeText(text);
  toast(`Copied ${text}`);
};

async function join(c) {
  const s = statuses[c.id];
  const address = s?.address;
  if (!address) return toast('This connection has no game address yet. Edit it and add one.', 'err');
  const version = versionOf(c, s);
  let inst = version ? state.instances.find((i) => i.mcVersion === version) : selectedInstance();
  if (!inst) {
    if (!version) return toast('Create an instance first.', 'err');
    if (await confirmModal('No matching instance', `You need a Minecraft ${version} instance to join this server. Create one now?`, { confirm: 'Create instance' })) {
      newInstanceModal({ mcVersion: version, onCreated: (i) => playInstance(i.id, { server: address }) });
    }
    return;
  }
  if (!version) toast(`Joining with ${inst.name}. Set the Minecraft version on the connection to pick a matching instance.`, 'info');
  await selectInstance(inst.id);
  playInstance(inst.id, { server: address });
}

// -------------------------------------------------------------- list --
/** Renders the connection cards into `root`. Returns a cleanup function. */
export function remoteList(root, navigate) {
  wire();
  const grid = el('div', { class: 'inst-grid' });
  root.append(grid);
  const card = (c) => {
    const s = statuses[c.id];
    const players = s?.ping?.players;
    return el('div', { class: `card inst-card rs-card${s?.state === 'online' ? ' running' : ''}`, onclick: () => navigate('servers', { remote: c.id }) },
      el('div', { class: 'top' }, faviconIcon(c, s), el('div', { class: 'grow' }, el('b', {}, c.name), el('span', {}, subtitle(c, s)))),
      s?.ping?.motd ? el('div', { class: 'rs-motd', title: s.ping.motd }, s.ping.motd) : null,
      el('div', { class: 'bottom' },
        chipFor(s),
        players ? el('span', { class: 'chip', title: 'Players online' }, icon('users'), `${players.online}/${players.max}`) : null,
        s?.ping ? el('span', { class: 'rs-meta', title: `${s.ping.version.name}, ${s.ping.latency} ms` }, el('span', { class: 'rs-ver' }, s.ping.version.name), el('span', {}, `${s.ping.latency} ms`)) : null));
  };
  const draw = () => {
    if (!connections.length) {
      return clear(grid, el('div', { class: 'card empty', style: { gridColumn: '1 / -1' } }, icon('globe'), el('h3', {}, 'No remote servers'),
        el('div', {}, 'Connect a server from your hosting panel, another PC with Pimpin Launcher, RCON, or just an address to watch.'),
        el('button', { class: 'btn primary', onclick: () => connectionModal(navigate) }, icon('plus'), 'Connect')));
    }
    clear(grid, connections.map(card));
  };
  const poll = () => connections.forEach((c) => refreshStatus(c.id).then(draw));
  loadConnections().then(() => { draw(); poll(); }).catch(errorToast);
  draw();
  const timer = setInterval(poll, 30000);
  const off = onStatus(draw);
  return () => {
    clearInterval(timer);
    off();
  };
}

// ------------------------------------------------------- add / edit --
export async function connectionModal(navigate, existing = null) {
  wire();
  const secure = await api.call('remote:secure').catch(() => ({ available: false }));
  let kind = existing?.kind || 'pterodactyl';
  const input = (attrs) => el('input', { class: 'input', ...attrs });
  const f = {
    name: input({ placeholder: 'My server', maxlength: 60, value: existing?.name || '' }),
    address: input({ placeholder: 'play.example.com', value: existing?.address || '' }),
    panelUrl: input({ placeholder: 'https://panel.example.com', value: existing?.panelUrl || '' }),
    host: input({ placeholder: kind === 'pimpin' ? '192.168.1.20' : 'play.example.com', value: existing?.host || '' }),
    port: input({ type: 'number', min: 1, max: 65535 }),
    secret: input({ type: 'password', autocomplete: 'off', spellcheck: 'false' }),
    mcVersion: input({ placeholder: 'Auto', maxlength: 32, value: existing?.mcVersion || '' }),
    server: el('select', { class: 'select' }, el('option', { value: '' }, 'Find servers first')),
  };
  let gamePort = existing?.gamePort || null;
  if (existing?.serverId) clear(f.server, el('option', { value: existing.serverId }, existing.serverId));
  const found = el('div', { class: 'rs-found muted' });
  const kinds = el('div', { class: 'rs-kinds' });
  const fields = el('div', { class: 'rs-fields' });
  const findBtn = el('button', { class: 'btn', type: 'button' }, icon('search'), 'Find servers');
  const testBtn = el('button', { class: 'btn', type: 'button' }, icon('wifi'), 'Test');
  const save = el('button', { class: 'btn primary' }, icon('check'), existing ? 'Save' : 'Connect');

  const draft = () => ({
    id: existing?.id,
    kind,
    name: f.name.value.trim(),
    address: f.address.value.trim(),
    panelUrl: f.panelUrl.value.trim(),
    host: f.host.value.trim(),
    port: Number(f.port.value) || undefined,
    serverId: f.server.value,
    mcVersion: f.mcVersion.value.trim(),
    gamePort,
  });
  const secretValue = () => f.secret.value.trim() || undefined;

  const field = (label, node, hint) => el('label', { class: 'field' }, label, node, hint ? el('span', { class: 'hint' }, hint) : null);
  const secretHint = () => (existing?.hasSecret && existing.kind === kind ? 'Saved. Leave empty to keep it.' : secure.available ? 'Stored encrypted with your system keychain.' : 'Secure storage is unavailable on this system, so secrets cannot be saved.');
  const drawFields = () => {
    clear(found);
    f.secret.placeholder = existing?.hasSecret && existing.kind === kind ? '••••••••' : '';
    if (kind === 'pterodactyl') {
      f.port.value = '';
      clear(fields,
        el('div', { class: 'form-grid rs-2' }, field('Panel address', f.panelUrl), field('Client API key', f.secret, secretHint())),
        el('div', { class: 'rs-find' }, field('Server', f.server), findBtn),
        found,
        el('div', { class: 'form-grid rs-3' }, field('Name', f.name), field('Game address', f.address, 'Optional, taken from the panel'), field('Minecraft version', f.mcVersion, 'Optional, for Join')),
        el('p', { class: 'hint rs-note' }, 'Create the key in your panel under Account, API credentials. Application keys (ptla_) do not work.'));
    } else if (kind === 'pimpin') {
      f.port.value = existing?.kind === 'pimpin' ? existing.port : 25590;
      f.host.placeholder = '192.168.1.20 or a Tailscale address';
      clear(fields,
        el('div', { class: 'form-grid rs-3' }, field('Other PC address', f.host), field('Port', f.port), field('Pairing token', f.secret, secretHint())),
        el('div', { class: 'rs-find' }, field('Server', f.server), findBtn),
        found,
        el('div', { class: 'form-grid rs-2' }, field('Name', f.name), field('Minecraft version', f.mcVersion, 'Optional, filled in from the other PC')),
        el('p', { class: 'hint rs-note' }, 'On the other PC open Servers, turn on Share this PC and copy its address and pairing token.'));
    } else if (kind === 'rcon') {
      f.port.value = existing?.kind === 'rcon' ? existing.port : 25575;
      f.host.placeholder = 'play.example.com';
      clear(fields,
        el('div', { class: 'form-grid rs-3' }, field('RCON host', f.host), field('RCON port', f.port), field('RCON password', f.secret, secretHint())),
        el('div', { class: 'form-grid rs-3' }, field('Name', f.name), field('Game address', f.address, 'Optional, for status and Join'), field('Minecraft version', f.mcVersion, 'Optional, for Join')),
        el('div', { class: 'row' }, testBtn, found),
        el('p', { class: 'hint rs-note' }, 'Needs enable-rcon=true, rcon.port and rcon.password in server.properties. RCON is not encrypted, so only use it on networks you trust.'));
    } else {
      clear(fields,
        el('div', { class: 'form-grid rs-3' }, field('Server address', f.address), field('Name', f.name), field('Minecraft version', f.mcVersion, 'Optional, for Join')),
        el('div', { class: 'row' }, testBtn, found));
    }
  };
  const drawKinds = () => clear(kinds, Object.entries(KINDS).map(([k, d]) =>
    el('button', { type: 'button', class: `rs-kind${k === kind ? ' on' : ''}`, onclick: () => { kind = k; drawKinds(); drawFields(); } },
      icon(d.icon), el('div', {}, el('b', {}, d.label), el('span', {}, d.desc)))));

  findBtn.addEventListener('click', async () => {
    findBtn.disabled = true;
    clear(found, el('span', { class: 'spin xs' }), ' Looking');
    try {
      const res = await api.call('remote:discover', draft(), secretValue());
      if (!res.servers.length) {
        clear(found, kind === 'pimpin' ? 'That PC has no servers yet.' : 'This key cannot see any servers.');
        return;
      }
      const keep = f.server.value;
      clear(f.server, res.servers.map((s) => el('option', { value: s.id }, kind === 'pimpin' ? `${s.name} (${s.mcVersion})` : `${s.name}${s.node ? ` · ${s.node}` : ''}`)));
      if (res.servers.some((s) => s.id === keep)) f.server.value = keep;
      const pick = () => {
        const s = res.servers.find((x) => x.id === f.server.value);
        if (!s) return;
        if (!f.name.value.trim() || f.name.dataset.auto) {
          f.name.value = s.name;
          f.name.dataset.auto = '1';
        }
        if (kind === 'pimpin') {
          gamePort = s.port;
          if (!f.mcVersion.value || f.mcVersion.dataset.auto) {
            f.mcVersion.value = s.mcVersion || '';
            f.mcVersion.dataset.auto = '1';
          }
        }
        if (kind === 'pterodactyl' && s.address && (!f.address.value || f.address.dataset.auto)) {
          f.address.value = s.address;
          f.address.dataset.auto = '1';
        }
      };
      f.server.onchange = pick;
      pick();
      clear(found, kind === 'pimpin' ? `Connected to ${res.info.hostname || 'the other PC'}. ${res.servers.length} server${res.servers.length > 1 ? 's' : ''}.` : `${res.servers.length} server${res.servers.length > 1 ? 's' : ''} on this panel.`);
    } catch (err) {
      clear(found, el('span', { class: 'rs-err' }, err.message));
    } finally {
      findBtn.disabled = false;
    }
  });
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    clear(found, el('span', { class: 'spin xs' }), ' Testing');
    try {
      const res = await api.call('remote:discover', draft(), secretValue());
      if (res.ping) clear(found, `Online: ${res.ping.version.name}, ${res.ping.players.online}/${res.ping.players.max} players, ${res.ping.latency} ms`);
      else clear(found, 'RCON works. The password was accepted.');
    } catch (err) {
      clear(found, el('span', { class: 'rs-err' }, err.message));
    } finally {
      testBtn.disabled = false;
    }
  });

  const m = modal({
    title: existing ? `Edit ${existing.name}` : 'Connect a remote server',
    wide: true,
    body: [el('div', { class: 'field' }, 'Type', kinds), fields],
    actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), save],
  });
  m.box.classList.add('rs-modal');
  drawKinds();
  drawFields();
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const c = await api.call('remote:save', draft(), secretValue());
      await loadConnections();
      m.close();
      toast(existing ? 'Connection saved' : `${c.name} added`);
      navigate('servers', { remote: c.id });
    } catch (err) {
      save.disabled = false;
      errorToast(err);
    }
  });
  return m;
}

// ------------------------------------------------------------ detail --
export function renderRemoteDetail(page, id, navigate) {
  wire();
  let tab = 'console';
  let off = null;
  const head = el('div');
  const stats = el('div');
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  const conn = () => connections.find((c) => c.id === id);

  const powerBtn = (c, action) => {
    const [label, ic] = POWER_LABEL[action];
    const run = async () => {
      if ((action === 'kill' || action === 'stop') && !(await confirmModal(`${label} ${c.name}?`, action === 'kill' ? 'Kill ends the server process right away. The world may lose the last minutes of progress.' : 'Players on the server will be disconnected.', { confirm: label, danger: action === 'kill' }))) return;
      try {
        await api.call('remote:power', id, action);
        toast(`${label} sent`);
        setTimeout(() => refreshStatus(id).then(drawHead), 2500);
      } catch (err) {
        errorToast(err);
      }
    };
    if (action === 'start') return el('button', { class: 'play-btn', onclick: run }, icon(ic), label);
    if (action === 'stop') return el('button', { class: 'play-btn running', onclick: run }, icon(ic), label);
    return el('button', { class: `btn${action === 'kill' ? ' ghost danger' : ''}`, title: action === 'kill' ? 'End the server process right away' : `${label} the server`, onclick: run }, icon(ic), label);
  };

  const drawHead = () => {
    const c = conn();
    if (!c) return clear(head, el('button', { class: 'back', onclick: () => navigate('servers', { view: 'remote' }) }, icon('back'), 'All servers'), el('div', { class: 'card empty' }, 'Connection not found.'));
    const s = statuses[id];
    const online = s?.state === 'online' || s?.state === 'starting';
    const p = s?.ping?.players;
    const allowed = c.power || [];
    const primary = online ? (allowed.includes('stop') ? 'stop' : null) : allowed.includes('start') ? 'start' : null;
    const secondary = allowed.filter((a) => (a === 'restart' && online) || (a === 'kill' && s && s.state !== 'offline'));
    clear(head,
      el('button', { class: 'back', onclick: () => navigate('servers', { view: 'remote' }) }, icon('back'), 'All servers'),
      el('div', { class: 'detail-head' },
        faviconIcon(c, s, 'lg'),
        el('div', { class: 'grow' },
          el('h1', {}, c.name),
          el('div', { class: 'chips' },
            el('span', { class: 'chip accent' }, KINDS[c.kind].label),
            s?.address ? el('button', { class: 'chip click', title: 'Copy address', onclick: () => copy(s.address) }, icon('copy'), s.address) : null,
            chipFor(s),
            p ? el('span', { class: 'chip' }, icon('users'), `${p.online}/${p.max} online`) : null,
            s?.ping?.version?.name ? el('span', { class: 'chip' }, s.ping.version.name) : null,
            s?.ping ? el('span', { class: 'chip' }, icon('clock'), `${s.ping.latency} ms`) : null)),
        el('div', { class: 'row' },
          el('button', { class: 'btn icon ghost', title: 'Check now', onclick: () => refreshStatus(id).then(drawHead) }, icon('refresh')),
          el('button', { class: 'btn icon ghost', title: 'Edit connection', onclick: () => connectionModal(navigate, c) }, icon('edit')),
          el('button', {
            class: 'btn icon ghost danger',
            title: 'Remove connection',
            onclick: async () => {
              if (!(await confirmModal('Remove connection?', `"${c.name}" is removed from this launcher, including its saved password or key. The server itself is not touched.`, { confirm: 'Remove', danger: true }))) return;
              try {
                connections = await api.call('remote:remove', id);
                navigate('servers', { view: 'remote' });
              } catch (err) {
                errorToast(err);
              }
            },
          }, icon('trash')),
          secondary.map((a) => powerBtn(c, a)),
          el('button', { class: 'btn', onclick: () => join(c), disabled: s?.state !== 'online' }, icon('play'), 'Join'),
          primary ? powerBtn(c, primary) : null)),
      s?.ping?.motd ? el('div', { class: 'rs-motd-line' }, s.ping.motd) : null,
      s?.error ? el('div', { class: 'rs-error-line' }, icon('alert'), s.error) : !s?.ping && s?.pingError ? el('div', { class: 'rs-error-line muted' }, icon('info'), s.pingError) : null,
    );
    drawStats();
  };

  const drawStats = () => {
    const r = statuses[id]?.resources;
    if (!r) return clear(stats);
    const lim = r.limits || {};
    const stat = (label, value, sub) => el('div', { class: 'card rs-stat' }, el('span', {}, label), el('b', {}, value), sub ? el('i', {}, sub) : null);
    clear(stats, el('div', { class: 'rs-stats' },
      stat('CPU', `${r.cpu.toFixed(1)}%`, lim.cpu ? `of ${lim.cpu}%` : 'no limit'),
      stat('Memory', fmtBytes(r.memory), lim.memory ? `of ${fmtBytes(lim.memory * 1024 * 1024)}` : 'no limit'),
      stat('Disk', fmtBytes(r.disk), lim.disk ? `of ${fmtBytes(lim.disk * 1024 * 1024)}` : 'no limit'),
      stat('Uptime', r.uptime ? fmtDuration(r.uptime / 1000) || '<1m' : 'Stopped')));
  };

  const drawTabs = () => {
    const defs = [['console', 'Console', 'terminal'], ['players', 'Players', 'users']];
    clear(tabs, defs.map(([k, l, ic]) => el('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawBody(); } }, icon(ic), l)));
  };

  const drawBody = () => {
    off?.();
    off = null;
    clear(body);
    const c = conn();
    if (!c) return;
    if (tab === 'console') off = drawConsole(body, c);
    else drawPlayers(body, c);
  };

  page.append(head, stats, tabs, body);
  const start = () => {
    drawHead();
    drawTabs();
    drawBody();
    refreshStatus(id).then(drawHead);
  };
  if (conn()) start();
  else loadConnections().then(start).catch(errorToast);
  const unsub = onStatus((sid) => sid === id && drawHead());
  const timer = setInterval(() => refreshStatus(id).then(drawHead), 15000);
  return () => {
    unsub();
    clearInterval(timer);
    off?.();
  };
}

function drawConsole(root, c) {
  if (c.kind === 'address') {
    root.append(el('div', { class: 'card empty' }, icon('terminal'), el('h3', {}, 'No console for address-only connections'),
      el('div', {}, 'Edit the connection and pick RCON, a hosting panel or another Pimpin PC to run commands.')));
    return null;
  }
  const { box, add } = consoleView([]);
  const input = el('input', { class: 'input', placeholder: 'Type a command, e.g. list  (↑ for history)' });
  const history = [];
  let hIndex = -1;
  const send = async () => {
    const cmd = input.value.trim().replace(/^\//, '');
    if (!cmd) return;
    input.disabled = true;
    try {
      await api.call('remote:command', c.id, cmd);
      history.unshift(cmd);
      hIndex = -1;
      input.value = '';
    } catch (err) {
      errorToast(err);
    } finally {
      input.disabled = false;
      input.focus();
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
    if (e.key === 'ArrowUp' && history.length) {
      hIndex = Math.min(history.length - 1, hIndex + 1);
      input.value = history[hIndex];
      e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
      hIndex = Math.max(-1, hIndex - 1);
      input.value = hIndex < 0 ? '' : history[hIndex];
      e.preventDefault();
    }
  });
  const note = c.kind === 'rcon' ? 'RCON shows the reply to each command. It does not stream the server log.' : c.kind === 'pimpin' ? 'Live log from the other PC.' : 'Live console from the panel.';
  root.append(
    el('div', { class: 'filter-row' },
      [['Players', 'list', 'users'], ['Save world', 'save-all', 'archive'], ['Make day', 'time set day', 'sun']].map(([label, cmd, ic]) =>
        el('button', { class: 'btn sm', onclick: () => api.call('remote:command', c.id, cmd).catch(errorToast) }, icon(ic), label)),
      el('span', { class: 'grow muted rs-console-note' }, note),
      el('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(box.innerText); toast('Log copied to clipboard'); } }, icon('copy'), 'Copy log')),
    box,
    el('div', { class: 'console-input' }, input, el('button', { class: 'btn primary', onclick: send }, icon('send'), 'Send')),
  );
  let alive = true;
  api.call('remote:console', c.id, true).then((r) => {
    if (!alive) return;
    r.lines.forEach(add);
    if (!r.lines.length && r.live) add('[Pimpin] Connected to the live console.');
  }).catch((err) => add(`[Pimpin] ${err.message}`));
  const offLog = api.on('remote:log', (e) => e.id === c.id && add(e.line));
  return () => {
    alive = false;
    offLog();
    api.call('remote:console', c.id, false).catch(() => {});
  };
}

async function drawPlayers(root, c) {
  root.append(el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading'));
  let info;
  try {
    info = await api.call('remote:players', c.id);
  } catch (err) {
    clear(root, el('div', { class: 'card empty' }, icon('alert'), el('h3', {}, 'Could not load players'), el('div', {}, err.message)));
    return;
  }
  const head = (n) => el('img', { class: 'p-head', src: `https://mc-heads.net/avatar/${encodeURIComponent(n.replace(/^\./, ''))}/32`, alt: '', loading: 'lazy' });
  const section = (title, ic, names, empty) =>
    el('div', { class: 'card p-section' },
      el('h3', {}, icon(ic), title, el('span', { class: 'count' }, String(names.length))),
      names.length ? names.map((n) => el('div', { class: 'p-row' }, head(n), el('b', { class: 'grow' }, n))) : el('div', { class: 'dim p-empty' }, empty));
  const total = info.online === null ? 'unknown' : `${info.online}${info.max ? ` of ${info.max}` : ''}`;
  clear(root,
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, `Online: ${total}`, info.source === 'ping' ? ' · from the server list ping' : info.source === 'rcon' ? ' · from the list command' : ' · from the other PC'),
      el('button', { class: 'btn sm', onclick: () => { clear(root); drawPlayers(root, c); } }, icon('refresh'), 'Refresh')),
    info.note ? el('p', { class: 'hint rs-note' }, info.note) : null,
    el('div', { class: 'players-grid' },
      section('Online now', 'wifi', info.names || [], info.online ? 'The server hides player names.' : 'Nobody is online.'),
      info.ops ? section('Operators', 'shield', info.ops, 'No operators.') : null,
      info.whitelist ? section('Whitelist', 'check', info.whitelist, 'Whitelist is empty.') : null));
}

// ---------------------------------------------------- share this PC --
/** "Share this PC" card for the This PC view: the host agent settings. */
export function shareThisPcCard() {
  const card = el('div', { class: 'card settings-card rs-share' });
  let showToken = false;
  const draw = (st) => {
    const port = el('input', { class: 'input rs-port', type: 'number', min: 1024, max: 65535, value: st.port });
    const savePort = async () => {
      const v = Number(port.value);
      if (v === st.port) return;
      try {
        draw(await api.call('remote-host:update', { port: v }));
        toast(`Share this PC now uses port ${v}`);
      } catch (err) {
        errorToast(err);
        port.value = st.port;
      }
    };
    port.addEventListener('change', savePort);
    clear(card,
      el('div', { class: 'set-row' },
        el('div', { class: 'grow' }, el('b', {}, 'Share this PC'), el('span', {}, 'Let another Pimpin Launcher see, start, stop and run commands on the servers on this PC.')),
        switchEl(st.enabled, async (on) => {
          try {
            const next = await api.call('remote-host:update', { enabled: on });
            draw(next);
            if (next.error) errorToast(new Error(next.error));
          } catch (err) {
            errorToast(err);
          }
        })),
      st.enabled ? [
        st.error ? el('div', { class: 'rs-error-line' }, icon('alert'), st.error) : null,
        el('div', { class: 'rs-share-grid' },
          el('div', { class: 'field' }, 'Address for the other PC',
            el('div', { class: 'chips rs-chips' }, st.addresses.length ? st.addresses.map((a) => el('button', { class: 'chip click', title: 'Copy', onclick: () => copy(a) }, icon('copy'), a)) : el('span', { class: 'dim' }, 'No network address found'))),
          el('label', { class: 'field' }, 'Port', port)),
        el('div', { class: 'field' }, 'Pairing token',
          el('div', { class: 'row rs-token-row' },
            el('code', { class: 'rs-token' }, showToken ? st.token : '•'.repeat(24)),
            el('button', { class: 'btn sm', onclick: () => { showToken = !showToken; draw(st); } }, icon('eye'), showToken ? 'Hide' : 'Show'),
            el('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(st.token); toast('Pairing token copied'); } }, icon('copy'), 'Copy'),
            el('button', {
              class: 'btn sm',
              onclick: async () => {
                if (!(await confirmModal('New pairing token?', 'PCs that use the old token lose access until you give them the new one.', { confirm: 'Regenerate' }))) return;
                draw(await api.call('remote-host:regenerate').catch((err) => (errorToast(err), st)));
              },
            }, icon('refresh'), 'Regenerate'))),
        el('p', { class: 'rs-warn' }, icon('alert'),
          el('span', {}, 'Anyone on your network who has this token can start and stop your servers and run console commands. The connection is not encrypted. To reach this PC from the internet, use a VPN like Tailscale or forward the port on your router.')),
      ] : null);
  };
  api.call('remote-host:status').then(draw).catch((err) => clear(card, el('div', { class: 'muted' }, `Share this PC is unavailable: ${err.message}`)));
  return card;
}

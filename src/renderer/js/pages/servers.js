// Servers: run a local Paper, Purpur or Vanilla server, tweak its properties,
// manage players, back up worlds, install plugins and join with one click.
import { el, icon, clear, modal, errorToast, toast, confirmModal, switchEl, seg, fmtBytes, fmtDuration, timeAgo } from '../dom.js';
import { api, state, subscribe, refreshServers, selectInstance, activeAccount, SERVER_LABEL } from '../state.js';
import { playInstance, newInstanceModal } from '../components.js';
import { consoleView } from './instances.js';
import { fileBrowser } from '../files.js';

const PLUGIN_SOFTWARE = new Set(['paper', 'purpur']);
const STARTERS = [
  { slug: 'essentialsx', name: 'EssentialsX', desc: '/home, /tpa, /spawn, kits & more' },
  { slug: 'luckperms', name: 'LuckPerms', desc: 'Ranks & permissions' },
  { slug: 'worldedit', name: 'WorldEdit', desc: 'Build fast with //wand' },
  { slug: 'chunky', name: 'Chunky', desc: 'Pre-generate the world' },
  { slug: 'viaversion', name: 'ViaVersion', desc: 'Let newer clients join' },
  { slug: 'geyser', name: 'Geyser', desc: 'Bedrock players can join', extra: ['floodgate'] },
];
const tabMem = {};

export function render(page, params, navigate) {
  if (params.id) return renderDetail(page, params.id, navigate);
  return renderList(page, params, navigate);
}

const software = (s) => SERVER_LABEL[s.software] || 'Paper';
const canPlugins = (s) => PLUGIN_SOFTWARE.has(s.software || 'paper');
const statusChip = (s) => {
  const st = state.server[s.id]?.state;
  if (s.running && s.ready) return el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Online');
  if (s.running || st === 'preparing') return el('span', { class: 'chip warn' }, el('span', { class: 'spin xs' }), 'Starting');
  return el('span', { class: 'chip' }, 'Offline');
};

function serverIcon(s, size = '') {
  return el('div', { class: `inst-icon ${size} ${s.running ? 'ic-emerald' : 'ic-night'}` }, icon('server'));
}

function renderList(page, params, navigate) {
  const grid = el('div', { class: 'inst-grid' });
  const lan = el('span');
  api.call('servers:network').then((n) => n.lan[0] && clear(lan, el('span', { class: 'chip' }, icon('wifi'), `Your LAN address: ${n.lan[0]}`))).catch(() => {});
  const draw = () => {
    if (!state.servers.length) {
      return clear(grid, el('div', { class: 'card empty', style: { gridColumn: '1 / -1' } }, icon('server'), el('h3', {}, 'No servers'),
        el('div', {}, 'A local server runs on this PC. Friends on the same network can join with the LAN address.'),
        el('button', { class: 'btn primary', onclick: () => newServerModal(navigate) }, icon('plus'), 'New server')));
    }
    clear(
      grid,
      state.servers.map((s) =>
        el('div', { class: `card inst-card${s.running ? ' running' : ''}`, onclick: () => navigate('servers', { id: s.id }) },
          el('div', { class: 'top' }, serverIcon(s), el('div', { class: 'grow' }, el('b', {}, s.name), el('span', {}, `${software(s)} ${s.mcVersion} · port ${s.port}`))),
          el('div', { class: 'bottom' },
            statusChip(s),
            s.running ? el('span', { class: 'chip' }, icon('users'), String(s.online?.length || 0)) : null,
            s.pluginCount ? el('span', { class: 'chip' }, icon('puzzle'), String(s.pluginCount)) : null,
            el('span', { class: 'dim' }, `${(s.memory / 1024).toFixed(1)} GB RAM`))),
      ),
    );
  };
  page.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', { class: 'page-title' }, 'Servers'), el('p', { class: 'page-sub' }, 'Local Paper, Purpur and Vanilla servers with plugins, backups and player management.')),
      el('div', { class: 'row' }, lan, el('button', { class: 'btn primary', onclick: () => newServerModal(navigate) }, icon('plus'), 'New server'))),
    grid,
  );
  draw();
  if (params.create) newServerModal(navigate);
  return subscribe((t) => (t === 'servers' || t === 'server-players') && draw());
}

const selectEl = (options, value) => {
  const s = el('select', { class: 'select' }, options.map(([v, l]) => el('option', { value: v }, l)));
  s.value = value;
  return s;
};
const GAMEMODES = [['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure'], ['spectator', 'Spectator']];
const DIFFICULTIES = [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];

async function newServerModal(navigate) {
  let kind = 'paper';
  const name = el('input', { class: 'input', placeholder: 'My server', maxlength: 40 });
  const version = el('select', { class: 'select' }, el('option', {}, 'Loading'));
  const memory = el('input', { type: 'range', min: 1024, max: Math.max(2048, state.settings.totalMemory - 2048), step: 512, value: 2048 });
  const memVal = el('div', { class: 'mem-val' }, '2.0 GB');
  memory.addEventListener('input', () => (memVal.textContent = `${(memory.value / 1024).toFixed(1)} GB`));
  const port = el('input', { class: 'input', type: 'number', value: 25565 + state.servers.length });
  const gamemode = selectEl(GAMEMODES, 'survival');
  const difficulty = selectEl(DIFFICULTIES, 'normal');
  const maxPlayers = el('input', { class: 'input', type: 'number', value: 10, min: 1, max: 1000 });
  const offlineAcc = activeAccount()?.type === 'offline';
  const crack = el('input', { type: 'checkbox', checked: offlineAcc });
  const eula = el('input', { type: 'checkbox' });
  const picked = new Set(['essentialsx', 'luckperms']);
  const starters = el('div', { class: 'starter-grid' }, STARTERS.map((p) => {
    const box = el('input', { type: 'checkbox', checked: picked.has(p.slug) });
    box.addEventListener('change', () => (box.checked ? picked.add(p.slug) : picked.delete(p.slug)));
    return el('label', { class: 'starter' }, box, el('div', {}, el('b', {}, p.name), el('span', {}, p.desc)));
  }));
  const starterField = el('div', { class: 'field' }, 'Starter plugins', starters);
  const create = el('button', { class: 'btn primary' }, icon('plus'), 'Create server');

  const loadVersions = async () => {
    clear(version, el('option', {}, 'Loading'));
    starterField.classList.toggle('hidden', !PLUGIN_SOFTWARE.has(kind));
    try {
      const versions = await api.call('servers:versions', kind);
      clear(version, versions.map((v) => el('option', { value: v }, v)));
    } catch (err) {
      errorToast(err);
    }
  };

  const m = modal({
    title: 'New server',
    wide: true,
    body: [
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
        el('label', { class: 'field' }, 'Name', name),
        el('div', { class: 'field' }, 'Software', seg([
          { value: 'paper', label: 'Paper' },
          { value: 'purpur', label: 'Purpur' },
          { value: 'vanilla', label: 'Vanilla' },
        ], kind, (v) => { kind = v; loadVersions(); }))),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr 1fr' } },
        el('label', { class: 'field' }, 'Minecraft version', version),
        el('label', { class: 'field' }, 'Port', port),
        el('label', { class: 'field' }, 'Max players', maxPlayers)),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
        el('label', { class: 'field' }, 'Game mode', gamemode),
        el('label', { class: 'field' }, 'Difficulty', difficulty)),
      el('label', { class: 'field' }, 'Memory', el('div', { class: 'set-row' }, memory, memVal)),
      starterField,
      el('label', { class: 'check-row' }, crack, el('div', {}, el('b', {}, 'Allow offline accounts'), el('span', {}, 'Turns off online-mode so offline / non-premium accounts can join. Only do this for servers with friends.'))),
      el('label', { class: 'check-row' }, eula, el('div', {}, el('b', {}, 'I agree to the Minecraft EULA'), el('span', {}, 'Required to run a server: https://aka.ms/MinecraftEULA'))),
    ],
    actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), create],
  });
  loadVersions();
  create.addEventListener('click', async () => {
    create.disabled = true;
    try {
      const s = await api.call('servers:create', {
        name: name.value.trim() || undefined,
        software: kind,
        mcVersion: version.value,
        memory: Number(memory.value),
        port: Number(port.value) || 25565,
        properties: {
          gamemode: gamemode.value,
          difficulty: difficulty.value,
          'max-players': Number(maxPlayers.value) || 10,
          'online-mode': !crack.checked,
          motd: `${name.value.trim() || 'A Pimpin server'}`,
        },
      });
      if (eula.checked) await api.call('servers:update', s.id, { eulaAccepted: true });
      await refreshServers();
      m.close();
      navigate('servers', { id: s.id });
      if (PLUGIN_SOFTWARE.has(kind) && picked.size) installStarters(s, [...picked]);
    } catch (err) {
      create.disabled = false;
      errorToast(err);
    }
  });
}

async function installStarters(s, slugs) {
  const target = { kind: 'server', id: s.id };
  const failed = [];
  const all = slugs.flatMap((slug) => [slug, ...(STARTERS.find((p) => p.slug === slug)?.extra || [])]);
  for (const slug of all) {
    try {
      await api.call('content:install', target, { projectId: slug, type: 'plugin' });
    } catch {
      failed.push(STARTERS.find((p) => p.slug === slug)?.name || slug);
    }
  }
  await refreshServers();
  if (failed.length) toast(`Not available for ${s.mcVersion}: ${failed.join(', ')}`, 'err', 7000);
  else toast(`Starter plugins installed on ${s.name}`);
}

function renderDetail(page, id, navigate) {
  let tab = tabMem[id] || 'console';
  const head = el('div');
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  let off = null;
  let lan = null;
  const srv = () => state.servers.find((s) => s.id === id);
  api.call('servers:network').then((n) => { lan = n.lan[0] || null; drawHead(); }).catch(() => {});

  const join = async () => {
    const s = srv();
    const acc = activeAccount();
    if (acc?.type === 'offline') {
      const props = await api.call('servers:properties', id).catch(() => ({}));
      if (props['online-mode'] !== 'false') {
        const ok = await confirmModal('Offline account', `"${acc.name}" is an offline account, but this server only lets Microsoft accounts in (online-mode). Allow offline accounts and restart the server?`, { confirm: 'Allow & restart' });
        if (!ok) return;
        await api.call('servers:setProperties', id, { 'online-mode': false });
        await api.call('servers:restart', id).catch(errorToast);
        toast('Restarting. Press Join again once it is online.');
        return;
      }
    }
    let inst = state.instances.find((i) => i.mcVersion === s.mcVersion);
    if (!inst) {
      if (await confirmModal('No matching instance', `You need a Minecraft ${s.mcVersion} instance to join this server. Create one now?`, { confirm: 'Create instance' })) {
        newInstanceModal({ mcVersion: s.mcVersion, onCreated: (i) => playInstance(i.id, { server: `localhost:${s.port}` }) });
      }
      return;
    }
    await selectInstance(inst.id);
    playInstance(inst.id, { server: `localhost:${s.port}` });
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  };

  const startServer = async () => {
    if (!srv().eulaAccepted && !(await eulaPrompt())) return;
    try {
      state.server[id] = { state: 'preparing' };
      drawHead();
      tab = 'console';
      drawTabs();
      drawBody();
      await api.call('servers:start', id);
    } catch (err) {
      state.server[id] = { state: 'stopped' };
      drawHead();
      errorToast(err);
    }
  };

  const drawHead = () => {
    const s = srv();
    if (!s) return clear(head, el('div', { class: 'card empty' }, 'Server not found.'));
    const preparing = state.server[id]?.state === 'preparing';
    clear(
      head,
      el('button', { class: 'back', onclick: () => navigate('servers') }, icon('back'), 'All servers'),
      el('div', { class: 'detail-head' },
        serverIcon(s, 'lg'),
        el('div', { class: 'grow' },
          el('h1', {}, s.name),
          el('div', { class: 'chips' },
            el('span', { class: 'chip accent' }, `${software(s)} ${s.mcVersion}${s.build ? ` #${s.build}` : ''}`),
            el('button', { class: 'chip click', title: 'Copy address', onclick: () => copy(`localhost:${s.port}`) }, icon('copy'), `localhost:${s.port}`),
            lan ? el('button', { class: 'chip click', title: 'Friends on the same Wi-Fi can join with this address', onclick: () => copy(`${lan}:${s.port}`) }, icon('wifi'), `LAN ${lan}:${s.port}`) : null,
            statusChip(s),
            s.running ? el('span', { class: 'chip' }, icon('users'), `${s.online?.length || 0} online`) : null,
            s.running && s.started ? el('span', { class: 'chip' }, icon('clock'), `Up ${fmtDuration((Date.now() - s.started) / 1000) || '<1m'}`) : null)),
        el('div', { class: 'row' },
          el('button', { class: 'btn icon ghost', title: 'Open folder', onclick: () => api.call('servers:open', id) }, icon('folder')),
          el('button', {
            class: 'btn icon ghost danger',
            title: 'Delete server',
            onclick: async () => {
              if (!(await confirmModal('Delete server?', `"${s.name}" and its world will be permanently deleted.`, { confirm: 'Delete', danger: true }))) return;
              try {
                await api.call('servers:delete', id);
                await refreshServers();
                navigate('servers');
              } catch (err) {
                errorToast(err);
              }
            },
          }, icon('trash')),
          s.running ? el('button', { class: 'btn icon ghost', title: 'Restart', onclick: () => api.call('servers:restart', id).catch(errorToast) }, icon('refresh')) : null,
          el('button', { class: 'btn', onclick: join, disabled: !s.running }, icon('play'), 'Join'),
          s.running
            ? el('button', { class: 'play-btn running', onclick: () => api.call('servers:stop', id) }, icon('stop'), 'Stop')
            : el('button', { class: `play-btn${preparing ? ' busy' : ''}`, disabled: preparing, onclick: startServer },
                preparing ? el('span', { class: 'spin xs' }) : icon('play'), preparing ? 'Starting' : 'Start')),
      ),
    );
  };

  const eulaPrompt = async () => {
    const ok = await confirmModal(
      'Minecraft EULA',
      'To run a Minecraft server you must agree to the Minecraft End User License Agreement (https://aka.ms/MinecraftEULA).',
      { confirm: 'I agree' },
    );
    if (!ok) return false;
    await api.call('servers:update', id, { eulaAccepted: true });
    await refreshServers();
    return true;
  };

  const drawTabs = () => {
    const defs = [
      ['console', 'Console', 'terminal'],
      ['players', 'Players', 'users'],
      ['plugins', 'Plugins', 'puzzle'],
      ['properties', 'Properties', 'sliders'],
      ['backups', 'Backups', 'archive'],
      ['files', 'Files', 'folder'],
      ['settings', 'Settings', 'settings'],
    ];
    clear(tabs, defs.map(([k, l, ic]) =>
      el('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; tabMem[id] = k; drawTabs(); drawBody(); } }, icon(ic), l)));
  };

  const drawBody = () => {
    off?.();
    off = null;
    clear(body);
    const s = srv();
    if (!s) return;
    if (tab === 'console') off = drawConsole(body, s);
    if (tab === 'players') off = drawPlayers(body, s);
    if (tab === 'plugins') drawPlugins(body, s, navigate);
    if (tab === 'properties') drawProperties(body, s);
    if (tab === 'backups') drawBackups(body, s);
    if (tab === 'files') fileBrowser(body, { kind: 'server', id: s.id }, { rootLabel: s.name });
    if (tab === 'settings') drawSettings(body, s);
  };

  page.append(head, tabs, body);
  drawHead();
  drawTabs();
  drawBody();
  const unsub = subscribe((t) => (t === 'servers' || t === 'server-players') && drawHead());
  const timer = setInterval(() => srv()?.running && drawHead(), 30000);
  return () => {
    unsub();
    clearInterval(timer);
    off?.();
  };
}

const QUICK = [
  ['Save world', 'save-all', 'archive'],
  ['Make day', 'time set day', 'sun'],
  ['Clear weather', 'weather clear', 'sparkle'],
  ['Players', 'list', 'users'],
];

function drawConsole(root, s) {
  const { box, add } = consoleView([]);
  const input = el('input', { class: 'input', placeholder: 'Type a command, e.g. op YourName  (↑ for history)' });
  const history = [];
  let hIndex = -1;
  const send = async (cmd) => {
    try {
      await api.call('servers:command', s.id, cmd);
      return true;
    } catch (err) {
      errorToast(err);
      return false;
    }
  };
  const sendCmd = async () => {
    const cmd = input.value.trim().replace(/^\//, '');
    if (!cmd) return;
    if (await send(cmd)) {
      history.unshift(cmd);
      hIndex = -1;
      input.value = '';
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCmd();
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
  const quick = [...QUICK, ...(canPlugins(s) ? [['TPS', 'tps', 'bolt']] : [])];
  root.append(
    el('div', { class: 'filter-row' },
      quick.map(([label, cmd, ic]) => el('button', { class: 'btn sm', onclick: () => send(cmd) }, icon(ic), label)),
      el('button', { class: 'btn sm', onclick: () => { input.value = 'say '; input.focus(); } }, icon('send'), 'Broadcast'),
      el('span', { class: 'grow' }),
      el('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(box.innerText); toast('Log copied to clipboard'); } }, icon('copy'), 'Copy log')),
    box,
    el('div', { class: 'console-input' }, input, el('button', { class: 'btn primary', onclick: sendCmd }, icon('send'), 'Send')),
  );
  api.call('servers:logs', s.id).then((lines) => {
    if (!lines.length) add(s.eulaAccepted ? '[Pimpin] Server is offline. Press Start.' : '[Pimpin] Accept the Minecraft EULA by pressing Start.');
    lines.forEach(add);
  });
  return api.on('server:log', (e) => e.id === s.id && add(e.line));
}

function drawPlayers(root, s) {
  const lists = el('div', { class: 'players-grid' });
  const nameIn = el('input', { class: 'input', placeholder: 'Player name', maxlength: 20, style: { width: '220px' } });
  const head = (n) => el('img', { class: 'p-head', src: `https://mc-heads.net/avatar/${encodeURIComponent(n.replace(/^\./, ''))}/32`, alt: '', loading: 'lazy' });
  const act = async (action, name) => {
    try {
      info = await api.call('servers:playerAction', s.id, action, name);
      draw();
      toast(`${action} ${name}`);
    } catch (err) {
      errorToast(err);
    }
  };
  let info = { online: [], ops: [], whitelist: [], banned: [] };
  const section = (title, ic, names, empty, actions) =>
    el('div', { class: 'card p-section' },
      el('h3', {}, icon(ic), title, el('span', { class: 'count' }, String(names.length))),
      names.length
        ? names.map((n) => el('div', { class: 'p-row' }, head(n), el('b', { class: 'grow' }, n), actions.map(([label, a, cls]) => el('button', { class: `btn sm ${cls || 'ghost'}`, onclick: () => act(a, n) }, label))))
        : el('div', { class: 'dim p-empty' }, empty));
  const draw = () => {
    const live = srv()?.running;
    clear(lists,
      section('Online now', 'wifi', info.online, live ? 'Nobody is online yet.' : 'The server is offline.', [['OP', 'op'], ['Kick', 'kick'], ['Ban', 'ban', 'danger']]),
      section('Operators', 'shield', info.ops, 'No operators. OP yourself so you can use commands in-game.', [['Remove', 'deop']]),
      section('Whitelist', 'check', info.whitelist, 'Whitelist is empty. Turn it on in Properties to only let these players in.', [['Remove', 'unwhitelist']]),
      section('Banned', 'alert', info.banned, 'Nobody is banned.', [['Pardon', 'pardon']]));
  };
  const srv = () => state.servers.find((x) => x.id === s.id);
  const load = async () => {
    info = await api.call('servers:players', s.id).catch(() => info);
    draw();
  };
  const add = (action) => {
    const n = nameIn.value.trim();
    if (n) act(action, n).then(() => (nameIn.value = ''));
  };
  root.append(
    el('div', { class: 'filter-row' },
      nameIn,
      el('button', { class: 'btn sm primary', onclick: () => add('op') }, icon('shield'), 'Make OP'),
      el('button', { class: 'btn sm', onclick: () => add('whitelist') }, icon('check'), 'Whitelist'),
      el('button', { class: 'btn sm danger', onclick: () => add('ban') }, icon('alert'), 'Ban'),
      el('span', { class: 'grow' }),
      el('span', { class: 'muted' }, s.running ? '' : 'Start the server to change players.')),
    lists,
  );
  load();
  return subscribe((t) => {
    if (t !== 'server-players' && t !== 'servers') return;
    info.online = srv()?.online || [];
    draw();
  });
}

async function drawPlugins(root, s, navigate) {
  if (!canPlugins(s)) {
    root.append(el('div', { class: 'card empty' }, icon('puzzle'), el('h3', {}, 'Vanilla servers cannot run plugins'), el('div', {}, 'Switch to Paper or Purpur in the Settings tab. Your world is kept.')));
    return;
  }
  const target = { kind: 'server', id: s.id };
  const list = el('div', { class: 'content-list' });
  const load = async () => {
    const items = await api.call('content:list', target);
    if (!items.length) {
      clear(list, el('div', { class: 'card empty' }, icon('puzzle'), el('h3', {}, 'No plugins yet'), el('div', {}, 'Grab EssentialsX, LuckPerms, WorldEdit and more from the library.')));
      return;
    }
    clear(list, items.map((i) =>
      el('div', { class: `content-row${i.enabled ? '' : ' off'}` },
        i.icon ? el('img', { src: i.icon, alt: '' }) : el('div', { class: 'ph' }, icon('puzzle')),
        el('div', { class: 'grow' }, el('b', {}, i.title), el('span', {}, i.versionNumber || i.file)),
        switchEl(i.enabled, async (on) => {
          await api.call('content:toggle', target, { type: 'plugin', file: i.file, enabled: on }).catch(errorToast);
          load();
        }),
        el('button', { class: 'btn ghost icon sm danger', onclick: async () => { await api.call('content:remove', target, { type: 'plugin', file: i.file }).catch(errorToast); load(); } }, icon('trash')))));
  };
  const updBtn = el('button', { class: 'btn sm' }, icon('refresh'), 'Check for updates');
  updBtn.addEventListener('click', async () => {
    updBtn.disabled = true;
    try {
      const updates = await api.call('content:checkUpdates', target);
      if (!updates.length) toast('All plugins are up to date');
      else if (await confirmModal(`${updates.length} update${updates.length > 1 ? 's' : ''} available`, updates.map((u) => `${u.title}: ${u.versionNumber} → ${u.newVersionNumber}`).join('\n'), { confirm: 'Update all' })) {
        await api.call('content:applyUpdates', target, updates);
        toast('Plugins updated. Restart the server to load them.');
        load();
      }
    } catch (err) {
      errorToast(err);
    } finally {
      updBtn.disabled = false;
    }
  });
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, s.running ? 'Restart the server after changing plugins.' : 'Plugins load the next time the server starts.'),
      updBtn,
      el('button', { class: 'btn sm', onclick: () => api.call('servers:open', s.id) }, icon('folder'), 'Folder'),
      el('button', { class: 'btn sm primary', onclick: () => navigate('library', { type: 'plugin', serverId: s.id }) }, icon('plus'), 'Add plugins')),
    list,
  );
  load().catch(errorToast);
}

// Common server.properties, with vanilla defaults.
const PROPS = [
  { key: 'motd', label: 'Message of the day', type: 'text', def: 'A Minecraft Server', wide: true },
  { key: 'gamemode', label: 'Game mode', type: 'select', options: GAMEMODES, def: 'survival' },
  { key: 'difficulty', label: 'Difficulty', type: 'select', options: DIFFICULTIES, def: 'easy' },
  { key: 'max-players', label: 'Max players', type: 'number', def: '20' },
  { key: 'view-distance', label: 'View distance (chunks)', type: 'number', def: '10' },
  { key: 'simulation-distance', label: 'Simulation distance', type: 'number', def: '10' },
  { key: 'spawn-protection', label: 'Spawn protection radius', type: 'number', def: '16' },
  { key: 'level-seed', label: 'World seed (new worlds only)', type: 'text', def: '' },
  { key: 'pvp', label: 'PvP', desc: 'Players can hurt each other', type: 'bool', def: 'true' },
  { key: 'online-mode', label: 'Online mode', desc: 'Only Microsoft accounts can join. Turn off to allow offline accounts.', type: 'bool', def: 'true' },
  { key: 'white-list', label: 'Whitelist', desc: 'Only whitelisted players can join', type: 'bool', def: 'false' },
  { key: 'hardcore', label: 'Hardcore', desc: 'Players are banned when they die', type: 'bool', def: 'false' },
  { key: 'allow-flight', label: 'Allow flight', desc: 'Stops kicks for "flying" with mods or elytra lag', type: 'bool', def: 'false' },
  { key: 'spawn-monsters', label: 'Monsters', desc: 'Hostile mobs spawn', type: 'bool', def: 'true' },
  { key: 'allow-nether', label: 'Nether', desc: 'Nether portals work', type: 'bool', def: 'true' },
  { key: 'enable-command-block', label: 'Command blocks', type: 'bool', def: 'false' },
];

async function drawProperties(root, s) {
  root.append(el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading'));
  const props = await api.call('servers:properties', s.id).catch(() => ({}));
  const inputs = {};
  const fields = [];
  const toggles = [];
  for (const p of PROPS) {
    const val = props[p.key] ?? p.def;
    if (p.type === 'bool') {
      const sw = switchEl(val === 'true', () => {});
      inputs[p.key] = () => String(sw.querySelector('input').checked);
      toggles.push(el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, p.label), p.desc ? el('span', {}, p.desc) : null), sw));
    } else {
      const input = p.type === 'select' ? selectEl(p.options, val) : el('input', { class: 'input', type: p.type, value: val });
      inputs[p.key] = () => input.value;
      fields.push(el('label', { class: 'field', style: p.wide ? { gridColumn: '1 / -1' } : null }, p.label, input));
    }
  }
  const save = el('button', { class: 'btn primary' }, icon('check'), 'Save properties');
  save.addEventListener('click', async () => {
    const patch = {};
    for (const [k, get] of Object.entries(inputs)) {
      const v = get();
      if (v !== (props[k] ?? PROPS.find((p) => p.key === k).def)) patch[k] = v;
    }
    if (!Object.keys(patch).length) return toast('Nothing changed');
    try {
      Object.assign(props, await api.call('servers:setProperties', s.id, patch));
      const live = state.servers.find((x) => x.id === s.id)?.running;
      if (live && (await confirmModal('Restart now?', 'The server reads its properties when it starts. Restart it now to apply the changes?', { confirm: 'Restart' }))) {
        api.call('servers:restart', s.id).catch(errorToast);
      } else toast(live ? 'Saved. Restart the server to apply.' : 'Saved');
    } catch (err) {
      errorToast(err);
    }
  });
  clear(root,
    el('div', { class: 'card settings-card' }, el('h3', {}, icon('globe'), 'World & gameplay'), el('div', { class: 'form-grid' }, fields)),
    el('div', { class: 'card settings-card' }, el('h3', {}, icon('shield'), 'Rules & access'), el('div', { class: 'toggle-grid' }, toggles)),
    el('div', { class: 'row', style: { justifyContent: 'space-between' } },
      el('span', { class: 'dim' }, 'Everything else is in server.properties in the Files tab.'),
      save));
}

async function drawBackups(root, s) {
  const list = el('div', { class: 'content-list' });
  const btn = el('button', { class: 'btn sm primary' }, icon('archive'), 'Back up now');
  const draw = (items) => {
    if (!items.length) {
      clear(list, el('div', { class: 'card empty' }, icon('archive'), el('h3', {}, 'No backups yet'), el('div', {}, 'Make a backup before trying risky plugins or big builds. It works while the server is running.')));
      return;
    }
    clear(list, items.map((b) =>
      el('div', { class: 'content-row' },
        el('div', { class: 'ph' }, icon('archive')),
        el('div', { class: 'grow' }, el('b', {}, new Date(b.created).toLocaleString()), el('span', {}, `${b.name} · ${fmtBytes(b.size)} · ${timeAgo(b.created)}`)),
        el('button', { class: 'btn sm ghost icon', title: 'Show in folder', onclick: () => api.call('files:reveal', { kind: 'server', id: s.id }, 'backups', b.name) }, icon('folder')),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            if (!(await confirmModal('Restore backup?', `The current world is replaced with the backup from ${new Date(b.created).toLocaleString()}. Make a fresh backup first if you might want it back.`, { confirm: 'Restore', danger: true }))) return;
            try {
              draw(await api.call('servers:restoreBackup', s.id, b.name));
              toast('World restored');
            } catch (err) {
              errorToast(err);
            }
          },
        }, icon('refresh'), 'Restore'),
        el('button', {
          class: 'btn ghost icon sm danger',
          title: 'Delete backup',
          onclick: async () => {
            if (!(await confirmModal('Delete backup?', b.name, { confirm: 'Delete', danger: true }))) return;
            draw(await api.call('servers:deleteBackup', s.id, b.name).catch((err) => (errorToast(err), [])));
          },
        }, icon('trash')))));
  };
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.replaceChildren(el('span', { class: 'spin xs' }), 'Backing up');
    try {
      draw(await api.call('servers:backup', s.id));
      toast('Backup saved');
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
      btn.replaceChildren(icon('archive'), 'Back up now');
    }
  });
  root.append(
    el('div', { class: 'filter-row' }, el('span', { class: 'muted grow' }, 'Backups are zips of the world folders, saved in the server\'s backups folder.'), btn),
    list,
  );
  draw(await api.call('servers:backups', s.id).catch(() => []));
}

function drawSettings(root, s) {
  const name = el('input', { class: 'input', value: s.name });
  const port = el('input', { class: 'input', type: 'number', value: s.port });
  const memory = el('input', { type: 'range', min: 1024, max: Math.max(2048, state.settings.totalMemory - 2048), step: 512, value: s.memory });
  const memVal = el('div', { class: 'mem-val' }, `${(s.memory / 1024).toFixed(1)} GB`);
  memory.addEventListener('input', () => (memVal.textContent = `${(memory.value / 1024).toFixed(1)} GB`));
  let kind = s.software || 'paper';
  const version = el('select', { class: 'select' }, el('option', { value: s.mcVersion }, s.mcVersion));
  const loadVersions = () =>
    api.call('servers:versions', kind).then((vs) => {
      const keep = version.value;
      clear(version, vs.map((v) => el('option', { value: v }, v)));
      version.value = vs.includes(keep) ? keep : vs[0];
    }).catch(() => {});
  loadVersions();
  const jvm = el('textarea', { class: 'input', rows: 2, placeholder: 'Extra JVM arguments (optional), e.g. -XX:+UseG1GC' }, s.jvmArgs || '');
  let autoRestart = Boolean(s.autoRestart);
  root.append(
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('settings'), 'Server'),
      el('div', { class: 'form-grid' }, el('label', { class: 'field' }, 'Name', name), el('label', { class: 'field' }, 'Port', port)),
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, 'Software', seg([{ value: 'paper', label: 'Paper' }, { value: 'purpur', label: 'Purpur' }, { value: 'vanilla', label: 'Vanilla' }], kind, (v) => { kind = v; loadVersions(); })),
        el('label', { class: 'field' }, 'Version', version)),
      el('label', { class: 'field' }, 'Memory', el('div', { class: 'set-row' }, memory, memVal)),
      el('label', { class: 'field' }, 'JVM arguments', jvm),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Restart after a crash'), el('span', {}, 'Brings the server back up automatically (at most 3 times in 10 minutes).')),
        switchEl(autoRestart, (v) => (autoRestart = v))),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Minecraft EULA'), el('span', {}, 'Required to run a server: https://aka.ms/MinecraftEULA')),
        switchEl(s.eulaAccepted, (v) => api.call('servers:update', s.id, { eulaAccepted: v }).then(refreshServers)))),
    el('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          try {
            if (kind !== (s.software || 'paper') && kind === 'vanilla' && !(await confirmModal('Switch to Vanilla?', 'Vanilla servers ignore plugins. They stay in the plugins folder if you switch back later.', { confirm: 'Switch' }))) return;
            await api.call('servers:update', s.id, {
              name: name.value.trim() || s.name,
              port: Number(port.value) || 25565,
              memory: Number(memory.value),
              mcVersion: version.value,
              software: kind,
              autoRestart,
              jvmArgs: jvm.value.trim() || null,
            });
            await refreshServers();
            toast(s.running ? 'Saved. Restart the server to apply.' : 'Saved');
          } catch (err) {
            errorToast(err);
          }
        },
      }, icon('check'), 'Save changes')),
  );
}

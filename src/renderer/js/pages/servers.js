// Servers: run a local Paper server, install plugins from the library and
// join it with one click.
import { el, icon, clear, modal, errorToast, toast, confirmModal, switchEl } from '../dom.js';
import { api, state, subscribe, refreshServers, selectInstance } from '../state.js';
import { playInstance, newInstanceModal } from '../components.js';
import { consoleView } from './instances.js';

export function render(page, params, navigate) {
  if (params.id) return renderDetail(page, params.id, navigate);
  return renderList(page, params, navigate);
}

function serverIcon(running) {
  return el('div', { class: `inst-icon ${running ? 'ic-emerald' : 'ic-night'}` }, icon('server'));
}

function renderList(page, params, navigate) {
  const grid = el('div', { class: 'inst-grid' });
  const draw = () =>
    clear(
      grid,
      state.servers.map((s) =>
        el('div', { class: `card inst-card${s.running ? ' running' : ''}`, onclick: () => navigate('servers', { id: s.id }) },
          el('div', { class: 'top' }, serverIcon(s.running), el('div', { class: 'grow' }, el('b', {}, s.name), el('span', {}, `Paper ${s.mcVersion} · port ${s.port}`))),
          el('div', { class: 'bottom' }, s.running ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Online') : el('span', { class: 'chip' }, 'Offline'), el('span', { class: 'dim' }, `${(s.memory / 1024).toFixed(1)} GB RAM`))),
      ),
      el('div', { class: 'card inst-card new', onclick: () => newServerModal(navigate) }, icon('plus'), el('b', {}, 'New server'), el('span', { class: 'dim' }, 'Paper — runs plugins')),
    );
  page.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', { class: 'page-title' }, 'Servers'), el('p', { class: 'page-sub' }, 'Host a local Paper server for you and your friends, with plugins from the library.')),
      el('button', { class: 'btn primary', onclick: () => newServerModal(navigate) }, icon('plus'), 'New server')),
    grid,
  );
  draw();
  if (params.create) newServerModal(navigate);
  return subscribe((t) => t === 'servers' && draw());
}

async function newServerModal(navigate) {
  const name = el('input', { class: 'input', placeholder: 'My server', maxlength: 40 });
  const version = el('select', { class: 'select' }, el('option', {}, 'Loading…'));
  const memory = el('input', { type: 'range', min: 1024, max: Math.max(2048, state.settings.totalMemory - 2048), step: 512, value: 2048 });
  const memVal = el('div', { class: 'mem-val' }, '2.0 GB');
  memory.addEventListener('input', () => (memVal.textContent = `${(memory.value / 1024).toFixed(1)} GB`));
  const port = el('input', { class: 'input', type: 'number', value: 25565 + state.servers.length });
  const create = el('button', { class: 'btn primary' }, icon('plus'), 'Create server');
  const m = modal({
    title: 'New Paper server',
    body: [
      el('label', { class: 'field' }, 'Name', name),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } }, el('label', { class: 'field' }, 'Minecraft version', version), el('label', { class: 'field' }, 'Port', port)),
      el('label', { class: 'field' }, 'Memory', el('div', { class: 'set-row' }, memory, memVal)),
    ],
    actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), create],
  });
  try {
    const versions = await api.call('servers:versions');
    clear(version, versions.map((v) => el('option', { value: v }, v)));
  } catch (err) {
    errorToast(err);
  }
  create.addEventListener('click', async () => {
    create.disabled = true;
    try {
      const s = await api.call('servers:create', { name: name.value.trim() || undefined, mcVersion: version.value, memory: Number(memory.value), port: Number(port.value) || 25565 });
      await refreshServers();
      m.close();
      navigate('servers', { id: s.id });
    } catch (err) {
      create.disabled = false;
      errorToast(err);
    }
  });
}

function renderDetail(page, id, navigate) {
  let tab = 'console';
  const head = el('div');
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  let off = null;
  const srv = () => state.servers.find((s) => s.id === id);

  const join = async () => {
    const s = srv();
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

  const drawHead = () => {
    const s = srv();
    if (!s) return clear(head, el('div', { class: 'card empty' }, 'Server not found.'));
    const preparing = state.server[id]?.state === 'preparing';
    clear(
      head,
      el('button', { class: 'back', onclick: () => navigate('servers') }, icon('back'), 'All servers'),
      el('div', { class: 'detail-head' },
        el('div', { class: `inst-icon lg ${s.running ? 'ic-emerald' : 'ic-night'}` }, icon('server')),
        el('div', { class: 'grow' },
          el('h1', {}, s.name),
          el('div', { class: 'chips' },
            el('span', { class: 'chip accent' }, `Paper ${s.mcVersion}${s.build ? ` #${s.build}` : ''}`),
            el('span', { class: 'chip' }, `localhost:${s.port}`),
            s.running ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Online') : el('span', { class: 'chip' }, 'Offline'))),
        el('div', { class: 'row' },
          el('button', { class: 'btn icon', title: 'Open folder', onclick: () => api.call('servers:open', id) }, icon('folder')),
          el('button', {
            class: 'btn icon danger',
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
          el('button', { class: 'btn', onclick: join, disabled: !s.running }, icon('play'), 'Join'),
          s.running
            ? el('button', { class: 'btn', style: { height: '44px', padding: '0 22px' }, onclick: () => api.call('servers:stop', id) }, icon('stop'), 'Stop')
            : el('button', {
                class: 'btn primary',
                style: { height: '44px', padding: '0 24px' },
                disabled: preparing,
                onclick: async () => {
                  if (!srv().eulaAccepted) return eulaPrompt();
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
                },
              }, preparing ? el('span', { class: 'spin' }) : icon('play'), preparing ? 'Starting…' : 'Start')),
      ),
    );
  };

  const eulaPrompt = async () => {
    const ok = await confirmModal(
      'Minecraft EULA',
      'To run a Minecraft server you must agree to the Minecraft End User License Agreement (https://aka.ms/MinecraftEULA).',
      { confirm: 'I agree' },
    );
    if (!ok) return;
    await api.call('servers:update', id, { eulaAccepted: true });
    await refreshServers();
    toast('EULA accepted — press Start');
  };

  const drawTabs = () =>
    clear(tabs, [['console', 'Console', 'terminal'], ['plugins', 'Plugins', 'puzzle'], ['settings', 'Settings', 'settings']].map(([k, l, ic]) =>
      el('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawBody(); } }, icon(ic), l)));

  const drawBody = () => {
    off?.();
    off = null;
    clear(body);
    const s = srv();
    if (!s) return;
    if (tab === 'console') off = drawConsole(body, s);
    if (tab === 'plugins') drawPlugins(body, s, navigate);
    if (tab === 'settings') drawSettings(body, s);
  };

  page.append(head, tabs, body);
  drawHead();
  drawTabs();
  drawBody();
  const unsub = subscribe((t) => t === 'servers' && drawHead());
  return () => {
    unsub();
    off?.();
  };
}

function drawConsole(root, s) {
  const { box, add } = consoleView([]);
  const input = el('input', { class: 'input', placeholder: 'Type a command, e.g. op YourName' });
  const sendCmd = async () => {
    const cmd = input.value.trim().replace(/^\//, '');
    if (!cmd) return;
    try {
      await api.call('servers:command', s.id, cmd);
      input.value = '';
    } catch (err) {
      errorToast(err);
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && sendCmd());
  root.append(box, el('div', { class: 'console-input' }, input, el('button', { class: 'btn primary', onclick: sendCmd }, icon('send'), 'Send')));
  api.call('servers:logs', s.id).then((lines) => {
    if (!lines.length) add(s.eulaAccepted ? '[Pimpin] Server is offline — press Start.' : '[Pimpin] Accept the Minecraft EULA by pressing Start.');
    lines.forEach(add);
  });
  return api.on('server:log', (e) => e.id === s.id && add(e.line));
}

async function drawPlugins(root, s, navigate) {
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
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, s.running ? 'Restart the server after changing plugins.' : 'Plugins load the next time the server starts.'),
      el('button', { class: 'btn sm', onclick: () => api.call('servers:open', s.id) }, icon('folder'), 'Folder'),
      el('button', { class: 'btn sm primary', onclick: () => navigate('library', { type: 'plugin', serverId: s.id }) }, icon('plus'), 'Add plugins')),
    list,
  );
  load().catch(errorToast);
}

function drawSettings(root, s) {
  const name = el('input', { class: 'input', value: s.name });
  const port = el('input', { class: 'input', type: 'number', value: s.port });
  const memory = el('input', { type: 'range', min: 1024, max: Math.max(2048, state.settings.totalMemory - 2048), step: 512, value: s.memory });
  const memVal = el('div', { class: 'mem-val' }, `${(s.memory / 1024).toFixed(1)} GB`);
  memory.addEventListener('input', () => (memVal.textContent = `${(memory.value / 1024).toFixed(1)} GB`));
  const version = el('select', { class: 'select' }, el('option', { value: s.mcVersion }, s.mcVersion));
  api.call('servers:versions').then((vs) => {
    clear(version, vs.map((v) => el('option', { value: v }, v)));
    version.value = s.mcVersion;
  }).catch(() => {});
  root.append(
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('settings'), 'Server'),
      el('div', { class: 'form-grid' }, el('label', { class: 'field' }, 'Name', name), el('label', { class: 'field' }, 'Port', port), el('label', { class: 'field' }, 'Version', version)),
      el('label', { class: 'field' }, 'Memory', el('div', { class: 'set-row' }, memory, memVal)),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Minecraft EULA'), el('span', {}, 'Required to run a server — https://aka.ms/MinecraftEULA')),
        switchEl(s.eulaAccepted, (v) => api.call('servers:update', s.id, { eulaAccepted: v }).then(refreshServers)))),
    el('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      el('button', {
        class: 'btn primary',
        onclick: async () => {
          try {
            await api.call('servers:update', s.id, { name: name.value.trim() || s.name, port: Number(port.value) || 25565, memory: Number(memory.value), mcVersion: version.value });
            await refreshServers();
            toast(s.running ? 'Saved — restart the server to apply' : 'Saved');
          } catch (err) {
            errorToast(err);
          }
        },
      }, icon('check'), 'Save changes')),
  );
}

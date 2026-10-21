// Home: the selected instance with Play, your skin, worlds and other
// instances to jump back into, one-click client features and news.
import { el, icon, clear, errorToast, toast, fmtDuration, timeAgo, switchEl } from '../dom.js';
import { api, state, subscribe, selectedInstance, selectInstance, activeAccount, refreshInstances, headUrl, LOADER_LABEL } from '../state.js';
import { instIcon, instSubtitle, playInstance, stopInstance, openInstancePicker, newInstanceModal } from '../components.js';
import { importInstance } from '../qol.js';
import { mountSkin } from '../skin3d.js';

let newsCache = null;

export function render(page, _params, navigate) {
  const top = el('div');
  const jump = el('div');
  const features = el('div');
  const news = el('div');
  page.append(top, jump, features, news);

  let playRefs = null;
  let skinKey = null;
  let skinCleanup = null;
  let featureFor = null;
  const skinPanel = el('div', { class: 'card home-skin' });

  const draw = (topic) => {
    const sel = selectedInstance();
    if (topic === 'game-progress') return updateProgress(playRefs, sel && state.game[sel.id]);
    if (!sel) {
      clear(top, welcome(navigate));
      jump.replaceChildren();
      features.replaceChildren();
      featureFor = null;
      return;
    }
    playRefs = playButton(sel);
    clear(top, el('div', { class: 'home-top' }, instancePanel(sel, playRefs.btn, navigate), skinPanel));
    updateProgress(playRefs, state.game[sel.id]);

    const acc = activeAccount();
    const key = `${acc?.id}|${state.settings.skinMode}`;
    if (key !== skinKey) {
      skinKey = key;
      skinCleanup?.();
      skinCleanup = null;
      drawSkin(skinPanel, acc).then((fn) => (skinCleanup = fn));
    }
    drawJump(jump, sel);
    if (sel.id !== featureFor || topic === 'instances-content') {
      featureFor = sel.id;
      if (state.settings.showFeatures === false) features.replaceChildren();
      else drawFeatures(features, sel, navigate);
    }
  };
  draw();
  if (state.settings.showNews !== false) drawNews(news);
  const unsub = subscribe((topic) => {
    if (['instances', 'instances-content', 'game', 'game-progress', 'accounts', 'settings'].includes(topic)) draw(topic);
  });
  return () => {
    unsub();
    skinCleanup?.();
  };
}

function welcome(navigate) {
  return el('div', { class: 'card home-welcome' },
    el('img', { src: 'img/logo.svg', alt: '', style: { width: '56px', height: '56px' } }),
    el('div', { class: 'grow' },
      el('h1', {}, 'No instances yet'),
      el('p', {}, 'An instance is one Minecraft setup: a game version, a mod loader and its own mods, worlds and settings. Java and game files are downloaded when you first press Play.'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: () => newInstanceModal() }, icon('plus'), 'New instance'),
        el('button', { class: 'btn', onclick: () => navigate('library', { type: 'modpack' }) }, icon('library'), 'Browse modpacks'),
        el('button', { class: 'btn ghost', onclick: () => importInstance(navigate) }, icon('upload'), 'Import file'))));
}

function playButton(sel) {
  const g = state.game[sel.id];
  if (g?.state === 'running') return { btn: el('button', { class: 'play-btn running', title: 'Force close the game', onclick: () => stopInstance(sel.id) }, icon('stop'), 'Stop') };
  if (g?.state === 'preparing') {
    const label = el('span', {}, 'Preparing');
    const fill = el('span', { class: 'fill' });
    return { btn: el('button', { class: 'play-btn busy' }, el('span', { class: 'spin xs' }), label, fill), label, fill };
  }
  return { btn: el('button', { class: 'play-btn', onclick: () => playInstance(sel.id) }, icon('play'), 'Play') };
}

function updateProgress(refs, g) {
  if (!refs?.label) return;
  const p = g?.progress || {};
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  refs.label.textContent = `${p.stage || 'Preparing'}${p.total > 1 ? ` ${pct}%` : ''}`;
  refs.fill.style.width = `${pct}%`;
}

function instancePanel(sel, play, navigate) {
  const running = state.game[sel.id]?.state === 'running';
  const switcher = el('button', { class: 'btn', title: 'Pick another instance' }, 'Switch', icon('chevron'));
  switcher.addEventListener('click', () => openInstancePicker(switcher, { align: 'left' }));
  const loader = `${LOADER_LABEL[sel.loader] || sel.loader}${sel.loaderVersion ? ` ${sel.loaderVersion}` : ''}`;
  return el('div', { class: 'card home-inst' },
    el('div', { class: 'head' },
      instIcon(sel, 'lg'),
      el('div', { class: 'grow' },
        el('h1', {}, sel.name),
        el('div', { class: 'meta' },
          `Minecraft ${sel.mcVersion}`, el('span', { class: 'sep' }, '·'), loader,
          sel.modpack ? [el('span', { class: 'sep' }, '·'), 'Modpack'] : null,
          running ? el('span', { class: 'chip ok', style: { marginLeft: '6px' } }, el('span', { class: 'dot' }), 'Running') : null))),
    el('div', { class: 'home-actions' },
      play,
      switcher,
      el('span', { class: 'grow' }),
      el('button', { class: 'btn icon ghost', title: 'Open folder', onclick: () => api.call('instances:open', sel.id) }, icon('folder')),
      el('button', { class: 'btn icon ghost', title: 'Instance settings', onclick: () => navigate('instances', { id: sel.id, tab: 'settings' }) }, icon('settings'))),
    el('div', { class: 'home-stats' },
      stat('Played', fmtDuration(sel.playTime)),
      stat('Last played', timeAgo(sel.lastPlayed)),
      stat('Installed', sel.contentCount ? `${sel.contentCount} mods & packs` : 'Nothing yet')));
}

const stat = (k, v) => el('div', {}, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));

async function drawSkin(panel, acc) {
  const stage = el('div', { class: 'stage-wrap' });
  clear(panel, stage,
    el('div', { class: 'who' },
      acc ? el('img', { class: 'avatar', src: headUrl(acc), alt: '' }) : el('div', { class: 'avatar' }),
      el('div', { class: 'grow' }, el('b', {}, acc ? acc.name : 'Not signed in'), el('span', {}, acc ? (acc.type === 'msa' ? 'Microsoft account' : 'Offline account') : 'Use the menu in the top right'))));
  const mode = state.settings.skinMode || '3d';
  if (!acc || mode === 'off') {
    stage.append(el('div', { class: 'empty' }, icon('user')));
    return null;
  }
  const player = acc.type === 'offline' ? acc.name : acc.id.replace(/-/g, '');
  const flat = () => stage.replaceChildren(el('img', { class: 'flat', src: `https://mc-heads.net/body/${encodeURIComponent(player)}/right`, alt: '', onerror: (e) => e.target.remove() }));
  if (mode === '2d') {
    flat();
    return null;
  }
  const cleanup = await mountSkin(stage, player, 5);
  if (!cleanup) flat();
  return cleanup;
}

async function drawJump(root, sel) {
  const others = state.instances.filter((i) => i.id !== sel.id && i.lastPlayed).slice(0, 4);
  const worldsRow = el('div', { class: 'tile-row' });
  clear(root,
    el('h2', { class: 'section' }, 'Jump back in'),
    worldsRow,
    others.length ? [el('h2', { class: 'section' }, 'Other instances'), el('div', { class: 'tile-row' }, others.map((i) =>
      el('div', { class: 'card tile', title: `Switch to ${i.name}`, onclick: () => selectInstance(i.id) },
        instIcon(i, 'sm'),
        el('div', { class: 'grow' }, el('b', {}, i.name), el('span', {}, `${instSubtitle(i)} · ${timeAgo(i.lastPlayed)}`)),
        el('button', { class: 'mini-play', title: `Play ${i.name}`, onclick: (e) => { e.stopPropagation(); selectInstance(i.id).then(() => playInstance(i.id)); } }, icon('play')))))] : null);

  let worlds = [];
  try {
    worlds = await api.call('instances:worlds', sel.id);
  } catch {
    // the saves folder can be missing on fresh instances
  }
  const busy = Boolean(state.game[sel.id]?.state);
  if (!worlds.length) {
    clear(worldsRow, el('div', { class: 'dim', style: { gridColumn: '1 / -1' } }, `No worlds in ${sel.name} yet. Worlds you create in-game show up here.`));
    return;
  }
  clear(worldsRow, worlds.slice(0, 4).map((w) =>
    el('div', { class: 'card tile', title: busy ? 'The game is already running' : `Play ${w.folder}`, onclick: () => !busy && playInstance(sel.id, { world: w.folder }) },
      w.icon ? el('img', { class: 'world-ico', src: w.icon, alt: '' }) : el('div', { class: 'world-ico' }, icon('globe')),
      el('div', { class: 'grow' }, el('b', {}, w.folder), el('span', {}, `Played ${timeAgo(w.lastPlayed).toLowerCase()}`)),
      busy ? null : el('span', { class: 'mini-play' }, icon('play')))));
}

async function drawFeatures(root, sel, navigate) {
  const head = el('h2', { class: 'section' }, 'Client features', el('small', {}, sel.name), el('span', { class: 'grow' }),
    el('button', { class: 'btn sm ghost', onclick: () => navigate('library', { type: 'mod', instanceId: sel.id }) }, 'Browse mods', icon('chevronRight')));
  if (sel.loader === 'vanilla') {
    const toFabric = el('button', { class: 'btn' }, icon('puzzle'), 'Switch to Fabric');
    toFabric.addEventListener('click', async () => {
      try {
        await api.call('instances:update', sel.id, { loader: 'fabric' });
        await refreshInstances();
        toast(`${sel.name} now uses Fabric`);
      } catch (err) {
        errorToast(err);
      }
    });
    clear(root, head, el('div', { class: 'card set-row', style: { padding: '14px 16px' } },
      el('div', { class: 'grow' }, el('b', {}, 'Vanilla instance'), el('span', {}, 'FPS mods, shaders, zoom and minimaps need Fabric.')), toFabric));
    return;
  }
  clear(root, head, el('div', { class: 'row muted' }, el('span', { class: 'spin xs' }), 'Loading'));
  try {
    const list = await api.call('features:list', { kind: 'instance', id: sel.id });
    clear(root, head, featureGrid(sel, list));
  } catch (err) {
    clear(root, head, el('div', { class: 'card empty' }, `Could not load features: ${err.message}`));
  }
}

export function featureGrid(inst, list) {
  return el('div', { class: 'feature-grid' }, list.map((f) => {
    const card = el('div', { class: `feature${f.enabled ? ' on' : ''}${f.note ? ' unavailable' : ''}` });
    const sw = switchEl(f.enabled, async (on, label, input) => {
      label.classList.add('busy');
      input.disabled = true;
      try {
        const res = await api.call('features:set', { kind: 'instance', id: inst.id }, f.id, on);
        card.classList.toggle('on', on);
        if (res.failed?.length) toast(`Not available for ${inst.mcVersion}: ${res.failed.join('; ')}`, 'err', 8000);
        else toast(`${f.name} ${on ? 'on' : 'off'}`);
      } catch (err) {
        input.checked = !on;
        errorToast(err);
      } finally {
        label.classList.remove('busy');
        input.disabled = false;
      }
    });
    if (f.note && !f.enabled) sw.querySelector('input').disabled = true;
    card.append(
      el('div', { class: 'ico' }, icon(f.icon)),
      el('div', { class: 'txt' }, el('b', {}, f.name, f.custom ? el('span', { class: 'chip accent' }, 'Pimpin') : null), el('span', {}, f.note ? `${f.desc} (${f.note})` : f.desc)),
      sw);
    return card;
  }));
}

async function drawNews(root) {
  try {
    newsCache = newsCache || (await api.call('news:get'));
    if (!newsCache.length) return;
    clear(root, el('h2', { class: 'section' }, 'Minecraft news'), el('div', { class: 'news-grid' }, newsCache.slice(0, 4).map((n) =>
      el('div', { class: 'card news', onclick: () => n.link && api.call('shell:openExternal', n.link) },
        n.image ? el('img', { src: n.image, alt: '', loading: 'lazy' }) : null,
        el('div', { class: 'body' }, el('div', { class: 'date' }, n.date), el('b', {}, n.title), el('p', {}, n.text))))));
  } catch {
    clear(root, el('h2', { class: 'section' }, 'Minecraft news'), el('div', { class: 'dim' }, 'News needs an internet connection.'));
  }
}

// Home: hero with the big PLAY button, client feature toggles and news.
import { el, icon, clear, errorToast, toast, fmtDuration, timeAgo, switchEl } from '../dom.js';
import { api, state, subscribe, selectedInstance, activeAccount, refreshInstances, LOADER_LABEL } from '../state.js';
import { instIcon, instSubtitle, playInstance, stopInstance, openInstancePicker, newInstanceModal } from '../components.js';
import { mountSkin, blockScene, effectsOn } from '../fx3d.js';

let newsCache = null;

export function render(page, _params, navigate) {
  const hero = el('div');
  const features = el('div');
  const news = el('div');
  page.append(hero, features, news);

  let featureFor = null;
  const draw = (topic) => {
    renderHero(hero, navigate, topic);
    const sel = selectedInstance();
    if (topic !== 'game-progress' && (sel?.id !== featureFor || topic === 'instances-content')) {
      featureFor = sel?.id;
      renderFeatures(features, sel, navigate);
    }
  };
  draw();
  renderNews(news);
  const unsub = subscribe((topic) => {
    if (['instances', 'instances-content', 'game', 'game-progress', 'accounts', 'settings'].includes(topic)) draw(topic);
  });
  return unsub;
}

function heroArt(acc) {
  const art = el('div', { class: 'hero-art' }, el('div', { class: 'grid' }));
  if (!acc) {
    if (effectsOn()) art.append(blockScene());
    else art.append(el('div', { class: 'cube' }), el('div', { class: 'cube' }), el('div', { class: 'cube' }), el('div', { class: 'cube' }));
    return art;
  }
  const id = acc.type === 'offline' ? acc.name : acc.id.replace(/-/g, '');
  const skin = el('div', { class: 'skin' }, el('div', { class: 'pedestal' }));
  art.append(skin);
  if (effectsOn()) {
    skin.classList.add('live');
    mountSkin(skin, id);
  } else {
    skin.append(el('img', { src: `https://mc-heads.net/body/${encodeURIComponent(id)}/right`, alt: '', onerror: (e) => e.target.parentElement.remove() }));
  }
  return art;
}

let heroKey = '';
let heroRefs = null;

function playButton(sel, g) {
  if (g?.state === 'running') {
    return { btn: el('button', { class: 'play-btn running', onclick: () => stopInstance(sel.id) }, icon('stop'), el('span', { class: 'label' }, 'PLAYING', el('small', {}, 'Click to force close'))) };
  }
  if (g?.state === 'preparing') {
    const stage = el('small', {}, 'Preparing');
    const fill = el('span', { class: 'fill' });
    return { btn: el('button', { class: 'play-btn busy' }, el('span', { class: 'spin' }), el('span', { class: 'label' }, 'LAUNCHING', stage), fill), stage, fill };
  }
  return { btn: el('button', { class: 'play-btn', onclick: () => playInstance(sel.id) }, icon('play'), 'PLAY') };
}

function updateProgress(g) {
  if (!heroRefs?.stage) return;
  const p = g?.progress || {};
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  heroRefs.stage.textContent = `${p.stage || 'Preparing'}${p.total > 1 ? ` · ${pct}%` : ''}`;
  heroRefs.fill.style.width = `${pct}%`;
}

function renderHero(root, navigate, topic) {
  const sel = selectedInstance();
  const acc = activeAccount();
  const g = sel ? state.game[sel.id] : null;
  const key = JSON.stringify([sel?.id, sel?.name, sel?.icon, sel?.mcVersion, sel?.loader, sel?.playTime, sel?.contentCount, acc?.id, g?.state, effectsOn()]);
  // Progress ticks only touch the button; rebuilding would restart animations.
  if (key === heroKey && root.childElementCount) {
    updateProgress(g);
    return;
  }
  heroKey = key;

  if (!sel) {
    heroRefs = null;
    clear(
      root,
      el(
        'div',
        { class: 'hero' },
        heroArt(acc),
        el('div', { class: 'hero-eyebrow' }, 'Welcome to Pimpin'),
        el('h1', { class: 'hero-title' }, 'Your Minecraft, ', el('span', { class: 'grad' }, 'pimped out.')),
        el('p', { class: 'muted', style: { margin: '0 0 24px', maxWidth: '520px', lineHeight: 1.5 } }, 'Create an instance to get started. Pick a version, choose Fabric for mods & shaders, and we handle Java, libraries and assets for you.'),
        el('div', { class: 'hero-actions' }, el('button', { class: 'play-btn', onclick: () => newInstanceModal() }, icon('plus'), 'CREATE')),
      ),
    );
    return;
  }

  heroRefs = playButton(sel, g);
  updateProgress(g);
  const picker = el('div', { class: 'instance-picker', title: 'Switch instance' }, instIcon(sel, 'sm'), el('div', { class: 'meta' }, el('b', {}, sel.name), el('span', {}, instSubtitle(sel))), icon('chevron'));
  picker.addEventListener('click', () => openInstancePicker(picker));

  const worldCard = el('div', { class: 'card stat world-stat' }, el('div', { class: 'k' }, 'Jump back in'), el('div', { class: 'v dim' }, '—'));
  api.call('instances:worlds', sel.id).then((worlds) => {
    const w = worlds[0];
    if (!w) {
      clear(worldCard, el('div', { class: 'k' }, 'Jump back in'), el('div', { class: 'v dim', style: { fontSize: '15px' } }, 'No worlds yet'));
      return;
    }
    clear(
      worldCard,
      w.icon ? el('img', { class: 'world-ico', src: w.icon, alt: '' }) : el('div', { class: 'world-ico ph' }, icon('globe')),
      el('div', { class: 'grow' }, el('div', { class: 'k' }, 'Jump back in'), el('div', { class: 'v world-name' }, w.folder)),
      el('button', { class: 'btn sm primary', title: `Play ${w.folder}`, disabled: Boolean(g?.state), onclick: () => playInstance(sel.id, { world: w.folder }) }, icon('play')),
    );
  }).catch(() => {});

  clear(
    root,
    el(
      'div',
      { class: 'hero' },
      heroArt(acc),
      el('div', { class: 'hero-eyebrow' }, acc ? `Welcome back, ${acc.name}` : 'Ready when you are'),
      el('h1', { class: 'hero-title' }, el('span', { class: 'grad' }, sel.name)),
      el(
        'div',
        { class: 'hero-meta' },
        el('span', { class: 'chip accent' }, icon('box'), `Minecraft ${sel.mcVersion}`),
        el('span', { class: 'chip' }, icon('puzzle'), LOADER_LABEL[sel.loader] || sel.loader),
        sel.contentCount ? el('span', { class: 'chip' }, icon('layers'), `${sel.contentCount} mods & packs`) : null,
        sel.modpack ? el('span', { class: 'chip' }, icon('library'), 'Modpack') : null,
        g?.state === 'running' ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Running') : null,
      ),
      el(
        'div',
        { class: 'hero-actions' },
        heroRefs.btn,
        picker,
        el('button', { class: 'btn icon hero-gear', title: 'Instance settings', onclick: () => navigate('instances', { id: sel.id }) }, icon('settings')),
      ),
    ),
    el(
      'div',
      { class: 'quick-stats' },
      el('div', { class: 'card stat' }, el('div', { class: 'k' }, 'Play time'), el('div', { class: 'v' }, fmtDuration(sel.playTime))),
      el('div', { class: 'card stat' }, el('div', { class: 'k' }, 'Last played'), el('div', { class: 'v' }, timeAgo(sel.lastPlayed))),
      worldCard,
    ),
  );
}

async function renderFeatures(root, sel, navigate) {
  if (!sel) return root.replaceChildren();
  const head = el('h2', { class: 'section' }, icon('wand'), 'Client features', el('small', {}, `One-click mods for ${sel.name}`), el('span', { class: 'grow' }), el('button', { class: 'btn sm ghost', onclick: () => navigate('library', { type: 'mod' }) }, 'Browse all mods', icon('external')));
  if (sel.loader === 'vanilla') {
    clear(
      root,
      head,
      el('div', { class: 'card', style: { padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' } },
        el('div', { class: 'grow' }, el('b', {}, 'This is a Vanilla instance'), el('div', { class: 'muted', style: { marginTop: '4px' } }, 'Switch it to Fabric to unlock FPS Boost, shaders, zoom, minimaps and the full mod library.')),
        el('button', {
          class: 'btn primary',
          onclick: async () => {
            try {
              await api.call('instances:update', sel.id, { loader: 'fabric' });
              await refreshInstances();
              renderFeatures(root, { ...sel, loader: 'fabric' }, navigate);
              toast(`${sel.name} now uses Fabric`);
            } catch (err) {
              errorToast(err);
            }
          },
        }, icon('puzzle'), 'Switch to Fabric'),
      ),
    );
    return;
  }
  clear(root, head, el('div', { class: 'row muted', style: { padding: '10px 2px' } }, el('span', { class: 'spin' }), 'Loading features…'));
  try {
    const list = await api.call('features:list', { kind: 'instance', id: sel.id });
    clear(root, head, featureGrid(sel, list));
  } catch (err) {
    clear(root, head, el('div', { class: 'card empty' }, 'Could not load features: ', err.message));
  }
}

export function featureGrid(sel, list) {
  return el(
    'div',
    { class: 'feature-grid' },
    list.map((f) => {
      const card = el('div', { class: `feature${f.enabled ? ' on' : ''}` });
      const sw = switchEl(f.enabled, async (on, label, input) => {
        label.classList.add('busy');
        input.disabled = true;
        try {
          const res = await api.call('features:set', { kind: 'instance', id: sel.id }, f.id, on);
          card.classList.toggle('on', on);
          if (res.failed?.length) toast(`Some parts are not available for ${sel.mcVersion}: ${res.failed.join('; ')}`, 'err', 8000);
          else toast(`${f.name} ${on ? 'enabled' : 'disabled'}`);
        } catch (err) {
          input.checked = !on;
          errorToast(err);
        } finally {
          label.classList.remove('busy');
          input.disabled = false;
        }
      });
      card.append(el('div', { class: 'feature-top' }, el('div', { class: 'ico' }, icon(f.icon)), sw), el('div', { class: 'txt' }, el('b', {}, f.name), el('span', {}, f.desc)));
      return card;
    }),
  );
}

async function renderNews(root) {
  const head = el('h2', { class: 'section' }, icon('globe'), 'Minecraft news');
  clear(root, head);
  try {
    newsCache = newsCache || (await api.call('news:get'));
    if (!newsCache.length) return;
    root.append(
      el(
        'div',
        { class: 'news-grid' },
        newsCache.slice(0, 8).map((n) =>
          el(
            'div',
            { class: 'card news', onclick: () => n.link && api.call('shell:openExternal', n.link) },
            n.image ? el('img', { src: n.image, alt: '', loading: 'lazy' }) : null,
            el('div', { class: 'body' }, el('div', { class: 'date' }, n.date), el('b', {}, n.title), el('p', {}, n.text)),
          ),
        ),
      ),
    );
  } catch {
    root.append(el('div', { class: 'card empty' }, 'News is unavailable offline.'));
  }
}

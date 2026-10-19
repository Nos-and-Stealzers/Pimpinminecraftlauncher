// Pimpin Specials: the launcher's own resource packs, one-click combos and
// game-settings presets for an instance.
import { el, icon, clear, errorToast, toast, confirmModal } from '../dom.js';
import { api, state, refreshInstances } from '../state.js';
import { cube3d } from '../fx3d.js';

const COMBOS = [
  {
    mode: 'fps',
    name: 'Max FPS',
    block: 'emerald',
    icon: 'bolt',
    text: 'Pimpin Performance pack, FPS game settings, plus FPS Boost (Sodium & co.) and Background Saver on Fabric/Quilt.',
  },
  {
    mode: 'pretty',
    name: 'Max Pretty',
    block: 'diamond',
    icon: 'sparkle',
    text: 'Pimpin Pretty pack, pretty game settings, plus shaders (Complementary Reimagined), 3D skin layers, better animations, connected textures and dynamic lights.',
  },
];

export async function drawPimpin(root, inst) {
  const running = () => state.game[inst.id]?.state === 'running';
  const packsRow = el('div', { class: 'pack-grid' });
  const presetsRow = el('div', { class: 'preset-row' });
  let status = [];

  const guard = () => {
    if (!running()) return true;
    toast('Close the game first — Minecraft saves its options when it quits.', 'err');
    return false;
  };

  const busy = async (btn, label, fn) => {
    const old = [...btn.childNodes];
    btn.disabled = true;
    btn.replaceChildren(el('span', { class: 'spin xs' }), label);
    try {
      await fn();
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
      btn.replaceChildren(...old);
    }
  };

  const drawPacks = async () => {
    const previews = await Promise.all(status.map((p) => api.call('packs:preview', p.id).catch(() => [])));
    clear(packsRow, status.map((p, i) => {
      const actions = el('div', { class: 'row wrap' });
      const main = el('button', { class: `btn ${p.active ? '' : 'primary'}` }, icon(p.active ? 'check' : p.installed ? 'play' : 'download'), p.active ? 'Turned on' : p.installed ? 'Turn on' : 'Install & turn on');
      main.addEventListener('click', () => guard() && busy(main, 'Working…', async () => {
        status = p.active ? await api.call('packs:toggle', inst.id, p.id, false) : await api.call('packs:install', inst.id, p.id);
        toast(p.active ? `${p.name} turned off` : `${p.name} is on — it loads the next time you play`);
        drawPacks();
      }));
      if (p.active) main.title = 'Click to turn it off';
      actions.append(main);
      if (p.installed) {
        actions.append(el('button', {
          class: 'btn ghost',
          title: 'Remove from this instance',
          onclick: async () => {
            if (!guard()) return;
            status = await api.call('packs:remove', inst.id, p.id).catch((err) => (errorToast(err), status));
            drawPacks();
          },
        }, icon('trash'), 'Remove'));
      }
      actions.append(el('button', {
        class: 'btn ghost',
        title: 'Save a copy to share or use in another launcher',
        onclick: () => api.call('packs:export', p.id, inst.mcVersion).then((f) => f && toast('Pack saved')).catch(errorToast),
      }, icon('upload'), 'Export'));
      return el('div', { class: `card pack-card${p.active ? ' on' : ''}` },
        el('div', { class: 'pack-tiles' }, previews[i].map((t) => el('img', { src: t.url, alt: t.label, title: t.label }))),
        el('div', { class: 'pack-body' },
          el('div', { class: 'row' },
            el('h3', { class: 'grow' }, p.name),
            el('span', { class: 'chip' }, `${p.size}×`),
            p.active ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'On') : p.installed ? el('span', { class: 'chip' }, 'Installed') : null),
          el('p', { class: 'muted' }, p.tagline),
          el('ul', { class: 'pack-list' }, p.features.map((f) => el('li', {}, icon('check'), f))),
          actions));
    }));
  };

  const drawPresets = async () => {
    const presets = await api.call('game:presets');
    clear(presetsRow, presets.map((p) =>
      el('div', { class: 'card game-preset' },
        el('b', {}, p.name),
        el('ul', { class: 'pack-list' }, p.changes.map((c) => el('li', {}, icon('chevronRight'), c))),
        el('button', {
          class: 'btn sm',
          onclick: async (e) => {
            if (!guard()) return;
            await busy(e.currentTarget, 'Applying…', async () => {
              await api.call('game:applyPreset', inst.id, p.id);
              toast(`${p.name} applied to ${inst.name}`);
            });
          },
        }, icon('check'), 'Apply'))));
  };

  const combos = el('div', { class: 'combo-grid' }, COMBOS.map((c) => {
    const btn = el('button', { class: 'btn primary' }, icon(c.icon), `Go ${c.name}`);
    btn.addEventListener('click', async () => {
      if (!guard()) return;
      const extra = inst.loader === 'vanilla' ? '\n\nThis is a Vanilla instance, so only the pack and game settings are applied. Switch to Fabric for the mods.' : '';
      if (!(await confirmModal(c.name, `${c.text}${extra}`, { confirm: `Go ${c.name}` }))) return;
      await busy(btn, 'Setting up…', async () => {
        const res = await api.call('packs:combo', inst.id, c.mode);
        status = res.status;
        drawPacks();
        await refreshInstances();
        if (res.failed.length) toast(`Done, but some parts aren't available for ${inst.mcVersion}: ${res.failed.join('; ')}`, 'err', 9000);
        else toast(`${c.name} is ready — press Play!`);
      });
    });
    return el('div', { class: `card combo combo-${c.mode}` },
      el('div', { class: 'combo-block' }, cube3d(c.block, 46, true)),
      el('div', { class: 'grow' }, el('h3', {}, c.name), el('p', { class: 'muted' }, c.text)),
      btn);
  }));

  root.append(
    el('div', { class: 'pimpin-banner' },
      el('div', { class: 'grow' },
        el('div', { class: 'hero-eyebrow' }, 'Pimpin Specials'),
        el('h2', {}, 'Our own packs, made for ', el('span', { class: 'grad' }, `Minecraft ${inst.mcVersion}`)),
        el('p', { class: 'muted' }, 'Two original resource packs drawn by the launcher itself, plus one-click setups. Packs and settings apply the next time you press Play.')),
      el('div', { class: 'banner-blocks' }, ['grass', 'diamond', 'gold'].map((b) => cube3d(b, 40, true)))),
    combos,
    el('h2', { class: 'section' }, icon('palette'), 'Resource packs', el('small', {}, 'Use one or both — the one turned on last wins where they overlap')),
    packsRow,
    el('h2', { class: 'section' }, icon('sliders'), 'Game settings', el('small', {}, 'Writes options.txt for this instance')),
    presetsRow,
  );
  clear(packsRow, el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Drawing textures…'));
  try {
    status = await api.call('packs:status', inst.id);
    await drawPacks();
  } catch (err) {
    clear(packsRow, el('div', { class: 'card empty' }, err.message));
  }
  drawPresets().catch(errorToast);
}

// Reusable pieces: instance icons, account menu, play action, the "new
// instance" dialog and the instance picker.
import { el, icon, modal, popover, closePopover, toast, errorToast, microsoftLogo, seg, safeUrl } from './dom.js';
import {
  api, state, notify, refreshAccounts, refreshInstances, selectInstance, getVersions, activeAccount, headUrl, LOADER_LABEL, ICON_KEYS,
} from './state.js';

export function instIcon(inst, size = '') {
  const cls = `inst-icon ${size} ic-${inst?.icon || 'violet'}`;
  const url = inst?.iconUrl && safeUrl(inst.iconUrl);
  if (url) return el('div', { class: cls }, el('img', { src: url, alt: '' }));
  const letter = (inst?.name || '?').trim().charAt(0).toUpperCase();
  return el('div', { class: cls }, letter);
}

export function instSubtitle(inst) {
  return `${inst.mcVersion} · ${LOADER_LABEL[inst.loader] || inst.loader}`;
}

// ------------------------------------------------------------------ play --
export async function playInstance(id, opts = {}) {
  if (!activeAccount()) {
    toast('Add an account first — click "Sign in" in the top-right corner.', 'info');
    document.querySelector('.account-btn')?.click();
    return;
  }
  const inst = state.instances.find((i) => i.id === id);
  if (state.game[id]?.state === 'running' || state.game[id]?.state === 'preparing') return;
  state.game[id] = { state: 'preparing', progress: { stage: 'Preparing', done: 0, total: 1 } };
  notify('game');
  try {
    await api.call('instances:launch', id, opts);
    toast(`Launching ${inst?.name || 'Minecraft'}…`);
  } catch (err) {
    state.game[id] = { state: 'stopped' };
    notify('game');
    errorToast(err);
  }
}

export function stopInstance(id) {
  return api.call('instances:kill', id);
}

// -------------------------------------------------------------- accounts --
export function accountButton() {
  const acc = activeAccount();
  const btn = el(
    'button',
    { class: 'account-btn', title: 'Accounts' },
    acc
      ? el('img', { class: 'avatar', src: headUrl(acc), alt: '', onerror: (e) => (e.target.style.visibility = 'hidden') })
      : el('span', { class: 'add' }, icon('user')),
    acc ? acc.name : 'Sign in',
    icon('chevron'),
  );
  btn.addEventListener('click', () => openAccountMenu(btn));
  return btn;
}

function openAccountMenu(anchor) {
  const { accounts, active } = state.accounts;
  const nameInput = el('input', { class: 'input', placeholder: 'Offline username', maxlength: 16, style: { height: '36px' } });
  const addOffline = async () => {
    try {
      await api.call('accounts:addOffline', nameInput.value);
      await refreshAccounts();
      closePopover();
      toast(`Added offline account ${nameInput.value}`);
    } catch (err) {
      errorToast(err);
    }
  };
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && addOffline());

  popover(
    anchor,
    el(
      'div',
      { style: { width: '290px' } },
      accounts.length ? el('div', { class: 'pop-title' }, 'Accounts') : null,
      accounts.map((a) =>
        el(
          'div',
          {
            class: `pop-item${a.id === active ? ' active' : ''}`,
            onclick: async () => {
              await api.call('accounts:setActive', a.id);
              await refreshAccounts();
              closePopover();
            },
          },
          el('img', { class: 'avatar', src: headUrl(a), alt: '' }),
          el('div', { class: 'grow' }, el('b', {}, a.name), el('span', {}, a.type === 'msa' ? 'Microsoft account' : 'Offline account')),
          a.id === active ? icon('check') : null,
          el(
            'button',
            {
              class: 'btn ghost icon sm',
              title: 'Remove account',
              onclick: async (e) => {
                e.stopPropagation();
                await api.call('accounts:remove', a.id);
                await refreshAccounts();
                closePopover();
              },
            },
            icon('logout'),
          ),
        ),
      ),
      accounts.length ? el('div', { class: 'pop-sep' }) : null,
      el(
        'div',
        {
          class: 'pop-item',
          onclick: async () => {
            closePopover();
            try {
              const acc = await api.call('accounts:addMicrosoft');
              await refreshAccounts();
              toast(`Signed in as ${acc.name}`);
            } catch (err) {
              if (!/cancel|closed/i.test(err.message)) errorToast(err);
            }
          },
        },
        microsoftLogo(),
        el('div', { class: 'grow' }, el('b', {}, 'Sign in with Microsoft'), el('span', {}, 'Play online on any server')),
      ),
      el('div', { class: 'pop-sep' }),
      el('div', { class: 'pop-title' }, 'Offline account'),
      el('div', { class: 'row', style: { padding: '4px 6px 6px' } }, nameInput, el('button', { class: 'btn sm primary', onclick: addOffline }, 'Add')),
    ),
  );
  setTimeout(() => !accounts.length && nameInput.focus(), 50);
}

// ------------------------------------------------------- instance picker --
export function openInstancePicker(anchor, { onPick } = {}) {
  const sel = state.settings?.lastInstance;
  popover(
    anchor,
    el(
      'div',
      { style: { width: '300px', maxHeight: '380px', overflowY: 'auto' } },
      el('div', { class: 'pop-title' }, 'Instances'),
      state.instances.map((i) =>
        el(
          'div',
          {
            class: `pop-item${i.id === sel ? ' active' : ''}`,
            onclick: async () => {
              closePopover();
              await selectInstance(i.id);
              onPick?.(i);
            },
          },
          instIcon(i, 'sm'),
          el('div', { class: 'grow' }, el('b', {}, i.name), el('span', {}, instSubtitle(i))),
          state.game[i.id]?.state === 'running' ? el('span', { class: 'dot' }) : null,
        ),
      ),
      el('div', { class: 'pop-sep' }),
      el('div', { class: 'pop-item', onclick: () => { closePopover(); newInstanceModal(); } }, icon('plus'), el('div', { class: 'grow' }, el('b', {}, 'New instance'))),
    ),
    { align: 'left' },
  );
}

// ---------------------------------------------------------- new instance --
export async function newInstanceModal(preset = {}) {
  let loader = preset.loader || 'fabric';
  let iconKey = ICON_KEYS[Math.floor(Math.random() * 5)];
  let showSnapshots = false;
  let loaderGames = {};

  const name = el('input', { class: 'input', placeholder: 'My awesome instance', maxlength: 40 });
  const versionSel = el('select', { class: 'select' }, el('option', {}, 'Loading…'));
  const loaderVerSel = el('select', { class: 'select' });
  const loaderVerField = el('label', { class: 'field' }, 'Loader version', loaderVerSel);
  const essentials = el('input', { type: 'checkbox', checked: true });
  const essentialsRow = el(
    'label',
    { class: 'set-row card', style: { padding: '14px 16px', cursor: 'pointer' } },
    el('div', { class: 'grow' }, el('b', {}, 'Include Pimpin Essentials'), el('span', {}, 'FPS Boost (Sodium & friends), Zoom and Mod Menu — like Feather & Lunar out of the box.')),
    el('span', { class: 'switch' }, essentials, el('span')),
  );
  const snapToggle = el('input', { type: 'checkbox' });
  const iconRow = el('div', { class: 'icon-pick' });
  const renderIcons = () => {
    iconRow.replaceChildren(
      ...ICON_KEYS.map((k) =>
        el('div', { class: `inst-icon sm ic-${k}${k === iconKey ? ' on' : ''}`, onclick: () => { iconKey = k; renderIcons(); } }, (name.value || 'P').charAt(0).toUpperCase()),
      ),
    );
  };
  name.addEventListener('input', renderIcons);
  renderIcons();

  const fillVersions = async () => {
    const { versions, latest } = await getVersions();
    let list = versions.filter((v) => v.type === 'release' || (showSnapshots && v.type === 'snapshot'));
    if (loader !== 'vanilla') {
      if (!loaderGames[loader]) loaderGames[loader] = new Set(await api.call('loaders:games', loader).catch(() => []));
      if (loaderGames[loader].size) list = list.filter((v) => loaderGames[loader].has(v.id));
    }
    const keep = versionSel.value;
    versionSel.replaceChildren(...list.map((v) => el('option', { value: v.id }, v.type === 'release' ? v.id : `${v.id} (snapshot)`)));
    versionSel.value = list.some((v) => v.id === keep) ? keep : preset.mcVersion && list.some((v) => v.id === preset.mcVersion) ? preset.mcVersion : list.find((v) => v.id === latest.release)?.id || list[0]?.id;
    await fillLoaderVersions();
  };
  const fillLoaderVersions = async () => {
    loaderVerField.classList.toggle('hidden', loader === 'vanilla');
    essentialsRow.classList.toggle('hidden', loader === 'vanilla');
    if (loader === 'vanilla') return;
    loaderVerSel.replaceChildren(el('option', {}, 'Loading…'));
    try {
      const vs = await api.call('loaders:versions', loader, versionSel.value);
      loaderVerSel.replaceChildren(
        el('option', { value: '' }, `Latest stable${vs.find((v) => v.stable) ? ` (${vs.find((v) => v.stable).version})` : ''}`),
        ...vs.slice(0, 40).map((v) => el('option', { value: v.version }, `${v.version}${v.stable ? '' : ' (beta)'}`)),
      );
    } catch {
      loaderVerSel.replaceChildren(el('option', { value: '' }, 'Latest'));
    }
  };
  versionSel.addEventListener('change', fillLoaderVersions);
  snapToggle.addEventListener('change', () => { showSnapshots = snapToggle.checked; fillVersions(); });

  const createBtn = el('button', { class: 'btn primary' }, icon('plus'), 'Create instance');
  const m = modal({
    title: 'New instance',
    body: [
      el('div', { class: 'row', style: { alignItems: 'flex-end', gap: '14px' } }, el('label', { class: 'field grow' }, 'Name', name)),
      el('label', { class: 'field' }, 'Icon', iconRow),
      el('label', { class: 'field' }, 'Mod loader',
        seg(
          [
            { value: 'fabric', label: 'Fabric', icon: 'puzzle' },
            { value: 'quilt', label: 'Quilt', icon: 'grid' },
            { value: 'vanilla', label: 'Vanilla', icon: 'box' },
          ],
          loader,
          (v) => { loader = v; fillVersions(); },
        ),
      ),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
        el('label', { class: 'field' }, el('span', { class: 'row' }, 'Minecraft version', el('span', { class: 'grow' }), el('label', { class: 'row hint', style: { gap: '6px', cursor: 'pointer' } }, snapToggle, 'Snapshots')), versionSel),
        loaderVerField,
      ),
      essentialsRow,
    ],
    actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), createBtn],
  });
  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    try {
      const inst = await api.call('instances:create', {
        name: name.value.trim() || undefined,
        mcVersion: versionSel.value,
        loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVerSel.value || null,
        icon: iconKey,
        essentials: loader !== 'vanilla' && essentials.checked,
      });
      await selectInstance(inst.id);
      await refreshInstances();
      m.close();
      toast(`Created ${inst.name}`);
      preset.onCreated?.(inst);
    } catch (err) {
      createBtn.disabled = false;
      errorToast(err);
    }
  });
  fillVersions().catch(errorToast);
  setTimeout(() => name.focus(), 50);
}

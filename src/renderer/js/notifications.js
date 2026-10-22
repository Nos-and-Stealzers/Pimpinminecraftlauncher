// Notification centre: the bell in the title bar and its panel. The list
// itself lives in the main process (launcher updates, mod updates,
// announcements); this only draws it and runs the actions.
import { el, icon, clear, popover, closePopover, timeAgo, toast, errorToast } from './dom.js';
import { api, state } from './state.js';
import { updateModal, installUpdate, notifyDesktop } from './qol.js';

let snap = { items: [], unread: 0 };
let button = null;
let panel = null;
let navigateTo = () => {};

const KIND_ICON = { 'launcher-update': 'download', 'mod-updates': 'puzzle', announcement: 'info' };

function badge() {
  if (!button) return;
  const n = snap.unread;
  button.classList.toggle('has-unread', n > 0);
  button.title = n ? `${n} unread notification${n > 1 ? 's' : ''}` : 'Notifications';
  button.setAttribute('aria-label', button.title);
  const b = button.querySelector('.notif-count');
  b.textContent = n > 9 ? '9+' : String(n);
  b.hidden = !n;
}

async function run(item) {
  closePopover();
  panel = null;
  if (!item.read) api.call('notifications:read', [item.id]).then(apply).catch(() => {});
  const a = item.action;
  if (!a) return;
  if (a.type === 'update') {
    if (/-ready$/.test(item.rev)) installUpdate();
    else updateModal();
  } else if (a.type === 'instance') {
    if (state.instances.some((i) => i.id === a.id)) navigateTo('instances', { id: a.id, tab: a.tab || undefined });
    else toast('That instance no longer exists.', 'info');
  } else if (a.type === 'link') {
    api.call('shell:openExternal', a.url);
  }
}

function row(item) {
  const sev = item.severity !== 'info' ? ` sev-${item.severity}` : '';
  return el('div', { class: `notif-item${item.read ? '' : ' unread'}${sev}`, role: 'listitem' },
    el('span', { class: 'notif-ico' }, icon(item.severity === 'info' ? KIND_ICON[item.kind] || 'info' : 'alert')),
    el('div', { class: 'grow' },
      el('b', {}, item.title),
      item.body ? el('p', {}, item.body) : null,
      el('div', { class: 'notif-meta' },
        el('span', {}, timeAgo(item.createdAt)),
        item.action ? el('button', { class: 'link', onclick: () => run(item) }, item.action.label) : null,
        !item.read ? el('button', { class: 'link', onclick: () => api.call('notifications:read', [item.id]).then(apply).catch(errorToast) }, 'Mark as read') : null)),
    el('button', {
      class: 'notif-x',
      title: 'Dismiss',
      'aria-label': `Dismiss ${item.title}`,
      onclick: () => api.call('notifications:dismiss', item.id).then(apply).catch(errorToast),
    }, icon('x')));
}

function drawPanel() {
  if (!panel || !document.body.contains(panel)) return;
  const refresh = el('button', { class: 'btn ghost sm icon', title: 'Check now', 'aria-label': 'Check for notifications now' }, icon('refresh'));
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.classList.add('busy');
    try {
      apply(await api.call('notifications:check'));
    } catch (err) {
      errorToast(err);
    } finally {
      refresh.disabled = false;
      refresh.classList.remove('busy');
    }
  });
  clear(panel,
    el('div', { class: 'notif-head' },
      el('b', { class: 'grow' }, 'Notifications'),
      snap.unread ? el('button', { class: 'link', onclick: () => api.call('notifications:read', null).then(apply).catch(errorToast) }, 'Mark all as read') : null,
      refresh),
    el('div', { class: 'notif-list', role: 'list' },
      snap.items.length ? snap.items.map(row) : el('div', { class: 'notif-empty' }, icon('check'), el('span', {}, "You're all caught up."))),
    el('div', { class: 'notif-foot' },
      el('button', { class: 'link', onclick: () => { closePopover(); panel = null; navigateTo('settings', { section: 'notifications' }); } }, 'Notification settings')));
  // The content arrives after popover() measures its empty shell. Reposition
  // after drawing so the real width/height stay inside the window.
  const pop = panel.parentElement;
  const anchor = button.getBoundingClientRect();
  const box = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(anchor.right - box.width, innerWidth - box.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(anchor.bottom + 8, innerHeight - box.height - 8))}px`;
}

function apply(next) {
  if (!next) return;
  snap = { items: next.items || [], unread: next.unread || 0 };
  badge();
  drawPanel();
}

function open() {
  if (panel && document.body.contains(panel)) {
    closePopover();
    panel = null;
    return;
  }
  panel = el('div', { class: 'notif-panel' });
  popover(button, panel).classList.add('notif-pop');
  drawPanel();
}

/** Mounts the bell into the title bar and keeps it in sync with the main process. */
export async function installNotifications(slot, navigate) {
  navigateTo = navigate;
  button = el('button', { class: 'notif-btn', onclick: open }, icon('bell'), el('span', { class: 'notif-count', hidden: true }));
  clear(slot, button);
  api.on('notifications:changed', (next) => {
    apply(next);
    for (const n of next.fresh || []) {
      // the update card already sends its own desktop notice when an update is ready
      if (n.kind !== 'launcher-update') notifyDesktop(n.title, n.body);
      if (n.severity === 'critical') toast(n.title, 'err', 8000);
    }
  });
  apply(await api.call('notifications:list'));
}

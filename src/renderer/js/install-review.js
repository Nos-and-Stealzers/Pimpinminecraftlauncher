// Install review popup: a small live card listing what an install brings in
// (the item plus its required dependencies), with per-item progress and
// done / failed / blocked status. Installs proceed on their own; the card just
// keeps Lucas informed. Hide closes the card, Cancel stops the remaining
// downloads (finished items stay installed, partial files are removed).
// Fed by the main process events 'content:plan' and 'content:progress'.
import { el, icon, clear, fmtBytes, safeUrl, toast } from './dom.js';
import { api } from './state.js';

const cards = new Map(); // taskId -> { plan, items: Map(key -> item), node, hidden, state }
const AUTO_HIDE_MS = 7000;
let installed = false;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "Installing Sodium Extra and 2 required dependencies: Fabric API, Reese's Sodium Options" */
export function planSentence(plan, state = 'running') {
  const items = plan.items;
  const roots = items.filter((i) => !i.dependency);
  const deps = items.filter((i) => i.dependency);
  const doneCount = items.filter((i) => i.status === 'done').length;
  if (state === 'cancelled') {
    return { head: plan.source === 'update' ? 'Update cancelled' : 'Install cancelled', tail: `${doneCount} of ${items.length} installed. The rest was not downloaded.` };
  }
  let what;
  if (plan.source === 'update') what = plan.label.replace(/^Updating /, '');
  else if (roots.length === 1 && plan.source !== 'feature') what = roots[0].title;
  else if (plan.source === 'feature') what = roots.length > 1 ? `${plan.label} (${plural(roots.length, 'mod', 'mods')})` : plan.label;
  else what = plural(roots.length, 'item', 'items');
  const verb = plan.source === 'update' ? (state === 'running' ? 'Updating' : 'Updated') : state === 'running' ? 'Installing' : 'Installed';
  const head = `${verb} ${what}`;
  if (!deps.length) return { head, tail: '' };
  const depsDone = deps.filter((d) => d.status === 'done').length;
  // a partial result says exactly how many dependencies made it
  const count = state === 'partial' && depsDone < deps.length
    ? `${depsDone} of ${plural(deps.length, 'required dependency', 'required dependencies')}`
    : plural(deps.length, 'required dependency', 'required dependencies');
  return { head: `${head} and ${count}`, tail: deps.map((d) => d.title).join(', ') };
}

function statusNode(item) {
  switch (item.status) {
    case 'downloading': {
      const pct = item.total ? Math.min(100, Math.round((item.done / item.total) * 100)) : 0;
      return el('span', { class: 'ir-status' }, el('span', { class: 'ir-bar' }, el('i', { style: { width: `${pct}%` } })), el('span', { class: 'dim' }, `${pct}%`));
    }
    case 'done':
      return el('span', { class: 'ir-status ok' }, icon('check'), 'Done');
    case 'failed':
      return el('span', { class: 'ir-status bad' }, icon('alert'), 'Failed');
    case 'blocked':
      return el('span', { class: 'ir-status warn' }, 'Skipped');
    case 'cancelled':
      return el('span', { class: 'ir-status dim' }, 'Cancelled');
    default:
      return el('span', { class: 'ir-status dim' }, 'Waiting');
  }
}

function iconImg(src) {
  const img = el('img', { src, alt: '', loading: 'lazy' });
  // offline or a dead link: fall back to the plain placeholder instead of a broken image
  img.addEventListener('error', () => img.replaceWith(el('span', { class: 'ir-ph' }, icon('puzzle'))), { once: true });
  return img;
}

function itemRow(item) {
  const note = item.status === 'failed' && item.error
    ? el('div', { class: 'ir-note bad' }, item.error)
    : item.status === 'blocked'
      ? el('div', { class: 'ir-note' }, 'Skipped. Download it from the project page.',
          item.pageUrl ? el('button', { class: 'link', onclick: () => api.call('shell:openExternal', item.pageUrl).catch(() => {}) }, 'Open project page') : null)
      : null;
  const meta = [item.dependency ? 'Dependency' : null, item.versionNumber, item.size ? fmtBytes(item.size) : null].filter(Boolean).join(' · ');
  return el('li', { class: `ir-item ${item.status}`, 'data-key': item.key },
    safeUrl(item.icon) ? iconImg(item.icon) : el('span', { class: 'ir-ph' }, icon('puzzle')),
    el('div', { class: 'ir-main' },
      el('div', { class: 'ir-name' }, el('b', { title: item.title }, item.title)),
      meta ? el('div', { class: 'ir-meta' }, meta) : null,
      note),
    statusNode(item));
}

function totals(card) {
  let done = 0;
  let total = 0;
  for (const i of card.items.values()) {
    if (i.status === 'blocked' || (i.status === 'failed' && !i.started)) continue;
    total += i.size || 0;
    done += i.status === 'done' ? i.size || 0 : i.status === 'downloading' ? Math.min(i.done || 0, i.size || i.done || 0) : 0;
  }
  return { done, total };
}

// once finished, problems go to the top so they are seen without scrolling
const RANK = { failed: 0, blocked: 1 };
function draw(card) {
  const ordered = [...card.items.values()];
  let items = ordered;
  if (card.state !== 'running') items = items.map((i, n) => [i, n]).sort((a, b) => (RANK[a[0].status] ?? 2) - (RANK[b[0].status] ?? 2) || a[1] - b[1]).map(([i]) => i);
  const running = card.state === 'running';
  const { head, tail } = planSentence({ ...card.plan, items: ordered }, card.state);
  const failed = items.filter((i) => i.status === 'failed').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const { done, total } = totals(card);
  const pct = total ? Math.round((done / total) * 100) : running ? 0 : 100;
  const summary = running
    ? `${items.filter((i) => i.status === 'done').length} of ${items.length} done`
    : [failed ? `${failed} failed` : null, blocked ? `${blocked} skipped` : null].filter(Boolean).join(', ') || (card.state === 'cancelled' ? '' : 'All done');
  clear(card.node,
    el('div', { class: 'ir-head' },
      el('span', { class: `ir-ico ${card.state}` }, running ? el('span', { class: 'spin xs' }) : icon(card.state === 'done' ? 'check' : card.state === 'cancelled' ? 'x' : 'alert')),
      el('div', { class: 'ir-title' },
        el('b', {}, head),
        tail ? el('span', { title: tail }, tail) : null),
      el('button', { class: 'btn ghost sm ir-hide', title: 'Hide', onclick: () => hide(card) }, 'Hide')),
    el('div', { class: `ir-progress${running ? '' : ' idle'}` }, running ? el('i', { style: { width: `${pct}%` } }) : null),
    el('ul', { class: 'ir-list' }, items.map(itemRow)),
    el('div', { class: 'ir-foot' },
      el('span', { class: `dim${failed ? ' bad' : ''}` }, summary),
      total ? el('span', { class: 'dim' }, running ? `${fmtBytes(done)} of ${fmtBytes(total)}` : fmtBytes(total)) : null,
      running && card.plan.taskId ? el('button', { class: 'btn ghost sm ir-cancel', disabled: card.cancelling, onclick: () => cancel(card) }, card.cancelling ? 'Cancelling' : 'Cancel') : null),
  );
}

function hide(card) {
  card.hidden = true;
  clearTimeout(card.timer);
  card.node.remove();
  if (card.state !== 'running') cards.delete(card.plan.taskId);
}

async function cancel(card) {
  card.cancelling = true;
  draw(card);
  try {
    await api.call('content:cancel', card.plan.taskId);
  } catch {
    /* the task may have just finished */
  }
}

function host() {
  return document.getElementById('toasts') || document.body;
}

/** A plan arrived: show its card right away (installs never wait for a click). */
export function showPlan(plan) {
  if (!plan?.taskId || !Array.isArray(plan.items)) return null;
  const card = {
    plan,
    items: new Map(plan.items.map((i) => [i.key, { ...i, done: 0, total: i.size || 0 }])),
    node: el('section', { class: 'install-review', role: 'status', 'aria-live': 'polite', 'data-task': plan.taskId }),
    hidden: false,
    state: 'running',
  };
  cards.set(plan.taskId, card);
  draw(card);
  host().append(card.node);
  return card.node;
}

/** Per-item progress, or the final { state } for the whole task. */
export function applyProgress(p) {
  const card = cards.get(p?.taskId);
  if (!card) return;
  if (p.state) {
    card.state = p.state === 'done' ? 'done' : p.state === 'cancelled' ? 'cancelled' : 'partial';
    card.cancelling = false;
    if (card.hidden) {
      // hidden while running: still say so when something went wrong
      const bad = [...card.items.values()].filter((i) => i.status === 'failed' || i.status === 'blocked');
      if (bad.length) toast(`${bad.length === 1 ? bad[0].title : plural(bad.length, 'item', 'items')} could not be installed. ${bad[0].error || ''}`.trim(), 'err', 8000);
      cards.delete(p.taskId);
      return;
    }
    draw(card);
    if (card.state === 'done') card.timer = setTimeout(() => hide(card), AUTO_HIDE_MS);
    return;
  }
  const item = card.items.get(p.key);
  if (!item) return;
  item.status = p.status || item.status;
  item.error = p.error ?? item.error;
  if (p.status === 'downloading') item.started = true;
  if (typeof p.done === 'number') item.done = p.done;
  if (typeof p.total === 'number' && p.total) item.total = p.total;
  if (!item.size && item.total) item.size = item.total;
  if (!card.hidden) draw(card);
}

/** Subscribe once; safe to call from every page that can start installs. */
export function installReview() {
  if (installed || !api?.on) return;
  installed = true;
  api.on('content:plan', showPlan);
  api.on('content:progress', applyProgress);
}

installReview();

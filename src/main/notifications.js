// Notification centre: one persisted list of launcher notices (launcher
// updates, mod updates per instance, announcements from the public feed),
// read/dismiss state, and the small file the Pimpin Client shows in game.
const fs = require('fs/promises');
const path = require('path');

const FILE_VERSION = 1;
const MAX_ITEMS = 60;
const FEED_MAX_BYTES = 64 * 1024;
const KINDS = new Set(['launcher-update', 'mod-updates', 'announcement']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const ACTIONS = new Set(['update', 'instance', 'link']);
const IN_GAME_KINDS = new Set(['launcher-update', 'announcement']);

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/** Compares dotted versions numerically; missing parts count as 0. */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function safeLink(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function cleanAction(a) {
  if (!a || typeof a !== 'object' || !ACTIONS.has(a.type)) return null;
  if (a.type === 'update') return { type: 'update', label: text(a.label, 32) || 'View update' };
  if (a.type === 'instance') {
    if (typeof a.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(a.id)) return null;
    return { type: 'instance', id: a.id, tab: a.tab === 'content' ? 'content' : null, label: text(a.label, 32) || 'Open' };
  }
  const url = safeLink(a.url);
  return url ? { type: 'link', url, label: text(a.label, 32) || 'Open link' } : null;
}

/** Validates a notice before it is stored; throws on anything malformed. */
function cleanItem(item) {
  if (!item || typeof item !== 'object') throw new Error('Notice must be an object.');
  const id = String(item.id || '');
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/i.test(id)) throw new Error(`Invalid notice id: ${id}`);
  if (!KINDS.has(item.kind)) throw new Error(`Unknown notice kind: ${item.kind}`);
  const title = text(item.title, 80);
  if (!title) throw new Error('Notice needs a title.');
  return {
    id,
    kind: item.kind,
    rev: text(String(item.rev ?? '1'), 80) || '1',
    title,
    body: text(item.body, 400),
    severity: SEVERITIES.has(item.severity) ? item.severity : 'info',
    action: cleanAction(item.action),
    inGame: item.inGame !== false,
  };
}

/**
 * Parses the public announcements feed and keeps only entries meant for this
 * launcher: MultiMC-style from/to version range, platform and channel, plus an
 * optional expiry. Unknown fields are ignored, bad entries skipped.
 */
function parseFeed(raw, { version, platform, channel, now = Date.now() }) {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string' && raw.length > FEED_MAX_BYTES) throw new Error('Announcement feed is too large.');
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!doc || doc.version !== 1 || !Array.isArray(doc.notices)) throw new Error('Announcement feed has an unknown format.');
  const out = [];
  for (const n of doc.notices.slice(0, 20)) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(n.id)) continue;
    if (n.platform && n.platform !== platform) continue;
    if (n.channel && n.channel !== channel) continue;
    if (n.from && compareVersions(version, n.from) < 0) continue;
    if (n.to && compareVersions(version, n.to) > 0) continue;
    if (n.expires) {
      const t = Date.parse(n.expires);
      if (!Number.isFinite(t) || t <= now) continue;
    }
    const title = text(n.title, 80);
    if (!title) continue;
    const link = safeLink(n.link);
    out.push({
      id: `ann-${n.id.toLowerCase()}`,
      kind: 'announcement',
      rev: text(String(n.rev ?? '1'), 40) || '1',
      title,
      body: text(n.body, 400),
      severity: SEVERITIES.has(n.severity) ? n.severity : 'info',
      action: link ? { type: 'link', url: link, label: text(n.linkLabel, 32) || 'Read more' } : null,
      inGame: n.inGame === true || n.severity === 'critical',
    });
  }
  return out;
}

function createNotifications({ file, io = fs, now = () => Date.now(), onChange = () => {} } = {}) {
  if (!file) throw new Error('Notifications need a file path.');
  let items = null;
  let chain = Promise.resolve();

  async function load() {
    if (items) return items;
    try {
      const doc = JSON.parse(await io.readFile(file, 'utf8'));
      items = Array.isArray(doc?.items) ? doc.items.flatMap((x) => {
        try {
          const c = cleanItem(x);
          return [{ ...c, createdAt: Number(x.createdAt) || now(), read: x.read === true, dismissed: x.dismissed === true }];
        } catch {
          return [];
        }
      }) : [];
    } catch (err) {
      if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
      items = []; // a missing or corrupt file starts an empty list
    }
    return items;
  }

  async function persist() {
    items.sort((a, b) => b.createdAt - a.createdAt);
    // drop the oldest handled notices first, never an unread one if avoidable
    while (items.length > MAX_ITEMS) {
      let i = items.length - 1;
      while (i >= 0 && !items[i].read && !items[i].dismissed) i--;
      items.splice(i < 0 ? items.length - 1 : i, 1);
    }
    await io.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await io.writeFile(tmp, JSON.stringify({ version: FILE_VERSION, items }, null, 2));
      await io.rename(tmp, file);
    } finally {
      await io.unlink(tmp).catch(() => {});
    }
  }

  // Every mutation runs in order so overlapping checks can't lose writes.
  function mutate(fn) {
    const run = chain.then(async () => {
      await load();
      // Work on a private transaction: validation and disk errors must leave
      // the last committed state intact, including read/dismiss flags.
      const before = items;
      items = structuredClone(items);
      let res;
      try {
        res = await fn();
        if (res?.changed) await persist();
      } catch (err) {
        items = before;
        throw err;
      }
      if (res?.changed) onChange(snapshot(), structuredClone(res.fresh || []));
      return res;
    });
    chain = run.catch(() => {});
    return run;
  }

  function snapshot() {
    const visible = structuredClone((items || []).filter((x) => !x.dismissed));
    return { items: visible, unread: visible.filter((x) => !x.read).length };
  }

  function put(raw) {
    const next = cleanItem(raw);
    const old = items.find((x) => x.id === next.id);
    if (!old) {
      items.push({ ...next, createdAt: now(), read: false, dismissed: false });
      return { changed: true, fresh: [next] };
    }
    if (old.rev !== next.rev) {
      // new content (a newer version, more mod updates): surface it again
      Object.assign(old, next, { createdAt: now(), read: false, dismissed: false });
      return { changed: true, fresh: [next] };
    }
    const same = ['title', 'body', 'severity', 'inGame'].every((k) => old[k] === next[k]) && JSON.stringify(old.action) === JSON.stringify(next.action);
    if (same) return { changed: false };
    Object.assign(old, next);
    return { changed: true };
  }

  function drop(pred) {
    const before = items.length;
    items = items.filter((x) => !pred(x));
    return items.length !== before;
  }

  // Reads join the same queue, including the initial disk load. Merely awaiting
  // the old chain lets a concurrent cold list overwrite a committed mutation.
  function read(fn) {
    const run = chain.then(async () => {
      await load();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  }

  return {
    list: () => read(snapshot),
    upsert: (item) => mutate(() => put(item)),
    remove: (id) => mutate(() => ({ changed: drop((x) => x.id === id) })),
    removeWhere: (pred) => mutate(() => ({ changed: drop(pred) })),
    /** Replaces one family of notices (e.g. every `mods-*` id) with a new set. */
    replaceKind: (kind, list, { prefix = '' } = {}) => mutate(() => {
      const keep = new Set(list.map((x) => x.id));
      let changed = drop((x) => x.kind === kind && x.id.startsWith(prefix) && !keep.has(x.id));
      const fresh = [];
      for (const x of list) {
        const r = put(x);
        changed = changed || r.changed;
        if (r.fresh) fresh.push(...r.fresh);
      }
      return { changed, fresh };
    }),
    markRead: (ids) => mutate(() => {
      let changed = false;
      for (const x of items) {
        if (!x.read && (ids == null || ids.includes(x.id))) {
          x.read = true;
          changed = true;
        }
      }
      return { changed };
    }),
    dismiss: (id) => mutate(() => {
      const x = items.find((n) => n.id === id);
      if (!x || x.dismissed) return { changed: false };
      x.dismissed = true;
      x.read = true;
      return { changed: true };
    }),
    /** Notices the Pimpin Client may show in game: unread updates and flagged announcements. */
    inGamePayload: () => read(() => {
      const notices = items
        .filter((x) => !x.read && !x.dismissed && x.inGame && IN_GAME_KINDS.has(x.kind))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((x) => ({ id: `${x.id}.${x.rev}`.slice(0, 120), kind: x.kind, title: x.title.slice(0, 60), body: x.body.slice(0, 140), createdAt: x.createdAt }));
      return { version: 1, notices };
    }),
  };
}

/** Writes the in-game notice file into an instance, skipping links and unchanged content. */
async function writeInGameFile(gameDir, payload, io = fs) {
  const config = path.join(gameDir, 'config');
  for (const p of [gameDir, config]) {
    try {
      if ((await io.lstat(p)).isSymbolicLink()) return false;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  await io.mkdir(config, { recursive: true });
  const file = path.join(config, 'pimpin-notices.json');
  const body = JSON.stringify(payload, null, 2);
  try {
    const st = await io.lstat(file);
    if (st.isSymbolicLink()) return false;
    if ((await io.readFile(file, 'utf8')) === body) return false;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    if (!payload.notices.length) return false; // nothing to clear
  }
  const tmp = `${file}.${process.pid}.tmp`;
  await io.writeFile(tmp, body);
  await io.rename(tmp, file);
  return true;
}

module.exports = { createNotifications, parseFeed, compareVersions, writeInGameFile, cleanItem, FEED_MAX_BYTES };

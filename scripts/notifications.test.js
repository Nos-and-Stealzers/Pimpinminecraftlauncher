// Notification centre: storage, read/dismiss state, feed targeting and the
// in-game notice file. Runs against a temporary folder only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createNotifications, parseFeed, compareVersions, writeInGameFile, FEED_MAX_BYTES } = require('../src/main/notifications');

const base = process.env.TMPDIR || os.tmpdir();
async function tmp() {
  return fs.mkdtemp(path.join(base, 'pimpin-notices-'));
}

const update = (rev, extra = {}) => ({ id: 'launcher-update', kind: 'launcher-update', rev, title: `Pimpin ${rev}`, body: 'b', action: { type: 'update' }, ...extra });

test('versions compare numerically', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
  assert.equal(compareVersions('v0.1.26', '0.1.26'), 0);
  assert.equal(compareVersions('0.1', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.2', '0.2'), -1);
});

test('upsert dedupes, a new revision resurfaces, read/dismiss persist', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'n.json');
  const events = [];
  let t = 1000;
  const n = createNotifications({ file, now: () => t, onChange: (s, fresh) => events.push({ unread: s.unread, fresh: fresh.map((x) => x.rev) }) });
  await n.upsert(update('0.1.27-available'));
  await n.upsert(update('0.1.27-available')); // identical: no change event
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { unread: 1, fresh: ['0.1.27-available'] });
  await n.markRead(null);
  assert.equal((await n.list()).unread, 0);
  t = 2000;
  await n.upsert(update('0.1.27-ready'));
  let s = await n.list();
  assert.equal(s.items.length, 1);
  assert.equal(s.unread, 1, 'a ready update is unread again');
  assert.equal(s.items[0].createdAt, 2000);
  await n.dismiss('launcher-update');
  assert.equal((await n.list()).items.length, 0);
  // same revision after a dismiss stays dismissed, also after a reload
  await n.upsert(update('0.1.27-ready'));
  const again = createNotifications({ file });
  assert.equal((await again.list()).items.length, 0);
  await again.upsert(update('0.1.28-ready'));
  assert.equal((await again.list()).unread, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('bad notices are rejected and links must be https', async () => {
  const dir = await tmp();
  const n = createNotifications({ file: path.join(dir, 'n.json') });
  await assert.rejects(n.upsert({ id: '../x', kind: 'announcement', title: 'x' }), /Invalid notice id/);
  await assert.rejects(n.upsert({ id: 'a', kind: 'popup', title: 'x' }), /Unknown notice kind/);
  await assert.rejects(n.upsert({ id: 'a', kind: 'announcement', title: '   ' }), /title/);
  await n.upsert({ id: 'a', kind: 'announcement', title: 'x', action: { type: 'link', url: 'javascript:alert(1)' } });
  await n.upsert({ id: 'b', kind: 'mod-updates', title: 'y', action: { type: 'instance', id: '../evil' } });
  const s = await n.list();
  assert.ok(s.items.every((x) => x.action === null));
  await fs.rm(dir, { recursive: true, force: true });
});

test('a corrupt file starts empty and the list is capped, keeping unread', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'n.json');
  await fs.writeFile(file, '{not json');
  let t = 0;
  const n = createNotifications({ file, now: () => ++t });
  assert.equal((await n.list()).items.length, 0);
  await n.upsert({ id: 'keep', kind: 'announcement', title: 'oldest but unread' });
  for (let i = 0; i < 70; i++) {
    await n.upsert({ id: `x${i}`, kind: 'announcement', title: `n${i}` });
    await n.markRead([`x${i}`]);
  }
  const s = await n.list();
  assert.equal(s.items.length, 60);
  assert.ok(s.items.some((x) => x.id === 'keep'));
  const disk = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(disk.version, 1);
  assert.equal(disk.items.length, 60);
  await fs.rm(dir, { recursive: true, force: true });
});

test('replaceKind drops notices that no longer apply', async () => {
  const dir = await tmp();
  const n = createNotifications({ file: path.join(dir, 'n.json') });
  const mods = (id, rev) => ({ id: `mods-${id}`, kind: 'mod-updates', rev, title: `updates ${id}` });
  await n.replaceKind('mod-updates', [mods('a', '1'), mods('b', '1')]);
  await n.upsert(update('9.9.9-ready'));
  await n.replaceKind('mod-updates', [mods('b', '1')]);
  const ids = (await n.list()).items.map((x) => x.id).sort();
  assert.deepEqual(ids, ['launcher-update', 'mods-b']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('feed targeting follows version range, platform, channel and expiry', () => {
  const ctx = { version: '0.1.27', platform: 'win32', channel: 'stable', now: Date.parse('2026-10-22T00:00:00Z') };
  const feed = {
    version: 1,
    notices: [
      { id: 'all', title: 'For everyone' },
      { id: 'old-only', title: 'Old', to: '0.1.20' },
      { id: 'new-only', title: 'New', from: '0.1.28' },
      { id: 'range', title: 'Range', from: '0.1.27', to: '0.1.27' },
      { id: 'linux', title: 'Linux', platform: 'linux' },
      { id: 'beta', title: 'Beta', channel: 'beta' },
      { id: 'expired', title: 'Gone', expires: '2026-10-01T00:00:00Z' },
      { id: 'bad date', title: 'bad id' },
      { id: 'no-title', title: '' },
      { id: 'crit', title: 'Broken build', severity: 'critical', link: 'https://example.com/x', linkLabel: 'Details' },
      { id: 'http', title: 'Plain link', link: 'http://example.com' },
    ],
  };
  const out = parseFeed(JSON.stringify(feed), ctx);
  assert.deepEqual(out.map((x) => x.id), ['ann-all', 'ann-range', 'ann-crit', 'ann-http']);
  const crit = out.find((x) => x.id === 'ann-crit');
  assert.equal(crit.inGame, true);
  assert.deepEqual(crit.action, { type: 'link', url: 'https://example.com/x', label: 'Details' });
  assert.equal(out.find((x) => x.id === 'ann-http').action, null);
  assert.equal(out.find((x) => x.id === 'ann-all').inGame, false);
  assert.deepEqual(parseFeed('', ctx), []);
  assert.throws(() => parseFeed('[]', ctx), /unknown format/);
  assert.throws(() => parseFeed('x'.repeat(FEED_MAX_BYTES + 1), ctx), /too large/);
});

test('in-game file carries unread update notices only and is written atomically', async () => {
  const dir = await tmp();
  const n = createNotifications({ file: path.join(dir, 'n.json') });
  await n.upsert(update('0.1.27-ready', { title: 'x'.repeat(80), body: 'y'.repeat(300) }));
  await n.upsert({ id: 'mods-a', kind: 'mod-updates', title: 'mods', inGame: false });
  await n.upsert({ id: 'ann-quiet', kind: 'announcement', title: 'quiet', inGame: false });
  await n.upsert({ id: 'ann-loud', kind: 'announcement', title: 'loud', inGame: true });
  let p = await n.inGamePayload();
  assert.equal(p.version, 1);
  assert.deepEqual(p.notices.map((x) => x.id).sort(), ['ann-loud.1', 'launcher-update.0.1.27-ready']);
  const up = p.notices.find((x) => x.kind === 'launcher-update');
  assert.equal(up.title.length, 60);
  assert.equal(up.body.length, 140);

  const game = path.join(dir, 'game');
  assert.equal(await writeInGameFile(game, { version: 1, notices: [] }), false, 'no file is created just to say nothing');
  assert.equal(await writeInGameFile(game, p), true);
  assert.equal(await writeInGameFile(game, p), false, 'unchanged content is not rewritten');
  const disk = JSON.parse(await fs.readFile(path.join(game, 'config', 'pimpin-notices.json'), 'utf8'));
  assert.deepEqual(disk, p);
  assert.deepEqual((await fs.readdir(path.join(game, 'config'))).filter((f) => f.endsWith('.tmp')), []);

  await n.markRead(['launcher-update']);
  p = await n.inGamePayload();
  assert.deepEqual(p.notices.map((x) => x.id), ['ann-loud.1']);
  await n.markRead(null);
  assert.equal(await writeInGameFile(game, await n.inGamePayload()), true, 'an existing file is cleared');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(game, 'config', 'pimpin-notices.json'), 'utf8')).notices, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('snapshots and callbacks cannot mutate stored actions', async (t) => {
  const dir = await tmp();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const n = createNotifications({ file: path.join(dir, 'n.json'), onChange: (s, fresh) => {
    s.items[0].action.type = 'link';
    fresh[0].action.type = 'link';
  } });
  await n.upsert(update('1'));
  const s = await n.list();
  assert.equal(s.items[0].action.type, 'update');
  s.items[0].action.type = 'instance';
  assert.equal((await n.list()).items[0].action.type, 'update');
});

test('cold reads and mutations share one queue and never reload over a write', async (t) => {
  const dir = await tmp();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  const io = { ...fs, readFile: async () => {
    reads++;
    await gate;
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  } };
  const n = createNotifications({ file: path.join(dir, 'n.json'), io });
  const first = n.list();
  const write = n.upsert(update('1'));
  const payload = n.inGamePayload();
  await new Promise(setImmediate);
  const coldReads = reads;
  release();
  await Promise.all([first, write, payload]);
  assert.equal(coldReads, 1, 'only one load may be in flight');
  assert.equal((await n.list()).unread, 1);
  assert.equal((await payload).notices.length, 1, 'reads queued after upsert see it');
});

test('disk failures roll back memory so identical retries persist and emit once', async (t) => {
  for (const method of ['mkdir', 'writeFile', 'rename']) {
    await t.test(method, async (t) => {
      const dir = await tmp();
      t.after(() => fs.rm(dir, { recursive: true, force: true }));
      const file = path.join(dir, 'n.json');
      const events = [];
      let fail = true;
      const io = { ...fs, [method]: async (...args) => {
        if (fail) throw Object.assign(new Error('disk unavailable'), { code: 'EIO' });
        return fs[method](...args);
      } };
      const n = createNotifications({ file, io, onChange: (s) => events.push(s) });
      await assert.rejects(n.upsert(update('1')), /disk unavailable/);
      assert.deepEqual(await n.list(), { items: [], unread: 0 });
      assert.equal(events.length, 0);
      fail = false;
      await n.upsert(update('1'));
      assert.equal(events.length, 1);
      assert.equal((await createNotifications({ file }).list()).unread, 1);
      fail = true;
      await assert.rejects(n.dismiss('launcher-update'), /disk unavailable/);
      assert.equal((await n.list()).unread, 1);
      fail = false;
      await n.dismiss('launcher-update');
      assert.equal((await createNotifications({ file }).list()).items.length, 0);
      assert.deepEqual((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp')), []);
    });
  }
});

test('in-game file refuses a linked config folder', async (t) => {
  const dir = await tmp();
  const game = path.join(dir, 'game');
  const elsewhere = path.join(dir, 'elsewhere');
  await fs.mkdir(game, { recursive: true });
  await fs.mkdir(elsewhere);
  try {
    await fs.symlink(elsewhere, path.join(game, 'config'), 'junction');
  } catch {
    t.skip('cannot create links here');
    return;
  }
  assert.equal(await writeInGameFile(game, { version: 1, notices: [{ id: 'a', kind: 'announcement', title: 't', body: '', createdAt: 1 }] }), false);
  assert.deepEqual(await fs.readdir(elsewhere), []);
  await fs.rm(dir, { recursive: true, force: true });
});

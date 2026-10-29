// Runs the real main-process notification integration with mocked Electron,
// instance/update transports. Disposable root, no games or user data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const main = path.resolve(__dirname, '../src/main/main.js');
const realRequire = createRequire(main);

async function fixture() {
  assert.ok(process.env.TMPDIR, 'Set TMPDIR to scratch.');
  const root = await fsp.mkdtemp(path.join(process.env.TMPDIR, 'notice-main-'));
  const settings = { notifyLauncherUpdates: true, notifyModUpdates: true, notifyAnnouncements: true, inGameNotices: true, updateChannel: 'stable' };
  let feed = { version: 1, notices: [] }, scans = {}, sent = [], checkCount = 0;
  const inst = [{ id: 'fixture', name: 'Survival', running: true }];
  const instances = {
    list: async () => inst,
    holder: async id => ({ id }),
    dirOf: id => path.join(root, 'instances', id),
    setEmitter: () => {}, isAnyRunning: () => false,
  };
  const mocks = {
    electron: { app: { requestSingleInstanceLock: () => true, getVersion: () => '0.1.26', on: () => {}, whenReady: () => new Promise(() => {}), isPackaged: false }, ipcMain: { handle: () => {} } },
    './store': { dirs: { root }, getSettings: () => ({ ...settings }), updateSettings: async p => Object.assign(settings, p) },
    './instances': instances,
    './servers': { setEmitter: () => {} },
    './screenshots': { createScreenshots: () => ({}) },
    './content': { checkUpdates: async h => { checkCount++; if (scans[h.id] instanceof Error) throw scans[h.id]; return scans[h.id] || []; } },
    './net': { getJson: async () => [] },
    './remote/remote-servers': { createRemoteServers: () => ({ shutdown: () => {} }) },
    './remote/host-agent': { createHostAgent: () => ({ observe: () => {}, startIfEnabled: async () => {}, close: async () => {} }) },
  };
  const context = vm.createContext({
    console: { log: () => {}, warn: () => {} }, Buffer, URL, AbortSignal,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : name === './notifications' || name === 'path' || name === 'crypto' ? realRequire(name) : {},
    process: { env: {}, platform: 'win32', pid: process.pid }, __dirname: path.dirname(main),
    setTimeout: () => {}, setInterval: () => {},
    fetch: async () => new Response(JSON.stringify(feed), { status: 200 }),
  });
  vm.runInContext(fs.readFileSync(main, 'utf8') + '\n globalThis.testAPI={notices, noteUpdateState, checkAnnouncements, scanModUpdates, syncInGameNotices, handlers};', context);
  return { root, settings, inst, get checkCount() { return checkCount; }, scans,
    setFeed: f => { feed = f; }, api: context.testAPI,
    async cleanup() { await new Promise(r=>setTimeout(r,30)); await fsp.rm(root, { recursive:true, force:true }); },
  };
}

// Clean real objects from the VM realm for deep comparisons.
const plain = v => JSON.parse(JSON.stringify(v));

test('main update events create one notice and send unread notice to running game', async () => {
  const f = await fixture();
  try {
    f.api.noteUpdateState({ state:'available', version:'0.1.27' });
    let s = await f.api.notices.list();
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].rev, '0.1.27-available');
    f.api.noteUpdateState({ state:'downloading', version:'0.1.27' });
    f.api.noteUpdateState({ state:'downloading', version:'0.1.27', percent:20 });
    s = await f.api.notices.list();
    assert.equal(s.items.length, 1);
    await f.api.notices.markRead(null);
    f.api.noteUpdateState({ state:'ready', version:'0.1.27' });
    s = await f.api.notices.list();
    assert.equal(s.unread, 1);
    assert.equal(s.items[0].rev, '0.1.27-ready');
    await f.api.syncInGameNotices();
    const file = path.join(f.root,'instances/fixture/config/pimpin-notices.json');
    const disk = JSON.parse(await fsp.readFile(file));
    assert.equal(disk.notices[0].id,'launcher-update.0.1.27-ready');
    f.settings.inGameNotices = false;
    await f.api.syncInGameNotices();
    assert.deepEqual(JSON.parse(await fsp.readFile(file)).notices, []);
    f.api.noteUpdateState({ state:'up-to-date' });
    assert.equal((await f.api.notices.list()).items.length, 0);
  } finally { await f.cleanup(); }
});

test('main feed targeting, toggles and critical notices', async () => {
  const f = await fixture();
  try {
    f.setFeed({ version:1, notices:[
      {id:'hello', title:'Hello'}, {id:'broken', title:'Broken', severity:'critical'},
      {id:'future', title:'Future', from:'0.1.28'},
    ]});
    await f.api.checkAnnouncements();
    assert.deepEqual((await f.api.notices.list()).items.map(n=>n.id).sort(), ['ann-broken','ann-hello']);
    f.settings.notifyAnnouncements = false;
    await f.api.checkAnnouncements();
    assert.deepEqual((await f.api.notices.list()).items.map(n=>n.id), ['ann-broken']);
    f.setFeed({version:1, notices:[]});
    await f.api.checkAnnouncements();
    assert.equal((await f.api.notices.list()).items.length,0);
  } finally { await f.cleanup(); }
});

test('main mod scan awaits holders, dedupes, preserves on failure and removes resolved notices', async () => {
  const f = await fixture();
  try {
    f.scans.fixture = [{title:'Iris', newVersionId:'x'}, {title:'Sodium', newVersionId:'y'}];
    await Promise.all([f.api.scanModUpdates(), f.api.scanModUpdates()]);
    assert.equal(f.checkCount, 1, 'single-flight mod scans');
    let s = await f.api.notices.list();
    assert.equal(s.items[0].id, 'mods-fixture');
    assert.equal(s.items[0].title, '2 mod updates for Survival');
    assert.equal(s.items[0].body, 'Iris, Sodium');
    assert.deepEqual(plain(s.items[0].action), {type:'instance',id:'fixture',tab:'content',label:'Review updates'});
    f.scans.fixture = new Error('Offline');
    await f.api.scanModUpdates();
    assert.equal((await f.api.notices.list()).items.length,1);
    f.scans.fixture = [];
    await f.api.scanModUpdates();
    assert.equal((await f.api.notices.list()).items.length,0);
  } finally { await f.cleanup(); }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('client settings filesystem safety and lifecycle regression suite', async () => {
  assert.ok(process.env.TMPDIR, 'TMPDIR must be explicitly set for isolated tests');
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR, 'pimpin-settings-test-'));
  process.env.PIMPIN_ROOT = root;
  try {
    const instances = require('../src/main/instances');
    const service = require('../src/main/client-settings');
    await fs.mkdir(path.join(root, 'instances', 'fixture'), { recursive: true });
    await fs.writeFile(path.join(root, 'instances', 'fixture', 'pimpin-instance.json'), JSON.stringify({ name: 'Fixture', loader: 'fabric', mcVersion: '1.21.4' }));
    const result = await service.get('fixture');
    assert.equal(result.exists, false);
    assert.equal(result.values.hudOpacity, 55);
    assert.equal(result.values.showBiome, false);
    await assert.rejects(fs.access(path.join(root, 'instances/fixture/config/pimpin-client.json')));
    const file = path.join(root, 'instances/fixture/config/pimpin-client.json');
    let saved = await service.update('fixture', { showBiome: true }, result.revision);
    assert.equal(JSON.parse(await fs.readFile(file)).showBiome, true);
    assert.equal(saved.values.showBiome, true);
    assert.equal(saved.backup, null);
    const original = JSON.stringify({ showBiome: false, hudLayout: [{ x: .2, y: .4, scale: 1.2 }], boostBackup: { clouds: 'off' }, sprintNativeBackup: true, waypoints: [{ name: 'Home' }], future: { nested: [1, 2] }, accent: -1 });
    await fs.writeFile(file, original);
    await fs.writeFile(path.join(path.dirname(file), 'pimpin-waypoints.json'), 'WAYPOINT SENTINEL');
    saved = await service.get('fixture');
    const patched = await service.update('fixture', { showFps: false, hudOpacity: 70, accent: -4887297 }, saved.revision);
    const actual = JSON.parse(await fs.readFile(file));
    assert.deepEqual(actual, { ...JSON.parse(original), showFps: false, hudOpacity: 70, accent: -4887297 });
    assert.equal(await fs.readFile(path.join(path.dirname(file), patched.backup), 'utf8'), original);
    assert.equal(await fs.readFile(path.join(path.dirname(file), 'pimpin-waypoints.json'), 'utf8'), 'WAYPOINT SENTINEL');
    await assert.rejects(service.update('fixture', { showFps: true }, saved.revision), /changed since/);
    for (const patch of [null, [], {}, { boostBackup: {} }, { boostActive: true }, { sprintNativeBackup: false }, { hudLayout: [] }, { file: 'other' }, JSON.parse('{"__proto__":{}}'), { showFps: 1 }, { hudOpacity: 101 }, { hudOpacity: -1 }, { effectHudRows: 3 }, { minimapSize: 193 }, { mapZoom: 5 }, { mapZoom: 1.5 }, { zoomFactor: Infinity }, { zoomFactor: 2.25 }, { zoomFactor: NaN }, { accent: '#fff' }, { accent: 4294967295 }, { minimapRefresh: 9 }, { minimapEntityHeight: 257 }, { backgroundFpsLimit: 4 }, { minimapWaypointRange: -1 }]) {
      await assert.rejects(service.update('fixture', patch, patched.revision), /setting|Invalid|Provide/);
    }
    assert.deepEqual(JSON.parse(await fs.readFile(file)), actual);
    for (const id of ['', null, '../fixture', 'fixture/../fixture', 'C:\\fixture', 'fixture:stream', 'CON', 'missing']) await assert.rejects(service.get(id));
    for (const text of ['{ broken', 'null', '[]', '42']) {
      await fs.writeFile(file, text);
      await assert.rejects(service.get('fixture'), /Cannot parse.*left unchanged/);
      await assert.rejects(service.update('fixture', { hud: true }, patched.revision), /Cannot parse.*left unchanged/);
      assert.equal(await fs.readFile(file, 'utf8'), text);
    }
    await fs.writeFile(file, original);
    const revision = (await service.get('fixture')).revision;
    const failing = service.createClientSettings({ io: new Proxy(fs, { get(target, key) { return key === 'rename' ? async () => { throw new Error('fixture disk error'); } : target[key]; } }) });
    await assert.rejects(failing.update('fixture', { hud: false }, revision), /fixture disk error.*not replaced.*Safety copy/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    assert.equal((await fs.readdir(path.dirname(file))).some(name => name.endsWith('.tmp')), false);
    for (const suffix of ['.bak', '.tmp']) {
      const denied = service.createClientSettings({ io: new Proxy(fs, { get(target, key) { return key === 'open' ? async (name, flags) => { if (name.endsWith(suffix)) throw new Error('fixture access denied'); return fs.open(name, flags); } : target[key]; } }) });
      await assert.rejects(denied.update('fixture', { hud: false }, revision), /fixture access denied/);
      assert.equal(await fs.readFile(file, 'utf8'), original);
      assert.equal(instances.isBusy('fixture'), false);
    }
    const partialBackup = service.createClientSettings({ io: new Proxy(fs, { get(target, key) { return key === 'open' ? async (name, flags) => {
      const handle = await fs.open(name, flags);
      return name.endsWith('.bak') ? { writeFile: async () => { await handle.writeFile('partial'); throw new Error('fixture disk full'); }, sync: () => handle.sync(), close: () => handle.close() } : handle;
    } : target[key]; } }) });
    await assert.rejects(partialBackup.update('fixture', { hud: false }, revision), error => /fixture disk full/.test(error.message) && !error.message.includes('Safety copy:'));
    assert.equal(await fs.readFile(file, 'utf8'), original);
    // Equipment HUD choices mirror the exact in-game cycles.
    assert.equal(result.values.armorReadout, 0);
    assert.equal(result.values.armorMainHand, true);
    assert.equal(result.values.armorOffHand, false);
    assert.equal(result.values.armorWarningPercent, 0);
    for (const field of result.schema.filter(f => f.type === 'choice')) {
      for (const choice of field.choices) {
        const before = await service.get('fixture');
        const after = await service.update('fixture', { [field.key]: choice.value }, before.revision);
        assert.equal(after.values[field.key], choice.value, field.key);
        assert.equal(JSON.parse(await fs.readFile(file))[field.key], choice.value);
      }
    }
    for (const patch of [{ armorReadout: 3 }, { armorReadout: '1' }, { armorWarningPercent: 12 }, { armorWarningPercent: 35 }, { armorOffHand: 'yes' }]) {
      await assert.rejects(service.update('fixture', patch, (await service.get('fixture')).revision), /Invalid/);
    }
    // Every advertised numeric endpoint is accepted, without erasing opaque data.
    for (const field of result.schema.filter(f => f.type === 'number')) {
      for (const value of [field.min, field.max]) {
        const before = await service.get('fixture');
        const after = await service.update('fixture', { [field.key]: value }, before.revision);
        assert.equal(after.values[field.key], value, field.key);
        assert.deepEqual(JSON.parse(await fs.readFile(file)).hudLayout, JSON.parse(original).hudLayout);
      }
    }
    await fs.writeFile(file, original);
    assert.equal(instances.isBusy('fixture'), false);
    // Exercise the actual running lifecycle without starting Java or contacting auth.
    const { EventEmitter } = require('node:events');
    const minecraft = require('../src/main/minecraft');
    const auth = require('../src/main/auth');
    const content = require('../src/main/content');
    const old = { launch: minecraft.launch, prepare: minecraft.prepare, account: auth.getLaunchAccount, refresh: content.refreshPimpinClient };
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    try {
      auth.getLaunchAccount = async () => ({ fixture: true });
      content.refreshPimpinClient = async () => {};
      minecraft.prepare = async () => {};
      minecraft.launch = async () => ({ child, loaderVersion: null });
      await instances.launch('fixture');
      await assert.rejects(service.update('fixture', { hud: false }, revision), /Stop Minecraft/);
      await child.listeners('close')[0](0); // await fixture exit metadata persistence
    } finally { minecraft.launch = old.launch; minecraft.prepare = old.prepare; auth.getLaunchAccount = old.account; content.refreshPimpinClient = old.refresh; }
    assert.equal(instances.isBusy('fixture'), false);
    let release;
    const held = instances.withStopped('fixture', () => new Promise(resolve => { release = resolve; }));
    await assert.rejects(service.update('fixture', { hud: false }, revision), /Stop Minecraft/);
    release(); await held;
    const preparing = instances.launch('nonexistent-lock-fixture');
    await assert.rejects(service.update('nonexistent-lock-fixture', { hud: false }, 'absent'), /Stop Minecraft/);
    await assert.rejects(preparing, /Instance not found/);
    const concurrent = await Promise.allSettled([service.update('fixture', { hud: false }, revision), service.update('fixture', { showBiome: true }, revision)]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(concurrent.find(r => r.status === 'rejected').reason.message, /Stop Minecraft/);
    const linkedRoot = path.join(root, 'linked-instances');
    await fs.symlink(path.join(root, 'instances'), linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    const linkedService = service.createClientSettings({ instancesRoot: linkedRoot });
    await assert.rejects(linkedService.get('fixture'), /linked/);
    await fs.rm(linkedRoot, { recursive: true });
    console.log('Client settings: defaults, patch preservation, exact backups, malformed JSON, whitelist/ranges, stale revision, atomic failure, lifecycle reservations and concurrent write checks passed.');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

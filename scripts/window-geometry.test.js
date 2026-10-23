// Launcher window geometry: remembered size/position/maximized state is
// sanitized on the way into BrowserWindow options so a corrupt settings file
// can never create an unusable window, and updateSettings only keeps known
// keys (so geometry keys must live in DEFAULT_SETTINGS to persist).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('launcher geometry is sanitized, clamped and persisted', async (t) => {
  const scratchRoot = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
  await fs.mkdir(scratchRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratchRoot, 'win-geometry-'));
  process.env.PIMPIN_ROOT = root;
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const store = require('../src/main/store');

  // garbage in -> safe defaults; NaN positions are dropped so the OS centers it
  assert.deepEqual(
    store.launcherBounds({ winW: 'bogus', winH: 0, winX: 'NaN', winY: undefined, winMax: 1 }),
    { x: null, y: null, width: 1280, height: 800, maximized: true },
  );

  // clamped to the window's minimum size, position kept when finite (multi-monitor)
  assert.deepEqual(
    store.launcherBounds({ winW: 400, winH: -20, winX: 0, winY: -1640 }),
    { x: 0, y: -1640, width: 1024, height: 640, maximized: false },
  );

  // persisted through updateSettings, which drops unknown fields
  const s = await store.updateSettings({
    winW: 1512, winH: 900, winX: -1640, winY: 88, winMax: true,
    unknownKey: 'should not persist',
  });
  assert.equal(s.winW, 1512);
  assert.equal(s.unknownKey, undefined);
  assert.deepEqual(
    store.launcherBounds(store.getSettings()),
    { x: -1640, y: 88, width: 1512, height: 900, maximized: true },
  );
});

// Explicit Electron integration regression suite; no real launcher data.
// TMPDIR=<scratch> node --test scripts/settings-usability.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('Settings custom speed, asynchronous search and narrow keyboard navigation in the real Electron renderer', { timeout: 90000 }, () => {
  assert.ok(process.env.TMPDIR, 'TMPDIR must explicitly point to disposable scratch storage');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // The fixture creates its own unique PIMPIN_ROOT before importing services.
  delete env.PIMPIN_ROOT;
  const result = spawnSync(require('electron'), [path.join(__dirname, 'settings-usability-electron.js')], {
    env, encoding: 'utf8', timeout: 80000, windowsHide: false,
  });
  console.log(result.stdout);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  for (const check of ['late optional rows obey active search', 'imported custom scene speed is visible without changing persisted value', 'keyboard section target is not covered by sticky search/navigation', 'narrow page has no horizontal clipping']) {
    assert.ok(result.stdout.includes('PASS ' + check), 'Missing regression check: ' + check);
  }
});

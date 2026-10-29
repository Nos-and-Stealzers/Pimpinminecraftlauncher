// Actual-main regression fixture. Never uses real launcher data or startup/jump-list settings.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.env.TMPDIR) throw new Error('TMPDIR must point at disposable scratch');
app.disableHardwareAcceleration();
app.setUserTasks = () => true;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR, 'pimpin-window-recovery-'));
  process.env.PIMPIN_ROOT = root;
  app.setPath('userData', path.join(root, 'electron-profile'));
  const store = require('../src/main/store');
  await store.updateSettings({ startPage: 'home', onboarded: true, lastSeenVersion: app.getVersion(), showNews: false, notifyAnnouncements: false, notifyModUpdates: false, autoUpdate: false, winX: 99999, winY: 99999, minimizeToTray: false });
  process.argv.push('--hidden'); // stale startup registration must not make the launcher unreachable
  require('../src/main/main');
  await app.whenReady();
  let win;
  for (let n = 0; n < 160; n++) {
    win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoadingMainFrame()) break;
    await pause(50);
  }
  assert.ok(win, 'actual launcher opens');
  for (let n = 0; n < 40 && !win.isVisible(); n++) await pause(50);
  assert.equal(win.isVisible(), true, '--hidden without a tray must fall back to a visible window');
  const bounds = win.getBounds();
  assert.ok(screen.getAllDisplays().some(({ workArea: a }) => Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x) >= 96 && Math.min(bounds.y + 32, a.y + a.height) - Math.max(bounds.y, a.y) >= 24), 'disconnected monitor position is recovered on a real display');
  const report = { passed: true, actualMain: true, root, bounds, tests: ['off-screen window recovery', 'hidden startup without tray stays accessible'] };
  await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });

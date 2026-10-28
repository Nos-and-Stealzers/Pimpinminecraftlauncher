const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('installer preserves identity, assisted install choices and all user data', () => {
  assert.equal(pkg.build.appId, 'com.nosandstealzers.pimpinlauncher');
  assert.equal(pkg.build.productName, 'Pimpin Launcher');
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');
  assert.equal(pkg.build.nsis.artifactName, 'PimpinLauncher-Setup-${version}.${ext}');
  assert.equal(pkg.build.publish[0].repo, 'pimpin-launcher-releases');
});

test('runtime window and tray icon is explicitly packaged without build tools', () => {
  assert.ok(pkg.build.files.includes('build/icon.png'));
  assert.ok(!pkg.build.files.includes('build/**/*'));
});

test('custom NSIS path replaces recursive removal and blocks the upstream destructive switch', () => {
  const custom = read('build/installer.nsh');
  const stock = read('node_modules/app-builder-lib/templates/nsis/uninstaller.nsh');
  assert.match(stock, /!ifmacrodef customRemoveFiles/);
  assert.match(stock, /GetOptions.*--delete-app-data/);
  assert.match(custom, /!macro customUnInit[\s\S]*--delete-app-data[\s\S]*Abort[\s\S]*!macroend/);
  assert.match(custom, /!macro customRemoveFiles/);
  assert.doesNotMatch(custom, /RMDir\s+\/r|Delete\s+.*\*/i);
  assert.match(custom, /!macro customUnWelcomePage[\s\S]*!define MUI_WELCOMEPAGE_TEXT/);
  assert.match(custom, /\.pimpinlauncher/);
  assert.match(custom, /PIMPIN_ROOT/);
});

test('packaged-file manifest is strict, deterministic and never removes unknown data', () => {
  const { manifestFromListing, renderManifest } = require('../build/installer-manifest');
  const manifest = manifestFromListing('Path = resources/app.asar\nFolder = -\n\nPath = locales/en-US.pak\nFolder = -\n\nPath = locales\nFolder = +\n\nPath = Pimpin Launcher.exe\nFolder = -\n');
  assert.deepEqual(manifest.files, ['Pimpin Launcher.exe', 'locales\\en-US.pak', 'resources\\app.asar']);
  const windowsListing = manifestFromListing('Path = resources\r\nAttributes = D\r\n\r\nPath = resources/app.asar\r\nAttributes = A\r\n');
  assert.deepEqual(windowsListing.files, ['resources\\app.asar']);
  assert.deepEqual(windowsListing.directories, ['resources']);
  const text = renderManifest(manifest);
  assert.match(text, /!macro pimpinMovePackagedFiles/);
  assert.match(text, /!macro pimpinRestorePackagedFiles/);
  assert.match(text, /!macro pimpinRemoveEmptyDirectories/);
  assert.doesNotMatch(text, /RMDir\s+\/r|Delete\s+.*\*/i);
  assert.doesNotMatch(text, /worlds|accounts|instances|cache/);
  for (const file of ['../worlds/save', '/absolute', 'C:\\worlds', 'resources/*', 'resources/$APPDATA', 'bad"name', 'a\\..\\b']) {
    assert.throws(() => manifestFromListing(`Path = ${file}\nFolder = -\n`), /Unsafe/);
  }
  assert.throws(() => manifestFromListing(''), /empty/i);
  assert.throws(() => manifestFromListing('Path = resources/app.asar\nFolder = -\n\nPath = RESOURCES/APP.ASAR\nFolder = -\n'), /duplicate/i);
});

test('actual installer payload contains the runtime icon and valid updater metadata', {
  skip: !process.env.PIMPIN_INSTALLER_OUTPUT && 'Set PIMPIN_INSTALLER_OUTPUT to verify a built installer',
}, async () => {
  const output = path.resolve(process.env.PIMPIN_INSTALLER_OUTPUT);
  const cp = require('node:child_process');
  const crypto = require('node:crypto');
  const yaml = require('js-yaml');
  const asar = require('@electron/asar');
  // Load the public builder entry first to avoid its internal module cycles.
  require('electron-builder');
  const sevenZip = await require('app-builder-lib/out/toolsets/7zip').getPath7za();
  const update = yaml.load(fs.readFileSync(path.join(output, 'latest.yml'), 'utf8'));
  assert.match(update.path, /^PimpinLauncher-Setup-[\d.]+\.exe$/);
  const installer = path.join(output, update.path);
  const bytes = fs.readFileSync(installer);
  assert.equal(crypto.createHash('sha512').update(bytes).digest('base64'), update.sha512);
  assert.equal(update.files[0].size, bytes.length);
  const listing = cp.execFileSync(sevenZip, ['l', '-slt', '-ba', installer], { encoding: 'utf8', windowsHide: true });
  const { manifestFromListing, renderManifest } = require('../build/installer-manifest');
  const manifest = manifestFromListing(listing);
  assert.ok(manifest.files.includes('resources\\app.asar'));
  assert.ok(!manifest.files.includes('resources'));
  assert.ok(!manifest.files.includes('locales'));
  const extracted = path.join(output, 'audit-app.asar');
  const descriptor = fs.openSync(extracted, 'w');
  try {
    const extraction = cp.spawnSync(sevenZip, ['x', '-so', installer, 'resources/app.asar'], {
      stdio: ['ignore', descriptor, 'pipe'], windowsHide: true,
    });
    assert.equal(extraction.status, 0, String(extraction.stderr));
    const entry = name => name.split('/').join(path.sep);
    assert.deepEqual(asar.extractFile(extracted, entry('build/icon.png')), fs.readFileSync(path.join(root, 'build/icon.png')));
    const entries = asar.listPackage(extracted).map(name => name.replace(/\\/g, '/'));
    assert.ok(!entries.some(name => /\/build\/installer/.test(name)), 'build-time scripts must not ship');
    const metadata = JSON.parse(asar.extractFile(extracted, 'package.json'));
    assert.equal(metadata.version, update.version);
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(extracted);
  }
  const updater = cp.execFileSync(sevenZip, ['x', '-so', installer, 'resources/app-update.yml'], { encoding: 'utf8', windowsHide: true });
  assert.equal(yaml.load(updater).repo, 'pimpin-launcher-releases');
  fs.writeFileSync(path.join(output, 'audit-payload-manifest.nsh'), renderManifest(manifest));
});

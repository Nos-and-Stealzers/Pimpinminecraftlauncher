// Verifies the freshly collected pimpin-client jars: notice HUD present,
// production entrypoints only, no test-only classes, manifest covers match.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const assert = require('assert/strict');

const dir = path.join(__dirname, '..', 'resources', 'mods');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'pimpin-client.json'), 'utf8'));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'manifest version should be semver');
const jars = manifest.jars.map((j) => j.file);
assert.equal(jars.length, 14, 'expected 14 jars in the manifest');

let bad = 0;
for (const file of jars) {
  const zip = new AdmZip(path.join(dir, file));
  const names = new Set(zip.getEntries().map((e) => e.entryName));
  const has = (n) => names.has(n);
  const checks = [
    [`production init ${file}`, has('dev/pimpin/client/PimpinClient.class')],
    [`notices feature ${file}`, has('dev/pimpin/client/feature/LauncherNotices.class')],
    [`notice hud ${file}`, has('dev/pimpin/client/hud/NoticeHud.class')],
    [`waypoints ${file}`, has('dev/pimpin/client/feature/Waypoints.class')],
  ];
  const forbidden = [...names].filter((n) => /AdresseTest|TestCapture/.test(n));
  checks.push([`no test classes ${file}`, forbidden.length === 0]);
  const meta = JSON.parse(zip.readAsText('fabric.mod.json'));
  const entrypoints = (meta.entrypoints?.client || []).map(String).filter((s) => !/Mixin|PreLaunch/.test(s));
  const realClients = JSON.stringify(entrypoints);
  checks.push([`clean client entrypoints ${file}`, !/DevTest|TestCapture/.test(realClients) && realClients.includes('dev.pimpin.client.PimpinClient')]);
  for (const [label, ok] of checks) {
    if (!ok) { console.log('FAIL', label, forbidden.length ? forbidden.join(',') : ''); bad++; }
  }
  const size = fs.statSync(path.join(dir, file)).size;
  console.log(`${file}: ${size} bytes, ${names.size} entries`);
}
if (bad) { console.log(`${bad} problems`); process.exit(1); }
console.log('all 14 jars verified: notice HUD present, entrypoints clean');

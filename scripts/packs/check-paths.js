// Verify every texture path the packs write exists in the vanilla client jar of
// that version, and that image proportions match the vanilla file.
//   node scripts/packs/check-paths.js <indexDir>
// <indexDir> holds one <version>.json per game version: { version: <version.json>,
// textures: { "assets/minecraft/textures/...png": [w, h] } } built from the
// real client jars (see the minecraft-resource-pack-verification skill).
const fs = require('fs');
const path = require('path');
const packs = require('../../src/main/packs');
const INDEX = process.argv[2] || process.env.PACK_INDEX_DIR;
if (!INDEX) { console.error('usage: check-paths.js <indexDir>'); process.exit(2); }
const VERS = ['1.8.9', '1.12.2', '1.16.5', '1.19.3', '1.20.1', '1.20.2', '1.20.4', '1.21.1', '1.21.2', '1.21.4', '1.21.5', '1.21.8', '1.21.9', '1.21.10', '1.21.11', '26.1', '26.3'];
const rows = [];
let bad = 0;
for (const v of VERS) {
  const idx = JSON.parse(fs.readFileSync(path.join(INDEX, `${v}.json`)));
  for (const id of ['performance', 'pretty']) {
    const files = packs.files(id, v);
    const pv = idx.version && idx.version.pack_version;
    const want = pv == null ? null : typeof pv === 'number' ? pv : pv.resource ?? pv.resource_major;
    const meta = JSON.parse(files.find(([p]) => p === 'pack.mcmeta')[1]).pack;
    const fmtOk = want == null || meta.pack_format === want || (meta.max_format >= want && meta.min_format <= want);
    // animated textures need their .mcmeta
    const anim = files.filter(([p, d]) => /blocks?\/.*\.png$/.test(p) && d.readUInt32BE(20) > d.readUInt32BE(16) && !files.some(([q]) => q === p + '.mcmeta'));
    const names = new Set(files.map(([p]) => p));
    let ok = 0;
    const problems = [];
    for (const [p, data] of files) {
      if (!p.startsWith('assets/minecraft/textures/')) continue;
      // OptiFine/Continuity emissive overlays (<name>_e.png) are not vanilla files
      if (/_e\.png$/.test(p) && names.has(p.replace(/_e\.png$/, '.png'))) { ok++; continue; }
      if (p.endsWith('.mcmeta')) {
        if (!names.has(p.slice(0, -7))) problems.push(`orphan mcmeta ${p}`);
        else ok++;
        continue;
      }
      const van = idx.textures[p];
      if (!van) { problems.push(`MISSING in vanilla: ${p}`); continue; }
      const w = data.readUInt32BE(16);
      const h = data.readUInt32BE(20);
      const [vw, vh] = van;
      const block = /\/blocks?\//.test(p);
      let good = w * vh === h * vw; // same aspect ratio
      if (!good && block) {
        // animated strip vs static tile: both must be stacks of square (or 1:1-per-frame) tiles of the same width ratio
        good = h % w === 0 && vh % vw === 0;
      }
      if (!good && /entity\//.test(p) === false && /gui\/sprites/.test(p) === false && /misc\//.test(p)) good = w === h && vw === vh;
      if (!good) problems.push(`ASPECT ${p}: ours ${w}x${h} vs vanilla ${vw}x${vh}`);
      else ok++;
      // entity / gui files must be an exact integer scale of vanilla
      if (good && /entity\/|gui\//.test(p) && !(w % vw === 0 && w / vw === h / vh)) problems.push(`SCALE ${p}: ${w}x${h} vs ${vw}x${vh}`);
    }
    if (!fmtOk) problems.push(`pack_format ${meta.pack_format} vs game ${want}`);
    anim.forEach(([p]) => problems.push(`animated without mcmeta: ${p}`));
    bad += problems.length;
    rows.push({ v, id, files: files.length, textures_ok: ok, problems, fmt: `${meta.pack_format}/${want ?? '?'}` });
  }
}
console.log('version  pack         files  ok  fmt(ours/game) problems');
for (const r of rows) console.log(`${r.v.padEnd(8)} ${r.id.padEnd(12)} ${String(r.files).padStart(5)} ${String(r.textures_ok).padStart(4)} ${r.fmt.padEnd(8)} ${r.problems.length}${r.problems.length ? `\n    - ${r.problems.join('\n    - ')}` : ''}`);
process.exit(bad ? 1 : 0);

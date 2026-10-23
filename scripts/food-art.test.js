'use strict';
// Standalone: node.exe scripts/food-art.test.js [cached-packs-dir] [evidence-dir]
// Reads real Mojang jars/indexes; never installs packs or modifies instances.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const { I, ITEM_SPECS } = require('../src/main/pack-art/food-art');
const root = process.argv[2] || path.join(process.env.LOCALAPPDATA, 'hermes/cache/scratch/packs');
const out = process.argv[3] || path.join(process.env.LOCALAPPDATA, 'hermes/cache/scratch/pimpin-item-art/food');
const versions = ['1.8.9', '1.12.2', '1.16.5', '1.19.3', '1.20.1', '1.20.2', '1.20.4', '1.21.1', '1.21.2', '1.21.4', '1.21.5', '1.21.8', '1.21.9', '1.21.10', '1.21.11', '26.1', '26.3'];
const jar = path.join(root, 'jars/26.3.jar');
const zip = new AdmZip(jar);
let assertions = 0;
function check(value, message) { assertions++; assert.ok(value, message); }
const json = (entry) => { const text = zip.readAsText(entry); check(!!text, `Missing game source ${entry}`); return JSON.parse(text); };
const javap = execFileSync('javap', ['-classpath', jar, 'net.minecraft.world.food.Foods'], { encoding: 'utf8' });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'Foods.javap.txt'), javap);
const edible = [...javap.matchAll(/FoodProperties ([A-Z_]+);/g)].map((m) => m[1].toLowerCase()).sort();
check(edible.length === 40, `Review new Foods constants: got ${edible.length}, expected 40`);
const balanced = Object.keys(json('data/minecraft/advancement/husbandry/balanced_diet.json').criteria).sort();
check(JSON.stringify(edible) === JSON.stringify(balanced), 'Foods and real balanced_diet criterion lists disagree');
const textureRefs = (model, visited = new Set()) => {
  if (visited.has(model) || model.endsWith('/generated') || model.endsWith('/handheld')) return [];
  visited.add(model);
  const entry = 'assets/minecraft/models/' + model.replace(/^minecraft:/, '') + '.json';
  const data = json(entry);
  return [...Object.values(data.textures || {}).filter((v) => !v.startsWith('#')), ...(data.parent ? textureRefs(data.parent, visited) : [])];
};
const coverage = edible.map((name) => {
  const textures = [...new Set(textureRefs('minecraft:item/' + name).map((v) => v.replace(/^(?:minecraft:)?item\//, '')))];
  check(textures.length > 0, `No actual model texture for ${name}`);
  for (const texture of textures) check(typeof I[texture] === 'function', `Uncovered edible ID ${name}: ${texture}`);
  return { item: name, textures };
});
check(!I.enchanted_golden_apple, 'Do not invent a separate enchanted apple PNG');
check(coverage.find((v) => v.item === 'enchanted_golden_apple').textures.includes('golden_apple'), 'Enchanted apple must resolve actual model texture');
check(ITEM_SPECS.length === 49 && Object.keys(I).length === 49, 'Expected 49 real unique textures');
check(new Set(ITEM_SPECS.map((s) => s.name)).size === ITEM_SPECS.length, 'Duplicate specs');
check(ITEM_SPECS.every((s) => typeof I[s.name] === 'function'), 'Spec painter missing');
const compare = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
const versionPaths = [];
for (const version of versions) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'index', version + '.json'), 'utf8'));
  const parts = version.split('.').map(Number), legacy = parts[0] === 1 && parts[1] < 13;
  const paths = [];
  for (const spec of ITEM_SPECS) {
    if (spec.since && compare(parts, spec.since) < 0 || legacy && spec.legacy === null) continue;
    const texture = `assets/minecraft/textures/${legacy ? 'items/' + spec.legacy : 'item/' + spec.name}.png`;
    check(!!index.textures[texture], `${version} INVALID PATH: ${texture}`);
    check(index.textures[texture][0] === index.textures[texture][1], `${version} item aspect changed: ${texture}`);
    paths.push(texture);
  }
  versionPaths.push({ version, count: paths.length, paths });
}
const hashes = [], metrics = [];
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
for (const S of [16, 32]) {
  const dir = path.join(out, String(S)); fs.mkdirSync(dir, { recursive: true });
  const seen = new Map();
  for (const { name } of ITEM_SPECS) {
    const style = S === 32 ? 'pretty' : 'performance';
    const image = I[name](S, style), data = Buffer.from(image.data), png = image.toPNG();
    check(image.w === S && image.h === S, `${name}: native size`);
    check(data.equals(Buffer.from(I[name](S, style).data)), `${name}: nondeterministic pixels`);
    check(png.equals(I[name](S, style).toPNG()), `${name}: nondeterministic encoding`);
    let opaque = 0; const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      check(data[i + 3] === 0 || data[i + 3] === 255, `${name}: intermediate alpha`);
      if (data[i + 3]) { opaque++; colors.add(data.subarray(i, i + 3).toString('hex')); }
      else check(data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0, `${name}: hidden RGB`);
    }
    check(opaque > S * S * 0.08 && opaque < S * S * 0.9, `${name}: unreadable silhouette coverage ${opaque}`);
    check(colors.size >= (name === 'potion_overlay' ? 3 : 5), `${name}: insufficient palette shading`);
    for (let n = 0; n < S; n++) check(!image.get(n, 0)[3] && !image.get(n, S - 1)[3] && !image.get(0, n)[3] && !image.get(S - 1, n)[3], `${name}: canvas-edge clipping`);
    const hash = digest(png);
    check(!seen.has(hash), `${name} duplicates ${seen.get(hash)}`); seen.set(hash, name);
    if (S === 32) {
      const small = I[name](16, 'performance'); let different = false;
      for (let y = 0; y < S && !different; y++) for (let x = 0; x < S; x++) if (image.get(x, y).join() !== small.get(Math.floor(x / 2), Math.floor(y / 2)).join()) { different = true; break; }
      check(different, `${name}: Pretty32 is only nearest-neighbor 16px`);
    }
    fs.writeFileSync(path.join(dir, name + '.png'), png);
    hashes.push({ name, size: S, sha256: hash }); metrics.push({ name, size: S, colors: colors.size, opaque });
  }
  const overlay = I.potion_overlay(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const pixel = overlay.get(x, y);
    if (!pixel[3]) continue;
    check(pixel[0] === pixel[1] && pixel[1] === pixel[2], 'Tint overlay must be neutral');
    for (const name of ['potion', 'splash_potion', 'lingering_potion']) check(!I[name](S).get(x, y)[3], `${name} hides vanilla potion tint layer`);
  }
}
const edibleTextures = [...new Set(coverage.flatMap((v) => v.textures))].sort();
const related = ITEM_SPECS.map((v) => v.name).filter((v) => !edibleTextures.includes(v));
const report = { assertions, edibleItemIds: edible.length, edibleTextureFiles: edibleTextures.length, totalTextureFiles: ITEM_SPECS.length, relatedTextureFiles: related.length, related, coverage, specs: ITEM_SPECS, versionPaths, hashes, metrics };
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ assertions, edibleItemIds: edible.length, edibleTextureFiles: edibleTextures.length, totalTextureFiles: ITEM_SPECS.length, related, versions: versionPaths.map(({ version, count }) => ({ version, count })), evidence: out }, null, 2));

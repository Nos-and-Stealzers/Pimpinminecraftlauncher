// Isolated art export for UV/alpha checking and contact sheets; no live game.
// node.exe scripts/preview-equipment-ores.js OUT [VERSION ...]
const fs = require('fs');
const path = require('path');
const { files } = require('../src/main/pack-art/equipment-art');
const { X } = require('../src/main/pack-art/ore-art');
const out = process.argv[2];
if (!out) throw new Error('Pass an output directory (prefer the Hermes scratch directory)');
const versions = process.argv.slice(3);
if (!versions.length) versions.push('1.8.9', '1.12.2', '1.16.5', '1.19.3', '1.20.1', '1.20.2', '1.20.4', '1.21.1', '1.21.2', '1.21.4', '1.21.5', '1.21.8', '1.21.9', '1.21.10', '1.21.11', '26.1', '26.3');
fs.mkdirSync(out, { recursive: true });
const manifest = { equipment: [], ores: [] };
function save(relative, image) {
  const target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, image.toPNG());
}
for (const version of versions) for (const style of ['fast', 'looks']) for (const [texture, image] of files(version, style)) {
  const file = `${version}/${style}/${texture}`;
  save(file, image);
  manifest.equipment.push({ version, style, texture, file, width: image.w, height: image.h });
}
for (const style of ['fast', 'looks']) for (const [name, painter] of Object.entries(X)) {
  const S = style === 'looks' ? 32 : 16, image = painter(S, style);
  const file = `ores/${style}/${name}.png`;
  save(file, image);
  save(`ores/${style}/${name}_e.png`, painter.emissive(S, style));
  if (image.meta) fs.writeFileSync(path.join(out, `${file}.mcmeta`), JSON.stringify(image.meta, null, 2));
  manifest.ores.push({ style, name, file, size: S, frames: image.h / S });
}
fs.writeFileSync(path.join(out, 'art-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ versions, equipmentSheets: manifest.equipment.length, oreSheets: manifest.ores.length, out }, null, 2));

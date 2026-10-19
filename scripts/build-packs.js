// Writes the Pimpin resource packs to dist/packs so they can be shared or
// used in any launcher: `npm run packs -- 1.21.4 1.8.9` (defaults to 1.21.4).
const fs = require('fs');
const path = require('path');
const packs = require('../src/main/packs');

const versions = process.argv.slice(2).length ? process.argv.slice(2) : ['1.21.4'];
const out = path.join(__dirname, '..', 'dist', 'packs');
fs.mkdirSync(out, { recursive: true });
for (const version of versions) {
  for (const pack of Object.values(packs.PACKS)) {
    const file = path.join(out, `${pack.name} (${version}).zip`);
    fs.writeFileSync(file, packs.build(pack.id, version));
    console.log(`${path.relative(process.cwd(), file)}  (pack_format ${packs.packFormat(version)}, ${packs.files(pack.id, version).length} files)`);
  }
}

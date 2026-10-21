// Jar-free sanity checks for the generated packs (fast, no downloads):
//   node scripts/packs/check-art.js
// - both packs build for every supported version line
// - opaque block textures have no transparent pixels (a hole would show as
//   a see-through or black spot in game); cutout/translucent kinds are exempt
// - animated strips are whole frames and carry a .mcmeta
// Path/aspect checks against the real client jars live in check-paths.js.
const packs = require('../../src/main/packs');
const { decode } = require('./png-decode');

const VERSIONS = ['1.8.9', '1.12.2', '1.16.5', '1.19.3', '1.20.1', '1.20.4', '1.21.1', '1.21.4', '1.21.5', '1.21.11', '26.1', '26.3'];
const SEE_THROUGH = /glass|leaves|torch|lantern|ladder|door|trapdoor|(^|_)grass$|short_grass|tall_grass|tallgrass|fern|poppy|dandelion|flower|tulip|orchid|allium|bluet|daisy|cornflower|lily|sapling|mushroom|dead_?bush|wheat|carrots|potatoes|beetroots|sugar_cane|reeds|vine|fire|cactus|overlay|double_plant|waterlily|^ice$|pane|_e$|water|portal/;
let bad = 0;
for (const v of VERSIONS) {
  for (const id of Object.keys(packs.PACKS)) {
    const files = packs.files(id, v);
    const names = new Set(files.map(([p]) => p));
    for (const [p, data] of files) {
      const m = /textures\/blocks?\/(.+)\.png$/.exec(p);
      if (!m) continue;
      const img = decode(data);
      if (img.h % img.w) { console.log(`${v} ${id} ${m[1]}: strip ${img.w}x${img.h} is not whole frames`); bad++; }
      if (img.h > img.w && !names.has(`${p}.mcmeta`)) { console.log(`${v} ${id} ${m[1]}: animated strip without .mcmeta`); bad++; }
      if (SEE_THROUGH.test(m[1])) continue;
      let holes = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 255) holes++;
      if (holes) { console.log(`${v} ${id} ${m[1]}: ${holes} transparent pixels in an opaque block`); bad++; }
    }
  }
}
console.log(bad ? `${bad} problem(s)` : `pack art OK (${VERSIONS.length} versions x ${Object.keys(packs.PACKS).length} packs)`);
process.exit(bad ? 1 : 0);

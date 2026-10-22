'use strict';
// node.exe scripts/gear-art.test.js [index directory] [output directory]
// Reads actual client indexes; does not download assets or modify game instances.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {I, ITEM_SPECS} = require('../src/main/pack-art/gear-art');
const indexDir = process.argv[2];
const out = process.argv[3];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const compare = (a,b) => { for(let j=0;j<3;j++) { const d=(a[j]||0)-(b[j]||0); if(d) return d; } return 0; };
assert.equal(new Set(ITEM_SPECS.map(s=>s.name)).size,ITEM_SPECS.length);
assert.deepEqual(Object.keys(I).sort(),ITEM_SPECS.map(s=>s.name).sort());
const report={items:ITEM_SPECS.length,renders:0,versions:[],images:[],notes:[
  'broken_elytra retires at 1.21.4; elytra_broken replaces it. Intersect registry with real texture index.',
  'Shield is special/entity rendered; no invented inventory path.',
  'Trident inventory only; entity/held renderer unchanged.',
  'Spear inventory only; separate _in_hand textures intentionally unchanged.',
]};
if(out) fs.mkdirSync(out,{recursive:true});
for(const [S,style] of [[16,'fast'],[32,'pretty']]) {
  const seen=new Map();
  for(const spec of ITEM_SPECS) {
    const image=I[spec.name](S,style), again=I[spec.name](S,style);
    assert.equal(image.w,S); assert.equal(image.h,S);
    assert.equal(image.data.length,S*S*4);
    assert.deepEqual(image.data,again.data,`${spec.name} deterministic pixels`);
    assert.deepEqual(image.toPNG(),again.toPNG(),`${spec.name} deterministic PNG`);
    let opaque=0, minX=S,minY=S,maxX=-1,maxY=-1;
    const colors=new Set();
    for(let y=0;y<S;y++) for(let x=0;x<S;x++) {
      const i=(y*S+x)*4, a=image.data[i+3];
      assert.ok(a===0||a===255,`${spec.name} has binary alpha`);
      if(!a) assert.deepEqual([...image.data.slice(i,i+3)],[0,0,0],`${spec.name} transparent RGB cleared`);
      else { opaque++; minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);colors.add([...image.data.slice(i,i+3)].join(',')); }
    }
    assert.ok(opaque>=4*S/16 && opaque<S*S*.85,`${spec.name} readable nonempty cutout (${opaque})`);
    assert.ok(colors.size>=2,`${spec.name} has deliberate shading`);
    if(/^(wooden|stone|iron|golden|diamond|netherite|copper)_(sword|pickaxe|axe|shovel|hoe|spear)$/.test(spec.name)) {
      assert.ok(opaque>=S*S*.14,`${spec.name} full-size tool coverage`);
      assert.ok(maxX-minX+1>=S*.55 && maxY-minY+1>=S*.75,`${spec.name} held-tool proportions`);
      assert.ok(minX>=1 && minY>=1 && maxX<S-1 && maxY<S-1,`${spec.name} silhouette is not clipped`);
    }
    // Leather bases must accept the game's RGB dye multiplier without a baked brown cast.
    if(/^leather_(helmet|chestplate|leggings|boots|horse_armor)$/.test(spec.name)) for(let i=0;i<image.data.length;i+=4) {
      if(image.data[i+3]) assert.ok(Math.max(...image.data.slice(i,i+3))-Math.min(...image.data.slice(i,i+3))<=8,'neutral leather dye base');
    }
    const digest=hash(image.data);
    const duplicate=seen.get(digest);
    assert.ok(!duplicate||[duplicate,spec.name].every(n=>n==='broken_elytra'||n==='elytra_broken'),`${spec.name} duplicates ${duplicate}`);
    seen.set(digest,spec.name);
    const entry={name:spec.name,S,style,opaque,coverage:opaque/(S*S),bbox:[minX,minY,maxX,maxY],colors:colors.size,sha256:digest};
    if(out) { entry.file=`${style}-${spec.name}.png`;fs.writeFileSync(path.join(out,entry.file),image.toPNG()); }
    report.images.push(entry);report.renders++;
  }
  // Leather trim must remain on the dyeable silhouette, not paint floating pixels.
  for(const kind of ['helmet','chestplate','leggings','boots','horse_armor']) {
    const base=I[`leather_${kind}`](S,style), overlay=I[`leather_${kind}_overlay`](S,style);
    for(let i=3;i<overlay.data.length;i+=4) if(overlay.data[i]) assert.ok(base.data[i],`${kind} overlay is contained in base`);
  }
  // Pretty is authored at 32, not a nearest-neighbor upscale of Performance.
  if(S===32) {
    let distinct=0;
    for(const spec of ITEM_SPECS) {
      const lo=I[spec.name](16,'fast'), hi=I[spec.name](32,'pretty'); let same=true;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)for(let c=0;c<4;c++)if(hi.data[(y*32+x)*4+c]!==lo.data[(Math.floor(y/2)*16+Math.floor(x/2))*4+c])same=false;
      if(!same)distinct++;
    }
    assert.equal(distinct,ITEM_SPECS.length);report.independentlyRasterizedPretty=distinct;
  }
}
if(indexDir) {
  const witnessed=new Set();
  for(const file of fs.readdirSync(indexDir).filter(f=>/^\d+\.\d+(\.\d+)?\.json$/.test(f))) {
    const version=file.slice(0,-5), v=version.split('.').map(Number);
    const textures=JSON.parse(fs.readFileSync(path.join(indexDir,file),'utf8')).textures;
    const legacy=v[0]===1&&v[1]<13;
    let checked=0;const skipped=[];
    for(const spec of ITEM_SPECS) {
      if(spec.since&&compare(v,spec.since)<0)continue;
      if(legacy&&!spec.legacy)continue;
      // This is a path alias, not an absent texture silently tolerated.
      if(spec.name==='broken_elytra'&&compare(v,[1,21,4])>=0) { skipped.push('broken_elytra -> elytra_broken'); continue; }
      const asset=`assets/minecraft/textures/${legacy?'items/'+spec.legacy:'item/'+spec.name}.png`;
      assert.ok(textures[asset],`${version}: ${asset} must exist`);
      assert.deepEqual(textures[asset],[16,16],`${version}: actual item texture shape`);
      witnessed.add(spec.name);checked++;
    }
    report.versions.push({version,checked,skipped});
  }
  assert.equal(witnessed.size,ITEM_SPECS.length,'Every metadata record witnessed in a real jar index');
  assert.ok(report.versions.length>=17,'Full cached supported version matrix');
  report.witnessed=witnessed.size;
}
if(out) fs.writeFileSync(path.join(out,'gear-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({items:report.items,renders:report.renders,versions:report.versions,independentlyRasterizedPretty:report.independentlyRasterizedPretty,output:out||null},null,2));

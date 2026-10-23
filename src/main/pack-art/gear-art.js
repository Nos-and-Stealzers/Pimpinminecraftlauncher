'use strict';
// Original inventory/held-item art. No vanilla pixels, entity UVs or models.
// Geometry is authored on a 16-unit grid; Pretty rasterises at 32 with a fine
// bevel and extra facets, not a filtered enlargement of Performance.
const { Image, rgba } = require('../png');

// Explicit ramps keep equipment and its raw/refined materials in one family.
const PAL = {
  wooden: ['#302321','#62442f','#97643b','#c49757','#e5bd7c'],
  stone: ['#292e3b','#4b5160','#797f8d','#a7adba','#d2d5d7'],
  iron: ['#263349','#51667c','#91a9ba','#c4dce5','#f1fbff'],
  golden: ['#513023','#986024','#d89a2a','#f6cf55','#fff0ad'],
  copper: ['#482e33','#8b493c','#c6764c','#eead74','#ffe0a6'],
  diamond: ['#173c50','#187d92','#29bcc9','#7be8ec','#d7ffff'],
  netherite: ['#211e2e','#393044','#57475e','#88728b','#b6a1b4'],
  leather: ['#313138','#65656b','#a1a1a6','#d0d0d4','#eeeeef'],
  chainmail: ['#273345','#536a7e','#8ea7b9','#c4d9e3','#edf7fb'],
  turtle: ['#203e35','#386447','#64924c','#a1c775','#d7ed9d'],
  emerald: ['#173d36','#176b46','#2da86a','#7ee1a1','#d0ffcf'],
  quartz: ['#544654','#9b8591','#cdbab9','#eee0cf','#fff8e5'],
  redstone: ['#401e32','#80213a','#c33949','#f2605c','#ffafa0'],
  lapis: ['#212b50','#2c4386','#386cc0','#6ca9ed','#c0dfff'],
  amethyst: ['#392849','#67458c','#9d70cb','#cfaaec','#f5e3ff'],
  coal: ['#171d2a','#2a3342','#434e5d','#68778a','#a0b1bd'],
  charcoal: ['#261f25','#423334','#624b40','#8c6c50','#bf9970'],
  prismarine: ['#244e50','#347e7e','#62b9a7','#a7e3bd','#e2f8d3'],
};
const WOOD = PAL.wooden;
const TRIM = ['#2b252d','#564033','#97704c','#c49a66','#f1ce8a'];
const inside = (p, x, y) => {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [a, b] = p[i], [c, d] = p[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
  }
  return hit;
};
const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const part = (points, pal, detail = '') => ({ points, pal, detail });

// Outlines are inside the silhouette. No grey antialiasing fringes, randomness,
// blur, or unpremultiplied hidden RGB. One-pixel features survive at native 16.
function paint(S, parts, style) {
  if (S !== 16 && S !== 32) throw new RangeError('Gear art supports 16 or 32 pixels');
  const img = new Image(S), k = S / 16;
  for (const r of parts) {
    const mask = new Uint8Array(S*S);
    for (let y=0;y<S;y++) for(let x=0;x<S;x++) mask[y*S+x] = inside(r.points,(x+.5)/k,(y+.5)/k) ? 1 : 0;
    const has = (x,y) => x>=0 && y>=0 && x<S && y<S && mask[y*S+x];
    for (let y=0;y<S;y++) for(let x=0;x<S;x++) {
      if (!has(x,y)) continue;
      const u=(x+.5)/k, v=(y+.5)/k;
      const tl=!has(x-1,y)||!has(x,y-1), br=!has(x+1,y)||!has(x,y+1);
      // Thin straps/strings get a lit leading pixel, not an all-black outline.
      let shade=tl&&br ? (!has(x-1,y)&&!has(x,y-1)?3:1) : tl ? 4 : br ? 0 : 2;
      // Broad planes, rather than random dots, convey a deliberately forged face.
      if (!tl&&!br) {
        shade = u+v < 14 ? 3 : 2;
        if (r.detail==='blade') shade = Math.abs(u+v-15.5)<.65 ? 4 : u+v<15.5 ? 3 : 1;
        if (r.detail==='grain' && Math.floor(u-v)%4===0) shade=1;
        if (r.detail==='stone' && u>8 && v>4 && v<5.2) shade=1;
        if (r.detail==='chain') shade = (Math.floor(u)+Math.floor(v))%2 ? 1 : 4;
        if (r.detail==='ribs' && Math.floor(v)%3===0) shade=1;
        if (r.detail==='netherite' && Math.abs(u-v-3)<.6) shade=3;
        if (r.detail==='crystal') shade = u+v<15.1 ? 4 : u-v>4 ? 1 : 2;
        if (r.detail==='gilded' && Math.abs(u-v-4)<.8) shade=1;
        if (r.detail==='hammered' && v>3 && v<4.2 && u>7) shade=4;
        if (S===32 && style!=='fast' && r.detail==='facet' && u>v*.5+4 && u<v*.5+5) shade=4;
      }
      img.set(x,y,r.pal[shade]);
    }
  }
  return img;
}
// Diagonal tool coordinates: a is distance along the haft, b is crosswise.
const diagonal = points => points.map(([a,b])=>[2.5+(a+b)*.70710678,13.5+(-a+b)*.70710678]);
const dpart = (p,pal,d) => part(diagonal(p),pal,d);
function tool(kind, material) {
  return (S,style) => {
    const p=PAL[material], motif=({wooden:'grain',stone:'stone',netherite:'netherite',diamond:'crystal',golden:'gilded',copper:'hammered'})[material]||'blade';
    const pieces=[];
    const end=kind==='spear'?15.2:kind==='sword'?3.8:11.8;
    pieces.push(dpart([[0,-.95],[end,-.95],[end,.95],[0,.95]],WOOD,'grain'));
    if (kind==='sword') {
      pieces.push(dpart([[-.5,-1.1],[1,-1.1],[1,1.1],[-.5,1.1]],p));
      pieces.push(dpart([[3,-2.8],[4.5,-2.8],[4.5,2.8],[3,2.8]],p));
      const width=material==='netherite'?2.05:material==='diamond'?1.9:1.75;
      pieces.push(dpart([[4.5,-width],[15.7,-width],[18,0],[15.7,width],[4.5,width]],p,motif));
    } else if(kind==='pickaxe') {
      // Angular drooping points: avoids aliased arcs and preserves vanilla reach.
      pieces.push(dpart([[8.2,-5.7],[10.7,-4.4],[12,-2],[12,2],[10.7,4.4],[8.2,5.7],[9.8,2.8],[10,-2.8]],p,motif));
      pieces.push(dpart([[9.8,-1],[11.7,-1],[11.7,1],[9.8,1]],TRIM));
    } else if(kind==='axe') {
      pieces.push(dpart([[8,-1],[8,-4],[9.5,-5.3],[13.3,-5.3],[14,-3.5],[12.5,-1],[12.5,1.8],[10,1.8],[10,-1]],p,motif));
    } else if(kind==='hoe') {
      pieces.push(dpart([[9,-4.8],[11.8,-4.8],[12.5,-3],[12.5,2.7],[10.7,2.7],[10.7,-2.8],[9,-3]],p,motif));
    } else if(kind==='spear') {
      pieces.push(dpart([[12.8,-1.3],[16.1,-1.4],[18,0],[16.1,1.4],[12.8,1.3],[14,0]],p,motif));
      pieces.push(dpart([[11,-1],[12.8,-1],[12.8,1],[11,1]],TRIM));
    } else {
      pieces.push(dpart([[9,-1.7],[12,-2.1],[14.6,0],[12,2.1],[9,1.7]],p,motif));
    }
    // Small collars are material-specific; the netherite tang is reinforced.
    if(material==='netherite' && kind!=='sword') pieces.push(dpart([[7,-1.1],[8.5,-1.1],[8.5,1.1],[7,1.1]],p));
    // Fit the complete tool uniformly, not each piece: held-item proportions
    // stay intact while heads/hafts occupy a vanilla-like 14-pixel footprint.
    const points=pieces.flatMap(r=>r.points);
    const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);
    const scale=14.5/Math.max(hiX-loX,hiY-loY),cx=(loX+hiX)/2,cy=(loY+hiY)/2;
    const fitted=pieces.map(r=>({...r,points:r.points.map(([x,y])=>[8+(x-cx)*scale,8+(y-cy)*scale])}));
    return paint(S,fitted,style);
  };
}

const ARMOR = {
  helmet: [[[3,3],[5,2],[11,2],[13,4],[13,11],[10,11],[10,7],[6,7],[6,11],[3,11]]],
  chestplate: [[[2,3],[5,2],[6,5],[10,5],[11,2],[14,3],[15,7],[12,8],[12,14],[4,14],[4,8],[1,7]]],
  leggings: [[[4,2],[12,2],[12,14],[9,14],[9,8],[7,8],[7,14],[4,14]]],
  boots: [[[3,6],[7,6],[7,14],[1,14],[1,11],[3,10]],[[9,6],[13,6],[13,10],[15,11],[15,14],[9,14]]],
};
const SEAMS = {
  helmet: [rect(4,4,8,1),rect(4,9,1,2),rect(11,9,1,2)],
  chestplate: [rect(5,12,6,1),rect(7,6,2,2)],
  leggings: [rect(5,3,6,1),rect(5,11,1,2),rect(10,11,1,2)],
  boots: [rect(3,7,3,1),rect(10,7,3,1),rect(2,12,4,1),rect(10,12,4,1)],
};
function armor(kind,material,overlay=false) {
  return (S,style) => {
    const p=PAL[material], pieces=[];
    if(overlay) return paint(S,SEAMS[kind].map(shape=>part(shape,TRIM)),style);
    for(const shape of ARMOR[kind]) pieces.push(part(shape,p,material==='chainmail'?'chain':material==='netherite'?'netherite':material==='leather'?'ribs':''));
    // Material is more than a hue swap: chain links, stitched leather, gold
    // bands, diamond insets, shell plates and reinforced dark metal all differ.
    if(material==='golden') for(const shape of SEAMS[kind]) pieces.push(part(shape,p));
    if(material==='diamond' && kind==='chestplate') pieces.push(part([[8,6],[10,8],[8,11],[6,8]],p,'facet'));
    if(material==='netherite' && kind==='chestplate') pieces.push(part([[5,6],[8,9],[11,6],[11,8],[8,11],[5,8]],p));
    if(material==='copper' && kind==='helmet') pieces.push(part(rect(7,3,2,3),p));
    if(material==='turtle') {
      pieces.push(part([[5,3],[8,2],[11,3],[11,5],[8,6],[5,5]],p));
      pieces.push(part(rect(7,3,1,2),PAL.prismarine));
    }
    return paint(S,pieces,style);
  };
}
function horse(material,overlay=false) {
  return (S,style) => {
    if(overlay) return paint(S,[part(rect(4,8,8,1),TRIM),part(rect(11,5,2,1),TRIM)],style);
    const p=PAL[material];
    return paint(S,[part([[2,6],[8,6],[10,3],[13,2],[14,5],[15,7],[12,8],[11,13],[8,13],[8,11],[5,11],[4,14],[2,14]],p,material==='leather'?'ribs':''),part([[3,7],[7,7],[7,10],[3,10]],p,'facet'),part(rect(10,4,2,3),p)],style);
  };
}
function elytra(broken=false) {
  return (S,style) => paint(S,[
    part([[7,3],[5,2],[2,3],[1,8],[broken?3:2,broken?11:14],[5,12],[7,7]],PAL.stone,'ribs'),
    part([[9,3],[11,2],[14,3],[15,8],[broken?12:14,broken?10:14],[11,12],[9,7]],PAL.stone,'ribs'),
    part(rect(7,3,2,6),PAL.netherite),
  ],style);
}
function bow(stage=-1) {
  return (S,style) => {
    const pull=Math.max(0,stage), bend=stage<0?0:pull*.7;
    const stringX=10.5-pull*2;
    const p=[part([[9,1],[12,2],[14,5],[14,10],[12,13],[9,15],[8,14],[10,12],[12-bend,9],[12-bend,6],[10,3],[8,2]],WOOD,'grain')];
    p.push(part([[9,1],[stringX+.35,8],[9,15],[8.5,15],[stringX-.35,8],[8.5,1]],PAL.quartz));
    p.push(part(rect(11-bend,6,2,4),TRIM));
    if(stage>=0) p.push(part(rect(stringX-1,7,13-stringX,1),WOOD),part([[12,6],[15,7.5],[12,9]],PAL.iron));
    return paint(S,p,style);
  };
}
function crossbow(state='standby') {
  return (S,style) => {
    const stage=state.startsWith('pulling_')?Number(state.slice(-1))+1:state==='standby'?0:3;
    const p=[part([[2,12],[11,3],[13,5],[4,14]],WOOD,'grain'),part([[2,3],[4,2],[8,5],[12,9],[14,12],[13,14],[10,10],[6,6]],PAL.iron,'blade'),part([[3,3],[3+stage,6],[12,13],[11,13],[2+stage,6],[2,3]],PAL.quartz),part([[5,10],[8,7],[10,9],[7,12]],TRIM)];
    if(state==='arrow') p.push(part([[5,10],[12,3],[13,4],[6,11]],WOOD),part([[11,2],[14,2],[14,5]],PAL.iron));
    if(state==='firework') p.push(part([[7,7],[11,3],[13,5],[9,9]],PAL.quartz),part([[10,3],[12,1],[14,3],[12,5]],PAL.redstone));
    return paint(S,p,style);
  };
}
function arrow(kind='normal') {
  return (S,style) => {
    const head=kind==='spectral'?PAL.golden:kind==='head'?PAL.leather:PAL.iron;
    const p=[];
    if(kind!=='head') p.push(part([[2,13],[12,3],[13,4],[3,14]],WOOD),part([[1,10],[3,10],[6,13],[6,15],[4,15],[1,12]],kind==='spectral'?PAL.golden:PAL.quartz));
    if(kind!=='base') p.push(part([[10,2],[15,1],[14,6],[12,4]],head,'blade'));
    return paint(S,p,style);
  };
}
function trident(S,style) {
  return paint(S,[part([[2,14],[11,5],[12,6],[3,15]],PAL.prismarine,'blade'),part([[7,2],[8,1],[8,5],[11,7],[15,7],[14,9],[10,9],[6,5]],PAL.prismarine),part([[10,1],[11,1],[12,2],[10,5],[9,4]],PAL.prismarine),part([[14,3],[15,4],[12,7],[11,6]],PAL.prismarine)],style);
}
function mace(S,style) {
  return paint(S,[part([[2,13],[8,7],[10,9],[4,15]],WOOD,'grain'),part([[6,3],[10,1],[15,6],[13,10],[10,11],[5,6]],PAL.iron),part([[7,3],[10,2],[13,5],[10,7]],PAL.stone),part([[6,5],[10,8],[13,6],[13,9],[10,10],[6,7]],PAL.stone,'ribs')],style);
}
function ingot(material) {
  return (S,style) => paint(S,[part([[2,7],[5,4],[12,4],[15,7],[13,11],[3,12],[1,10]],PAL[material]),part([[3,7],[6,5],[12,5],[13,7],[10,9],[3,9]],PAL[material],'facet')],style);
}
function mineral(kind,material) {
  return (S,style) => {
    const p=PAL[material]; let pieces;
    if(kind==='nugget') pieces=[part([[5,5],[8,4],[11,6],[11,9],[8,11],[5,10],[4,7]],p,'facet')];
    else if(kind==='diamond') pieces=[part([[3,5],[6,2],[11,2],[14,6],[8,14],[2,7]],p),part([[6,3],[10,3],[11,6],[5,6]],p),part([[5,7],[11,7],[8,12]],p,'facet')];
    else if(kind==='emerald') pieces=[part([[5,2],[11,2],[13,5],[13,11],[10,14],[5,14],[3,11],[3,5]],p),part([[6,4],[10,4],[11,6],[11,10],[9,12],[6,12],[5,10],[5,6]],p,'facet')];
    else if(kind==='shard') pieces=[part([[8,1],[12,4],[11,9],[5,15],[3,12],[5,6]],p,'facet'),part([[8,3],[9,6],[6,12],[5,11]],p,'blade')];
    else if(kind==='dust') pieces=[part([[1,11],[4,8],[7,9],[9,6],[12,7],[12,10],[15,11],[14,13],[4,14]],p),part(rect(3,5,2,2),p),part(rect(11,3,2,2),p)];
    else if(kind==='charcoal') pieces=[part([[2,9],[5,4],[11,3],[14,6],[12,12],[6,14],[2,12]],p,'grain'),part([[4,8],[10,5],[12,6],[7,10]],p,'ribs')];
    else if(kind==='raw') pieces=[part([[1,9],[3,5],[7,5],[9,2],[13,4],[14,9],[11,13],[5,14],[2,12]],PAL.stone),part([[3,8],[6,6],[9,7],[8,11],[4,12]],p),part([[9,4],[12,5],[12,8],[10,9]],p)];
    else if(kind==='brick') pieces=[part([[2,6],[10,3],[14,6],[14,10],[6,13],[2,10]],p),part([[3,6],[10,4],[13,6],[6,9]],p,'facet')];
    else if(kind==='scrap') pieces=[part([[2,5],[6,3],[8,5],[12,3],[14,6],[11,9],[13,12],[8,13],[6,10],[2,11]],p,'ribs'),part([[5,5],[8,7],[6,9],[4,8]],PAL.copper)];
    else pieces=[part([[2,7],[5,3],[10,2],[14,6],[13,11],[9,14],[4,13],[1,10]],p,'facet'),part([[4,5],[8,3],[10,5],[7,8],[3,8]],p)];
    return paint(S,pieces,style);
  };
}
const I = Object.create(null), ITEM_SPECS=[];
function add(name,fn,legacy=name,since) {
  I[name]=fn;
  const spec={name,legacy};
  if(since) spec.since=since;
  ITEM_SPECS.push(spec);
}
for(const material of ['wooden','stone','iron','golden','diamond','netherite','copper']) {
  for(const kind of ['sword','pickaxe','axe','shovel','hoe','spear']) {
    const name=`${material}_${kind}`;
    const legacy=kind==='spear'||material==='netherite'||material==='copper'?null:name.replace(/^wooden_/,'wood_').replace(/^golden_/,'gold_');
    add(name,tool(kind,material),legacy,kind==='spear'?[1,21,11]:material==='netherite'?[1,16,0]:material==='copper'?[1,21,9]:undefined);
  }
}
for(const material of ['leather','chainmail','iron','golden','diamond','netherite','copper']) for(const kind of Object.keys(ARMOR)) {
  const name=`${material}_${kind}`;
  add(name,armor(kind,material),material==='netherite'||material==='copper'?null:name.replace(/^golden_/,'gold_'),material==='netherite'?[1,16,0]:material==='copper'?[1,21,9]:undefined);
  if(material==='leather') add(`${name}_overlay`,armor(kind,material,true));
}
add('turtle_helmet',armor('helmet','turtle'),null,[1,13,0]);
for(const material of ['iron','golden','diamond','leather','copper','netherite']) {
  add(`${material}_horse_armor`,horse(material),['leather','copper','netherite'].includes(material)?null:`${material==='golden'?'gold':material}_horse_armor`,material==='leather'?[1,14,0]:material==='copper'?[1,21,9]:material==='netherite'?[1,21,11]:undefined);
}
add('leather_horse_armor_overlay',horse('leather',true),null,[1,21,11]);
add('elytra',elytra(), 'elytra',[1,9,0]);
add('broken_elytra',elytra(true),'broken_elytra',[1,9,0]);
// Renamed in 1.21.4. Keep the old spelling for earlier modern/legacy jars;
// the parent must intersect these aliases with the target jar's texture index.
add('elytra_broken',elytra(true),null,[1,21,4]);
add('bow',bow(),'bow_standby');
for(let n=0;n<3;n++) add(`bow_pulling_${n}`,bow(n));
for(const state of ['standby','pulling_0','pulling_1','pulling_2','arrow','firework']) add(`crossbow_${state}`,crossbow(state),null,[1,14,0]);
add('arrow',arrow());
add('spectral_arrow',arrow('spectral'),'spectral_arrow',[1,9,0]);
add('tipped_arrow_base',arrow('base'),'tipped_arrow_base',[1,9,0]);
add('tipped_arrow_head',arrow('head'),'tipped_arrow_head',[1,9,0]);
add('trident',trident,null,[1,13,0]);
add('mace',mace,null,[1,21,0]);
for(const [name,material,legacy,since] of [
  ['iron_ingot','iron','iron_ingot'],['gold_ingot','golden','gold_ingot'],
  ['copper_ingot','copper',null,[1,17,0]],['netherite_ingot','netherite',null,[1,16,0]],
]) add(name,ingot(material),legacy,since);
for(const [name,kind,material,legacy,since] of [
  ['gold_nugget','nugget','golden','gold_nugget'],['iron_nugget','nugget','iron','iron_nugget',[1,11,1]],
  ['copper_nugget','nugget','copper',null,[1,21,9]],
  ['raw_iron','raw','iron',null,[1,17,0]],['raw_gold','raw','golden',null,[1,17,0]],['raw_copper','raw','copper',null,[1,17,0]],
  ['diamond','diamond','diamond','diamond'],['emerald','emerald','emerald','emerald'],
  ['quartz','shard','quartz','quartz'],['redstone','dust','redstone','redstone_dust'],
  ['lapis_lazuli','lump','lapis','dye_powder_blue'],['coal','lump','coal','coal'],['charcoal','charcoal','charcoal','charcoal'],
  ['amethyst_shard','shard','amethyst',null,[1,17,0]],['netherite_scrap','scrap','netherite',null,[1,16,0]],
  ['prismarine_shard','shard','prismarine','prismarine_shard'],['prismarine_crystals','lump','prismarine','prismarine_crystals'],
  ['flint','shard','coal','flint'],['brick','brick','copper','brick'],['nether_brick','brick','netherite','netherbrick'],
]) add(name,mineral(kind,material),legacy,since);
// Shield is intentionally absent: its inventory is a special entity renderer,
// not textures/item/shield.png. Trident here changes GUI, not entity/held art.
// Spear _in_hand textures are intentionally absent: they are NOT inventory art.
module.exports={I,ITEM_SPECS};

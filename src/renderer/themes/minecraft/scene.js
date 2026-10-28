import { shaded, faceName } from './textures.js';

export function sceneLayout(width, height, viewportHeight, dpr = 1, scene = 'island') {
  const band = Math.min(height, Math.max(180, Math.min(300, viewportHeight * .36)) * dpr);
  return { width, height, band, dpr, scene, ground: band - 21 * dpr,
    scale: scene === 'oneblock' ? Math.min(band * .43, width * .26) : Math.max(1, Math.min((band - 63 * dpr) / 22.5, width / 38)),
    mobScale: Math.min(1.02 * dpr, band / 210, width / 420) };
}

/** A foreground cutaway shares the same materials as the distant island.
 * The only walking surface is inside the reserved panorama band. */
export function drawParadeGround(ctx, layout, preset) {
  const { width: w, band, ground, dpr } = layout;
  const block = preset === 'nether' ? 'nylium' : preset === 'end' ? 'endstone' : 'grass';
  const tile = Math.max(8, Math.round(24 * dpr));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let x = 0; x < w; x += tile) {
    ctx.drawImage(shaded(faceName(block, 'top'), .87), x, ground, tile, 5 * dpr);
    ctx.drawImage(shaded(faceName(block, 'side'), .75), x, ground + 5 * dpr, tile, tile);
  }
  ctx.fillStyle = preset === 'end' ? '#eee9b5' : preset === 'nether' ? '#d4554c' : '#a6c965';
  ctx.globalAlpha = .48; ctx.fillRect(0, ground, w, dpr);
  ctx.restore();
}

/** Small hand-built distant silhouettes; muted so the hero remains the focus. */
export function drawSatellite(ctx, x, y, s, preset) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = .46;
  const poly = (points,c) => { ctx.fillStyle=c; ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); };
  const colors = preset === 'overworld' ? ['#82985a','#747e77','#58687b'] : preset === 'nether' ? ['#974546','#61303b','#392438'] : ['#d7d29d','#969281','#706b86'];
  poly([[-25,0],[-8,-8],[20,-7],[31,2],[12,10],[-13,9]],colors[0]);
  poly([[-25,0],[-13,9],[12,10],[8,21],[-1,30],[-8,21],[-15,20]],colors[1]);
  poly([[12,10],[31,2],[22,16],[8,21]],colors[2]);
  ctx.fillStyle=preset==='overworld'?'#69865d':preset==='nether'?'#873845':'#8f73a7';
  ctx.fillRect(-5,-22,4,19);
  if (preset==='overworld') { ctx.fillRect(-14,-31,23,12);ctx.fillRect(-10,-36,15,7); }
  else if(preset==='nether') {ctx.fillRect(-15,-24,25,5); ctx.fillRect(-11,-29,17,5);}
  else {ctx.fillRect(-11,-16,9,3);ctx.fillRect(-11,-22,3,7);ctx.fillRect(-13,-26,7,5);}
  ctx.restore();
}

export function drawBlockDetail(ctx, anchor, s, preset) {
  ctx.save(); ctx.translate(anchor[0], anchor[1]); ctx.scale(s,s);
  if (preset === 'overworld') {
    ctx.fillStyle='#467a36'; ctx.fillRect(-1,-17,2,17);ctx.fillRect(1,-8,5,2);ctx.fillRect(-5,-12,4,2);
    ctx.fillStyle='#fff0c7';ctx.fillRect(-4,-23,8,8); ctx.fillRect(-6,-21,12,4);
    ctx.fillStyle='#e4af4e';ctx.fillRect(-2,-21,4,4);
    ctx.fillStyle='#5c933e'; ctx.fillRect(9,-7,2,7);ctx.fillRect(12,-10,2,10);
  } else if (preset === 'nether') {
    ctx.fillStyle='#9b7971'; ctx.fillRect(-2,-13,4,13);
    ctx.fillStyle='#bb3a43';ctx.fillRect(-9,-18,18,6);ctx.fillRect(-6,-22,12,5);
    ctx.fillStyle='#f3a671';ctx.fillRect(-5,-17,3,2);ctx.fillRect(3,-19,2,2);
  } else {
    ctx.fillStyle='#775386'; ctx.fillRect(-2,-21,4,21);ctx.fillRect(-9,-14,9,3);ctx.fillRect(-9,-22,3,9);
    ctx.fillStyle='#c3a1d8';ctx.fillRect(-5,-27,10,7);ctx.fillRect(-11,-25,7,5);
  }
  ctx.restore();
}

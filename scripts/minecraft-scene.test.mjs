import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMob, normalizeOptions, isSceneValid, mobPositions } from '../src/renderer/themes/minecraft/mobs.js';
import { sceneLayout } from '../src/renderer/themes/minecraft/scene.js';

test('world-specific species and prototype-safe fallback',()=>{
  assert.equal(selectMob('overworld'),'sheep');assert.equal(selectMob('nether'),'pigman');assert.equal(selectMob('end'),'enderman');
  for(const x of ['__proto__','constructor','bad',null,undefined])assert.equal(selectMob(x),'sheep');
});
test('option defaults and bounded values',()=>{
  assert.deepEqual(normalizeOptions(),{scene:'island',mobs:true,mobCount:2,speed:1});
  assert.deepEqual(normalizeOptions({scene:'oneblock',mobs:false,mobCount:9,speed:-1}),{scene:'oneblock',mobs:false,mobCount:3,speed:0});
  assert.equal(normalizeOptions({mobCount:NaN,speed:Infinity}).speed,1);
  assert.equal(normalizeOptions({mobCount:NaN}).mobCount,2);
  assert.equal(normalizeOptions({mobCount:-2}).mobCount,0);
});
test('exact scene validity',()=>{
  assert.ok(isSceneValid('island'));assert.ok(isSceneValid('oneblock'));
  for(const x of ['one-block','',null,undefined,'__proto__'])assert.equal(isSceneValid(x),false);
});
test('deterministic positions, both directions and no jumps at turns',()=>{
  const a={count:3,time:12.5,left:40,right:900,ground:220};
  assert.deepEqual(mobPositions(a),mobPositions(a));
  assert.equal(new Set(mobPositions(a).map(m=>m.direction)).size,2);
  let previous=mobPositions({...a,time:0});
  for(let frame=1;frame<=12000;frame++){
    const next=mobPositions({...a,time:frame/30});
    next.forEach((m,i)=>{
      assert.ok(m.x>=40&&m.x<=900); assert.ok(Math.abs(m.x-previous[i].x)<1);
      assert.ok(Number.isFinite(m.phase));assert.ok(m.bounds.top>=0);assert.ok(m.bounds.bottom<250);
    });previous=next;
  }
});
test('speed zero is genuinely static',()=>{
  assert.deepEqual(mobPositions({time:0,speed:0}),mobPositions({time:100,speed:0}));
  assert.equal(mobPositions({count:0}).length,0);assert.equal(mobPositions({count:300}).length,3);
});
test('responsive reserved-band routes across widths and DPR',()=>{
  for(const dpr of [1,1.25,2])for(const [width,height] of [[320,480],[640,480],[940,760],[1740,1080]])for(const scene of ['island','oneblock']){
    const l=sceneLayout(width*dpr,(height-40)*dpr,height,dpr,scene);
    assert.ok(l.band<=300*dpr&&l.band>=180*dpr);assert.ok(l.scale>0);
    const mobs=mobPositions({left:38*l.mobScale,right:l.width-38*l.mobScale,ground:l.ground,scale:l.mobScale,count:3});
    mobs.forEach(m=>{assert.ok(m.bounds.left>=0);assert.ok(m.bounds.right<=l.width);assert.ok(m.bounds.top>=0);assert.ok(m.bounds.bottom<=l.band);});
  }
});

// Geometry contract: art never edits a parcel or paints an unfinished building.
const assert = require('node:assert/strict');
global.window = {};
require('../city.js');
require('../city-art.js');
const C = window.VisionCity, makeArt = window.VisionCityArt;
function draw(tile,quality='high'){
  const shapes=[];
  const art=makeArt({ground:.011,quality,box:(...a)=>shapes.push(['box',...a]),cylinder:(...a)=>shapes.push(['cylinder',...a])});
  const before=JSON.stringify(tile), handled=art(tile,0,0,1,8,11);
  assert.equal(JSON.stringify(tile),before,'drawing must not mutate simulation state');
  for(const shape of shapes){
    const end=shape[0]==='box'?7:6;
    assert.ok(shape.slice(1,end).every(Number.isFinite),'finite geometry');
    assert.ok(shape.slice(4,end).every(v=>v>0),'positive dimensions');
    assert.ok(shape[2]>=0,'geometry stays above the national ground');
  }
  return {handled,shapes};
}
for(const st of [0,1,2])assert.equal(draw({k:'z',zone:'R',st}).handled,false);
for(const zone of ['R','C','I','T','M'])for(const lv of [1,2,3]){
  const tile=Object.freeze({k:'z',zone,lv,st:3,pow:true,occ:1});
  const high=draw(tile),low=draw(tile,'low');
  assert.ok(high.handled&&low.handled);
  assert.ok(high.shapes.length>low.shapes.length,'Reduced omits fine detail, retains architecture');
  assert.deepEqual(high,draw(tile),'the same parcel draws deterministically');
}
for(const fac of Object.keys(C.FAC))for(const inactive of [false,true])assert.ok(draw(Object.freeze({k:'f',fac,inactive})).handled,fac);
const dark=draw({k:'z',zone:'R',lv:1,st:3,pow:false,occ:1}).shapes;
const lit=draw({k:'z',zone:'R',lv:1,st:3,pow:true,occ:1}).shapes;
const glowing=s=>s.some(a=>Array.isArray(a[7])&&a[7][0]===.241);
assert.ok(!glowing(dark)&&glowing(lit),'only powered occupied windows carry the emissive material');
console.log('All cinematic geometry checks passed (15 zoning variants, 13 services, stages, quality, power, immutability).');

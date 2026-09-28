// Explicitly joined coping/rails carry one grind through corners and grade changes.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Skater } from '../src/skater.js';
import { Level } from '../src/level.js';
import { RocCityLevel } from '../src/roc-city-level.js';
import { makeState } from '../src/input.js';

const DT=1/120,roc=new RocCityLevel();
let checks=0,failures=0;
function check(name,test){checks++;try{test();console.log('PASS: '+name);}catch(error){failures++;console.error('FAIL: '+name+'\n'+error.stack);}}
const neutral=()=>Object.assign(makeState(),{autoPush:false});
function rail(a,b){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);return {a:start,b:end,dir:delta.clone().normalize(),len:delta.length(),kind:'rail'};}
function fixture(rails){return {rails,colliders:[],spawn:{pos:rails[0].a.clone(),heading:rails[0].dir.clone()}};}
function attach(level,r,{t=.1,dir=1,speed=7,trick='C',facing=null}={}){
  const skater=new Skater(level,()=>.5);
  skater.vel.copy(r.dir).multiplyScalar(dir*speed);
  skater.facing.copy(facing||r.dir.clone().multiplyScalar(dir));
  const events={start:0,end:0,bail:0};
  skater.events.grindStart=()=>events.start++;skater.events.grindEnd=()=>events.end++;skater.events.bail=()=>events.bail++;
  skater.startGrind({rail:r,t,point:r.a.clone().addScaledVector(r.dir,t*r.len)},{dir8:trick});
  return {skater,events};
}
function expectClose(actual,expected,message){assert.ok(Math.abs(actual-expected)<1e-6,`${message}: ${actual} versus ${expected}`);}

check('ROC bowl coping sustains one continuous grind for more than a second in both directions',()=>{
  const coping=roc.rails.filter(r=>r.feature==='D'&&r.kind==='coping'&&r.aLink&&r.bLink);
  assert.equal(coping.length,144);
  for(const dir of [1,-1]){
    const first=dir===1?coping.at(-1):coping[0];
    const {skater,events}=attach(roc,first,{t:dir===1?.9:.1,dir,speed:7});
    const grind=skater.grind,visited=new Set([first]);
    for(let i=0;i<180;i++){
      skater.update(DT,neutral());
      assert.equal(skater.state,'grind',`direction ${dir}, frame ${i}`);
      assert.equal(skater.grind,grind,'handoff retains the grind object');
      visited.add(skater.grind.rail);
      assert.ok(skater.heading.dot(skater.grind.rail.dir)*skater.grind.dir>.999);
    }
    assert.ok(visited.size>10,'many short coping segments are traversed');
    expectClose(grind.time,1.5,'grind duration');expectClose(skater.balance.t,1.5,'balance duration');
    assert.equal(skater.combo.tricks.length,1);assert.ok(skater.combo.points>=240);
    assert.deepEqual(events,{start:1,end:0,bail:0});
  }
});
check('ROC A-frame follows the uphill, flat and downhill kink before its open end',()=>{
  const first=roc.rails.find(r=>r.kind==='rail'&&r.bLink&&!r.aLink);
  assert.ok(first);const chain=[first,first.bLink.rail,first.bLink.rail.bLink.rail];
  assert.ok(!chain.at(-1).bLink);
  const {skater,events}=attach(roc,first,{speed:9}),visited=new Set([first]);
  let lastTime=0;
  for(let i=0;i<600&&skater.state==='grind';i++){
    visited.add(skater.grind.rail);lastTime=skater.grind.time;
    skater.update(DT,neutral());
  }
  assert.equal(skater.state,'air');assert.equal(visited.size,3);assert.ok(chain.every(r=>visited.has(r)));
  assert.ok(lastTime>.5);assert.equal(skater.combo.tricks.length,1);assert.ok(skater.combo.points>100);
  assert.deepEqual(events,{start:1,end:1,bail:0});
  const end=chain.at(-1).b.clone();end.y+=.02;assert.ok(skater.pos.distanceTo(end)<1e-6);
});
check('endpoint overshoot crosses multiple short segments and honors reverse-oriented links',()=>{
  const a=rail([0,1,0],[.1,1,0]),b=rail([.1,1,.1],[.1,1,0]),c=rail([.1,1,.1],[1.1,1,.1]);
  a.bLink={rail:b,dir:-1};b.aLink={rail:c,dir:1};
  const {skater,events}=attach(fixture([a,b,c]),a,{t:.8,speed:7});
  skater.update(1/30,neutral());
  assert.equal(skater.state,'grind');assert.equal(skater.grind.rail,c);assert.equal(skater.grind.dir,1);
  const expectedX=.1+(skater.grind.speed/30-.02-.1);
  expectClose(skater.pos.x,expectedX,'carried travel distance');expectClose(skater.pos.z,.1,'corner position');
  assert.equal(skater.combo.tricks.length,1);assert.deepEqual(events,{start:1,end:0,bail:0});
});
check('turning a linked corner preserves fakie stance and the chosen side of a boardslide',()=>{
  for(const slide of [false,true]){
    const a=rail([0,1,0],[1,1,0]),b=rail([1,1,0],[1,1,4]);a.bLink={rail:b,dir:1};
    const {skater}=attach(fixture([a,b]),a,{t:.99,speed:7,trick:slide?'W':'C',facing:new THREE.Vector3(-1,0,0)});
    const priorFacing=skater.facing.clone(),priorStance=skater.stance;
    skater.update(DT,neutral());
    assert.equal(skater.grind.rail,b);assert.equal(skater.stance,priorStance);
    const expected=priorFacing.applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2);
    assert.ok(skater.facing.distanceTo(expected)<1e-6);assert.equal(skater.grind.name,slide?'Boardslide':'50-50');
    assert.equal(skater.combo.tricks.length,1);
  }
});
check('jumping after a handoff leaves along the new rail and ends the grind once',()=>{
  const a=rail([0,1,0],[1,1,0]),b=rail([1,1,0],[1,1,4]);a.bLink={rail:b,dir:1};
  const {skater,events}=attach(fixture([a,b]),a,{t:.99,speed:7});skater.update(DT,neutral());
  skater.crouching=true;skater.crouchTime=.55;
  skater.update(DT,Object.assign(neutral(),{ollieReleased:true}));
  assert.equal(skater.state,'air');assert.ok(Math.abs(skater.vel.x)<1e-6);assert.ok(skater.vel.z>6&&skater.vel.y>0);
  assert.deepEqual(events,{start:1,end:1,bail:0});assert.equal(skater.combo.tricks.length,1);
});
check('unlinked warehouse rails retain the original endpoint pop',()=>{
  const warehouse=new Level();assert.ok(warehouse.rails.every(r=>!r.aLink&&!r.bLink));
  const r=warehouse.rails.find(r=>r.kind==='rail'&&Math.abs(r.dir.y)<1e-8);
  const {skater,events}=attach(warehouse,r,{t:1-.001/r.len,speed:7});skater.update(DT,neutral());
  assert.equal(skater.state,'air');const end=r.b.clone();end.y+=.02;
  assert.ok(skater.pos.distanceTo(end)<1e-6);assert.ok(skater.vel.y>=1);
  assert.deepEqual(events,{start:1,end:1,bail:0});assert.equal(skater.combo.tricks.length,1);
});

console.log(`\n${checks-failures}/${checks} linked rail checks passed.`);
if(failures)process.exitCode=1;

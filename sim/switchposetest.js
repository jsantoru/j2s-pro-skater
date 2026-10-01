// Travel-relative manual/grind contacts. Expected leading/trailing ends are
// measured from the actual rendered wheels/hangers, never animation metadata.
// Flicks and rail capture use Skater.update so names, switch flags and points
// remain part of the test rather than being invented by pose fixtures.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import * as THREE from 'three';
import {Character} from '../src/character.js';
import {Skater} from '../src/skater.js';
import {makeState} from '../src/input.js';
import {GRINDS} from '../src/tricks.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),UP=V(0,1,0),dt=1/120;
const report={passed:false,method:'Actual input detection plus world-space rendered truck/wheel measurements',checks:[],renderFrames:0};
function check(name,run){
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
  try{report.checks.push({name,passed:true,detail:run()});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,error:error.message});console.error('FAIL '+name+'\n'+error.stack);}
}
const controls=values=>Object.assign(makeState(),{autoPush:false},values);
function snapshot(sk){return JSON.stringify(sk,(key,value)=>['level','events','T'].includes(key)?undefined:value);}
function render(c,sk){
  const before=snapshot(sk);
  c.root.position.copy(sk.pos);c.root.quaternion.copy(sk.modelQuat);
  c.update(sk,1/60,report.renderFrames++/60);c.root.updateMatrixWorld(true);
  assert.equal(snapshot(sk),before,'rendering cannot change physics, scoring, balance or trick selection');
  for(const item of [c.board,c.hips,c.lLeg.an,c.rLeg.an])assert.ok(item.matrixWorld.elements.every(Number.isFinite));
  for(const [leg,z] of [[c.lLeg,.235],[c.rLeg,-.255]]){
    const sole=c.board.worldToLocal(leg.an.localToWorld(V(0,-.0405,0)));
    assert.ok(sole.distanceTo(V(0,.132,z))<.001,'both anatomical feet remain attached to their own deck marks');
  }
}
function fixture(slope=0,dir=1,stance=1){
  const forward=V(Math.sin(.61),slope,Math.cos(.61)).normalize(),right=V().crossVectors(UP,forward).normalize();
  const normal=V().crossVectors(forward,right).normalize();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,200),new THREE.MeshBasicMaterial());
  floor.quaternion.setFromUnitVectors(V(0,0,1),normal);floor.updateMatrixWorld(true);
  const level={spawn:{pos:V(),heading:forward.clone()},colliders:[floor],rails:[]};
  const sk=new Skater(level,()=>.5);sk.normal.copy(normal);sk.heading.copy(forward).multiplyScalar(dir);
  sk.facing.copy(sk.heading).setY(0).normalize().multiplyScalar(stance);sk.stance=stance;
  sk.speed=6;sk.vel.copy(sk.heading).multiplyScalar(6);
  const visualForward=sk.heading.clone().multiplyScalar(stance),visualRight=V().crossVectors(normal,visualForward).normalize();
  sk.modelQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(visualRight,normal,visualForward));
  return{sk,level,normal,forward,dispose(){floor.geometry.dispose();floor.material.dispose();}};
}
function wheelEnds(c,sk,normal){
  const travel=sk.heading.clone().normalize();
  const ends=[-.24,.24].map(z=>{
    const wheels=c.board.userData.wheels.filter(w=>Math.abs(w.position.z-z)<1e-6);assert.equal(wheels.length,2);
    const center=wheels.reduce((sum,w)=>sum.add(w.getWorldPosition(V())),V()).multiplyScalar(.5);
    let bottom=Infinity;
    for(const wheel of wheels)wheel.traverse(object=>{
      if(!object.isMesh)return;
      const positions=object.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)bottom=Math.min(bottom,object.localToWorld(V().fromBufferAttribute(positions,i)).sub(sk.pos).dot(normal));
    });
    return{z,along:center.clone().sub(sk.pos).dot(travel),height:bottom};
  }).sort((a,b)=>a.along-b.along);
  return{trailing:ends[0],leading:ends[1]};
}
function hangers(c,sk){
  const rail=sk.grind.rail,travel=rail.dir.clone().multiplyScalar(sk.grind.dir);
  const line=new THREE.Ray(rail.a.clone().addScaledVector(rail.dir,-100),rail.dir);
  const normal=UP.clone().addScaledVector(rail.dir,-UP.dot(rail.dir)).normalize();
  const ends=[-.24,.24].map(z=>{
    const mesh=c.board.children.find(o=>o.geometry?.type==='CylinderGeometry'&&Math.abs(o.position.y-.043)<1e-6&&Math.abs(o.position.z-z)<1e-6);
    assert.ok(mesh,'actual board hanger exists');
    const a=mesh.localToWorld(V(0,-.09,0)),b=mesh.localToWorld(V(0,.09,0)),center=mesh.getWorldPosition(V());
    return{z,along:center.clone().sub(sk.pos).dot(travel),
      height:center.clone().sub(rail.a).dot(normal),
      gap:Math.sqrt(line.distanceSqToSegment(a,b))-rail.radius-.017};
  }).sort((a,b)=>a.along-b.along);
  return{trailing:ends[0],leading:ends[1]};
}
function points(sk,name,base,hold,time){
  assert.equal(sk.combo.tricks.length,1,'one trick detection only');
  const trick=sk.combo.tricks[0];assert.equal(trick.name,name);assert.equal(trick.switch,sk.stance<0);
  assert.equal(trick.points,Math.round(base*(sk.stance<0?1.2:1))+Math.floor(time*10)*hold,'original stance bonus and hold scoring remain unchanged');
  assert.equal(sk.combo.multiplier,1);assert.equal(sk.score,0,'unfinished hold is not banked by rendering');
}

for(const characterId of ['joe','aaron']){
  check(`${characterId}: real manual flicks load the named travel-relative wheels in either stance, direction and grade`,()=>{
    const c=new Character({characterId}),results=[];
    try{for(const kind of ['Manual','Nose Manual'])for(const stance of [1,-1])for(const dir of [1,-1])for(const slope of [0,-.15,.15]){
      const f=fixture(slope,dir,stance),{sk}=f,capture=[];sk.events.manualStart=name=>capture.push(name);
      const first=(kind==='Manual'?-1:1)*stance;
      for(let i=0;i<110;i++){
        const stickY=i<2?0:i<6?first:i<10?-first:0;
        sk.update(dt,controls({stickY}));if(i%2===1)render(c,sk);
      }
      assert.equal(sk.state,'ride');assert.deepEqual(capture,[kind]);assert.equal(sk.manual?.kind,kind);assert.equal(sk.stance,stance);
      points(sk,kind,100,5,sk.manual.time);
      const ends=wheelEnds(c,sk,f.normal),loaded=kind==='Manual'?ends.trailing:ends.leading,free=kind==='Manual'?ends.leading:ends.trailing;
      assert.ok(Math.abs(loaded.height)<.004,`${kind} stance=${stance} dir=${dir} slope=${slope} loads wrong end: ${JSON.stringify(ends)}`);
      assert.ok(free.height>.13,'unloaded wheel pair rises clearly above the surface');
      results.push({kind,stance,dir,slope,loaded:loaded.z,clearance:free.height});f.dispose();
    }}finally{c.dispose();}
    return{cases:results.length,minimumLift:Math.min(...results.map(r=>r.clearance))};
  });

  check(`${characterId}: captured truck grinds load leading or trailing trucks by travel, with switch scoring intact`,()=>{
    const c=new Character({characterId}),results=[];
    const cases=[['S','5-0','trailing',100],['N','Nosegrind','leading',100],['NW','Crooked Grind','leading',125],['NE','Overcrook','leading',125],['SW','Feeble Grind','trailing',125],['SE','Smith Grind','trailing',125]];
    try{for(const [input,name,end,base]of cases)for(const stance of [1,-1])for(const dir of [1,-1])for(const slope of [0,-.35,.35]){
      const f=fixture(slope,dir,stance),{sk,level,forward}=f;
      const a=forward.clone().multiplyScalar(-15).add(V(0,3,0)),rail={a,b:a.clone().addScaledVector(forward,30),dir:forward.clone(),len:30,kind:'rail',radius:.035};level.rails.push(rail);
      sk.state='air';sk.popped=true;sk.pos.copy(a).lerp(rail.b,.5).add(V(0,.25,0));
      sk.vel.copy(forward).multiplyScalar(dir*6);sk.vel.y=-1;sk.normal.copy(UP);
      c.grindAnimation.reset();
      sk.update(dt,controls({grind:true,grindPressed:true,dir8:input}));
      assert.equal(sk.state,'grind','ordinary armed descending pass captures the rail');
      assert.equal(sk.grind.name,name,'direction selects requested grind');assert.equal(sk.grind.dir,dir);assert.equal(sk.stance,stance);
      for(let i=0;i<48;i++){
        sk.update(dt,controls({grind:true,dir8:input,steer:THREE.MathUtils.clamp(-sk.balance.x*3-sk.balance.v,-1,1)}));
        if(i%2===1){
          render(c,sk);const ends=hangers(c,sk);
          assert.ok(Math.abs(ends[end].gap)<.00015,`${name} stance=${stance} dir=${dir} slope=${slope} wrong loaded travel truck: ${JSON.stringify(ends)}`);
        }
      }
      points(sk,name,base,10,sk.grind.time);
      const ends=hangers(c,sk),free=ends[end==='leading'?'trailing':'leading'];
      assert.ok(free.gap>.05,'opposite truck remains visibly off the rail');
      if(name==='5-0')assert.ok(ends.leading.height-ends.trailing.height>.13,'5-0 raises travel-leading end');
      if(name==='Nosegrind')assert.ok(ends.trailing.height-ends.leading.height>.1,'Nosegrind raises travel-trailing end');
      results.push({name,stance,dir,slope,loaded:ends[end].z,clearance:free.gap});f.dispose();
    }}finally{c.dispose();}
    return{cases:results.length,minimumFreeTruckGap:Math.min(...results.map(r=>r.clearance))};
  });

  check(`${characterId}: reverting during a held manual changes the supporting end without a one-frame board snap`,()=>{
    const c=new Character({characterId});let cases=0,maxWheelStep=0,maxNormalStep=0;
    try{for(const kind of ['Manual','Nose Manual'])for(const stance of [1,-1])for(const dir of [1,-1])for(const turn of [-1,1]){
      const f=fixture(0,dir,stance),{sk}=f;let previous=null;
      try{for(let i=0;i<190;i++){
        const first=(kind==='Manual'?-1:1)*stance;
        const stickY=i<2?0:i<6?first:i<10?-first:THREE.MathUtils.clamp(-sk.manualBalance.x*3-sk.manualBalance.v,-1,1);
        sk.update(dt,controls({stickY,revertLeftPressed:i===120&&turn===-1,revertRightPressed:i===120&&turn===1}));
        if(i%2===0)continue;
        render(c,sk);
        const normal=UP.clone().applyQuaternion(c.board.getWorldQuaternion(new THREE.Quaternion()));
        const wheels=c.board.userData.wheels.map(w=>w.getWorldPosition(V()).sub(sk.pos));
        if(i>=119){
          assert.equal(sk.state,'ride');assert.equal(sk.manual?.kind,kind,'stance pivot retains the existing manual identity');
          const ends=wheelEnds(c,sk,UP);
          assert.ok(Math.abs(Math.min(ends.leading.height,ends.trailing.height))<.004,'the pivot remains supported throughout the turn');
          if(previous){
            const normalStep=normal.angleTo(previous.normal),wheelStep=Math.max(...wheels.map((w,j)=>w.distanceTo(previous.wheels[j])));
            assert.ok(normalStep<.35,`held ${kind} flips board pitch in one frame: ${normalStep} radians`);
            assert.ok(wheelStep<.12,`held ${kind} wheel snaps ${wheelStep}m relative to the rider`);
            maxNormalStep=Math.max(maxNormalStep,normalStep);maxWheelStep=Math.max(maxWheelStep,wheelStep);
          }
          previous={normal,wheels};
        }
      }
      assert.equal(sk.stance,-stance);assert.equal(sk.combo.multiplier,1,'a ground manual pivot does not create a score multiplier');
      assert.equal(sk.combo.tricks.length,1);assert.equal(sk.combo.tricks[0].name,kind);
      assert.equal(sk.combo.tricks[0].switch,stance<0,'the original manual keeps its original stance award');
      const ends=wheelEnds(c,sk,UP),loaded=kind==='Manual'?ends.trailing:ends.leading;
      assert.ok(Math.abs(loaded.height)<.004,'settled pose loads the correct end after changing stance');cases++;
      }finally{f.dispose();}
    }}finally{c.dispose();}
    return{cases,maxWheelStep,maxNormalStep};
  });
}

check('SW selects Feeble and SE selects Smith without changing either 125-point base',()=>{
  assert.deepEqual(GRINDS.SW,['Feeble Grind',125]);assert.deepEqual(GRINDS.SE,['Smith Grind',125]);
  return{SW:GRINDS.SW,SE:GRINDS.SE};
});

report.passed=report.checks.length>0&&report.checks.every(c=>c.passed);
if(process.env.SWITCH_POSE_REPORT){mkdirSync(dirname(process.env.SWITCH_POSE_REPORT),{recursive:true});writeFileSync(process.env.SWITCH_POSE_REPORT,JSON.stringify(report,null,2)+'\n');}
console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} switch pose checks passed; ${report.renderFrames} immutable render frames`);
if(!report.passed)process.exitCode=1;

// Actual input trajectories, rather than assigning a new animation state at
// impact. Run with node sim/tricktransitiontest.js; optional JSON evidence path:
// TRICK_TRANSITION_REPORT=... . Physics runs at 120 Hz and rendering at 60 Hz.
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';
import { Skater } from '../src/skater.js';
import { Character } from '../src/character.js';
import { Level } from '../src/level.js';
import { makeState } from '../src/input.js';
import { GRABS, GRINDS } from '../src/tricks.js';
import { GRAB_PALM_CONTACT } from '../src/grab-animation.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), dt=1/120, renderDt=1/60;
const grabs=Object.entries(GRABS).filter(([dir])=>dir!=='E');
const report={passed:false,physicsHz:120,renderHz:60,checks:[],trajectories:[]};
let frames=0, checkedStates=0;
const filter=process.env.QA_CHECK;
function check(name,run) {
  if(filter&&!name.includes(filter))return;
  try {run();report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
  catch(error){report.checks.push({name,passed:false,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}
}
function input(values={}) {return Object.assign(makeState(),{autoPush:false},values);}
function fixture({rail=false,stance=1}={}) {
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial());
  floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
  // End before the pop's descending arc so this case tests a single departure,
  // rather than legitimately recapturing a long rail on the way down.
  const rails=rail?[{a:V(0,2,-5),b:V(0,2,1),dir:V(0,0,1),len:6,kind:'rail',radius:.035}]:[];
  const level={spawn:{pos:V(),heading:V(0,0,1)},colliders:[floor],rails};
  const sk=new Skater(level,()=>.5);
  sk.stance=stance;sk.facing.set(0,0,stance);
  sk.modelQuat.setFromAxisAngle(V(0,1,0),stance===1?0:Math.PI);
  const events={tricks:[],land:[],bails:[],grinds:[]};
  sk.events.trick=name=>events.tricks.push(name);
  sk.events.land=(points,text)=>{if(points>0)events.land.push({points,text});};
  sk.events.bail=reason=>events.bails.push(reason);
  sk.events.grindStart=name=>events.grinds.push(name);
  return {sk,events,dispose(){floor.geometry.dispose();floor.material.dispose();}};
}
// Include every serializable Skater field, including combo degradation,
// balance state, queued input, stance and rail state. Geometry is read-only
// fixture data; including its large mesh serialization adds no useful check.
function physicsState(sk) {
  return JSON.stringify(sk,(key,value)=>key==='level'||key==='events'||key==='T'?undefined:value);
}
function draw(c,sk,time,removeRootRotation=false) {
  const before=physicsState(sk);
  c.root.position.copy(sk.pos);c.root.quaternion.copy(sk.modelQuat);
  c.update(sk,renderDt,time);c.root.updateMatrixWorld(true);
  assert.equal(physicsState(sk),before,'Character rendering may not change simulation, inputs or scoring');
  checkedStates++;frames++;
  const root=c.root.getWorldPosition(V());
  const inverse=c.root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const relativePoint=point=>{point.sub(root);if(removeRootRotation)point.applyQuaternion(inverse);return point;};
  const relative=node=>relativePoint(node.getWorldPosition(V()));
  const board=relative(c.board),feet=[relative(c.lLeg.an),relative(c.rLeg.an)];
  const footQuaternions=[c.lLeg.an,c.rLeg.an].map(foot=>foot.getWorldQuaternion(new THREE.Quaternion()));
  if(removeRootRotation)for(const q of footQuaternions)q.premultiply(inverse);
  const palms=[c.lArm,c.rArm].map(arm=>relativePoint(arm.hand.localToWorld(new THREE.Vector3(...GRAB_PALM_CONTACT))));
  const arms=[c.lArm,c.rArm].flatMap(arm=>[arm.sh.quaternion.clone(),arm.el.quaternion.clone(),arm.hand.quaternion.clone()]);
  for(const p of [board,...feet,...palms])assert.ok(p.toArray().every(Number.isFinite),'render landmarks remain finite');
  for(const q of arms)assert.ok(q.toArray().every(Number.isFinite),'render joint orientations remain finite');
  return {board,feet,footQuaternions,palms,arms,root,state:sk.state,trick:sk.trick?.name??null};
}
function measure(previous,next,metric,time) {
  if(!previous)return;
  const distance=(a,b)=>a.distanceTo(b);
  const values={board:distance(previous.board,next.board),feet:Math.max(...next.feet.map((p,i)=>distance(previous.feet[i],p))),
    palms:Math.max(...next.palms.map((p,i)=>distance(previous.palms[i],p))),arms:Math.max(...next.arms.map((q,i)=>previous.arms[i].angleTo(q))),
    footAngle:Math.max(...next.footQuaternions.map((q,i)=>previous.footQuaternions[i].angleTo(q)))};
  for(const [key,value]of Object.entries(values))if(value>metric[key].value)metric[key]={value,time,from:previous.state,to:next.state,trick:next.trick};
}
const metrics=()=>Object.fromEntries(['board','feet','palms','arms','footAngle'].map(key=>[key,{value:0}]));
// These are landmark displacements per rendered 60 Hz frame, after subtracting
// physical root translation. They allow a quick hand/foot tuck and a flip flick,
// while rejecting a 30–35 cm one-frame board reset. We measure board centre,
// not its rotating ends, so a legitimate Kickflip is not mistaken for a snap.
const limits={board:.10,feet:.17,palms:.22,arms:.70,footAngle:.65};
// A new grab deliberately tucks from neutral at 23/s. Its first 60 Hz frame
// can move a 38 cm target about 12 cm, on top of the outgoing rail correction.
// Give that *entry* room while keeping held-grab release/landing strict.
const entryLimits={board:.18,feet:.23,palms:.25,arms:.80,footAngle:.80};
function validateMotion(result,allowed=limits) {
  result.limits=allowed;
  const failures=Object.entries(allowed).filter(([key,max])=>result.motion[key].value>max);
  assert.equal(failures.length,0,failures.map(([key,max])=>{
    const m=result.motion[key];return `${result.name}: ${key} jumped ${m.value.toFixed(4)} (limit ${max}) at ${m.time.toFixed(3)}s ${m.from}→${m.to} ${m.trick??''}`;
  }).join('; '));
}
function settle(c,sk) {for(let i=0;i<60;i++)draw(c,sk,-1+i*renderDt);}
function grabTrajectory(characterId,dir,name,mode,stance) {
  const world=fixture({stance}),{sk,events}=world,c=new Character({characterId});
  const result={name:`${characterId} ${name} ${mode} ${stance===1?'regular':'fakie'}`,motion:metrics()};
  let previous,firstLanding=null,flipAt=null,held=false;
  try {
    sk.state='air';sk.popped=true;sk.pos.set(0,mode==='held landing'?1:6,0);sk.vel.set(0,mode==='held landing'?5:7,7);sk.speed=7;
    settle(c,sk);
    for(let step=0;step<300;step++) {
      const isHeld=mode==='held landing'||step<60;
      const inp=input({grab:isHeld,grabPressed:step===0,flipPressed:mode==='immediate flip'&&step===61,dir8:step<=60?dir:'C'});
      sk.update(dt,inp);
      assert.notEqual(sk.state,'bail',`${result.name} must land the real input route: ${sk.bailReason}`);
      if(sk.trick?.name===name&&sk.trick.t>.25)held=true;
      if(sk.trick?.kind==='flip'&&flipAt===null)flipAt=(step+1)*dt;
      if(sk.state==='ride'&&firstLanding===null)firstLanding=(step+1)*dt;
      if(step%2===1) {
        const next=draw(c,sk,(step+1)*dt);
        // Begin after the actual grab has had time to settle. This isolates
        // departure/recovery, not the intentional fast reach at trick entry.
        if(step>=24)measure(previous,next,result.motion,(step+1)*dt);
        previous=next;
      }
    }
    assert.ok(held,`${name} genuinely reached a held grab`);
    assert.ok(firstLanding!==null&&sk.state==='ride','physical landing and recovery completed');
    assert.equal(events.land.length,1,'one combo bank, without an extra animation-driven award');
    assert.equal(events.tricks.filter(n=>n===name).length,1,'grab completes exactly once');
    assert.equal(events.tricks.filter(n=>n==='Kickflip').length,mode==='immediate flip'?1:0);
    assert.ok(sk.score>0&&events.land[0].points===sk.score,'banked score preserved');
    if(mode==='immediate flip')assert.ok(flipAt>.5&&flipAt<.54,'flip starts on the first legally available input frame');
    assert.equal(c.grabAnimation.weight,0,'no latent grab pose after recovery');
    assert.ok(c.board.position.length()<.001,'board settles into the normal grounded pose');
    for(const [leg,z]of [[c.lLeg,.235],[c.rLeg,-.255]]) {
      const sole=leg.an.localToWorld(V(0,-.0405,0));c.board.worldToLocal(sole);
      assert.ok(sole.distanceTo(V(0,.132,z))<.001,'both actual shoe soles settle on the grip tape');
    }
    result.landing=firstLanding;result.flipAt=flipAt;result.score=sk.score;result.events=events;
    report.trajectories.push(result);return result;
  } finally {c.dispose();world.dispose();}
}

for(const characterId of ['joe','aaron'])for(const [dir,[name]]of grabs)check(`${characterId}: ${name} held landing and immediate flip, both stances`,()=>{
  const results=[];
  for(const stance of [1,-1])for(const mode of ['held landing','immediate flip'])results.push(grabTrajectory(characterId,dir,name,mode,stance));
  for(const result of results)validateMotion(result);
});

function grindExit(characterId,dir,name,kind,stance) {
  const world=fixture({rail:true,stance}),{sk,events}=world,c=new Character({characterId});
  const result={name:`${characterId} ${stance<0?'switch ':''}${name} ollie to ${kind}`,motion:metrics()};
  let previous,capturedAt=null,poppedAt=null,newTrickAt=null;
  try {
    sk.state='air';sk.popped=true;sk.pos.set(0,2.6,-4.7);sk.vel.set(0,-1,7);sk.speed=7;
    settle(c,sk);
    for(let step=0;step<300;step++) {
      const since=capturedAt===null?-1:step-capturedAt;
      const startNew=sk.state==='air'&&poppedAt!==null&&newTrickAt===null;
      const inp=input({grind:capturedAt===null,grindPressed:step===0,dir8:capturedAt===null?dir:'C',
        ollie:since>=20&&since<56,olliePressed:since===20,ollieReleased:since===56,
        grab:kind==='grab'&&startNew,grabPressed:kind==='grab'&&startNew,flipPressed:kind==='flip'&&startNew});
      sk.update(dt,inp);
      assert.notEqual(sk.state,'bail',`${result.name}: ${sk.bailReason}`);
      if(sk.state==='grind'&&capturedAt===null)capturedAt=step;
      if(capturedAt!==null&&sk.state==='air'&&poppedAt===null)poppedAt=step;
      if(startNew&&sk.trick)newTrickAt=step;
      if(step%2===1) {
        const next=draw(c,sk,(step+1)*dt);
        if(poppedAt!==null)measure(previous,next,result.motion,(step+1)*dt);
        previous=next;
      }
    }
    assert.deepEqual(events.grinds,[name],'actual falling approach captures the requested grind');
    assert.ok(poppedAt-capturedAt>=55&&poppedAt-capturedAt<=57,'actual charged Ollie exits the grind');
    assert.equal(newTrickAt,poppedAt+1,'new air trick starts immediately after grind pop');
    assert.deepEqual(events.tricks,[kind==='grab'?'Indy':'Kickflip']);
    assert.equal(events.land.length,1);assert.equal(sk.state,'ride');assert.ok(sk.score>0);
    assert.equal(c.grindAnimation.weight,0,'departing rail correction settles');
    result.score=sk.score;result.events=events;report.trajectories.push(result);return result;
  } finally {c.dispose();world.dispose();}
}
for(const characterId of ['joe','aaron'])check(`${characterId}: all nine real grind captures, charged exits into grab and flip`,()=>{
  const results=[];
  for(const stance of [1,-1])for(const [dir,[name]]of Object.entries(GRINDS))for(const kind of ['grab','flip'])results.push(grindExit(characterId,dir,name,kind,stance));
  for(const result of results)validateMotion(result,entryLimits);
});

for(const characterId of ['joe','aaron'])for(const stance of [1,-1])check(`${characterId}: ${stance<0?'switch ':''}Method to Kickflip to Indy immediately reattaches without a latent release pose`,()=>{
  const world=fixture({stance}),{sk,events}=world,c=new Character({characterId});
  const result={name:`${characterId} ${stance<0?'switch ':''}Method to Kickflip to Indy`,motion:metrics()};
  let previous,secondGrabAt=null,completeTucks=0;
  try {
    // A high drop leaves enough physical air time for all three minimum trick
    // durations. Only the initial trajectory is seeded; subsequent transitions
    // and their scoring use normal pressed/held/released inputs.
    sk.state='air';sk.popped=true;sk.pos.set(0,12,0);sk.vel.set(0,7,7);sk.speed=7;settle(c,sk);
    for(let step=0;step<300;step++) {
      const again=step>65&&!sk.trick&&secondGrabAt===null;
      const inp=input({grab:step<60||secondGrabAt!==null||again,grabPressed:step===0||again,
        flipPressed:step===61,dir8:step<60?'NW':'C'});
      sk.update(dt,inp);assert.notEqual(sk.state,'bail',`three-trick route: ${sk.bailReason}`);
      if(again)secondGrabAt=step;
      if(step%2===1) {
        const next=draw(c,sk,(step+1)*dt);
        if(secondGrabAt!==null)measure(previous,next,result.motion,(step+1)*dt);
        previous=next;
        if(sk.trick?.name==='Indy'&&sk.trick.t>.20&&c.grabAnimation.weight>.98) {
          assert.ok(c.board.position.y>.30,'new Indy visibly tucks the board instead of inheriting the expired flip offset');
          const arm=stance<0?c.lArm:c.rArm;
          const palm=arm.hand.localToWorld(new THREE.Vector3(...GRAB_PALM_CONTACT));
          const rim=c.board.localToWorld(V(-.11,.126,-.015*stance));
          assert.ok(palm.distanceTo(rim)<.04,'newly held grab reaches the actual toe-side rim');completeTucks++;
        }
      }
    }
    assert.ok(completeTucks>0,'fixture includes a full new grab before the landing release');
    assert.deepEqual(events.tricks,['Method','Kickflip','Indy']);
    assert.equal(events.land.length,1);assert.equal(sk.state,'ride');assert.ok(sk.score>0);
    assert.equal(c.grabAnimation.weight,0);assert.ok(c.board.position.length()<.001);
    result.score=sk.score;result.events=events;result.completeTucks=completeTucks;report.trajectories.push(result);
    validateMotion(result,entryLimits);
  } finally {c.dispose();world.dispose();}
});

for(const characterId of ['joe','aaron'])check(`${characterId}: held grab extends before a real steep quarter-pipe landing`,()=>{
  const level=new Level(),sk=new Skater(level,()=>.5),c=new Character({characterId});
  const result={name:`${characterId} held Indy to steep Warehouse quarter`,motion:metrics(),motionSpace:'physical root translation and rotation removed'};
  let previous,landNormal=null,completed=0,banks=0;
  try {
    // Descending vert air just outside the west coping. The legitimate recent
    // rail cooldown prevents the coping magnet from replacing this surface
    // landing; the real quarter collider supplies its >73-degree face normal.
    sk.state='air';sk.popped=true;sk.vertAir=true;sk.pos.set(-34.12,4.5,6);sk.vel.set(.05,0,0);sk.speed=1;
    sk.facing.set(1,0,0);sk.heading.copy(sk.facing);sk.modelQuat.setFromAxisAngle(V(0,1,0),Math.PI/2);
    sk.lastRail=level.rails.find(r=>r.kind==='coping'&&r.a.x<-34);sk.railCooldown=.45;
    assert.ok(sk.lastRail,'fixture identifies actual west coping');
    sk.events.trick=()=>completed++;sk.events.land=points=>{if(points>0)banks++;};settle(c,sk);
    for(let step=0;step<300;step++) {
      const before=sk.state;sk.update(dt,input({grab:true,grabPressed:step===0,dir8:'C'}));
      assert.notEqual(sk.state,'bail',`steep quarter landing: ${sk.bailReason}`);
      if(before==='air'&&sk.state==='ride'&&landNormal===null)landNormal=sk.normal.y;
      if(step%2===1) {
        // The physical controller rotates the whole rig to the steep ground.
        // Remove that unchanged rigid transform as well as translation here.
        const next=draw(c,sk,(step+1)*dt,true);if(step>=24)measure(previous,next,result.motion,(step+1)*dt);previous=next;
      }
    }
    assert.ok(landNormal>.15&&landNormal<.3,'actual vert return lands on the steep portion, not the lower bank');
    assert.equal(completed,1);assert.equal(banks,1);assert.equal(sk.state,'ride');assert.ok(sk.score>0);
    assert.equal(c.grabAnimation.weight,0);result.normalY=landNormal;result.score=sk.score;report.trajectories.push(result);
    validateMotion(result);
  } finally {
    c.dispose();const resources=new Set();level.group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
    for(const resource of resources)resource.dispose();
  }
});

for(const characterId of ['joe','aaron'])for(const stance of [1,-1])check(`${characterId}: ${stance<0?'switch ':''}held grab prepares for real rail capture without adding a board reset`,()=>{
  const world=fixture({rail:true,stance}),{sk,events}=world,c=new Character({characterId}),rail=sk.level.rails[0];
  rail.a.y=rail.b.y=1;
  const result={name:`${characterId} ${stance<0?'switch ':''}held Indy to automatic 50-50 capture`,motion:metrics()};
  let previous,capture=null;
  try {
    sk.state='air';sk.popped=true;sk.pos.set(0,3,-4);sk.vel.set(0,1,7);sk.speed=7;settle(c,sk);
    for(let step=0;step<300;step++) {
      // This also covers the unarmed automatic snap: a held grab must not need
      // an extra grind button for its impending capture to extend the legs.
      sk.update(dt,input({grab:true,grabPressed:step===0,dir8:'C'}));
      assert.notEqual(sk.state,'bail',`held grab into rail: ${sk.bailReason}`);
      if(step%2===1) {
        const next=draw(c,sk,(step+1)*dt);
        if(step>=24)measure(previous,next,result.motion,(step+1)*dt);
        if(next.state==='grind'&&previous?.state==='air'&&!capture) {
          capture={time:(step+1)*dt,physicalRootDelta:next.root.clone().sub(previous.root).toArray(),additionalBoardMotion:next.board.distanceTo(previous.board)};
          // Capture physics intentionally snaps over half a metre here. The
          // render layer must not add the old 29 cm grab-offset disappearance.
          assert.ok(capture.physicalRootDelta[1]<-.5&&capture.physicalRootDelta[1]>-.65,'existing capture movement is preserved');
          assert.ok(capture.additionalBoardMotion<.10,`physical capture adds ${capture.additionalBoardMotion.toFixed(4)}m of render correction (limit .10m)`);
          for(const z of [-.24,.24]) {
            const underside=c.board.localToWorld(V(0,.026,z));
            assert.ok(Math.abs(underside.y-(rail.a.y+rail.radius))<.001,'both actual truck undersides touch the rail immediately');
            assert.ok(Math.abs(underside.x)<.001,'loaded trucks remain centred over the rail');
          }
        }
        previous=next;
      }
    }
    assert.ok(capture,'real falling trajectory actually captures the rail');
    assert.deepEqual(events.grinds,['50-50']);assert.deepEqual(events.tricks,['Indy']);
    assert.equal(events.land.length,1);assert.equal(sk.state,'ride');assert.ok(sk.score>0);
    result.capture=capture;result.score=sk.score;result.events=events;report.trajectories.push(result);validateMotion(result);
  } finally {c.dispose();world.dispose();}
});

report.passed=report.checks.every(c=>c.passed)&&report.checks.length>0;
report.renderedFrames=frames;report.unchangedSimulationChecks=checkedStates;
if(process.env.TRICK_TRANSITION_REPORT){mkdirSync(dirname(process.env.TRICK_TRANSITION_REPORT),{recursive:true});writeFileSync(process.env.TRICK_TRANSITION_REPORT,JSON.stringify(report,null,2)+'\n');}
console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} transition checks; ${report.trajectories.length} real input trajectories; ${frames} rendered frames`);
if(!report.passed)process.exitCode=1;

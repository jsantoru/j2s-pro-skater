// Render-only grind contacts against the actual detailed skateboard and shoe rig.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';
import { GrindAnimation } from '../src/grind-animation.js';
import { GRINDS } from '../src/tricks.js';
import { RocCityLevel } from '../src/roc-city-level.js';

const V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), UP=V(0,1,0);
const names = Object.values(GRINDS).map(([name])=>name);
const expected = {
  '50-50':'both', '5-0':'rear', Nosegrind:'front', Boardslide:'deck', Lipslide:'deck',
  'Crooked Grind':'front', Overcrook:'front', 'Smith Grind':'rear', 'Feeble Grind':'rear',
};
let checks=0, frames=0, contacts=0;
function check(name,fn) { fn(); checks++; console.log(`PASS ${name}`); }
function fixture(name,{stance=1,slope=0,dir=1,radius=.035,yaw=.63}={}) {
  const direction=V(Math.sin(yaw),slope,Math.cos(yaw)).normalize();
  const a=V(13,2,-6),rail={a,b:a.clone().addScaledVector(direction,12),dir:direction,len:12,kind:radius?'rail':'ledge',radius,surfaceLift:radius?0:.004};
  const slide=name.includes('slide');
  const facing=slide?V().crossVectors(direction,UP).normalize():direction.clone().setY(0).normalize().multiplyScalar(dir*stance);
  const q=new THREE.Quaternion().setFromAxisAngle(UP,Math.atan2(facing.x,facing.z)+.32);
  return {state:'grind',grind:{name,rail,t:.5,dir,speed:7,time:0,slide},pos:a.clone().addScaledVector(direction,6).add(V(0,.02,0)),
    modelQuat:q,facing,heading:direction.clone().multiplyScalar(dir),normal:UP.clone(),vel:direction.clone().multiplyScalar(7),
    stance,speed:7,crouch:0,landSquash:0,pushing:0,lean:0,bailT:0,trick:null,manualLean:0};
}
function stateSnapshot(sk) { return JSON.stringify(sk,(key,value)=>key==='visuals'?undefined:
  key==='aLink'||key==='bLink'?{dir:value.dir,a:value.rail.a,b:value.rail.b}:value); }
function step(c,sk,dt=1/60) {
  const before=stateSnapshot(sk);
  c.root.position.copy(sk.pos);c.root.quaternion.copy(sk.modelQuat);
  c.update(sk,dt,frames++/60);c.root.updateMatrixWorld(true);
  assert.equal(stateSnapshot(sk),before,'rendering leaves physics, score inputs, rail and stance untouched');
  assert.ok(c.board.matrixWorld.elements.every(Number.isFinite),'finite board');
}
function feet(c) {
  for(const [leg,z] of [[c.lLeg,.235],[c.rLeg,-.255]]) {
    const sole=leg.an.localToWorld(V(0,-.0405,0));c.board.worldToLocal(sole);
    assert.ok(sole.distanceTo(V(0,.132,z))<.001,`sole remains planted: ${sole.toArray()}`);
    const normal=UP.clone().applyQuaternion(leg.an.getWorldQuaternion(new THREE.Quaternion()));
    normal.applyQuaternion(c.board.getWorldQuaternion(new THREE.Quaternion()).invert());
    assert.ok(normal.y>.9999,'sole follows board pitch/yaw'); contacts++;
  }
}
function hanger(c,z) {
  return c.board.children.find(o=>o.geometry?.type==='CylinderGeometry' && Math.abs(o.position.y-.043)<1e-6 && Math.abs(o.position.z-z)<1e-6);
}
function hangerGap(c,sk,z) {
  const mesh=hanger(c,z);assert.ok(mesh,'test reads the actual rendered hanger');
  const a=mesh.localToWorld(V(0,-.09,0)),b=mesh.localToWorld(V(0,.09,0));
  const r=sk.grind.rail,origin=r.a.clone().add(V(0,r.surfaceLift,0)).addScaledVector(r.dir,-100);
  return Math.sqrt(new THREE.Ray(origin,r.dir).distanceSqToSegment(a,b)) - r.radius - .017;
}
function support(c,sk) {
  const type=expected[sk.grind.name],g=c.grindAnimation;
  assert.equal(g.contact.kind,type);
  const actual=c.board.localToWorld(g.contact.local.clone());
  assert.ok(actual.distanceTo(g.contact.world)<1e-7,'contact pivot remains locked, including entry blend');
  if(type==='deck') {
    const q=c.board.getWorldQuaternion(new THREE.Quaternion()),up=UP.clone().applyQuaternion(q);
    const ray=new THREE.Raycaster(g.contact.world.clone().addScaledVector(up,-.02),up,0,.08);
    const hits=ray.intersectObjects(c.board.children,false);
    assert.ok(hits.length,'actual deck underside above rail');
    assert.ok(Math.abs(hits[0].distance-.02)<.001,`actual underside touches rail: ${hits[0].distance}`);
  } else {
    for(const z of type==='both'?[-.24,.24]:[type==='front'?.24:-.24])
      assert.ok(Math.abs(hangerGap(c,sk,z))<.0001,'loaded actual truck touches rail');
    if(type!=='both')assert.ok(hangerGap(c,sk,type==='front'?-.24:.24)>-.001,
      `${sk.grind.name} ${sk.stance} ${sk.grind.dir} ${sk.grind.rail.dir.y}: free truck clears bar at ${g.weight}; gap ${hangerGap(c,sk,type==='front'?-.24:.24)}`);
    if(type!=='both' && g.weight>=.9999) {
      const other=hanger(c,type==='front'?-.24:.24).getWorldPosition(V());
      const relative=other.sub(g.contact.railPoint),along=g.contact.railDirection;
      const fromLine=relative.addScaledVector(along,-relative.dot(along));
      assert.ok(fromLine.length()>.12,'unloaded truck visibly clears rail');
    }
  }
}

for(const characterId of ['joe','aaron']) check(`${characterId}: all nine grinds, both stances/directions, flat and sloped rails`,()=>{
  const c=new Character({characterId});
  for(const name of names) for(const stance of [1,-1]) for(const dir of [1,-1]) for(const slope of [0,-.4,.4]) for(const radius of [.035,.075]) {
    c.grindAnimation.reset();const sk=fixture(name,{stance,dir,slope,radius});
    for(let i=0;i<24;i++){step(c,sk);support(c,sk);feet(c);}
  }
  c.dispose();
});

check('default ROC scale contacts the actual visible handrail and bowl coping meshes',()=>{
  const level=new RocCityLevel(),c=new Character();
  level.group.updateMatrixWorld(true);
  const rails=[level.rails.find(r=>r.feature==='E'&&r.kind==='rail'),level.rails.find(r=>r.feature==='D'&&r.radius>=.07)];
  assert.ok(rails.every(Boolean),'real sloped E rail and wide D coping selected');
  for(const rail of rails)for(const name of ['50-50','5-0','Nosegrind','Crooked Grind','Overcrook','Smith Grind','Feeble Grind']) {
    const sk=fixture(name);sk.grind.rail=rail;sk.grind.t=.5;
    sk.pos.copy(rail.a).lerp(rail.b,.5).add(V(0,.02,0));
    c.grindAnimation.reset();for(let i=0;i<20;i++)step(c,sk);
    const contact=c.grindAnimation.contact;
    assert.ok(rail.radiusScale.x===1.25,'actual default scale metadata present');
    const ray=new THREE.Raycaster(contact.world.clone().addScaledVector(contact.normal,.02),contact.normal.clone().negate(),0,.05);
    const hit=ray.intersectObjects(rail.visuals,false)[0];
    assert.ok(hit,`${name} support lies over actual visible rail`);
    // Visible tubes use eight radial segments; the ideal cylinder contact can
    // stand at most its small polygon sagitta above the rendered face.
    assert.ok(hit.distance>=.019 && hit.distance<.028,`${name} actual scaled mesh gap ${hit.distance-.02}`);
    feet(c);
  }
  c.dispose();
  const geometries=new Set(),materials=new Set(),textures=new Set();
  level.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const x of Object.values(m))if(x?.isTexture)textures.add(x);}});
  for(const resource of [...textures,...materials,...geometries])resource.dispose();
});

check('correct loaded end and opposite diagonals; slides across the rail',()=>{
  const c=new Character(),poses={};
  for(const name of names) {
    const sk=fixture(name,{yaw:0});c.grindAnimation.reset();
    for(let i=0;i<20;i++)step(c,sk);
    const nose=c.board.localToWorld(V(0,.043,.24)),tail=c.board.localToWorld(V(0,.043,-.24));
    poses[name]={axis:nose.sub(tail).normalize(),body:c.torso.quaternion.toArray()};
  }
  assert.ok(Math.abs(poses['50-50'].axis.y)<1e-7);
  assert.ok(poses['5-0'].axis.y>.25,'5-0 raises anatomical nose');
  for(const name of ['Nosegrind','Crooked Grind','Overcrook','Smith Grind','Feeble Grind'])assert.ok(poses[name].axis.y<-.2,`${name} nose lower than tail`);
  for(const [a,b] of [['Crooked Grind','Overcrook'],['Smith Grind','Feeble Grind']]) {
    assert.ok(poses[a].axis.x*poses[b].axis.x<-.15,`${a}/${b} occupy opposite rail sides`);
    assert.notDeepEqual(poses[a].body,poses[b].body,'balanced upper-body counterturn differs');
  }
  for(const name of ['Boardslide','Lipslide'])assert.ok(Math.abs(poses[name].axis.z)<1e-7,'slides cross the rail');
  assert.notDeepEqual(poses.Boardslide.body,poses.Lipslide.body,'slide shoulder wind-up differs without inventing different contact');
  c.dispose();
});

check('painted flat top lift, wide coping radius and linked slope change remain grounded',()=>{
  const c=new Character();
  for(const radius of [0,.05,.075]) {
    const sk=fixture('50-50',{radius});c.grindAnimation.reset();
    for(let i=0;i<20;i++)step(c,sk);
    support(c,sk);
    // A linked handrail changes slope and heading without a new grind object.
    sk.grind.rail.dir.set(.6,-.2,.8).normalize();
    sk.pos.copy(sk.grind.rail.a).addScaledVector(sk.grind.rail.dir,6).add(V(0,.02,0));
    step(c,sk);support(c,sk);feet(c);
  }
  c.dispose();
});

check('smoothed model orientation does not pull settled trucks off the rail',()=>{
  const c=new Character(),sk=fixture('Crooked Grind',{slope:-.4});
  for(let i=0;i<20;i++)step(c,sk);
  for(let i=0;i<60;i++) {
    sk.modelQuat.setFromEuler(new THREE.Euler(.15*Math.sin(i),i*.13,.08));
    step(c,sk);support(c,sk);feet(c);
  }
  c.dispose();
});

check('entry and exit are bounded blends, air tricks retained, bail and reset remove correction',()=>{
  const c=new Character(),sk=fixture('5-0');let lastQ=null;
  for(let i=0;i<25;i++) {
    step(c,sk);
    const q=c.board.getWorldQuaternion(new THREE.Quaternion());
    if(lastQ)assert.ok(q.angleTo(lastQ)<.16,'no entry orientation snap');lastQ=q;
  }
  sk.state='air';sk.grind=null;
  const initial=c.grindAnimation.weight;
  step(c,sk);assert.ok(c.grindAnimation.weight>0&&c.grindAnimation.weight<initial,'exit retains diminishing transform');
  sk.trick={kind:'flip',name:'Kickflip',t:.21,dur:.42};
  step(c,sk);assert.ok(c.board.quaternion.angleTo(c.grindAnimation.boardQuaternion)>1,'new trick survives departing grind');
  sk.trick=null;for(let i=0;i<90;i++)step(c,sk);
  assert.equal(c.grindAnimation.weight,0);assert.equal(c.grindAnimation.name,null);
  Object.assign(sk,fixture('Smith Grind'));for(let i=0;i<20;i++)step(c,sk);
  sk.state='bail';sk.bailT=.2;step(c,sk);assert.equal(c.grindAnimation.weight,0);
  c.grindAnimation.reset();assert.equal(c.grindAnimation.contact.kind,null);
  c.dispose();
});

check('pause, zero/invalid dt and plain ride do not accumulate grind state',()=>{
  const g=new GrindAnimation(),sk=fixture('5-0');
  g.update(sk,.1);const before=g.boardQuaternion.toArray();
  for(const dt of [0,-1,NaN,Infinity]){g.update(sk,dt);assert.deepEqual(g.boardQuaternion.toArray(),before);}
  g.reset();g.update({...sk,state:'ride',grind:null},1/60);assert.equal(g.weight,0);
});
console.log(`PASS ${checks} grind-pose checks, ${frames} rendered frames and ${contacts} planted feet; gameplay state unchanged.`);

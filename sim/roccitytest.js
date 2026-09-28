// Real collision / input regressions for the outdoor Phase 1 level.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { ROC_CITY_LAYOUT, ROC_PICKUPS } from '../src/roc-city-layout.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';
import { GoalProgress, GoalRun } from '../src/goals.js';

const level=new RocCityLevel(),dt=1/120;
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
function support(x,z) { ray.set(new THREE.Vector3(x,8,z),down);return ray.intersectObjects(level.colliders,false); }
function rider(from,direction,speed=7) {
  const skater=new Skater(level,()=>.5);skater.pos.fromArray(from);skater.heading.fromArray(direction).normalize();
  skater.facing.copy(skater.heading);skater.speed=speed;skater.vel.copy(skater.heading).multiplyScalar(speed);
  return skater;
}
let passed=0;
function test(name,fn) { fn();console.log(`PASS: ${name}`);passed++; }

test('Phase 1 landmark and pickup contract has supported, distinct destinations',()=>{
  assert.deepEqual(Object.keys(level.features),Array.from('ABCDEFGHIJKL'));
  assert.equal(level.features.E.steps,7);assert.equal(level.features.G.steps,9);
  assert.equal(level.bailFloorY,-3);
  assert.equal(ROC_PICKUPS.length,11);
  assert.equal(new Set(ROC_PICKUPS.map(p=>p.id)).size,11);
  for(const pickup of ROC_PICKUPS){
    const hit=support(pickup.position[0],pickup.position[2])[0];
    assert(hit,`${pickup.id} has physical support`);
    assert(Math.abs(hit.point.y-pickup.surfaceY)<.025,`${pickup.id} surface height: ${hit.point.y}`);
  }
  assert.equal(level.colliders.filter(m=>m.userData.feature==='E'&&m.userData.steps===7).length,1);
  assert.equal(level.colliders.filter(m=>m.userData.feature==='G'&&m.userData.steps===9).length,1);
});

test('Bowl is a continuous upward-wound surface with a genuinely open deck and floor',()=>{
  const g=level.bowl.geometry,p=g.attributes.position,idx=g.index;
  for(let i=0;i<idx.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i));
    const b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+1));
    const c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+2));
    assert([...a,...b,...c].every(Number.isFinite));
    const normal=b.sub(a).cross(c.sub(a));
    assert(normal.y>0,'Every triangle faces the rider, including the center fan and seam');
    assert(normal.length()>1e-6,'No degenerate collision triangles');
  }
  const [cx,cz]=g.userData.center;
  for(let i=0;i<level.bowlOutline.length;i+=7)for(const r of [.15,.5,.9]){
    const [x,z]=level.bowlOutline[i],hits=support(cx+(x-cx)*r,cz+(z-cz)*r);
    assert.equal(hits[0]?.object,level.bowl,'No deck / ground plane crosses the pool opening');
  }
  assert(support(cx,cz)[0].point.y<-.9,'Deep pocket is below main plaza grade');
  assert(support(-5,-3)[0].point.y>support(cx,cz)[0].point.y+.5,'Square tail is a shallower pocket');
  const coping=level.rails.filter(r=>r.kind==='coping'&&Math.abs(r.a.y-1.655)<.001);
  assert.equal(coping.length,level.bowlOutline.length);
  for(let i=0;i<coping.length;i++)assert(coping[i].b.distanceTo(coping[(i+1)%coping.length].a)<1e-8,'Closed, grindable pool coping');
  const sideNormals=level.deckSkirt.geometry.attributes.normal;
  for(let i=0;i<ROC_CITY_LAYOUT.westDeck.length;i++){
    const a=ROC_CITY_LAYOUT.westDeck[i],b=ROC_CITY_LAYOUT.westDeck[(i+1)%ROC_CITY_LAYOUT.westDeck.length];
    const outward=new THREE.Vector3(b[1]-a[1],0,a[0]-b[0]).normalize();
    assert(new THREE.Vector3().fromBufferAttribute(sideNormals,i*4).dot(outward)>.999,'Retaining faces close the outside of the raised deck');
  }
});

test('Rail endpoints use final world transforms and remain normalized',()=>{
  assert(level.rails.length>160);
  for(const rail of level.rails){
    assert(rail.len>.001);assert(Math.abs(rail.dir.length()-1)<1e-8);
    assert(Math.abs(rail.a.distanceTo(rail.b)-rail.len)<1e-8);
    assert(rail.a.clone().addScaledVector(rail.dir,rail.len).distanceTo(rail.b)<1e-8);
    if(rail.bLink){
      const destination=rail.bLink.dir===1?rail.bLink.rail.a:rail.bLink.rail.b;
      assert(rail.b.distanceTo(destination)<1e-8,'Linked rails meet exactly at the handoff');
    }
  }
  assert(level.rails.some(r=>r.kind==='ledge'&&Math.abs(r.a.y+.42)<.01),'Manual-pad rails lie on the actual top, not above it');
});

test('Ordinary push input enters the pool, traverses its curved bottom and exits to deck',()=>{
  const enter=rider([1,1.62,-15],[-1,0,0],8);let bails=0,min=10;
  enter.events.bail=()=>bails++;
  const inp=makeState();inp.push=1;
  for(let t=0;t<3;t+=dt){enter.update(dt,inp);min=Math.min(min,enter.pos.y);}
  assert(min<-.8,'Rider descends onto actual bowl floor');assert.equal(bails,0);
  const exit=rider([-7,-1.03,-14],[1,0,0]);
  exit.events.bail=()=>bails++;
  for(let t=0;t<2.5;t+=dt)exit.update(dt,inp);
  assert.equal(exit.state,'ride');assert(exit.pos.y>1.5,'Rider clears transition and lands on deck');assert.equal(bails,0);
});

test('Both stair-side banks and the promenade grade transition are safely ridable',()=>{
  for(const [from,dir,time,label] of [
    [[2,0,-44],[0,0,1],2,'straight north-entry bank'],
    [[6.5,1.26,-23],[0,0,1],1.7,'seven-stair bank'],
    [[-8.8,1.62,5.8],[-.206,0,.979],1.5,'nine-stair bank'],
    [[8,0,17],[0,0,1],2,'mellow bank into bridge'],
  ]){
    const skater=rider(from,dir);let bails=0;skater.events.bail=()=>bails++;
    const inp=makeState();inp.push=1;
    for(let t=0;t<time;t+=dt)skater.update(dt,inp);
    assert.equal(bails,0,label);assert.equal(skater.state,'ride',label);
    assert(skater.pos.z>from[2]+8,`${label} makes forward progress`);
  }
});

test('35,000 Sick Score and a 5,000 combo are attainable with ordinary trick/manual input',()=>{
  // Start at an unobstructed line on the plaza, already reached by the SKATE route.
  // Three ollies linked by manuals bank 9,000; brake/turn and repeat the line.
  const skater=rider([7,0,-16],[0,0,1],5);
  let previousOllie=false,previousGrab=false,jumps=0,flick=0,charge=0;
  let time=0,mode='chain',target=-1,best=0,bails=0,grabAllowed=false;
  skater.events.bail=()=>bails++;
  skater.events.ollie=()=>{jumps++;flick=0;charge=0;grabAllowed=false;};
  skater.events.land=points=>{
    if(!points)return;
    best=Math.max(best,points);mode='brake';target=skater.heading.z>0?-1:1;jumps=0;charge=0;
  };
  // Skip late tricks when an uphill bank will shorten the visible landing arc.
  // This predicts a landing for control selection, without modifying the rider.
  const remainingAir=()=>{
    for(let ahead=.05;ahead<1.5;ahead+=.05){
      const x=skater.pos.x+skater.vel.x*ahead,z=skater.pos.z+skater.vel.z*ahead;
      const y=skater.pos.y+skater.vel.y*ahead-skater.T.gravity*.5*ahead*ahead;
      const hit=support(x,z)[0];if(hit&&y<hit.point.y+.05)return ahead;
    }
    return 1.5;
  };
  while(time<100&&skater.score<35000){
    const inp=makeState();
    if(mode==='chain'){
      inp.push=1;
      if(skater.state==='ride'){
        charge+=dt;inp.ollie=charge<.57;
        inp.stickY=skater.manual?THREE.MathUtils.clamp(-skater.manualBalance.x*3-skater.manualBalance.v,-1,1):0;
      }
      if(skater.state==='air'){
        inp.flipPressed=skater.airTime>.02&&skater.airTime<.04&&remainingAir()>.48;
        if(skater.airTime>.46&&skater.airTime<.48)grabAllowed=remainingAir()>.31;
        inp.grab=grabAllowed&&skater.airTime>.46&&skater.airTime<.66;
        if(jumps<3&&skater.airTime>.35&&flick<3)inp.stickY=[0,-1,1][flick++];
      }
    }else if(mode==='brake'){
      inp.brake=1;if(skater.speed<1.8)mode='turn';
    }else{
      const angle=Math.atan2(skater.heading.x*target,skater.heading.z*target);
      inp.steer=-1;inp.push=skater.speed<2.5?1:0;inp.brake=skater.speed>2.8?.5:0;
      if(Math.abs(angle)<.03){mode='chain';charge=0;}
    }
    inp.olliePressed=inp.ollie&&!previousOllie;inp.ollieReleased=!inp.ollie&&previousOllie;previousOllie=inp.ollie;
    inp.grabPressed=inp.grab&&!previousGrab;previousGrab=inp.grab;
    skater.update(dt,inp);time+=dt;
  }
  assert(skater.score>=35000&&time<80,'Sick Score leaves time to skate to the line from spawn');
  assert(best>=5000,'Big Combo uses real banked trick points');
  assert(bails<=3,'The line has room for recovery instead of requiring a perfect run');
  console.log(`  Score route: ${skater.score} in ${time.toFixed(2)} seconds; best ${best}; ${bails} bails.`);
});

test('All S-K-A-T-E letters are collected from spawn within one ordinary 120-second run',()=>{
  const skater=new Skater(level,()=>.5),goals=new GoalRun(new GoalProgress(null),ROC_PICKUPS);
  goals.start({skater});let bails=0,index=0,time=0;skater.events.bail=()=>bails++;
  const route=[
    [2,-40,'letter-s'],[8,-40],[10,-37],[10,-31],[10,-25,'letter-k'],
    [9,-15],[9,-10,'letter-a'],[7,0],[4,0],[1,1,'letter-t'],
    [3,2.5],[7,3],[7,13],[8,27],[8,43,'letter-e'],
  ];
  while(time<120&&!goals.completed.has('skate')){
    const [x,z,pickup]=route[index],dx=x-skater.pos.x,dz=z-skater.pos.z;
    const angle=Math.atan2(skater.heading.x*dz-skater.heading.z*dx,skater.heading.x*dx+skater.heading.z*dz);
    const desired=index<=1?3.2:index>=8&&index<=11?3:Math.abs(angle)>.65?3.5:7;
    const inp=makeState();inp.steer=skater.state==='ride'?THREE.MathUtils.clamp(angle*1.8,-1,1):0;
    inp.push=skater.speed<desired?1:0;inp.brake=skater.speed>desired+.25?.5:0;
    skater.update(dt,inp);goals.update(skater);time+=dt;
    if(pickup?goals.collected.has(pickup):Math.hypot(dx,dz)<.75)index=Math.min(index+1,route.length-1);
  }
  assert(goals.completed.has('skate'),`Stuck at waypoint ${index}: ${skater.pos.toArray()}`);
  assert.equal(bails,0);assert(time<60);console.log(`  SKATE route: ${time.toFixed(2)} seconds, no bails.`);
});

test('A charged quarter-pipe ollie reaches the secret tape through real airborne motion',()=>{
  const skater=rider([7.5,-.9,41],[0,0,1],8),goals=new GoalRun(new GoalProgress(null),ROC_PICKUPS);
  goals.start({skater});let previous=false,released=false,bails=0;
  skater.events.bail=()=>bails++;
  for(let t=0;t<2.5;t+=dt){
    const inp=makeState();inp.push=1;inp.ollie=skater.pos.z<48.4&&!released;
    inp.olliePressed=inp.ollie&&!previous;inp.ollieReleased=!inp.ollie&&previous;
    if(inp.ollieReleased)released=true;previous=inp.ollie;
    skater.update(dt,inp);goals.update(skater);
  }
  assert(goals.collected.has('secret-tape'),'Tape is reachable without teleportation or changing physics');assert.equal(bails,0);
});

test('Every bottle cap has a clean local route, including an ollie onto the manual pad',()=>{
  for(const [id,from,release] of [
    ['cap-1',[-7,0,-38],null],['cap-2',[-16.3,1.62,-11],null],
    ['cap-3',[7,0,0],null],['cap-4',[13,-.9,23],28.8],['cap-5',[8,-.9,40],null],
  ]){
    const skater=rider(from,[0,0,1]),goals=new GoalRun(new GoalProgress(null),ROC_PICKUPS);
    goals.start({skater});let previous=false,released=false,bails=0;skater.events.bail=()=>bails++;
    for(let t=0;t<3&&!goals.collected.has(id);t+=dt){
      const inp=makeState();inp.push=1;inp.ollie=release!==null&&skater.pos.z<release&&!released;
      inp.olliePressed=inp.ollie&&!previous;inp.ollieReleased=!inp.ollie&&previous;
      if(inp.ollieReleased)released=true;previous=inp.ollie;
      skater.update(dt,inp);goals.update(skater);
    }
    assert(goals.collected.has(id),`${id} has a physical collection route`);assert.equal(bails,0,id);
  }
});

console.log(`${passed}/${passed} ROC City geometry and gameplay checks passed.`);

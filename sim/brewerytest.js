import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

const level = new Level(), stock = level.colliders.filter(m => m.userData.breweryProp);
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0);
assert.ok(stock.length >= 15, 'Large brewery props must collide in both Node and browser');
for(const hull of stock){
  const p=hull.userData.breweryProp, bounds=new THREE.Box3().setFromObject(hull);
  assert.ok(Math.abs(bounds.min.y-p.y)<1e-6,'Stock rests on its floor or platform');
  assert.ok(bounds.min.x>-36 && bounds.max.x<36 && bounds.min.z>-23 && bounds.max.z<23,'Stock stays within walls');
  ray.set(new THREE.Vector3(p.x,8,p.z),down);ray.far=10;
  const hit=ray.intersectObject(hull)[0];
  assert.ok(hit && Math.abs(hit.point.y-bounds.max.y)<.001,'Stock has a solid top');
}
// Keep all authored grind segments and their nearby approaches free of new stock.
for(const rail of level.rails) for(let i=0;i<=20;i++){
  const p=rail.a.clone().lerp(rail.b,i/20);
  for(const hull of stock){
    const box=new THREE.Box3().setFromObject(hull).expandByScalar(.55);
    assert.ok(!box.containsPoint(p),'New stock leaves coping/rail clearance');
  }
}
// These ground-level lanes join the new bays without crossing their collision hulls.
for(const [start,end] of [
  [[-30,0,-9],[-26,0,-18]],[[24,0,-18.5],[33,0,-18.5]],
  [[-24,0,17],[-24,0,22]],[[31,1.6,12],[31,1.6,20]],
]){
  const a=new THREE.Vector3(...start).add(new THREE.Vector3(0,.45,0)),b=new THREE.Vector3(...end).add(new THREE.Vector3(0,.45,0));
  ray.set(a,b.clone().sub(a).normalize());ray.far=a.distanceTo(b);
  assert.equal(ray.intersectObjects(stock).length,0,'Brewery approach lane remains open');
}
// Exercise normal skating collision, rather than only intersecting proxy geometry.
for(const [x,z,dx,dz] of [[29.4,-18.8,0,-1],[-28.5,-18.6,0,-1],[-31.8,-13.4,-1,0]]){
  const skater=new Skater(level), input=makeState(); input.autoPush=false;
  skater.pos.set(x,0,z);skater.heading.set(dx,0,dz);skater.facing.copy(skater.heading);
  skater.speed=3;skater.vel.set(dx*3,0,dz*3);skater.updateModelQuat(1);
  for(let i=0;i<120;i++)skater.update(1/120,input);
  assert.ok(skater.state!=='bail','Slow stock approach bonks instead of entering a wall bail');
  assert.ok(skater.speed<1,'Solid stock stops a slow approach');
  assert.ok(Math.hypot(skater.pos.x-x,skater.pos.z-z)<1.5,'Skater cannot pass through stock');
}
console.log(`PASS: ${stock.length} stock hulls, platform placement, all grind clearances, four brewery access lanes and three live physics stock approaches.`);

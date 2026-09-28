// Below-grade bail recovery uses real raycasts, without imposing street height.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Skater } from '../src/skater.js';
import { RocCityLevel } from '../src/roc-city-level.js';

let checks=0,failures=0;
function check(name,test){checks++;try{test();console.log('PASS: '+name);}catch(error){failures++;console.error('FAIL: '+name+'\n'+error.stack);}}
function levelAt(height,{bailFloorY}={}){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshBasicMaterial());
  floor.rotation.x=-Math.PI/2;floor.position.y=height;floor.updateMatrixWorld(true);
  return {colliders:[floor],rails:[],spawn:{pos:new THREE.Vector3(0,height,0),heading:new THREE.Vector3(0,0,1)},bailFloorY};
}
function dispose(level){for(const mesh of level.colliders){mesh.geometry.dispose();mesh.material.dispose();}}

check('an airborne bail below street height falls to its bowl floor without snapping upward',()=>{
  const level=levelAt(-1.2,{bailFloorY:-3}),skater=new Skater(level);
  skater.pos.set(0,-.6,0);skater.state='air';skater.vel.set(0,0,0);skater.bail('trick');
  let peak=skater.pos.y;
  for(let frame=0;frame<200&&skater.state==='bail';frame++){
    skater.updateBail(1/120);peak=Math.max(peak,skater.pos.y);
    assert.ok(skater.pos.y<0,'bailing inside a bowl must never jump to street height');
  }
  assert.equal(skater.state,'ride');assert.ok(Math.abs(skater.pos.y+1.2)<1e-6);
  assert.ok(peak<-.4);assert.ok(skater.normal.y>.999);dispose(level);
});
check('the ROC deep bowl recovers against its actual curved collider below street height',()=>{
  const level=new RocCityLevel(),skater=new Skater(level);
  skater.pos.set(-7.2,-.5,-13.7);skater.state='air';skater.vel.set(0,0,0);skater.bail('trick');
  for(let frame=0;frame<200&&skater.state==='bail';frame++){
    skater.updateBail(1/120);
    assert.ok(skater.pos.y<0,'the actual deep bowl must never recover onto an invisible street-height floor');
  }
  assert.equal(skater.state,'ride');assert.ok(skater.pos.y<-.9&&skater.pos.y>-1.2);
  assert.ok(Math.abs(skater.pos.x+7.2)<1e-6&&Math.abs(skater.pos.z+13.7)<1e-6);
  const ray=new THREE.Raycaster(skater.pos.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),0,.3);
  assert.equal(ray.intersectObjects(level.colliders,false)[0]?.object,level.bowl);
  level.group.traverse(object=>{object.geometry?.dispose();const mats=Array.isArray(object.material)?object.material:[object.material];for(const material of mats)material?.dispose();});
});
check('a bail past the park void limit returns to a valid spawn and then recovers on the ground',()=>{
  const level=levelAt(0,{bailFloorY:-3}),skater=new Skater(level);
  skater.pos.set(40,-3.1,0);skater.state='air';skater.vel.set(4,-10,0);skater.bail('void');
  skater.updateBail(1/120);
  assert.deepEqual(skater.pos.toArray(),level.spawn.pos.toArray());
  assert.equal(skater.vel.length(),0);
  for(let frame=0;frame<200&&skater.state==='bail';frame++)skater.updateBail(1/120);
  assert.equal(skater.state,'ride');assert.ok(Math.abs(skater.pos.y)<1e-6);dispose(level);
});
check('warehouse levels without a below-grade limit preserve their original ground fallback',()=>{
  const level=levelAt(0),skater=new Skater(level);
  skater.pos.set(40,-.6,0);skater.state='air';skater.vel.set(0,-1,0);skater.bail('trick');
  skater.updateBail(1/120);
  assert.equal(skater.pos.y,0);assert.equal(skater.pos.x,40);assert.equal(skater.vel.y,0);dispose(level);
});
check('a park reset clears held and buffered tricks before the next physics step',()=>{
  const previous=levelAt(0),next=levelAt(-1.2,{bailFloorY:-3}),skater=new Skater(previous);
  skater.crouching=true;skater.crouchTime=.55;skater.bufferedOllie=true;skater.queued={kind:'flip',dir:'C'};
  skater.combo.add('Old park trick',5000);skater.score=5000;
  skater.level=next;skater.reset();
  assert.equal(skater.crouching,false);assert.equal(skater.crouchTime,0);assert.equal(skater.bufferedOllie,false);assert.equal(skater.queued,null);
  assert.equal(skater.score,0);assert.equal(skater.combo.tricks.length,0);
  assert.deepEqual(skater.pos.toArray(),next.spawn.pos.toArray());
  let pops=0;skater.events.ollie=()=>pops++;
  skater.update(1/120,{steer:0,stickY:0,push:0,brake:0,ollie:false,olliePressed:false,ollieReleased:true,dir8:'C',autoPush:false});
  assert.equal(pops,0);assert.equal(skater.state,'ride');assert.equal(skater.trick,null);
  dispose(previous);dispose(next);
});

console.log(`\n${checks-failures}/${checks} below-grade bail checks passed.`);
if(failures)process.exitCode=1;

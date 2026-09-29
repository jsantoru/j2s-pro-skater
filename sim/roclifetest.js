// Ambient actors should stay human-sized, continuous and outside skating lines.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { createRocCityArt } from '../src/roc-city-art.js';

function inside(x,z,polygon) {
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
const wrapped = angle => Math.atan2(Math.sin(angle),Math.cos(angle));

for(const lowfx of [false,true]) {
  const level=new RocCityLevel(),root=new THREE.Group(),scale=level.horizontalScale;
  root.add(level.group);
  const art=createRocCityArt(root,level,{lowfx});root.updateMatrixWorld(true);
  const dressing=level.group.getObjectByName('ROC City / Riverway landscape and I-490');
  const life=dressing.getObjectByName('Riverway people — decorative, outside riding lines');
  const metadata=life.userData.ambientPeople,update=dressing.userData.updateLife;
  const trail=new THREE.CatmullRomCurve3(level.layout.trail.map(([x,z])=>new THREE.Vector3(x,0,z))).getPoints(400);
  const torso=life.children.find(mesh=>mesh.name.endsWith('— torso'));
  const hips=life.children.find(mesh=>mesh.name.endsWith('— softBox'));
  const matrix=new THREE.Matrix4(),world=new THREE.Matrix4(),point=new THREE.Vector3();
  const actorMatrix=(mesh,id)=>{
    const index=mesh.userData.personIds.indexOf(id);
    assert.ok(index>=0,`${id} has rendered body geometry`);
    mesh.getMatrixAt(index,matrix);return world.multiplyMatrices(mesh.matrixWorld,matrix);
  };
  const actorBounds=id=>{
    const bounds=new THREE.Box3();
    for(const mesh of life.children) {
      mesh.geometry.computeBoundingBox();
      for(let i=0;i<mesh.count;i++)if(mesh.userData.personIds[i]===id) {
        mesh.getMatrixAt(i,matrix);world.multiplyMatrices(mesh.matrixWorld,matrix);
        bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(world));
      }
    }
    return bounds;
  };
  const walkers=metadata.people.filter(person=>person.kind==='walker');
  const histories=new Map(walkers.map(person=>[person.id,{last:null,turn:0,minZ:Infinity,maxZ:-Infinity}]));
  // More than two complete circuits of the longest route, sampling throughout
  // each curved turnaround and the modulo seam rather than checking end points.
  for(let frame=0;frame<=1600;frame++) {
    update(frame*.125);
    for(const person of walkers) {
      const pose=actorMatrix(torso,person.id),e=pose.elements;
      const current={x:e[12],y:e[13],z:e[14],yaw:Math.atan2(e[8],e[10])};
      const history=histories.get(person.id);
      assert.ok(Object.values(current).every(Number.isFinite),'Walker transforms remain finite');
      if(history.last) {
        assert.ok(Math.hypot(current.x-history.last.x,current.z-history.last.z)<.20,`${person.id} cannot teleport at route seams`);
        const turn=wrapped(current.yaw-history.last.yaw);
        assert.ok(Math.abs(turn)<.45,`${person.id} turns continuously`);history.turn+=turn;
      }
      history.last=current;history.minZ=Math.min(history.minZ,current.z);history.maxZ=Math.max(history.maxZ,current.z);
    }
    if(frame%80===0) for(const person of metadata.people) {
      const bounds=actorBounds(person.id),size=bounds.getSize(new THREE.Vector3());
      assert.ok([...bounds.min,...bounds.max].every(Number.isFinite),'Every body part remains finite');
      if(person.kind!=='seated')assert.ok(size.y>person.height-.10&&size.y<person.height+.10,`${person.id} remains human-sized after 1.25× world scaling`);
      const ground=person.kind==='walker'?-.019:person.position[1];
      assert.ok(Math.abs(bounds.min.y-ground)<.035,`${person.id} keeps a shoe on its supporting surface`);
      for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z])
        assert.ok(!inside(x/scale,z/scale,level.layout.perimeter),`${person.id} cannot enter a skating surface`);
      assert.ok(trail.every(p=>Math.hypot(Math.max(bounds.min.x/scale-p.x,0,p.x-bounds.max.x/scale),
        Math.max(bounds.min.z/scale-p.z,0,p.z-bounds.max.z/scale))>level.layout.trailWidth/2),`${person.id} keeps the entire body clear of the trail`);
    }
  }
  for(const person of walkers) {
    const history=histories.get(person.id),[,minZ,maxZ]=person.route;
    assert.ok(history.minZ/scale<minZ+.12&&history.maxZ/scale>maxZ-.12,'The check traversed both route ends');
    assert.ok(history.turn>Math.PI*3.8,'The check traversed multiple complete turnarounds');
  }
  console.log(`PASS: ${lowfx?'mobile':'desktop'} people complete continuous loops with finite human-scale bodies and grounded feet.`);

  const props=dressing.getObjectByName('Riverway street furniture and personal belongings');
  const property=[];dressing.traverse(mesh=>{if(mesh.isMesh&&!mesh.isInstancedMesh&&mesh!==props&&!mesh.name.includes('posters'))property.push(mesh);});
  const positions=props.geometry.attributes.position;
  // Check the actual batched geometry, including bike handlebars and the cafe
  // umbrella; anchor-only checks miss wide parts extending onto a riding line.
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i);const x=point.x,z=point.z;
    assert.ok(!inside(x,z,level.layout.perimeter),'A prop vertex enters the skating footprint');
    if(i%3===0)assert.ok(trail.every(p=>Math.hypot(p.x-x,p.z-z)>level.layout.trailWidth/2),'A prop reaches the Riverway travel lane');
  }
  console.log(`PASS: ${lowfx?'mobile':'desktop'} complete prop geometry stays outside the park and Riverway trail.`);

  update(0);
  const patron=metadata.people.find(person=>person.kind==='seated'),pelvis=actorMatrix(hips,patron.id).clone();
  hips.geometry.computeBoundingBox();const seatBody=hips.geometry.boundingBox.clone().applyMatrix4(pelvis);
  const seatCenter=seatBody.getCenter(new THREE.Vector3()),ray=new THREE.Raycaster();
  const forward=new THREE.Vector3(0,0,1).transformDirection(actorMatrix(torso,patron.id));
  assert.ok(forward.x>.9,'The cafe patron faces the table');
  let contacts=0;
  for(const dx of [-.05,.05])for(const dz of [-.08,.08]) {
    ray.set(new THREE.Vector3(seatCenter.x+dx,.7,seatCenter.z+dz),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(props,false)[0];
    if(hit&&hit.point.y>.4&&Math.abs(seatBody.min.y-hit.point.y)<.04)contacts++;
  }
  assert.equal(contacts,4,'The seated body is supported by the actual chair seat');
  const feet=[];
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(props.matrixWorld);
    if(Math.abs(point.x-seatCenter.x)<.26&&Math.abs(point.z-seatCenter.z)<.29&&point.y<.12)feet.push(point.clone());
  }
  assert.ok(feet.length>0,'The cafe chair has visible feet');
  const bottom=Math.min(...feet.map(p=>p.y));
  for(const foot of feet.filter(p=>Math.abs(p.y-bottom)<.001)) {
    ray.set(new THREE.Vector3(foot.x,.3,foot.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(property,false)[0];
    assert.ok(hit&&Math.abs(foot.y-hit.point.y)<.006,'Chair feet touch the same paved frontage as the patron');
  }
  console.log(`PASS: ${lowfx?'mobile':'desktop'} cafe patron faces the table, sits on the chair, and all chair feet meet the pavement.`);
  art.dispose();
}

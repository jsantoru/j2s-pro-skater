// Physical cap geometry, animation timing and shared-resource lifecycle.
// node sim/bottlecaptest.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAP_ROTATION_PERIOD, createBottlecapGeometries, createBottlecapModel, setBottlecapRotation } from '../src/bottlecap-model.js';
import { Collectibles } from '../src/collectibles.js';

let passed = 0;
function check(name, test) { test(); passed++; console.log('PASS: ' + name); }
const vector = new THREE.Vector3();

check('physical crown has finite, bounded geometry and consistently outward triangle normals', () => {
  const geometries = createBottlecapGeometries();
  let triangles = 0;
  const whole = new THREE.Box3();
  for (const [name, geometry] of Object.entries(geometries)) {
    const { position, normal, uv } = geometry.attributes;
    assert.ok(position && normal && uv, name + ' supplies the lighting and texture attributes');
    assert.equal(normal.count, position.count); assert.equal(uv.count, position.count);
    for (const attribute of [position, normal, uv]) assert.ok([...attribute.array].every(Number.isFinite), name + ' attributes stay finite');
    for (let i = 0; i < normal.count; i++) {
      const length = vector.fromBufferAttribute(normal, i).length();
      assert.ok(Math.abs(length - 1) < .002, `${name} has a normalized lighting normal (${length})`);
      assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) <= 1.000001 && uv.getY(i) >= -1e-6 && uv.getY(i) <= 1.000001, name + ' UVs stay in its assigned texture');
    }
    const index = geometry.index;
    assert.ok(index && index.count % 3 === 0);
    const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), cross=new THREE.Vector3(), normals=new THREE.Vector3(), temp=new THREE.Vector3();
    for (let i=0; i<index.count; i+=3) {
      const ia=index.getX(i), ib=index.getX(i+1), ic=index.getX(i+2);
      assert.ok(Math.max(ia,ib,ic)<position.count);
      a.fromBufferAttribute(position,ia);b.fromBufferAttribute(position,ib);c.fromBufferAttribute(position,ic);
      cross.crossVectors(b.sub(a),c.sub(a));
      assert.ok(cross.lengthSq()>1e-14,name+' has no zero-area triangles');
      normals.fromBufferAttribute(normal,ia).add(temp.fromBufferAttribute(normal,ib)).add(temp.fromBufferAttribute(normal,ic));
      assert.ok(cross.dot(normals)>0,name+' winding and lighting normals agree');
    }
    geometry.computeBoundingBox(); whole.union(geometry.boundingBox);
    triangles += index.count / 3;
  }
  const size=whole.getSize(new THREE.Vector3());
  assert.ok(size.x>.9&&size.x<1.2&&Math.abs(size.x-size.y)<.03,'round crown is visible but remains inside the collection reach');
  assert.ok(size.z>.18&&size.z<.4,'cap has a real skirt and recessed underside');
  assert.ok(triangles*5<30000,'all five detailed caps remain a modest geometry budget');
  Object.values(geometries).forEach(g=>g.dispose());
});

check('printed face, corrugated skirt and recessed liner are genuinely visible from their physical sides', () => {
  const geometries=createBottlecapGeometries(), model=createBottlecapModel(0,geometries);
  model.group.quaternion.identity(); model.group.updateMatrixWorld(true);
  const cast=(origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(model.group,true);
  const front=cast([0,0,2],[0,0,-1]), back=cast([0,0,-2],[0,0,1]), side=cast([2,0,-.09],[-1,0,0]);
  assert.ok(front.length&&back.length&&side.length,'front, back and skirt all render with normal backface culling');
  assert.match(front[0].object.name,/face/); assert.match(back[0].object.name,/liner/); assert.match(side[0].object.name,/skirt|rim/);
  assert.ok(front[0].point.z>back[0].point.z,'cork sits behind the printed crown');
  assert.ok(back[0].point.z>-.04,'underside is recessed inside the crown, above the hem');
  let sprites=0;model.group.traverse(o=>{if(o.isSprite)sprites++;});assert.equal(sprites,0,'the printed face cannot turn independently toward the camera');
  model.materials.forEach(m=>m.dispose());model.textures.forEach(t=>t.dispose());Object.values(geometries).forEach(g=>g.dispose());
});

check('the five cap designs remain distinct while sharing their physical geometry', () => {
  const geometries=createBottlecapGeometries(), models=Array.from({length:5},(_,i)=>createBottlecapModel(i,geometries));
  assert.equal(new Set(models.map(m=>m.group.userData.bottlecap.styleId)).size,5,'every pickup has a different vintage design');
  for(const model of models){
    for(const mesh of model.group.children.filter(c=>c.isMesh))assert.ok(Object.values(geometries).includes(mesh.geometry),'physical meshes share geometry across the warehouse');
    model.materials.forEach(m=>m.dispose());model.textures.forEach(t=>t.dispose());
  }
  Object.values(geometries).forEach(g=>g.dispose());
});

check('slow full rotation is independent of camera position and frame rate, and stops outside active play', () => {
  const a=new Collectibles(),b=new Collectibles();
  const ca=new THREE.PerspectiveCamera(),cb=new THREE.PerspectiveCamera();ca.lookAt(1,3,-2);cb.lookAt(-8,0,4);
  for(let i=0;i<120;i++)a.update(1/60,true,ca);
  for(let i=0;i<60;i++)b.update(1/30,true,cb);
  const capsA=a.items.filter(i=>i.definition.type==='cap'),capsB=b.items.filter(i=>i.definition.type==='cap');
  assert.equal(capsA.length,5);
  capsA.forEach((cap,i)=>assert.ok(cap.face.quaternion.angleTo(capsB[i].face.quaternion)<1e-6,'camera cannot billboard a physical cap'));
  const initial=capsA[0].face.quaternion.clone();
  const elapsed=a.elapsed;a.update(10,false,ca);
  assert.equal(a.elapsed,elapsed);assert.ok(capsA[0].face.quaternion.equals(initial),'inactive mode freezes orientation');
  assert.equal(a.group.visible,false);
  a.update(0,true,ca);assert.ok(capsA[0].face.quaternion.equals(initial),'zero-time resumes without a rotation jump');
  const g=new THREE.Group();setBottlecapRotation(g,0,0);const start=g.quaternion.clone();setBottlecapRotation(g,CAP_ROTATION_PERIOD,0);
  assert.ok(g.quaternion.angleTo(start)<1e-6,'exactly one physical revolution after the stated period');
  assert.ok(CAP_ROTATION_PERIOD>=18&&CAP_ROTATION_PERIOD<=40,'a cap turns slowly enough to read its face');
  a.dispose();b.dispose();
});

check('collecting fades every cap part, restart restores it, and a retired category stays removed', () => {
  const visuals=new Collectibles(),cap=visuals.items.find(i=>i.definition.id==='cap-1');
  visuals.sync(new Set(['cap-1']));visuals.update(.16,true);
  assert.ok(cap.root.visible&&!cap.ring.visible&&cap.root.scale.x>1);
  assert.ok(cap.materials.every(m=>m.transparent&&m.opacity<m.userData.restOpacity),'metal, label and cork fade together');
  const burst=cap.burst;visuals.sync(new Set(['cap-1']));assert.equal(cap.burst,burst,'same run snapshot does not restart the effect');
  visuals.sync(new Set());
  assert.ok(cap.root.visible&&cap.ring.visible);assert.equal(cap.root.scale.x,1);
  assert.ok(cap.materials.every(m=>m.opacity===m.userData.restOpacity&&m.transparent===m.userData.restTransparent));
  visuals.sync(new Set(['cap-1']));visuals.update(.4,true);assert.equal(cap.root.visible,false);
  visuals.sync(new Set(),new Set(['skate','tape']));visuals.update(30,true);
  assert.ok(visuals.items.filter(i=>i.definition.type==='cap').every(i=>!i.root.visible&&!i.ring.visible),'career-complete caps never reappear during animation');
  visuals.sync(new Set(),new Set(['caps']));visuals.update(0,true);
  assert.ok(visuals.items.filter(i=>i.definition.type==='cap').every(i=>i.root.visible&&i.ring.visible&&i.root.scale.x===1),'starting a fresh unfinished cap set restores all five');
  visuals.dispose();
});

check('disposing the pickup renderer releases each owned mesh, material and texture exactly once', () => {
  const parent=new THREE.Group(),visuals=new Collectibles(parent),resources=new Map();
  const watch=resource=>{if(resource&&!resources.has(resource)){resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}};
  visuals.group.traverse(object=>{
    if(object.geometry)watch(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
      watch(material);for(const value of Object.values(material))if(value?.isTexture)watch(value);
    }
  });
  visuals.dispose();assert.equal(parent.children.length,0);
  for(const [resource,count]of resources)assert.equal(count,1,`${resource.type||resource.constructor.name} is disposed once`);
});

console.log(`\n${passed}/${passed} bottle-cap checks passed.`);

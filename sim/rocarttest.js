// Environment changes must remain decorative and release their owned resources.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { createRocCityArt, dressRocCity } from '../src/roc-city-art.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function meshState(mesh) {
  const geometry = mesh.geometry;
  const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attr]) =>
    [name, { size:attr.itemSize, normalized:attr.normalized, type:attr.array.constructor.name, values:Array.from(attr.array) }]));
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return { id:mesh.uuid, geometry:geometry.uuid, matrix:mesh.matrixWorld.toArray(),
    layers:mesh.layers.mask, visible:mesh.visible, userData:mesh.userData,
    materials:materials.map(mat => ({ id:mat.uuid, side:mat.side })),
    shape:digest({attributes,index:geometry.index?Array.from(geometry.index.array):null,
      groups:geometry.groups,drawRange:geometry.drawRange}) };
}
function gameplayState(level) {
  level.group.updateMatrixWorld(true);
  const railIndex = new Map(level.rails.map((rail, index) => [rail,index]));
  const data = value => {
    if (railIndex.has(value)) return {railIndex:railIndex.get(value)};
    if (value?.isVector3) return value.toArray();
    if (value?.isMesh) return meshState(value);
    if (Array.isArray(value)) return value.map(data);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,data(item)]));
    return value;
  };
  return { colliders:level.colliders.map(meshState),
    // Include every scalar/vector property and the complete directed rail-link
    // graph. A changed endpoint or handoff is a gameplay change even if counts match.
    rails:level.rails.map(rail => Object.fromEntries(Object.entries(rail).map(([key,value]) => [key,data(value)]))) };
}
function resourcesIn(object, resources = new Set()) {
  object.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    if (node.isInstancedMesh) resources.add(node);
    for (const mat of Array.isArray(node.material)?node.material:node.material?[node.material]:[]) resources.add(mat);
  });
  return resources;
}
function includeTextures(resources) {
  for (const resource of [...resources]) if (resource.isMaterial) {
    for (const value of Object.values(resource)) if (value?.isTexture) resources.add(value);
  }
  return resources;
}
function watchDisposal(resources) {
  const counts = new Map();
  for (const resource of resources) {
    counts.set(resource,0);
    resource.addEventListener('dispose',() => counts.set(resource,counts.get(resource)+1));
  }
  return counts;
}

for (const lowfx of [false, true]) {
  const level = new RocCityLevel(), root = new THREE.Group(), scale = level.horizontalScale;
  assert.equal(scale,1.25,'Exercise the shipped horizontal scale');
  root.add(level.group);
  root.updateMatrixWorld(true);
  const original = gameplayState(level);
  const gameplayResources = includeTextures(resourcesIn(level.group));
  const gameplayDisposed = watchDisposal(gameplayResources);
  let previousDressing = null, totalOwned = 0;
  // Rebuild after disposal to catch retained cache entries or stale materials,
  // then repeat disposal to exercise menu/world teardown's idempotent contract.
  for (let cycle = 0; cycle < 2; cycle++) {
    const art = createRocCityArt(root, level, { lowfx });
    root.updateMatrixWorld(true);
    const dressing = level.group.getObjectByName('ROC City / Riverway landscape and I-490');
    assert.ok(dressing && dressing!==previousDressing,'A rebuilt world gets fresh scenery');
    assert.ok(dressRocCity(level,{lowfx})===dressing,'Repeated dressing reuses the active scene');
    art.update(1); art.update(120);
    assert.deepEqual(gameplayState(level),original,'Environment creation and animation preserve every collider and rail');
    const ray = new THREE.Raycaster();
    for (const x of [6,7,8,9,10,11,12,13,14]) {
      ray.set(new THREE.Vector3(x*scale,.3,24.5*scale),new THREE.Vector3(0,0,1));
      ray.far = 20*scale;
      assert.equal(ray.intersectObject(dressing,true).length,0,`Bridge props block the skating line at authored x=${x}`);
    }
    const registered = dressing.userData.materials;
    assert.ok(registered instanceof Set && registered.size>0,'Art exposes owned materials for teardown');
    dressing.traverse(node => {
      const materials=Array.isArray(node.material)?node.material:node.material?[node.material]:[];
      for (const material of materials) assert.ok(registered.has(material),`${material.name} must be registered`);
    });
    const owned = new Set(registered);
    resourcesIn(dressing,owned);
    // Lights and the sky are siblings of the scaled level rather than children
    // of its dressing group. Their separate geometry/material also need cleanup.
    for (const child of root.children) if (child!==level.group) resourcesIn(child,owned);
    includeTextures(owned);
    assert.ok([...owned].some(resource=>resource.isTexture),'Exercise real texture disposal in Node as well as browser rendering');
    for (const resource of owned) assert.ok(!gameplayResources.has(resource),'Decorative teardown must not own gameplay resources');
    const disposed = watchDisposal(owned);
    art.dispose(); art.dispose();
    for (const [resource,count] of disposed) assert.equal(count,1,`${resource.name||resource.type} is released exactly once`);
    for (const [resource,count] of gameplayDisposed) assert.equal(count,0,`Art teardown leaves gameplay ${resource.name||resource.type} alive`);
    assert.equal(dressing.parent,null,'Art cleanup detaches the owned group');
    assert.equal(root.children.length,1,'Cleanup also removes the sky and lights');
    assert.ok(root.children[0]===level.group,'The playable level remains attached');
    assert.deepEqual(gameplayState(level),original,'Environment disposal preserves every collider and rail');
    previousDressing=dressing; totalOwned+=owned.size;
  }
  console.log(`PASS: ${lowfx?'mobile':'desktop'} art preserves ${level.colliders.length} complete colliders / ${level.rails.length} linked rails, clear scaled promenade, and releases ${totalOwned} resources across rebuilds.`);
}

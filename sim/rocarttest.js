// Decorative bridge engineering must not occupy a playable skating line.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { createRocCityArt } from '../src/roc-city-art.js';

for (const lowfx of [false, true]) {
  const level = new RocCityLevel(), root = new THREE.Group();
  const colliders = level.colliders.length;
  root.add(level.group);
  const art = createRocCityArt(root, level, { lowfx });
  root.updateMatrixWorld(true);
  const dressing = level.group.getObjectByName('ROC City / Riverway landscape and I-490');
  const ray = new THREE.Raycaster();
  for (const x of [6,7,8,9,10,11,12,13,14]) {
    ray.set(new THREE.Vector3(x,.3,24.5),new THREE.Vector3(0,0,1));
    ray.far = 20;
    assert.equal(ray.intersectObject(dressing,true).length,0,`Bridge props block the skating line at x=${x}`);
  }
  assert.equal(level.colliders.length,colliders,'Scenery leaves gameplay collision targets unchanged');
  art.dispose();art.dispose();
  assert.equal(dressing.parent,null,'Art cleanup detaches the owned group');
  console.log(`PASS: ${lowfx?'mobile':'desktop'} bridge scenery leaves the promenade clear and disposes safely.`);
}

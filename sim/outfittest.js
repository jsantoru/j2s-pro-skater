// Clothing clearances across authored poses and interpolated IK: no dependence on screenshots.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const c = new Character(), p = new THREE.Vector3(), rest = new THREE.Vector3();
const state = extra => ({ state: 'ride', crouch: 0, landSquash: 0, pushing: 0,
  stance: 1, lean: 0, speed: 7, bailT: 0, trick: null, manualLean: 0, ...extra });
const hems = [];
c.root.updateMatrixWorld(true);
for (const [leg, name] of [[c.lLeg, 'Front jeans continuous hip'], [c.rLeg, 'Back jeans continuous hip']]) {
  const jeans = leg.hp.getObjectByName(name), attr = jeans.geometry.attributes;
  const samples = [];
  for (let i = 0; i < attr.position.count; i++) {
    const weight = attr.skinWeight;
    assert.ok(Math.abs(weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i) - 1) < 1e-6, 'Normalized four-bone denim weights');
    if (attr.position.getY(i) < -.773) {
      assert.equal(weight.getW(i), 1, 'Finished hem follows the foot orientation');
      p.fromBufferAttribute(attr.position, i); jeans.localToWorld(p); leg.an.worldToLocal(p);
      assert.ok(p.y > .05, 'Hem clears the top of the shoe');
      assert.ok(p.z < -.018, 'Hem does not obscure the forefoot and laces');
      samples.push([i, p.clone()]);
    }
  }
  assert.ok(samples.length > 100, 'Check the whole turned cuff, including its inner surface');
  hems.push({ jeans, leg, samples });
}
let cuffChecks = 0, frames = 0;
const poses = [ {}, { crouch: 1 }, { landSquash: 1 }, { pushing: 1 }, { pushing: 1, stance: -1 },
  { state: 'grind' }, { manualLean: 1 }, { manualLean: -1 },
  ...['Indy','Melon','Method','Nosegrab','Tailgrab','Judo'].map(name => ({ state: 'air', trick: { name, kind: 'grab' } })),
  ...['Kickflip','Heelflip','Impossible','360 Flip'].map(name => ({ state: 'air', trick: { name, kind: 'flip', t: .22, dur: .5 } })) ];
for (const pose of poses) for (let frame = 0; frame < 40; frame++) {
  c.update(state(pose), 1 / 60, frames++ / 60); c.root.updateMatrixWorld(true);
  for (const { jeans, leg, samples } of hems) for (const [i, expected] of samples) {
    jeans.getVertexPosition(i, p); jeans.localToWorld(p); leg.an.worldToLocal(p);
    assert.ok(p.distanceTo(expected) < 1e-6, 'Cuff cannot slide or rotate through the shoe during animation');
    cuffChecks++;
  }
}
const hood = c.root.getObjectByName('Lowered double-wall hood');
hood.geometry.computeBoundingBox();
let hairChecks = 0, minGap = Infinity;
for (const yaw of [-1.57, -.9, 0, .9, 1.57]) for (const pitch of [-.7, 0, .7]) {
  c.head.rotation.set(pitch, yaw, 0); c.root.updateMatrixWorld(true);
  const hair = c.head.getObjectByName('Short shaggy brown locks');
  for (let i = 0; i < hair.geometry.attributes.position.count; i++) {
    p.fromBufferAttribute(hair.geometry.attributes.position, i); hair.localToWorld(p); c.torso.worldToLocal(p);
    const gap = p.y - hood.geometry.boundingBox.max.y;
    minGap = Math.min(minGap, gap); assert.ok(gap > .015, 'Lowered hood stays below shaggy hair through head turns'); hairChecks++;
  }
}
// Pocket and hem share the same torso/pelvis deformation, without a rigid patch protruding.
const pocket = c.root.getObjectByName('Sewn kangaroo pocket');
assert.ok(pocket.isSkinnedMesh, 'Pocket bends with the hoodie');
c.root.traverse(o => {
  assert.ok(!['Continuous knee and calf', 'Continuous bare arm', 'Sewn cargo pocket'].includes(o.name), 'Covered skin and old cargo pockets are removed');
  if (!o.isSkinnedMesh) return;
  for (let i = 0; i < o.geometry.attributes.position.count; i += 11) {
    o.getVertexPosition(i, rest); assert.ok(rest.toArray().every(Number.isFinite), 'Finite cloth/skin deformation');
  }
});
console.log(`PASS: ${cuffChecks} cuff/shoe checks across ${frames} pose-blend frames; ${hairChecks} hair/hood checks (minimum gap ${(minGap*1000).toFixed(1)} mm); connected garment construction.`);

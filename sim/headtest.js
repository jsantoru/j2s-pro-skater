// Verify that skinning anchors the collar and follows the head through extreme turns.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const character = new Character();
const surface = character.root.getObjectByName('Continuous head and neck');
assert.ok(surface?.isSkinnedMesh, 'Head and neck must be a single skinned surface');
const positions = surface.geometry.attributes.position;
const weights = surface.geometry.attributes.skinWeight;
const v = new THREE.Vector3(), expected = new THREE.Vector3();
let checked = 0;
character.root.position.set(12, 3, -7);
character.root.rotation.set(0.1, 0.7, -0.2);
character.torso.rotation.set(0.4, -0.2, 0.15);
for (const yaw of [-90, -55, 0, 55, 90]) for (const pitch of [-45, 0, 45]) {
  character.head.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0.15);
  character.root.updateMatrixWorld(true); surface.skeleton.update();
  for (let i = 0; i < positions.count; i++) {
    const w = weights.getY(i);
    assert.ok(Math.abs(weights.getX(i) + w - 1) < 1e-6, 'Normalized skin weights');
    surface.applyBoneTransform(i, v.fromBufferAttribute(positions, i)).applyMatrix4(surface.matrixWorld);
    assert.ok(v.toArray().every(Number.isFinite), 'Finite deformed vertex');
    if (w === 0) expected.fromBufferAttribute(positions, i).applyMatrix4(character.torso.matrixWorld);
    else if (w === 1) {
      expected.fromBufferAttribute(positions, i); expected.y -= 0.5;
      expected.applyMatrix4(character.head.matrixWorld);
    } else continue;
    assert.ok(v.distanceTo(expected) < 1e-5, w === 0 ? 'Collar must stay anchored' : 'Face must follow the head');
    checked++;
  }
}
console.log(`PASS: ${checked} collar/face vertex checks across 15 head turns; all skin weights and deformed vertices valid.`);

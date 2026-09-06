// The crouching hands should hang outside the knees, not sweep behind the hips.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const character = new Character();
for (const stance of [1, -1]) {
  const skater = { state: 'ride', crouch: 1, landSquash: 0, pushing: 0, stance,
    lean: 0, speed: 5, bailT: 0, trick: null, grind: null };
  for (let i = 0; i < 240; i++) character.update(skater, 1 / 60, 0);
  character.root.updateMatrixWorld(true);
  for (const [side, arm, leg] of [[1, character.lArm, character.lLeg], [-1, character.rArm, character.rLeg]]) {
    const hand = character.body.worldToLocal(arm.el.localToWorld(new THREE.Vector3(0, -0.3, 0)));
    const knee = character.body.worldToLocal(leg.kn.getWorldPosition(new THREE.Vector3()));
    const elbow = character.body.worldToLocal(arm.el.getWorldPosition(new THREE.Vector3()));
    assert.ok(Math.abs(hand.y - knee.y) < 0.14, 'Hand should hang near knee height');
    assert.ok(Math.abs(hand.z - knee.z) < 0.12, 'Hand should be beside knee, not behind body');
    assert.ok((hand.x - knee.x) * side > 0.06, 'Hand should clear outside of knee');
    assert.ok((hand.x - knee.x) * side < 0.23, 'Arms should not spread too wide');
    assert.ok(hand.y < elbow.y - 0.2, 'Forearm should hang downward');
  }
}
console.log('PASS: both crouching hands hang beside the knees in regular and fakie stances.');

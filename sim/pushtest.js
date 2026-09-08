// Check the entire stroke, rather than a single authored pose: looking ahead,
// knees tracking the stride, the leading foot planted and the trailing sole clear.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const point = new THREE.Vector3(), direction = new THREE.Vector3(), q = new THREE.Quaternion();
let checked = 0;
for (const stance of [1, -1]) for (const lean of [-.3, 0, .3]) {
  const c = new Character();
  c.root.position.set(4, 2, -7); c.root.rotation.set(.16, .8, -.12);
  const state = { state: 'ride', crouch: 0, landSquash: 0, pushing: 1, stance, lean, speed: 4, bailT: 0, trick: null, manualLean: 0 };
  const support = stance > 0 ? c.lLeg : c.rLeg, trailing = stance > 0 ? c.rLeg : c.lLeg;
  const local = (object, value) => { object.localToWorld(value); return c.root.worldToLocal(value); };
  const facing = object => direction.set(0, 0, 1).applyQuaternion(object.getWorldQuaternion(q)).applyQuaternion(c.root.getWorldQuaternion(q).invert());
  for (let i = 0; i < 300; i++) {
    const before = JSON.stringify(state);
    c.update(state, 1 / 60, i / 60); c.root.updateMatrixWorld(true);
    assert.equal(JSON.stringify(state), before, 'Animation leaves gameplay unchanged');
    if (i < 60) continue;
    assert.ok(facing(c.head).z * stance > .92, 'Eyes face travel through the push cycle');
    assert.ok(facing(c.torso).z * stance > .90, 'Chest opens toward travel');
    assert.ok(facing(c.hips).z * stance > .8, 'Pelvis opens so knees can stride forward');
    assert.ok(facing(support.an).z * stance > .98, 'Leading shoe pivots forward on the grip');
    local(support.an, point.set(0, -.0405, 0));
    assert.ok(Math.abs(point.x) < .001 && Math.abs(point.y - .132) < .001, 'Support sole stays on grip');
    assert.ok(Math.abs(point.z - (stance > 0 ? .235 : -.255)) < .001, 'Support stays over leading truck');
    local(trailing.an, point.set(0, -.0405, 0));
    assert.ok(point.x < -.25 && point.y >= .002, 'Trailing sole clears deck and floor');
    if (c.pushPhase % (2 * Math.PI) < Math.PI) assert.ok(Math.abs(point.y - .003) < .001, 'Stroke contacts the ground');
    const pushKnee = local(trailing.kn, new THREE.Vector3());
    const supportKnee = local(support.kn, new THREE.Vector3());
    assert.ok(supportKnee.x - pushKnee.x > .10, 'Knees stay in separate stride lanes');
    checked++;
  }
  // Release at the back of the stroke: resetting phase here would teleport the
  // free foot to the front of the board before its contact blend could decay.
  c.pushPhase = 2.9; c.update(state, 0, 0); c.root.updateMatrixWorld(true);
  const previous = local(trailing.an, new THREE.Vector3());
  state.pushing = 0;
  for (let i = 0; i < 90; i++) {
    c.update(state, 1 / 60, i / 60); c.root.updateMatrixWorld(true);
    local(trailing.an, point.set(0, 0, 0));
    assert.ok(point.distanceTo(previous) < .1, 'Stopping a push recovers without a foot teleport');
    previous.copy(point);
  }
  c.root.updateMatrixWorld(true);
  for (const leg of [c.lLeg, c.rLeg]) {
    local(leg.an, point.set(0, -.0405, 0));
    assert.ok(Math.abs(point.y - .132) < .001 && Math.abs(point.x) < .001, 'Both feet return to the deck');
  }
  assert.ok(Math.abs(c.hips.rotation.y) < .001, 'Pelvis returns to riding stance');
}
console.log(`PASS: ${checked} push frames in regular/fakie and turns: forward gaze, chest/pelvis, leading shoe, ground contact, separate knees and recovery.`);

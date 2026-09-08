// Deck contact under changing pose blends and arbitrary ramp/world transforms.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const c = new Character();
const sk = (extra = {}) => ({ state: 'ride', crouch: 0, landSquash: 0, pushing: 0,
  stance: 1, lean: 0, speed: 7, bailT: 0, trick: null, manualLean: 0, ...extra });
const point = new THREE.Vector3(), normal = new THREE.Vector3(), q = new THREE.Quaternion();
const seams = [];
c.root.updateMatrixWorld(true);
for (const name of ['Front shorts continuous hip', 'Back shorts continuous hip']) {
  const mesh = c.root.getObjectByName(name), p = mesh.geometry.attributes.position;
  assert.ok(mesh?.isSkinnedMesh, 'Shorts must deform continuously into the hips');
  const samples = [];
  for (let i = 0; i < p.count; i++) if (mesh.geometry.attributes.skinWeight.getZ(i) === 1) {
    const bind = new THREE.Vector3().fromBufferAttribute(p, i);
    mesh.localToWorld(bind); c.hips.worldToLocal(bind); samples.push([i, bind]);
  }
  assert.ok(samples.length > 25, 'Hip seam has a firmly anchored band');
  seams.push([mesh, samples]);
}
const seamPoint = new THREE.Vector3(), seamExpected = new THREE.Vector3();
let contacts = 0, frames = 0;
c.root.position.set(13, 2.8, -6); c.root.rotation.set(0.31, -0.9, 0.22);
function step(state) {
  const before = JSON.stringify(state);
  c.update(state, 1 / 60, frames++ / 60); c.root.updateMatrixWorld(true);
  assert.equal(JSON.stringify(state), before, 'Rendering must not mutate gameplay state');
  c.root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite), 'Finite rig transforms'));
  for (const [mesh, samples] of seams) {
    mesh.skeleton.update();
    for (const [i, bind] of samples) {
      seamPoint.fromBufferAttribute(mesh.geometry.attributes.position, i);
      mesh.applyBoneTransform(i, seamPoint); mesh.localToWorld(seamPoint);
      seamExpected.copy(bind); c.hips.localToWorld(seamExpected);
      assert.ok(seamPoint.distanceTo(seamExpected) < 1e-5, 'Shorts hip seam must stay attached during leg flex');
    }
  }
}
function contact(leg, z, label) {
  leg.ankle.getWorldPosition(point); leg.an.worldToLocal(point);
  assert.ok(point.z < -0.04 && point.z > -0.08, `${label}: ankle enters the heel half, not the shoe centre`);
  point.set(0, -0.0405, 0); leg.an.localToWorld(point); c.board.worldToLocal(point);
  assert.ok(Math.abs(point.x) < 0.001, `${label}: shoe centered across deck: ${point.x}`);
  assert.ok(Math.abs(point.z - z) < 0.001, `${label}: stance stays over trucks: ${point.z}`);
  assert.ok(Math.abs(point.y - 0.132) < 0.001, `${label}: sole touches grip: ${point.y}`);
  normal.set(0, 1, 0).applyQuaternion(leg.an.getWorldQuaternion(q));
  normal.applyQuaternion(c.board.getWorldQuaternion(q).invert());
  assert.ok(normal.y > 0.9999, `${label}: sole follows deck tilt`); contacts++;
}
for (const stance of [1, -1]) for (const lean of [-0.6, 0, 0.6]) {
  for (const manualLean of [-1, -0.4, 0, 0.4, 1]) for (const crouch of [0, 0.4, 1, 0]) {
    for (let i = 0; i < 20; i++) {
      step(sk({ stance, lean, manualLean, crouch }));
      contact(c.lLeg, 0.235, 'front'); contact(c.rLeg, -0.255, 'back');
    }
  }
}
for (const state of ['grind', 'air']) for (const name of [null, 'Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Method', 'Stalefish', 'Judo', 'Airwalk']) {
  const s = sk({ state, trick: name ? { kind: 'grab', name } : null });
  for (let i = 0; i < 60; i++) {
    step(s); contact(c.lLeg, 0.235, name); contact(c.rLeg, -0.255, name);
  }
}
for (let i = 0; i < 240; i++) {
  step(sk({ pushing: 1 })); contact(c.lLeg, 0.235, 'pushing front');
  if (i > 60 && c.pushPhase % (Math.PI * 2) < Math.PI) {
    point.set(0, -0.0405, 0); c.rLeg.an.localToWorld(point); c.root.worldToLocal(point);
    assert.ok(Math.abs(point.y - 0.003) < 0.001, 'Push stroke contacts ground');
    assert.ok(point.x < -0.25, 'Push clears toe edge');
  }
}
for (let i = 0; i < 90; i++) step(sk());
contact(c.rLeg, -0.255, 'push recovery');
for (let i = 0; i < 40; i++) step(sk({ pushing: 1 }));
step(sk({ state: 'air' }));
contact(c.lLeg, 0.235, 'push to ollie'); contact(c.rLeg, -0.255, 'push to ollie');
for (const name of ['Kickflip', 'Heelflip', 'Pop Shove-it', 'Impossible', '360 Flip', 'Varial Heelflip', 'Hardflip', 'Inward Heelflip']) {
  for (let i = 0; i <= 60; i++) {
    step(sk({ state: 'air', trick: { kind: 'flip', name, t: i / 60, dur: 1 } }));
    if (i === 30) assert.equal(c.contactWeight, 0, 'Feet release for board rotation');
  }
  assert.equal(c.contactWeight, 1, 'Feet catch after completed flip');
  for (const leg of [c.lLeg, c.rLeg]) {
    point.set(0, -0.0405, 0); leg.an.localToWorld(point); c.board.worldToLocal(point);
    assert.ok(Math.abs(point.y - 0.132) < 0.001, `${name}: catch contacts grip`);
    assert.ok(Math.abs(point.x) < 0.001, `${name}: catch centered`);
  }
}
console.log(`PASS: ${contacts} deck contacts and anchored hip seams across ${frames} frames, ramp transforms, regular/fakie, crouch, carve, manuals, grinds, grabs, push and all flip catches; gameplay inputs unchanged.`);

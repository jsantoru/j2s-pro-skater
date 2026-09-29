// Outdoor paths and boundaries must agree with the visible ground, including
// the lower bridge surroundings. These checks use physical rays and real input.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { createRocCityArt } from '../src/roc-city-art.js';
import { trailPoints } from '../src/roc-city-surroundings.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

// Explicit authoring scale keeps these map/trail coordinate fixtures meaningful.
const level = new RocCityLevel({ horizontalScale: 1 }), root = new THREE.Group(), ray = new THREE.Raycaster();
root.add(level.group);
const art = createRocCityArt(root, level, { lowfx: true }); root.updateMatrixWorld(true);
const dressing = level.group.getObjectByName('ROC City / Riverway landscape and I-490');
let passed = 0, failed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`PASS: ${name}`); }
  catch (error) { failed++; console.error(`FAIL: ${name}\n${error.stack}`); }
}
function support(x, z) {
  ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)); ray.far = 10;
  return ray.intersectObjects(level.colliders, false)[0];
}
function rider(position, direction, speed = 6) {
  const skater = new Skater(level, () => .5);
  skater.pos.fromArray(position); skater.heading.fromArray(direction); skater.facing.copy(skater.heading);
  skater.speed = speed; skater.vel.copy(skater.heading).multiplyScalar(speed);
  return skater;
}

test('Riverway trail has physical support at the rendered grade along its complete route', () => {
  for (const point of trailPoints(level.layout).slice(1, -1)) {
    const physical = support(point.x, point.z);
    assert(physical, `Missing trail support at ${point.x}, ${point.z}`);
    assert(Math.abs(physical.point.y - level.layout.trailY) < .002, `Incorrect trail grade at ${point.x}, ${point.z}: ${physical.point.y}`);
    ray.set(new THREE.Vector3(point.x, 2, point.z), new THREE.Vector3(0, -1, 0)); ray.far = 10;
    const visible = ray.intersectObject(dressing, true).find(hit => hit.object.name === 'Riverway asphalt');
    assert(visible, 'Every supported trail point is visibly paved');
    assert(Math.abs(visible.point.y - physical.point.y) < .002, 'Rendered trail and collision support match');
  }
});

test('A rider can follow the underbridge trail without sinking or crossing bridge piers', () => {
  const skater = rider([-3, level.layout.trailY, 25], [0, 0, 1], 6);
  const bails = []; skater.events.bail = reason => bails.push(reason);
  let minimum = Infinity, maximum = -Infinity;
  for (let i = 0; i < 300; i++) {
    skater.update(1 / 120, { ...makeState(), push: 1 });
    minimum = Math.min(minimum, skater.pos.y); maximum = Math.max(maximum, skater.pos.y);
    ray.set(skater.pos.clone().add(new THREE.Vector3(0, .6, 0)), new THREE.Vector3(0, 0, 1)); ray.far = .6;
    assert.equal(ray.intersectObject(dressing, true).filter(hit => hit.object.name === 'Weathered bridge concrete').length, 0, 'Visible pier intrudes into the trail');
  }
  assert.deepEqual(bails, []); assert(skater.pos.z > 45);
  assert(Math.abs(minimum - level.layout.trailY) < .002 && Math.abs(maximum - level.layout.trailY) < .002);
});

test('River water has no invisible skate floor and the visible railing stops a ground approach', () => {
  for (const x of [-42, -44, -47]) for (const z of [-20, 0, 20]) assert.equal(support(x, z), undefined, `Floating ground over water at ${x}, ${z}`);
  const skater = rider([-38, -.04, 0], [-1, 0, 0], 6), collisions = [];
  skater.events.bail = reason => collisions.push({ reason, x: skater.pos.x });
  for (let i = 0; i < 120 && !collisions.length; i++) skater.update(1 / 120, { ...makeState(), push: 1 });
  assert.equal(collisions[0]?.reason, 'wall', 'The existing visible river boundary blocks a ground rider');
  assert(collisions[0].x > -40.8, 'Collision occurs before crossing the river railing');
});

test('Substantial bridge columns block riding through them while the promenade stays clear', () => {
  const columns = level.colliders.filter(mesh => mesh.name === 'I-490 bridge column');
  assert.equal(columns.length, art.pierBounds.length);
  for (const bounds of art.pierBounds) {
    const physical = columns.find(mesh => mesh.position.x === bounds.x && mesh.position.z === bounds.z);
    assert(physical, 'Every visible column has a physical counterpart');
    const size = new THREE.Box3().setFromObject(physical).getSize(new THREE.Vector3());
    assert(Math.abs(size.x - bounds.width) < 1e-5 && Math.abs(size.y - bounds.height) < 1e-5 && Math.abs(size.z - bounds.depth) < 1e-5);
  }
  const skater = rider([1.5, -.9, 31], [0, 0, 1], 6), collisions = [];
  skater.events.bail = reason => collisions.push({ reason, z: skater.pos.z });
  for (let i = 0; i < 120 && !collisions.length; i++) skater.update(1 / 120, { ...makeState(), push: 1 });
  assert.equal(collisions[0]?.reason, 'wall');
  assert(collisions[0].z < 34.15, 'The rider cannot pass into the visible concrete column');
  for (const x of [6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    ray.set(new THREE.Vector3(x, .3, 24.5), new THREE.Vector3(0, 0, 1)); ray.far = 20;
    assert.equal(ray.intersectObjects(level.colliders, false).length, 0, `Column support blocks the promenade at x=${x}`);
  }
});

test('A rider who clears the river boundary falls and safely returns instead of skating over water', () => {
  const skater = rider([-44, 1, 0], [-1, 0, 0], 2), bails = [];
  skater.state = 'air'; skater.events.bail = reason => bails.push(reason);
  for (let i = 0; i < 300; i++) skater.update(1 / 120, makeState());
  assert(bails.includes('void'), 'Unsupported water triggers the existing safe return');
  assert(skater.pos.distanceTo(level.spawn.pos) < 3, 'Return is near the active park spawn');
});

art.dispose();
console.log(`${passed} ROC surroundings checks passed${failed ? `, ${failed} failed` : ''}.`);
if (failed) process.exitCode = 1;

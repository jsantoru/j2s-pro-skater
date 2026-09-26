// Verify real collision geometry and skating approaches, not teleported pickups.
// Usage: node sim/collectibletest.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';
import { GoalProgress, GoalRun, PICKUPS } from '../src/goals.js';
import { Collectibles } from '../src/collectibles.js';

const level = new Level();
const DT = 1 / 120;
const routes = {
  'letter-s': { from: [-4, 0, 14], heading: [1, 0, 0], speed: 0 },
  'letter-k': { from: [12, 0, 5], heading: [1, 0, 0] },
  'letter-a': { from: [14, 0, -9.5], heading: [0, 0, -1] },
  'letter-t': { from: [-15, 0, -5.5], heading: [0, 0, -1] },
  'letter-e': { from: [-27, 0, 4], heading: [1, 0, 0] },
  'cap-1': { from: [-21, 0, 15], heading: [1, 0, 0] },
  'cap-2': { from: [-24, 0, 2], heading: [0, 0, -1] },
  'cap-3': { from: [17, 0, -12], heading: [0, 0, -1] },
  'cap-4': { from: [-8, 0, 3.1], heading: [1, 0, 0] },
  'cap-5': { from: [21, 0, 3], heading: [1, 0, 0] },
  'secret-tape': { from: [13, 0, 17], heading: [1, 0, 0] },
};

for (const pickup of PICKUPS) {
  const ray = new THREE.Raycaster(new THREE.Vector3(pickup.position[0], 7, pickup.position[2]), new THREE.Vector3(0, -1, 0));
  const surface = ray.intersectObjects(level.colliders, false)[0];
  assert(surface, `${pickup.id} has a supporting rideable surface`);
  assert(Math.abs(surface.point.y - pickup.surfaceY) < 0.03, `${pickup.id} floor ring matches collision surface at ${surface.point.y}`);
  assert(surface.face.normal.clone().applyQuaternion(surface.object.quaternion).y > 0.9, `${pickup.id} has level footing below the pickup`);

  const route = routes[pickup.id];
  assert(route, `${pickup.id} has an actual skating approach`);
  const skater = new Skater(level);
  skater.pos.fromArray(route.from); skater.heading.fromArray(route.heading); skater.facing.copy(skater.heading);
  skater.speed = route.speed ?? 7;
  skater.vel.copy(skater.heading).multiplyScalar(skater.speed);
  const goals = new GoalRun(new GoalProgress(null)); goals.start({ skater });
  const input = makeState(); input.push = 1;
  let bails = 0, elapsed = 0;
  skater.events.bail = () => bails++;
  while (elapsed < 5 && !goals.collected.has(pickup.id)) {
    skater.update(DT, input); goals.update(skater); elapsed += DT;
  }
  assert.equal(bails, 0, `${pickup.id} can be reached without bailing`);
  assert(goals.collected.has(pickup.id), `${pickup.id} is reachable through normal skating physics (${skater.pos.toArray()})`);
  if (pickup.id === 'letter-e') assert.equal(skater.state, 'air', 'E takes a real kicker launch');
  if (pickup.id === 'secret-tape') assert(skater.pos.y >= 1.5, 'Tape requires reaching the loading deck');
  console.log(`PASS ${pickup.id}: reached in ${elapsed.toFixed(2)}s, board at y=${skater.pos.y.toFixed(2)}`);
}

// The E cannot be picked up by rolling underneath it on the ground.
{
  const goals = new GoalRun(new GoalProgress(null));
  const skater = { state: 'ride', pos: new THREE.Vector3(-18, 0, 4) };
  goals.start({ skater }); goals.update(skater);
  assert(!goals.collected.has('letter-e'));
}

// Exercise run restart during pickup fade and visibility outside goal runs.
{
  const parent = new THREE.Group(), visuals = new Collectibles(parent);
  assert.equal(visuals.group.visible, false);
  assert.equal(visuals.items.length, 11);
  visuals.update(DT, true);
  visuals.sync(new Set(['letter-s'])); visuals.update(0.12, true);
  assert(visuals.items[0].root.visible && !visuals.items[0].ring.visible);
  visuals.sync(new Set());
  assert(visuals.items[0].root.visible && visuals.items[0].ring.visible);
  assert(visuals.items[0].materials.every(mat => mat.opacity === mat.userData.restOpacity));
  visuals.sync(new Set(['letter-s'])); visuals.update(0.4, true);
  assert.equal(visuals.items[0].root.visible, false);
  visuals.update(DT, false); assert.equal(visuals.group.visible, false);
  visuals.dispose(); assert.equal(parent.children.length, 0);
}

console.log('All collectible reachability and rendering lifecycle checks passed.');

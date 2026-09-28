// End-to-end goal routes driven only with ordinary skating controls.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';
import { GoalProgress, GoalRun } from '../src/goals.js';

const DT = 1 / 120;
const level = new Level();
const skater = new Skater(level, () => 0.5);
const goals = new GoalRun(new GoalProgress(null)); goals.start({ skater });
const route = [
  [0, 14, 'letter-s'], [3, 9], [11, 6.6], [20, 5, 'letter-k'],
  [17, -6], [14, -17.5, 'letter-a'], [14, -13.5], [-15, -13.5, 'letter-t'],
  [-25, -13.5], [-29, -9], [-29, -3], [-28, 1], [-25, 4], [-21, 4], [-18, 4, 'letter-e'],
];
let index = 0, time = 0, bails = 0;
skater.events.bail = () => bails++;
while (time < 120 && !goals.completed.has('skate')) {
  const [x, z, pickup] = route[index];
  const dx = x - skater.pos.x, dz = z - skater.pos.z;
  const angle = Math.atan2(skater.heading.x * dz - skater.heading.z * dx, skater.heading.x * dx + skater.heading.z * dz);
  const input = makeState();
  input.steer = skater.state === 'ride' ? THREE.MathUtils.clamp(angle * 1.8, -1, 1) : 0;
  const desiredSpeed = index >= 13 ? 8.5 : Math.abs(angle) > 0.65 ? 3.5 : 7;
  input.push = skater.speed < desiredSpeed ? 1 : 0;
  input.brake = skater.speed > desiredSpeed + 0.4 ? 0.5 : 0;
  skater.update(DT, input); goals.update(skater); time += DT;
  if (pickup ? goals.collected.has(pickup) : Math.hypot(dx, dz) < 1.2) {
    console.log(`Route ${index}: ${pickup || 'waypoint'} at ${time.toFixed(2)}s`);
    index = Math.min(route.length - 1, index + 1);
  }
}
assert(goals.completed.has('skate'), `SKATE reachable in one run; stuck at waypoint ${index} (${skater.pos.toArray()})`);
assert.equal(bails, 0, 'Whole SKATE route completes without a bail');
console.log(`PASS: all S-K-A-T-E letters from spawn in ${time.toFixed(2)}s with ordinary controls.`);

// A line of charged vert airs, grabbing, flipping and spinning. No score/physics
// mutations: every point comes from the same input state a keyboard/controller sends.
{
  const rider = new Skater(level, () => 0.5);
  rider.pos.set(-4, 0, -14); rider.heading.set(0, 0, -1); rider.facing.copy(rider.heading); rider.speed = 9;
  let previousOllie = false, previousGrab = false, bails = 0, bestCombo = 0, landings = 0, elapsed = 0;
  rider.events.bail = () => bails++;
  rider.events.land = points => { bestCombo = Math.max(bestCombo, points); if (points) landings++; };
  while (elapsed < 100 && rider.score < 25000) {
    const input = makeState(); input.push = 1;
    input.ollie = rider.state === 'ride' && rider.normal.y < 0.25 && rider.pos.y > 2 && rider.vel.y > 0;
    input.olliePressed = input.ollie && !previousOllie;
    input.ollieReleased = !input.ollie && previousOllie;
    previousOllie = input.ollie;
    input.grab = rider.state === 'air' && rider.airTime > 0.05 && rider.airTime < 0.5;
    input.grabPressed = input.grab && !previousGrab; previousGrab = input.grab;
    input.flipPressed = rider.state === 'air' && rider.airTime > 0.53 && rider.airTime < 0.55;
    input.spinRight = rider.state === 'air' && rider.spinDeg < 359;
    rider.update(DT, input); elapsed += DT;
  }
  console.log(`Score route: ${rider.score} in ${elapsed.toFixed(2)}s; best combo ${bestCombo}; ${landings} landings, ${bails} bails.`);
  assert(rider.score >= 25000 && elapsed < 100, 'Sick Score leaves time to reach the half pipe from spawn');
  assert.equal(bails, 0);
}

{
  const rider = new Skater(level, () => 0.5);
  rider.pos.set(-4, 0, -14); rider.heading.set(0, 0, -1); rider.facing.copy(rider.heading); rider.speed = 9;
  let previousOllie = false, previousGrab = false, flickStep = 0, manualTime = 0, bails = 0, elapsed = 0, linked = false;
  rider.events.bail = () => bails++;
  while (elapsed < 10 && rider.score === 0) {
    const input = makeState(); input.push = 1;
    input.ollie = !linked && rider.state === 'ride' && rider.normal.y < 0.25 && rider.pos.y > 2 && rider.vel.y > 0;
    input.grab = !linked && rider.state === 'air' && rider.airTime > 0.05 && rider.airTime < 0.5;
    input.flipPressed = !linked && rider.state === 'air' && rider.airTime > 0.53 && rider.airTime < 0.55;
    input.spinRight = !linked && rider.state === 'air' && rider.spinDeg < 359;
    if (rider.revertWindow > 0) input.revertRightPressed = true;
    if (rider.revertLink > 0 && flickStep < 3) input.stickY = [0, -1, 1][flickStep++];
    if (rider.manual) {
      linked = true; manualTime += DT;
      input.ollie = manualTime > 0.12 && manualTime < 0.25;
    }
    input.olliePressed = input.ollie && !previousOllie;
    input.ollieReleased = !input.ollie && previousOllie;
    previousOllie = input.ollie;
    input.grabPressed = input.grab && !previousGrab; previousGrab = input.grab;
    rider.update(DT, input); elapsed += DT;
  }
  console.log(`Combo route: ${rider.score} in ${elapsed.toFixed(2)}s; manual linked ${linked}; ${bails} bails.`);
  assert(linked && rider.score >= 3000, 'Big Combo is attainable with a vert air, revert, manual and clean ollie out');
  assert.equal(bails, 0);
}

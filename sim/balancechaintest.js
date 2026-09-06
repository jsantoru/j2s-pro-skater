// Exercise actual grind/manual entry, pop, landing, bank, bail and restart boundaries.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

const level = new Level(), up = new THREE.Vector3(0, 1, 0), input = makeState();
const fields = ['x', 'v', 't', 'applied', 'bias', 'biasTarget', 'biasT', 'armed'];
const snapshot = b => Object.fromEntries(fields.map(k => [k, b[k]]));
const fresh = () => new Skater(level, () => 0.85);
function enter(s, kind) {
  s.speed = 8; s.trick = null;
  if (kind === 'grind') {
    const rail = level.rails[0];
    s.vel.copy(rail.dir).multiplyScalar(8);
    s.startGrind({ rail, t: 0.4, point: rail.a.clone().addScaledVector(rail.dir, rail.len * 0.4) }, input);
    return s.balance;
  }
  s.manualIntent = kind === 'nose' ? 'nose' : 'tail';
  s.vel.set(8, -2, 0); s.facing.set(1, 0, 0); s.spinDeg = 0; s.airTime = 0.4; s.popped = true;
  s.land(new THREE.Vector3(-10, 0, 14), up);
  assert.ok(s.manual, 'Buffered landing starts a manual');
  return s.manualBalance;
}
for (const [a, b] of [['grind', 'grind'], ['manual', 'manual'], ['manual', 'nose'], ['grind', 'manual'], ['manual', 'grind']]) {
  const s = fresh(), first = enter(s, a);
  assert.equal(first.x, 0, 'First balance of a fresh combo starts centered');
  Object.assign(first, { x: -0.73, v: -0.4, t: 2.1, applied: 0.15, bias: -0.3, biasTarget: 0.6, biasT: 0.27, armed: true, difficulty: 0.3 });
  const before = snapshot(first);
  s.pop();
  assert.equal(first.active, false, 'Balance pauses after popping');
  for (let i = 0; i < 10; i++) first.update(1 / 60, 0, 8);
  assert.deepEqual(snapshot(first), before, 'Air time cannot improve or worsen the saved needle');
  const next = enter(s, b);
  assert.deepEqual(snapshot(next), before, `${a} -> ${b}: inherit position, momentum, time and wander`);
  assert.equal(next.settling, false, 'No new grace window on a chained entry');
  assert.ok(next.difficulty >= 0.3, 'Changing balance type cannot reduce accumulated difficulty');
  assert.equal(next.armed, true, 'Corrections remain available immediately when a chain resumes');
  assert.equal(s.chainBalance, next);
  next.update(1 / 120, 0, 8);
  assert.notEqual(next.x, before.x, 'Resumed meter moves on the first frame');
  assert.ok(s.combo.multiplier >= 2, 'Transition remains in one scoring combo');
  console.log(`PASS: ${a} -> ${b} carries the complete balance state.`);
}
{
  const s = fresh(); enter(s, 'manual'); s.manualBalance.x = 0.56; s.manualBalance.t = 2;
  s.endManual(false); s.startManual('nose');
  assert.equal(s.manualBalance.x, 0.56, 'Manual to nose-manual on the ground keeps the needle');
  assert.equal(s.manualBalance.t, 2, 'Switching manual type does not renew grace');
  s.endManual(true);
  assert.ok(s.score > 0, 'Banked manual still awards its score');
  assert.equal(s.chainBalance, null);
  assert.equal(enter(s, 'grind').x, 0, 'A banked combo starts the next one centered');
  s.balance.x = 0.8; s.pop();
  s.vel.set(8, -2, 0); s.facing.set(1, 0, 0); s.manualIntent = null; s.spinDeg = 0;
  s.land(new THREE.Vector3(-10, 0, 14), up);
  assert.equal(s.chainBalance, null, 'An ordinary landing banks and clears balance memory');
  assert.equal(s.balance.x, 0); assert.equal(s.manualBalance.x, 0);
  enter(s, 'manual'); s.manualBalance.x = 0.95; s.bail('balance');
  assert.equal(s.chainBalance, null, 'Bail clears the chain');
  assert.equal(s.manualBalance.active, false); assert.equal(s.balance.active, false);
  assert.equal(s.manualBalance.x, 0); assert.equal(s.balance.x, 0);
  s.reset(); enter(s, 'grind'); s.balance.x = -0.8; s.reset();
  assert.equal(s.chainBalance, null); assert.equal(enter(s, 'manual').x, 0, 'Restart begins centered');
  console.log('PASS: banking, ordinary landings, bails and restarts reset the next combo.');
}
// Even sub-grace hops must eventually tip an uncorrected rider over.
for (const kinds of [['grind'], ['manual'], ['grind', 'manual']]) {
  const s = fresh(); let fell = false, balancedTime = 0, entries = 0;
  for (; entries < 80 && !fell; entries++) {
    const meter = enter(s, kinds[entries % kinds.length]);
    for (let i = 0; i < 12; i++) {
      balancedTime += 1 / 120;
      if (!meter.update(1 / 120, 0, 8)) { s.bail('balance'); fell = true; break; }
    }
    if (!fell) s.pop();
  }
  assert.ok(fell, `${kinds.join('/')} hops must not give unlimited free balance`);
  assert.ok(balancedTime < 5, 'Short hops retain cumulative instability');
  console.log(`PASS: uncorrected ${kinds.join('/')} hopping fails after ${balancedTime.toFixed(2)}s of balance (${entries} entries).`);
}

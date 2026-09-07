import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Input, makeState } from '../src/input.js';
import { Skater } from '../src/skater.js';
import { Character } from '../src/character.js';
import { Level } from '../src/level.js';

const dt = 1 / 120, up = new THREE.Vector3(0, 1, 0);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial());
floor.rotation.x = -Math.PI / 2; floor.updateMatrixWorld(true);
const level = { spawn: {pos: new THREE.Vector3(), heading: new THREE.Vector3(0, 0, 1)}, colliders: [floor], rails: [] };
const neutral = extra => Object.assign(makeState(), {autoPush: false}, extra);
const advance = (s, seconds, extra = {}) => { for (let i = 0; i < Math.ceil(seconds / dt); i++) s.update(dt, neutral(extra)); };
function fresh() {
  const s = new Skater(level, () => 0.5);
  s.state = 'air'; s.airTime = 0.5; s.vertAir = true; s.popped = true;
  s.pos.set(0, 0.04, 0); s.vel.set(0, -2, 8); s.autoTurn = 0;
  s.combo.add('Kickflip', 100); s.airTrickIndex = 0;
  return s;
}
const touch = s => s.land(new THREE.Vector3(), up);
const press = (s, dir) => s.update(dt, neutral(dir > 0 ? {revertRightPressed: true} : {revertLeftPressed: true}));

// Real input polling: standard button 6 = L2/LT/ZL; button 7 = R2/RT/ZR.
const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  const pad = {index: 0, connected: true, id: 'Standard mapped controller', axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, () => ({value: 0, pressed: false}))};
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {getGamepads: () => [pad]}});
  const input = new Input();
  for (const [button, edge] of [[6, 'revertLeftPressed'], [7, 'revertRightPressed']]) {
    pad.buttons[button].value = 0.7;
    assert.equal(input.poll(dt)[edge], true, 'Analog trigger generates a rising edge');
    assert.equal(input.state.push, 0); assert.equal(input.state.brake, 0, 'Triggers no longer accelerate or brake');
    assert.equal(input.poll(dt)[edge], false, 'Holding trigger never repeats');
    pad.buttons[button].value = 0; input.poll(dt);
    pad.buttons[button].pressed = true;
    assert.equal(input.poll(dt)[edge], true, 'Digital Switch-style triggers also work');
    pad.buttons[button].pressed = false; input.poll(dt);
  }
  input.latched.add('KeyZ'); assert.equal(input.poll(dt).revertLeftPressed, true);
  input.poll(dt); input.latched.add('KeyC'); assert.equal(input.poll(dt).revertRightPressed, true);
  pad.axes[1] = -1; assert.equal(input.poll(dt).push, 1, 'Stick still pushes');
  pad.axes[1] = 1; assert.equal(input.poll(dt).brake, 1, 'Stick still brakes');
} finally {
  if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
  else delete globalThis.navigator;
}

for (const dir of [-1, 1]) for (const stance of [-1, 1]) {
  const s = fresh(); s.stance = stance; s.facing.set(0, 0, stance);
  touch(s); const speed = s.speed, heading = s.heading.clone();
  press(s, dir);
  assert.equal(s.stance, -stance); assert.equal(s.revertDir, dir);
  assert.ok(s.heading.dot(heading) > 0.999, 'Revert never reverses travel');
  assert.ok(s.speed < speed, 'Wheels scrub speed');
  assert.equal(s.combo.multiplier, 2); assert.equal(s.combo.points, 100, 'Revert adds multiplier, not base points');
  assert.equal(s.score, 0, 'Combo remains live');
  press(s, -dir); press(s, dir);
  assert.equal(s.combo.tricks.filter(t => t.name === 'Revert').length, 1, 'Only one revert per landing');
  advance(s, 0.03); s.update(dt, neutral({stickY: -1})); s.update(dt, neutral({stickY: 1}));
  assert.ok(s.manual, 'Revert connects to manual'); assert.equal(s.combo.multiplier, 3);
  assert.equal(s.landingPending, false); assert.equal(s.revertLink, 0);
}
{
  const s = fresh(); press(s, 1);
  assert.equal(s.combo.tricks.at(-1).name, 'Revert', 'A pre-touchdown trigger is buffered through real collision');
}
{
  const s = fresh(); s.pos.y = 10; s.vel.y = 0; press(s, 1); advance(s, 0.3);
  s.vel.set(0, -2, 8); touch(s);
  assert.equal(s.revertT, 0, 'Early trigger expires');
  advance(s, 0.2); assert.equal(s.score, 100, 'Without a timed revert the landing banks normally');
}
{
  const s = fresh(); touch(s); advance(s, 0.1); press(s, -1);
  assert.ok(s.revertLink > 0, 'Late tap inside landing window works');
  advance(s, 1); assert.equal(s.score, 200, 'Missing manual window banks once');
  const score = s.score; press(s, 1); advance(s, 0.3); assert.equal(s.score, score);
}
{
  const s = fresh(); touch(s); advance(s, 0.21); press(s, 1);
  assert.equal(s.score, 100); assert.ok(s.revertT > 0, 'Late trigger still changes stance');
  assert.equal(s.combo.active, false, 'Late stance change cannot reopen a banked combo');
}
for (const reverted of [false, true]) {
  const s = fresh(); touch(s); if (reverted) press(s, 1);
  s.pop(); assert.equal(s.combo.active, false, 'No chaining by hopping through an unbanked landing');
  assert.equal(s.score, reverted ? 200 : 100);
}
{
  const s = fresh(); s.startManual('tail'); Object.assign(s.manualBalance, {x: 0.58, v: -0.2, t: 2.5});
  s.pop(); s.vertAir = true; s.airTime = 0.5; s.vel.set(0, -2, 8); s.facing.set(0, 0, 1);
  touch(s); press(s, 1); advance(s, 0.03);
  s.update(dt, neutral({stickY: -1})); s.update(dt, neutral({stickY: 1}));
  assert.ok(s.manual); assert.ok(s.manualBalance.t >= 2.5, 'Revert never renews balance grace');
  assert.ok(Math.abs(s.manualBalance.x) > 0.5, 'Revert/manual keeps the previous needle');
}
{
  const s = fresh(); s.manualIntent = 'tail'; s.revertBuffer = {dir: 1, time: 0.1};
  s.land(new THREE.Vector3(), new THREE.Vector3(0, 0.7, 0.71414284).normalize());
  assert.equal(s.manual, null, 'Do not balance on a steep transition');
  s.normal.copy(up); s.heading.set(0, 0, 1); s.update(dt, neutral());
  assert.ok(s.manual, 'Buffered manual survives revert until the transition flattens');
}
for (const kind of ['unfinished', 'sideways', 'bail', 'restart']) {
  const s = fresh(); s.revertBuffer = {dir: 1, time: 0.1};
  if (kind === 'unfinished') s.trick = {kind: 'flip', t: 0.1, dur: 0.5};
  if (kind === 'sideways') s.facing.set(1, 0, 0);
  if (kind === 'bail') s.bail('wall');
  else if (kind === 'restart') s.reset();
  else touch(s);
  assert.equal(s.revertT, 0, `${kind} cannot revert`);
  assert.equal(s.combo.tricks.some(t => t.name === 'Revert'), false);
}

for (const dir of [-1, 1]) for (const speed of [0, 1, 8]) {
  const s = new Skater(level, () => 0.5); s.speed = speed;
  const heading = s.heading.clone();
  for (const stance of [-1, 1, -1, 1]) {
    press(s, dir); assert.equal(s.stance, stance, 'Ground taps toggle regular and switch at any speed');
    assert.ok(s.heading.dot(heading) > 0.999, 'Ground stance change preserves travel');
    assert.ok(s.revertT > 0); assert.equal(s.revertLink, 0); assert.equal(s.combo.multiplier, 0);
    advance(s, 0.35);
  }
  assert.equal(s.score, 0, 'Repeated ground taps award no points');
}
for (const kind of ['flat', 'tiny', 'slow']) {
  const s = fresh(); s.vertAir = false; s.revertBuffer = {dir: -1, time: 0.1};
  if (kind === 'tiny') { s.popped = false; s.airTime = 0.05; s.combo.reset(); }
  if (kind === 'slow') s.vel.set(0, -1, 1);
  touch(s); assert.equal(s.stance, -1, `${kind} touchdown consumes the buffered stance change`);
  assert.ok(s.revertT > 0); assert.equal(s.combo.active, false);
  assert.equal(s.revertLink, 0, 'Flat landing does not gain a ramp combo window');
}
{
  const s = new Skater(level, () => 0.5); s.speed = 8; s.startManual('tail');
  Object.assign(s.manualBalance, {x: 0.58, v: -0.2, t: 2.5});
  const mult = s.combo.multiplier; press(s, 1);
  assert.equal(s.stance, -1); assert.ok(s.manual, 'Manual stance changes stay on two wheels');
  assert.equal(s.combo.multiplier, mult, 'Manual pivots do not farm multipliers');
  assert.ok(s.manualBalance.t >= 2.5 && Math.abs(s.manualBalance.x) > 0.5, 'Manual pivot preserves balance');
}
{
  const s = fresh(); touch(s); press(s, 1); advance(s, 0.3);
  const remaining = s.revertLink; press(s, -1);
  assert.ok(s.revertLink < remaining, 'A second stance change cannot refresh the manual link window');
  assert.equal(s.combo.multiplier, 2, 'Only the first timed landing revert scores');
  advance(s, 0.7); assert.equal(s.score, 200);
}

// Both animation directions must remain finite and leave both feet on the rotating deck.
const character = new Character();
for (const dir of [-1, 1]) {
  const s = fresh(); touch(s); s.updateModelQuat(1); press(s, dir);
  let previous = s.modelQuat.clone();
  for (let i = 0; i < 100; i++) {
    s.update(dt, neutral()); character.root.position.copy(s.pos); character.root.quaternion.copy(s.modelQuat);
    character.update(s, dt, i * dt); character.root.updateMatrixWorld(true);
    assert.ok(s.modelQuat.toArray().every(Number.isFinite));
    assert.ok(previous.angleTo(s.modelQuat) < 0.3, 'No instant 180-degree visual snap'); previous.copy(s.modelQuat);
    for (const leg of [character.lLeg, character.rLeg]) {
      const foot = leg.an.getWorldPosition(new THREE.Vector3()); character.board.worldToLocal(foot);
      assert.ok(Math.abs(foot.x) < 0.06 && Math.abs(foot.z) < 0.31, 'Feet follow the sliding board');
    }
  }
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(s.modelQuat);
  assert.ok(facing.dot(s.heading) < -0.99, 'Slide completes facing fakie');
}

// Full warehouse route: ride up the quarter pipe, grab, land, revert and manual out.
const warehouse = new Level();
for (const dir of [-1, 1]) {
  const s = new Skater(warehouse, () => 0.5);
  s.pos.set(-20, 0, 6); s.heading.set(-1, 0, 0); s.facing.copy(s.heading); s.speed = 10;
  const events = []; let prevOllie = false, prevGrab = false, flickStep = 0;
  for (const name of ['touchdown', 'revert', 'manualStart', 'bail']) s.events[name] = () => events.push([name, s.pos.toArray(), s.normal.y]);
  for (let i = 0; i < 720 && !s.manual; i++) {
    const inp = neutral({push: 1, dir8: 'W'});
    inp.ollie = s.state === 'ride' && s.normal.y < 0.25 && s.pos.y > 2 && s.vel.y > 0;
    inp.olliePressed = inp.ollie && !prevOllie; inp.ollieReleased = !inp.ollie && prevOllie; prevOllie = inp.ollie;
    inp.grab = s.state === 'air' && s.airTime > 0.05 && s.airTime < 0.5;
    inp.grabPressed = inp.grab && !prevGrab; prevGrab = inp.grab;
    if (s.revertWindow > 0) inp[dir > 0 ? 'revertRightPressed' : 'revertLeftPressed'] = true;
    if (s.revertLink > 0 && flickStep < 3) { inp.stickY = [0, -1, 1][flickStep++]; }
    s.update(dt, inp);
  }
  assert.ok(s.manual, `Actual quarter pipe connects grab -> revert -> manual: ${JSON.stringify(events)}`);
  assert.ok(s.combo.text.includes('Melon') && s.combo.text.includes('Revert'), s.combo.text);
  assert.equal(s.score, 0, 'Real ramp route stays in one scoring chain');
  assert.equal(events.filter(e => e[0] === 'bail').length, 0);
}
console.log('PASS: trigger/keyboard edges, ground stance toggles at any speed, timed ramp reverts, manual pivots/links, balance carryover, no score farming, invalid landings and planted 180-degree animation.');

// Timer boundary and last-combo overtime checks. Run with: node sim/sessiontest.js
import assert from 'node:assert/strict';
import { SessionClock } from '../src/session.js';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

let failures = 0, checks = 0;
function check(name, fn) {
  checks++;
  try { fn(); console.log('PASS: ' + name); }
  catch (error) { failures++; console.error('FAIL: ' + name + '\n  ' + error.stack); }
}
const clearSkater = () => ({ state: 'ride', combo: { tricks: [] }, trick: null });
const comboSkater = () => ({ state: 'air', combo: { tricks: ['Kickflip'] }, trick: null });

check('clock starts inactive and ends exactly at its duration', () => {
  const clock = new SessionClock(2);
  assert.equal(clock.active, false);
  assert.equal(clock.advance(5, clearSkater()), false);
  assert.equal(clock.remaining, 2);
  clock.start();
  assert.equal(clock.advance(1, clearSkater()), false);
  assert.equal(clock.remaining, 1);
  assert.equal(clock.advance(1, clearSkater()), true);
  assert.equal(clock.remaining, 0);
  assert.equal(clock.active, false);
  assert.equal(clock.overtime, false);
  assert.equal(clock.advance(1, clearSkater()), false, 'end signal is emitted once');
});

check('120 seconds expires on the exact 14,400th fixed physics step', () => {
  const clock = new SessionClock().start();
  for (let i = 0; i < 14399; i++) assert.equal(clock.advance(1 / 120, clearSkater()), false);
  assert.equal(clock.advance(1 / 120, clearSkater()), true);
  assert.equal(clock.remaining, 0);
});

check('an unresolved final combo gets overtime and landing closes it', () => {
  const clock = new SessionClock(1).start();
  const skater = comboSkater();
  assert.equal(clock.advance(1, skater), false);
  assert.equal(clock.remaining, 0);
  assert.equal(clock.overtime, true);
  assert.equal(clock.overtimeRemaining, 20);
  assert.equal(clock.advance(0.5, skater), false);
  assert.equal(clock.overtimeRemaining, 19.5);
  skater.combo.tricks.length = 0; // skater emits banked landing before clearing it
  skater.state = 'ride';
  assert.equal(clock.advance(1 / 120, skater), true);
  assert.equal(clock.active, false);
});

check('an in-flight trick qualifies even before it enters the combo', () => {
  const clock = new SessionClock(1).start();
  const skater = clearSkater();
  skater.state = 'air';
  skater.trick = { name: 'Kickflip' };
  assert.equal(clock.advance(1, skater), false);
  assert.equal(clock.overtime, true);
  skater.trick = null;
  skater.combo.tricks.push('Kickflip');
  assert.equal(clock.advance(0.1, skater), false);
  skater.combo.tricks.length = 0;
  assert.equal(clock.advance(0.1, skater), true);
});

check('airborne without a trick or combo does not create overtime', () => {
  const clock = new SessionClock(1).start();
  const skater = clearSkater();
  skater.state = 'air';
  assert.equal(clock.advance(1, skater), true);
});

check('a scored airborne spin gets time to land, but an unscored rotation does not', () => {
  for (const spinDeg of [-360, -150, 150, 360]) {
    const clock = new SessionClock(1).start();
    const skater = { ...clearSkater(), state: 'air', spinDeg };
    assert.equal(clock.advance(1, skater), false);
    assert.equal(clock.overtime, true);
    skater.state = 'ride';
    assert.equal(clock.advance(1 / 120, skater, { banked: true }), true);
  }
  for (const spinDeg of [-149, 0, 149, NaN, Infinity]) {
    const clock = new SessionClock(1).start();
    assert.equal(clock.advance(1, { ...clearSkater(), state: 'air', spinDeg }), true);
  }
  assert.equal(new SessionClock(1).start().advance(1, { ...clearSkater(), spinDeg: 360 }), true,
    'the previous air\'s spin cannot reopen overtime while rolling');
});

check('banking during regulation leaves time to start another combo', () => {
  const clock = new SessionClock(10).start();
  assert.equal(clock.advance(1, comboSkater(), { banked: true }), false);
  assert.equal(clock.remaining, 9);
  assert.equal(clock.active, true);
  const free = new SessionClock().start('free');
  assert.equal(free.advance(1000, comboSkater(), { banked: true }), false);
  assert.equal(free.active, true);
});

check('actual ramp landing cannot extend overtime by banking and starting a queued flip in the same step', () => {
  const level = new Level(), dt = 1 / 120;
  for (const alreadyOvertime of [false, true]) {
    const skater = new Skater(level, () => 0.5);
    skater.pos.set(-20, 0, 6); skater.heading.set(-1, 0, 0); skater.facing.copy(skater.heading); skater.speed = 10;
    let previousOllie = false, previousGrab = false;
    // Ride a real quarter pipe, grab, and touch down with the normal revert window.
    for (let step = 0; step < 720 && !skater.landingPending; step++) {
      const input = makeState(); input.push = 1;
      input.ollie = skater.state === 'ride' && skater.normal.y < 0.25 && skater.pos.y > 2 && skater.vel.y > 0;
      input.olliePressed = input.ollie && !previousOllie;
      input.ollieReleased = !input.ollie && previousOllie; previousOllie = input.ollie;
      input.grab = skater.state === 'air' && skater.airTime > 0.05 && skater.airTime < 0.5;
      input.grabPressed = input.grab && !previousGrab; previousGrab = input.grab;
      skater.update(dt, input);
    }
    assert(skater.landingPending && skater.combo.total > 0 && skater.score === 0, 'real vert air has an unbanked landing');
    const earned = skater.combo.total;
    const clock = new SessionClock(2 * dt).start();
    if (alreadyOvertime) {
      assert.equal(clock.advance(2 * dt, skater), false);
      assert.equal(clock.overtime, true);
    }
    skater.update(dt, Object.assign(makeState(), { ollie: true, olliePressed: true, flipPressed: true }));
    assert.equal(clock.advance(dt, skater), false);
    let banked = false;
    skater.events.land = points => { if (points > 0) banked = true; };
    skater.update(dt, Object.assign(makeState(), { ollieReleased: true }));
    assert.equal(skater.score, earned, 'the final earned points are kept');
    assert.equal(skater.trick?.name, 'Kickflip', 'release has genuinely begun a separate queued trick');
    assert.equal(banked, true);
    assert.equal(clock.advance(dt, skater, { banked }), true, 'settling the final combo ends the session');
    assert.equal(clock.active, false);
    assert.equal(clock.advance(dt, skater), false, 'later steps cannot continue the new combo');
  }
});

check('bail at the buzzer or during overtime immediately ends the run', () => {
  for (const alreadyOvertime of [false, true]) {
    const clock = new SessionClock(1).start();
    const skater = comboSkater();
    if (alreadyOvertime) clock.advance(1, skater);
    skater.state = 'bail';
    assert.equal(clock.advance(1, skater), true);
    assert.equal(clock.active, false);
    assert.equal(clock.overtime, false);
  }
});

check('overtime ends at twenty seconds even if a manual/combo continues', () => {
  const clock = new SessionClock(1).start();
  const skater = comboSkater();
  skater.state = 'ride';
  skater.manual = {};
  clock.advance(1, skater);
  for (let i = 0; i < 2399; i++) assert.equal(clock.advance(1 / 120, skater), false);
  assert.equal(clock.advance(1 / 120, skater), true);
  assert.equal(clock.overtimeRemaining, 0);
  assert.equal(clock.active, false);
});

check('a step crossing expiration consumes only its excess from overtime', () => {
  const clock = new SessionClock(0.5).start();
  assert.equal(clock.advance(1, comboSkater()), false);
  assert.equal(clock.remaining, 0);
  assert.equal(clock.overtimeRemaining, 19.5);
  assert.equal(clock.advance(30, comboSkater()), true);
  assert.equal(clock.overtimeRemaining, 0);
});

check('zero, negative and nonfinite deltas leave both clocks unchanged', () => {
  const clock = new SessionClock(1).start();
  for (const dt of [0, -1, NaN, Infinity, -Infinity, null, undefined, '1']) {
    assert.equal(clock.advance(dt, clearSkater()), false);
    assert.equal(clock.remaining, 1);
  }
  clock.advance(1, comboSkater());
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.equal(clock.advance(dt, clearSkater()), false);
    assert.equal(clock.overtimeRemaining, 20);
    assert.equal(clock.active, true);
  }
});

check('free skate never times out or starts overtime', () => {
  const clock = new SessionClock().start('free');
  assert.equal(clock.remaining, Infinity);
  for (const skater of [clearSkater(), comboSkater(), { state: 'bail' }]) {
    assert.equal(clock.advance(1e10, skater), false);
    assert.equal(clock.active, true);
    assert.equal(clock.overtime, false);
  }
});

check('restart resets both clocks after normal, overtime and free sessions', () => {
  const clock = new SessionClock(5).start();
  clock.advance(6, comboSkater());
  assert.equal(clock.overtimeRemaining, 19);
  clock.start();
  assert.equal(clock.remaining, 5);
  assert.equal(clock.overtimeRemaining, 20);
  assert.equal(clock.overtime, false);
  assert.equal(clock.active, true);
  clock.start('free');
  clock.start('goals');
  assert.equal(clock.remaining, 5);
  assert.equal(clock.advance(5, clearSkater()), true);
  clock.start();
  assert.equal(clock.active, true);
  assert.equal(clock.remaining, 5);
});

check('finish stops future advancement and preserves the remaining time', () => {
  const clock = new SessionClock(5).start();
  clock.advance(2, clearSkater());
  clock.finish();
  assert.equal(clock.advance(100, comboSkater()), false);
  assert.equal(clock.remaining, 3);
  assert.equal(clock.active, false);
  assert.equal(clock.overtime, false);
});

check('zero duration expires on the first positive step and invalid durations use default', () => {
  const clock = new SessionClock(0).start();
  assert.equal(clock.advance(0, clearSkater()), false);
  assert.equal(clock.advance(0.1, clearSkater()), true);
  for (const duration of [-1, NaN, Infinity, '2', null]) assert.equal(new SessionClock(duration).duration, 120);
});

console.log(`\n${checks - failures}/${checks} session checks passed.`);
if (failures) process.exitCode = 1;

// Career/run boundary, banked scoring, swept collection and storage regression checks.
// Run with: node sim/goaltest.js
import assert from 'node:assert/strict';
import { GOALS, PICKUPS, GOAL_STORAGE_KEY, GoalProgress, GoalRun } from '../src/goals.js';

let failures = 0, checks = 0;
function check(name, fn) {
  checks++;
  try { fn(); console.log('PASS: ' + name); }
  catch (error) { failures++; console.error('FAIL: ' + name + '\n  ' + error.stack); }
}
function storage(initial) {
  const values = new Map(initial === undefined ? [] : [[GOAL_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function rider(x, y = 0, z = 0, state = 'ride') { return { pos: { x, y, z }, state }; }
function visit(run, pickup) {
  const [x, y, z] = pickup.position;
  const skater = rider(x, y - 0.85, z);
  // A move across the map is intentionally ignored; a valid subsequent contact counts.
  return [...run.update(skater), ...run.update(skater)];
}
function fresh(pickups = PICKUPS) { return new GoalRun(new GoalProgress(null), pickups).start(); }
const tinyPickup = { id: 'letter-s', goalId: 'skate', label: 'S', position: [0, 0.85, 0], radius: 0.2 };

check('seven goals and eleven unique pickups share valid definitions', () => {
  assert.equal(GOALS.length, 7);
  assert.equal(new Set(GOALS.map(goal => goal.id)).size, 7);
  assert.equal(PICKUPS.length, 11);
  assert.equal(new Set(PICKUPS.map(pickup => pickup.id)).size, 11);
  for (const goal of GOALS) {
    assert.ok(goal.target > 0 && goal.title && goal.description);
    if (goal.type === 'collection') assert.equal(PICKUPS.filter(pickup => pickup.goalId === goal.id).length, goal.target);
  }
  for (const pickup of PICKUPS) {
    assert.ok(GOALS.some(goal => goal.id === pickup.goalId));
    assert.ok(pickup.position.length === 3 && pickup.position.every(Number.isFinite));
    assert.ok(pickup.radius > 0 && pickup.hint);
  }
});

check('missing and malformed saves start an empty career', () => {
  for (const data of [undefined, '', '{broken', 'null', '42', '[]', '"x"', '{"completed":{}}']) {
    assert.deepEqual(new GoalProgress(storage(data)).snapshot(), { completed: [], bestScore: 0, bestCombo: 0 });
  }
});

check('saves whitelist goal IDs, deduplicate and reject nonnumeric records', () => {
  const saved = JSON.stringify({ completed: ['caps', 'unknown', 'caps', null, 'high-score', '__proto__'], bestScore: '10000', bestCombo: -5 });
  assert.deepEqual(new GoalProgress(storage(saved)).snapshot(), { completed: ['high-score', 'caps'], bestScore: 0, bestCombo: 0 });
  const valid = new GoalProgress(storage(JSON.stringify({ bestScore: 2000.8, bestCombo: 123.2 })));
  assert.equal(valid.bestScore, 2001);
  assert.equal(valid.bestCombo, 123);
});

check('blocked reads and writes preserve an in-memory career', () => {
  const progress = new GoalProgress({ getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } });
  const run = new GoalRun(progress).start();
  run.bankCombo(10000);
  assert.equal(progress.bestScore, 10000);
  assert.ok(progress.has('pro-score'));
  run.start();
  assert.ok(progress.has('pro-score'));
});

check('a throwing global localStorage getter is also guarded', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('blocked getter'); } });
    assert.deepEqual(new GoalProgress().snapshot(), { completed: [], bestScore: 0, bestCombo: 0 });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

check('score tiers complete once as landed payouts accumulate', () => {
  const run = fresh();
  assert.deepEqual(run.bankCombo(2500).map(event => event.goal.id), ['high-score']);
  assert.deepEqual(run.bankCombo(7500).map(event => event.goal.id), ['pro-score', 'combo']);
  assert.deepEqual(run.bankCombo(15000).map(event => event.goal.id), ['sick-score']);
  assert.deepEqual(run.bankCombo(1000), []);
  assert.equal(run.snapshot().score, 26000);
  assert.equal(run.snapshot().bestCombo, 15000);
});

check('live combo points, skater totals and a bail cannot bank a goal', () => {
  const run = fresh([]);
  const skater = { ...rider(0), score: 10000, combo: { points: 50000, multiplier: 10, total: 500000 } };
  run.update(skater);
  skater.state = 'bail';
  run.update(skater);
  assert.equal(run.score, 0);
  assert.equal(run.bestCombo, 0);
  assert.deepEqual(run.progress.snapshot(), { completed: [], bestScore: 0, bestCombo: 0 });
});

check('Big Combo needs one landed combo, not the sum of smaller payouts', () => {
  const run = fresh();
  run.bankCombo(2999);
  run.bankCombo(2999);
  assert.ok(!run.completed.has('combo'));
  assert.deepEqual(run.bankCombo(3000).map(event => event.goal.id), ['combo']);
});

check('invalid payouts do not affect score or completion', () => {
  const run = fresh();
  for (const value of [NaN, Infinity, -Infinity, -1000, 0, '10000', null, undefined]) assert.deepEqual(run.bankCombo(value), []);
  assert.equal(run.score, 0);
  run.bankCombo(Number.MAX_VALUE);
  assert.equal(run.score, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(run.bestCombo));
});

check('swept collection catches fast passes even when neither endpoint overlaps', () => {
  const run = fresh([tinyPickup]);
  run.update(rider(-1));
  const events = run.update(rider(1));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'pickup');
  assert.equal(events[0].pickup.id, 'letter-s');
  assert.deepEqual(run.update(rider(0)), []);
  assert.equal(run.count('skate'), 1);
});

check('large teleport segments cannot collect along their path or endpoint', () => {
  const endpoint = { ...tinyPickup, id: 'letter-k', label: 'K', position: [10, 0.85, 0] };
  const run = fresh([tinyPickup, endpoint]);
  run.update(rider(-10));
  assert.deepEqual(run.update(rider(10)), []);
  assert.equal(run.collected.size, 0);
  assert.equal(run.update(rider(10))[0].pickup.id, 'letter-k');
  assert.ok(!run.collected.has('letter-s'));
});

check('bails cannot collect or create a sweep when the rider recovers', () => {
  const run = fresh([tinyPickup]);
  run.update(rider(-1));
  assert.deepEqual(run.update(rider(0, 0, 0, 'bail')), []);
  assert.deepEqual(run.update(rider(1)), []);
  assert.equal(run.collected.size, 0);
  assert.equal(run.update(rider(-1))[0].type, 'pickup');
});

check('elevated E needs an ollie while ground-height letters collect while riding', () => {
  const run = fresh();
  const letterE = PICKUPS.find(pickup => pickup.id === 'letter-e');
  run.update(rider(letterE.position[0], 0, letterE.position[2]));
  assert.ok(!run.collected.has('letter-e'));
  run.update(rider(letterE.position[0], 0.5, letterE.position[2], 'air'));
  assert.ok(run.collected.has('letter-e'));
  visit(run, PICKUPS.find(pickup => pickup.id === 'letter-s'));
  assert.deepEqual(run.snapshot().letters, ['S', 'E']);
});

check('partial collections reset between runs while earned career goals persist immediately', () => {
  const store = storage();
  const progress = new GoalProgress(store);
  const run = new GoalRun(progress).start();
  const letters = PICKUPS.filter(pickup => pickup.goalId === 'skate');
  for (const pickup of letters.slice(0, 4)) visit(run, pickup);
  assert.ok(!progress.has('skate'));
  run.start();
  visit(run, letters[4]);
  assert.equal(run.count('skate'), 1);
  assert.ok(!progress.has('skate'));
  for (const pickup of letters.slice(0, 4)) visit(run, pickup);
  assert.ok(progress.has('skate'));
  assert.ok(new GoalProgress(store).has('skate'), 'completion saved before run ends');
  const result = run.finish();
  assert.deepEqual(result.newlyCompleted, ['skate']);
  run.start();
  assert.equal(run.collected.size, 0);
  assert.equal(run.completed.size, 0);
  assert.equal(run.snapshot().goals.find(goal => goal.id === 'skate').careerComplete, true);
  const events = letters.flatMap(pickup => visit(run, pickup));
  const repeated = events.filter(event => event.type === 'goal');
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].newCareer, false);
  assert.deepEqual(run.snapshot().newlyCompleted, []);
});

check('caps and tape finish separately and repeated contact does not double-count', () => {
  const run = fresh();
  for (const pickup of PICKUPS.filter(pickup => pickup.goalId !== 'skate')) visit(run, pickup);
  assert.equal(run.snapshot().caps, 5);
  assert.equal(run.snapshot().tape, true);
  assert.deepEqual(run.snapshot().completed, ['caps', 'tape']);
  assert.deepEqual(visit(run, PICKUPS.find(pickup => pickup.goalId === 'tape')), []);
});

check('clock expiration stops pickups but allows the last combo until finish', () => {
  const run = fresh([tinyPickup]);
  run.update(rider(-1));
  assert.deepEqual(run.update(rider(0), { collect: false }), []);
  assert.equal(run.collected.size, 0);
  assert.ok(run.bankCombo(3000).some(event => event.goal.id === 'combo'));
  const result = run.finish();
  assert.equal(result.active, false);
  assert.deepEqual(run.update(rider(0)), []);
  assert.deepEqual(run.bankCombo(3000), []);
  assert.equal(run.score, 3000);
});

check('free skate cannot collect or award career goals and records', () => {
  const run = fresh([tinyPickup]).start({ mode: 'free' });
  assert.deepEqual(run.update(rider(0)), []);
  assert.deepEqual(run.bankCombo(25000), []);
  assert.equal(run.score, 25000);
  assert.equal(run.collected.size, 0);
  assert.deepEqual(run.progress.snapshot(), { completed: [], bestScore: 0, bestCombo: 0 });
});

check('best records survive restarts and reloads and never decrease', () => {
  const store = storage();
  const run = new GoalRun(new GoalProgress(store)).start();
  run.bankCombo(9000);
  run.bankCombo(5000);
  run.finish();
  run.start();
  run.bankCombo(500);
  const progress = new GoalProgress(store);
  assert.equal(progress.bestScore, 14000);
  assert.equal(progress.bestCombo, 9000);
  assert.ok(progress.has('pro-score'));
  assert.ok(!progress.has('sick-score'));
});

check('snapshot arrays cannot mutate the run or saved career', () => {
  const run = fresh();
  run.bankCombo(3000);
  const result = run.snapshot();
  result.completed.length = 0;
  result.goals[0].complete = false;
  const saved = run.progress.snapshot();
  saved.completed.length = 0;
  assert.ok(run.completed.has('high-score'));
  assert.ok(run.progress.has('high-score'));
});

console.log(`\n${checks - failures}/${checks} goal checks passed.`);
if (failures) process.exitCode = 1;

// Pins the scoring maths to THPS-SCORING-SYSTEM.md: base values, degradation, the switch bonus,
// the per-trick multiplier and the spin table. Run with: npm run sim:score
import assert from 'node:assert/strict';
import {
  FLIPS, GRABS, GRINDS, MANUALS, HOLD, SWITCH_BONUS, DEGRADE,
  Combo, degradeFactor, spinPoints, spinMult, trickLabel,
} from '../src/tricks.js';
import { HighScores } from '../src/highscores.js';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS: ' + name); }
  catch (e) { failures++; console.log('FAIL: ' + name + '\n  ' + e.message); }
}
const values = (table) => Object.fromEntries(Object.values(table).map(([n, p]) => [n, p]));

check('flip tricks all sit on the 100-point flip base', () => {
  for (const [name, pts] of Object.entries(values(FLIPS))) assert.equal(pts, 100, name);
});

check('grabs use the weak / standard / advanced tiers', () => {
  const g = values(GRABS);
  for (const n of ['Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Method', 'Stalefish']) assert.equal(g[n], 300, n);
  assert.equal(g.Judo, 350);      // advanced grab
  assert.equal(g.Airwalk, 50);    // weak grab
});

check('grinds use the basic / advanced / slide tiers', () => {
  const g = values(GRINDS);
  for (const n of ['50-50', 'Nosegrind', '5-0']) assert.equal(g[n], 100, n);
  for (const n of ['Crooked Grind', 'Overcrook', 'Smith Grind', 'Feeble Grind']) assert.equal(g[n], 125, n);
  for (const n of ['Boardslide', 'Lipslide']) assert.equal(g[n], 200, n);
});

check('manuals are 100-point connective tissue', () => {
  assert.deepEqual(values(MANUALS), { Manual: 100, 'Nose Manual': 100 });
});

check('degradation runs 100 / 75 / 50 / 25 / 10 percent and floors there', () => {
  assert.deepEqual(DEGRADE, [1, 0.75, 0.5, 0.25, 0.1]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(degradeFactor), [1, 0.75, 0.5, 0.25, 0.1, 0.1, 0.1]);
  const c = new Combo();
  const pts = [0, 1, 2, 3, 4, 5].map(() => c.add('Kickflip', 100).points);
  assert.deepEqual(pts, [100, 75, 50, 25, 10, 10]);
});

check('every trick in the chain adds one to the multiplier', () => {
  const c = new Combo();
  for (let i = 1; i <= 20; i++) { c.add('Manual', 100); assert.equal(c.multiplier, i); }
});

check('the combo total is the sum of the tricks times the multiplier', () => {
  const c = new Combo();
  c.add('Boardslide', 200); c.add('Manual', 100); c.add('Kickflip', 100);
  assert.equal(c.points, 400);
  assert.equal(c.multiplier, 3);
  assert.equal(c.total, 1200);
});

check('switch pays 1.2x and resets that trick\'s degradation', () => {
  assert.equal(SWITCH_BONUS, 1.2);
  const c = new Combo();
  assert.equal(c.add('Kickflip', 100).points, 100);
  assert.equal(c.add('Kickflip', 100).points, 75);              // second regular use degrades
  assert.equal(c.add('Kickflip', 100, { switch: true }).points, 120); // switch is a different trick
  assert.equal(c.add('Kickflip', 100, { switch: true }).points, 90);  // ...with its own decay
  assert.equal(trickLabel(c.tricks[2]), 'Switch Kickflip');
});

check('degradation is scoped to the combo, not the whole run', () => {
  const c = new Combo();
  c.add('Kickflip', 100); c.add('Kickflip', 100);
  c.reset();
  assert.equal(c.add('Kickflip', 100).points, 100);
});

check('spin escalates and pays one extra x per completed 360', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(spinPoints), [0, 100, 250, 450, 700]);
  assert.ok(spinPoints(5) > spinPoints(4) && spinPoints(8) > spinPoints(7));
  assert.deepEqual([1, 2, 3, 4, 5].map(spinMult), [0, 1, 1, 2, 2]);
});

check('a spin attaches to the trick it was thrown with', () => {
  const c = new Combo();
  const t = c.add('Kickflip', 100);
  c.addMult(spinMult(2)); c.attachSpin(0, 'BS 360', spinPoints(2));
  assert.equal(t.points, 350);
  assert.equal(c.multiplier, 2);          // the trick itself, plus the 360
  assert.equal(c.text, 'BS 360 Kickflip');
  assert.equal(c.total, 700);
});

check('hold points are flat, undegraded, and land on the trick being held', () => {
  assert.deepEqual(HOLD, { grind: 10, manual: 5, grab: 10 });
  const c = new Combo();
  c.add('50-50', 100);
  for (let i = 0; i < 20; i++) c.addToLast(HOLD.grind); // 2 seconds on the rail
  assert.equal(c.tricks[0].points, 300);
  assert.equal(c.points, 300);
});

check('the worked example from the docs comes out in the right shape', () => {
  // Boardslide -> Manual -> Kickflip -> Nose Manual -> Switch Kickflip, no holds.
  const c = new Combo();
  c.add('Boardslide', 200);
  c.add('Manual', 100);
  c.add('Kickflip', 100);
  c.add('Nose Manual', 100);
  c.add('Kickflip', 100, { switch: true });
  assert.equal(c.points, 620);      // 200 + 100 + 100 + 100 + 120
  assert.equal(c.multiplier, 5);
  assert.equal(c.total, 3100);
});

check('high scores round-trip through storage and rank correctly', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const hs = new HighScores(store);
  assert.equal(hs.best, 0);
  assert.equal(hs.submit(12000), 1);
  assert.equal(hs.submit(4000), 2);
  assert.equal(hs.submit(90000), 1);
  assert.equal(hs.best, 90000);
  assert.equal(new HighScores(store).best, 90000, 'survives a reload');
  for (let i = 0; i < 20; i++) hs.submit(1000 + i);
  assert.equal(hs.list.length, 10, 'table is capped');
  assert.equal(hs.submit(1), 0, 'a run off the bottom of the table gets no place');
  assert.equal(hs.submit(0), 0, 'a scoreless run is not recorded');
});

check('corrupt or hostile stored data is discarded', () => {
  const bad = (raw) => new HighScores({ getItem: () => raw, setItem() {}, removeItem() {} }).list;
  assert.deepEqual(bad('{not json'), []);
  assert.deepEqual(bad('{"score":5}'), []);          // not an array
  assert.deepEqual(bad('[{"score":"<img>","date":"x"}]'), []);
  assert.deepEqual(bad('[{"score":50,"date":"<b>hi</b>"}]'), [{ score: 50, date: '' }]);
  assert.deepEqual(new HighScores(null).list, [], 'no storage at all still works');
});

check('storage that throws never breaks a run', () => {
  const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const hs = new HighScores(boom);
  assert.deepEqual(hs.list, []);
  assert.equal(hs.submit(500), 1);
  hs.clear();
});

// A representative line, to keep an eye on the magnitude a good run reaches.
{
  const c = new Combo();
  c.add('Boardslide', 200); for (let i = 0; i < 15; i++) c.addToLast(HOLD.grind);
  c.addMult(spinMult(2)); c.attachSpin(0, 'BS 360', spinPoints(2));
  c.add('Manual', 100); for (let i = 0; i < 10; i++) c.addToLast(HOLD.manual);
  c.add('Indy', 300);
  c.add('Nose Manual', 100); for (let i = 0; i < 10; i++) c.addToLast(HOLD.manual);
  c.add('50-50', 100); for (let i = 0; i < 15; i++) c.addToLast(HOLD.grind);
  c.add('Kickflip', 100);
  console.log(`\nSample line: ${c.text}\n  ${c.points} x${c.multiplier} = ${c.total.toLocaleString('en-US')}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nall scoring checks passed');
process.exit(failures ? 1 : 0);

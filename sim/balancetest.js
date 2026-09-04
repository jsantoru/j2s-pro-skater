// Balance meter checks. These assert the feel properties, not just that it runs: your correction must
// always out-muscle the meter, doing nothing must cost you but not instantly, a short rail must not be a
// coin flip, and heavy-handed input must be its own mistake. Usage: node sim/balancetest.js
import { Balance, BALANCE, MANUAL_BALANCE } from '../src/balance.js';

const DT = 1 / 120;
// deterministic rng so runs are comparable
function mulberry(seed) {
  return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => (Math.round(n * 100) / 100).toFixed(2);
let failures = 0;
const check = (label, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!cond) failures++;
};

// How long does a grind last for a given player? `gain` is how hard they counter the lean they can see.
// Crucially they react to the meter as it was LAG seconds ago: without that lag any gain holds forever
// and the model says nothing about how this feels in a hand.
const LAG = 0.14;
function survive(gain, seed, speed = 6, difficulty = 0, maxT = 12) {
  const b = new Balance(mulberry(seed));
  b.start(difficulty);
  const hist = [], n = Math.round(LAG / DT);
  for (let t = 0; t < maxT; t += DT) {
    hist.push(b.x);
    const seen = hist.length > n ? hist[hist.length - 1 - n] : 0;
    const input = Math.max(-1, Math.min(1, -seen * gain));
    if (!b.update(DT, input, speed)) return t;
  }
  return maxT;
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const runs = (gain) => [0, 1, 2, 3, 4].map((s) => survive(gain, s));

console.log('\n=== your correction always out-muscles the meter ===');
// The design invariant: however far the difficulty has ramped, full stick beats everything pushing you
// over. It does NOT mean any state is survivable -- if you are already at the edge carrying speed
// outward you are gone, and that point of no return is what makes the danger real.
{
  const b = new Balance(mulberry(1)); b.start(BALANCE.comboMax); b.t = 1e4;
  const hMax = b.hardness(0);                                     // fully ramped, big combo, barely moving
  const raw = BALANCE.tip * hMax + BALANCE.bias * hMax;           // worst case: hard over AND wander agreeing
  const capped = Math.min(raw, BALANCE.control * BALANCE.saveMargin);
  check('full stick beats the worst case the meter can produce', BALANCE.control > capped * 1.05,
    `control ${f(BALANCE.control)} vs disturbance ${f(capped)} (uncapped would be ${f(raw)}, hardness ${f(hMax)})`);
}

console.log('\n=== a hard lean is recoverable, given a little room ===');
for (const [label, diff, t0] of [['fresh grind', 0, 0], ['long grind + big combo', BALANCE.comboMax, 40]]) {
  const b = new Balance(mulberry(1)); b.start(diff);
  b.t = t0 + BALANCE.grace; b.armed = true; b.x = 0.85; b.v = 0.2; b.bias = 1; b.biasT = 99; b.biasTarget = 1;
  let saved = false, worst = b.x;
  for (let t = 0; t < 3; t += DT) {
    if (!b.update(DT, -1, 3.0)) break;          // full stick away, at an awkward slow speed
    worst = Math.max(worst, b.x);
    if (b.x < 0.5) { saved = true; break; }
  }
  check(`${label}: full stick pulls back from a 0.85 lean`, saved,
    `peaked at ${f(worst)}  hardness=${f(b.hardness(3.0))}`);
}

console.log('\n=== doing nothing costs you, but not instantly ===');
const idle = runs(0);
const idleAvg = avg(idle);
check('a passive rider falls', idle.every((t) => t < 12), 'times ' + idle.map(f).join(', '));
check('but gets at least ~1.5s first', Math.min(...idle) > 1.5, `worst ${f(Math.min(...idle))}s, avg ${f(idleAvg)}s`);

console.log('\n=== a short rail is not a coin flip ===');
// the flat rail is 7 m; at 6 m/s that is ~1.2 s, and the grace period covers a third of it
check('passive rider clears a 1.2s rail', Math.min(...idle) > 1.2, `worst ${f(Math.min(...idle))}s`);

console.log('\n=== correcting beats not correcting, and overcorrecting is its own mistake ===');
const tiers = [['none', 0], ['light', 1.2], ['measured', 2.6], ['heavy', 6], ['frantic', 14]];
const byTier = {};
for (const [label, gain] of tiers) {
  const t = runs(gain); byTier[label] = avg(t);
  console.log(`  ${label.padEnd(10)} avg ${f(avg(t))}s   ${t.map(f).join(', ')}`);
}
const best = tiers.map(([l]) => l).reduce((a, b) => (byTier[b] > byTier[a] ? b : a));
check('any correction beats none', byTier.light > byTier.none);
check('the sweet spot is a light touch, not a heavy one', best === 'light' || best === 'measured',
  `best tier is "${best}" at ${f(byTier[best])}s`);
check('overcorrecting is worse than correcting well', byTier.frantic < byTier.measured,
  `frantic ${f(byTier.frantic)}s vs measured ${f(byTier.measured)}s`);
check('there is a real cost to heavy-handedness', byTier.heavy < byTier.light,
  `heavy ${f(byTier.heavy)}s vs light ${f(byTier.light)}s`);

console.log('\n=== mashing the stick is not a strategy ===');
const mash = [0, 1, 2, 3, 4].map((seed) => {
  const b = new Balance(mulberry(seed)); b.start(0);
  for (let t = 0; t < 12; t += DT) if (!b.update(DT, Math.sin(t * 18) > 0 ? 1 : -1, 6)) return t;
  return 12;
});
check('mashing loses to feathering', avg(mash) < byTier.measured, `mash ${f(avg(mash))}s vs measured ${f(byTier.measured)}s`);

console.log('\n=== difficulty ramps along the rail ===');
const b2 = new Balance(mulberry(7)); b2.start(0); b2.t = BALANCE.grace;
const h0 = b2.hardness(8); b2.t = BALANCE.grace + 6;
const h6 = b2.hardness(8);
check('a long grind is harder than a fresh one', h6 > h0 * 1.15, `${f(h0)} -> ${f(h6)}`);
const b3 = new Balance(mulberry(7)); b3.start(BALANCE.comboMax); b3.t = BALANCE.grace;
check('a big combo is harder', b3.hardness(8) > h0, `${f(h0)} -> ${f(b3.hardness(8))}`);
check('creeping is harder than cruising', b2.hardness(1.5) > b2.hardness(8), `${f(b2.hardness(8))} -> ${f(b2.hardness(1.5))}`);

console.log('\n=== manuals run the same pendulum, tuned tighter ===');
{
  // same invariant has to hold for the manual tuning, since it is the same code path
  const b = new Balance(mulberry(1), MANUAL_BALANCE); b.start(MANUAL_BALANCE.comboMax); b.t = 1e4;
  const hMax = b.hardness(0);
  const capped = Math.min(MANUAL_BALANCE.tip * hMax + MANUAL_BALANCE.bias * hMax,
    MANUAL_BALANCE.control * MANUAL_BALANCE.saveMargin);
  check('full stick still beats the worst case', MANUAL_BALANCE.control > capped * 1.05,
    `control ${f(MANUAL_BALANCE.control)} vs disturbance ${f(capped)}`);

  const mRuns = (gain) => [0, 1, 2, 3, 4].map((seed) => {
    const bb = new Balance(mulberry(seed), MANUAL_BALANCE); bb.start(0);
    const hist = [], n = Math.round(LAG / DT);
    for (let t = 0; t < 12; t += DT) {
      hist.push(bb.x);
      const seen = hist.length > n ? hist[hist.length - 1 - n] : 0;
      if (!bb.update(DT, Math.max(-1, Math.min(1, -seen * gain)), 6)) return t;
    }
    return 12;
  });
  const mNone = avg(mRuns(0)), mLight = avg(mRuns(1.2));
  console.log(`  none ${f(mNone)}s   light ${f(mLight)}s`);
  check('a manual runs away faster than a grind', mNone < avg(runs(0)), `${f(mNone)}s vs grind ${f(avg(runs(0)))}s`);
  check('but is still holdable with a light touch', mLight > mNone * 1.5, `${f(mLight)}s`);
  check('and long enough to be a connector, not a coin flip', mNone > 1.0, `worst-case hold ${f(mNone)}s`);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall balance checks passed\n');
process.exit(failures ? 1 : 0);

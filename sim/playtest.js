// Headless play-test harness: drives the skater with scripted inputs and prints a compact timeline.
// Usage: node sim/playtest.js [scenario ...]
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

const DT = 1 / 120;
const level = new Level();
const f = (n) => (Math.round(n * 100) / 100).toFixed(2);

function run(name, setup, script, seconds, opts = {}) {
  const sk = new Skater(level);
  setup(sk);
  sk.heading.normalize(); sk.facing.set(sk.heading.x, 0, sk.heading.z).normalize();
  const log = [];
  let lastState = sk.state, maxY = 0, airStart = 0, bails = 0, landings = 0;
  const events = [];
  sk.events.bail = (r) => { bails++; events.push(`${f(t)} BAIL(${r})`); };
  sk.events.land = (pts, text, mult) => { landings++; if (pts) events.push(`${f(t)} LAND +${pts} [${text}] x${mult}`); };
  sk.events.grindStart = (n) => events.push(`${f(t)} GRIND ${n}`);
  sk.events.trick = (n) => events.push(`${f(t)} TRICK ${n}`);
  let t = 0;
  const inp = makeState();
  for (let i = 0; t < seconds; i++, t += DT) {
    // reset edges, then let the script set them
    inp.olliePressed = inp.ollieReleased = inp.flipPressed = inp.grabPressed = inp.grindPressed = false;
    const prevOllie = inp.ollie, prevGrab = inp.grab, prevGrind = inp.grind;
    script(inp, t, sk);
    inp.olliePressed = inp.ollie && !prevOllie; inp.ollieReleased = !inp.ollie && prevOllie;
    inp.grabPressed = inp.grab && !prevGrab; inp.grindPressed = inp.grind && !prevGrind;
    sk.update(DT, inp);
    inp.flipPressed = false;
    if (sk.state !== lastState) {
      if (sk.state === 'air') { airStart = t; maxY = sk.pos.y; }
      if (lastState === 'air') log.push(`  air ${f(t - airStart)}s apex y=${f(maxY)}`);
      log.push(`${f(t)} ${lastState}->${sk.state} pos=(${f(sk.pos.x)},${f(sk.pos.y)},${f(sk.pos.z)}) v=${f(sk.speed)} vy=${f(sk.vel.y)} n.y=${f(sk.normal.y)}`);
      lastState = sk.state;
    }
    if (sk.state === 'air') maxY = Math.max(maxY, sk.pos.y);
    if (opts.sample && i % Math.round(opts.sample / DT) === 0) log.push(`  t=${f(t)} pos=(${f(sk.pos.x)},${f(sk.pos.y)},${f(sk.pos.z)}) v=${f(sk.speed)} head=(${f(sk.heading.x)},${f(sk.heading.y)},${f(sk.heading.z)}) st=${sk.state}`);
  }
  console.log(`\n=== ${name} === bails=${bails} landings=${landings} score=${sk.score}`);
  for (const l of log.slice(0, 60)) console.log(l);
  if (log.length > 60) console.log('  ... (' + (log.length - 60) + ' more lines)');
  for (const e of events) console.log('  ev ' + e);
  return sk;
}

const S = {};
S.push = () => run('push from rest, then coast', (sk) => { sk.pos.set(-20, 0, 14); sk.heading.set(1, 0, 0); },
  (inp, t) => { inp.push = t < 4 ? 1 : 0; }, 9, { sample: 1 });
S.brake = () => run('brake from cruise', (sk) => { sk.pos.set(-20, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 9; },
  (inp, t) => { inp.brake = t > 0.5 ? 1 : 0; }, 2.5, { sample: 0.25 });
S.turn = () => run('full-lock turn at cruise', (sk) => { sk.pos.set(-10, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t) => { inp.steer = 1; inp.push = 1; }, 3, { sample: 0.5 });
S.ollie = () => {
  for (const hold of [0.04, 0.25, 0.6]) run(`ollie hold=${hold}s at 8 m/s`, (sk) => { sk.pos.set(-10, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 8; },
    (inp, t) => { inp.ollie = t > 0.2 && t < 0.2 + hold; }, 2);
};
S.kickflip = () => run('tap ollie + immediate kickflip, then 360 flip with full crouch', (sk) => { sk.pos.set(-10, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t) => {
    inp.ollie = (t > 0.2 && t < 0.28) || (t > 2 && t < 2.6);
    inp.flipPressed = Math.abs(t - 0.30) < DT / 2 || Math.abs(t - 2.62) < DT / 2;
    inp.dir8 = t > 2 ? 'SW' : 'W';
    inp.steer = t > 2.62 && t < 3.3 ? 1 : 0;
  }, 4);
S.qp = () => run('west quarter pipe: ride in at speed, air, land, ride out', (sk) => { sk.pos.set(-20, 0, 6); sk.heading.set(-1, 0, 0); sk.speed = 6; },
  (inp, t) => { inp.push = 1; }, 6, { sample: 0.25 });
S.qpollie = () => run('west quarter pipe: ollie off the lip + melon', (sk) => { sk.pos.set(-20, 0, 6); sk.heading.set(-1, 0, 0); sk.speed = 10; },
  (inp, t, sk) => { inp.push = 1; inp.ollie = sk.state === 'ride' && sk.normal.y < 0.25 && sk.pos.y > 2.0 && sk.vel.y > 0; inp.grab = sk.state === 'air' && sk.airTime > 0.05 && sk.airTime < 0.5; inp.dir8 = 'W'; }, 6);
S.kickerRail = () => run('kicker -> flat rail (assist held)', (sk) => { sk.pos.set(-28, 0, 4); sk.heading.set(1, 0, 0); sk.speed = 7; },
  (inp, t, sk) => { inp.push = 1; inp.grind = sk.state === 'air'; inp.dir8 = 'C'; }, 5);
S.flatRail = () => run('ollie onto flat rail along its axis, 50-50, ride off', (sk) => { sk.pos.set(-13, 0, 10); sk.heading.set(1, 0, 0); sk.speed = 7; },
  (inp, t, sk) => { inp.ollie = sk.pos.x > -10 && sk.pos.x < -9.5 && sk.state === 'ride'; inp.grind = true; }, 5);
S.railSide = () => run('ollie onto rail at 30° with assist (boardslide)', (sk) => { sk.pos.set(-8, 0, 13); sk.heading.set(1, 0, -1).normalize(); sk.speed = 7; },
  (inp, t, sk) => { inp.ollie = sk.pos.z < 11.2 && sk.pos.z > 11 && sk.state === 'ride'; inp.grind = true; inp.dir8 = 'W'; }, 5);
S.stairs = () => run('bank up to platform, ollie down the stairs', (sk) => { sk.pos.set(8, 0, 16); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t, sk) => { inp.push = 1; inp.steer = sk.pos.x > 24 && sk.state === 'ride' && sk.heading.z > -0.95 ? -1 : 0; inp.ollie = sk.pos.z < 10.6 && sk.pos.z > 10.3 && sk.pos.y > 1.5; }, 7, { sample: 0.5 });
S.halfpipe = () => run('half pipe: pump back and forth', (sk) => { sk.pos.set(-4, 0, -14); sk.heading.set(0, 0, -1); sk.speed = 9; },
  (inp, t, sk) => { inp.push = sk.state === 'ride' && sk.normal.y > 0.9 ? 1 : 0; }, 8, { sample: 0.5 });
S.wall = () => run('ride into a wall at 9 m/s', (sk) => { sk.pos.set(0, 0, 18); sk.heading.set(1, 0, 0); sk.speed = 9; },
  (inp, t) => { inp.push = 1; inp.steer = t > 1 && t < 1.5 ? 0.5 : 0; }, 6);
S.gap = () => run('kicker gap', (sk) => { sk.pos.set(0, 0, 12); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t, sk) => { inp.push = 1; inp.ollie = sk.pos.x > 7.3 && sk.pos.x < 7.7 && sk.state === 'ride'; }, 4);
S.spin = () => run('full crouch ollie + full-stick spin, land', (sk) => { sk.pos.set(-10, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t) => { inp.ollie = t > 0.2 && t < 0.8; inp.steer = t > 0.8 && t < 1.5 ? 1 : 0; }, 3);

S.autoPush = () => run('no input: skater auto-pushes to cruise on flat', (sk) => { sk.pos.set(-20, 0, 14); sk.heading.set(1, 0, 0); },
  () => {}, 6, { sample: 1 });
S.crouchAccel = () => run('hold crouch from rest = accelerate, release = big ollie', (sk) => { sk.pos.set(-20, 0, 14); sk.heading.set(1, 0, 0); },
  (inp, t) => { inp.ollie = t > 0.1 && t < 2.6; }, 4.5, { sample: 0.5 });
S.earlyFlip = () => run('flip pressed ON the release frame, then flip pressed DURING the crouch', (sk) => { sk.pos.set(-14, 0, 14); sk.heading.set(1, 0, 0); sk.speed = 8; },
  (inp, t) => {
    inp.ollie = (t > 0.2 && t < 0.5) || (t > 2.0 && t < 2.5);
    inp.flipPressed = Math.abs(t - 0.5) < DT / 2 || Math.abs(t - 2.3) < DT / 2;
    inp.dir8 = 'W';
  }, 4);
S.magnet = () => {
  // approach the flat rail (z=10) 1.4 m off its line, ollie, TAP grind once right after takeoff
  run('grind magnet: 1.4 m off-line, single tap of grind', (sk) => { sk.pos.set(-13, 0, 11.4); sk.heading.set(1, 0, 0); sk.speed = 7; },
    (inp, t, sk) => { inp.ollie = sk.pos.x > -10.6 && sk.pos.x < -10.2 && sk.state === 'ride'; inp.grind = sk.state === 'air' && sk.airTime > 0.03 && sk.airTime < 0.05; inp.dir8 = 'C'; }, 4);
  run('control: same line, grind never pressed (should land on the floor, no grind)', (sk) => { sk.pos.set(-13, 0, 11.4); sk.heading.set(1, 0, 0); sk.speed = 7; },
    (inp, t, sk) => { inp.ollie = sk.pos.x > -10.6 && sk.pos.x < -10.2 && sk.state === 'ride'; }, 4);
  run('grind magnet: tapped while still crouching, before the pop', (sk) => { sk.pos.set(-13, 0, 11.0); sk.heading.set(1, 0, 0); sk.speed = 7; },
    (inp, t, sk) => { const c = sk.pos.x > -10.9 && sk.pos.x < -10.2 && sk.state === 'ride'; inp.ollie = c; inp.grind = c && sk.crouchTime > 0.05 && sk.crouchTime < 0.07; inp.dir8 = 'C'; }, 4);
};

const which = process.argv.slice(2);
const names = which.length ? which : Object.keys(S);
for (const n of names) { if (S[n]) S[n](); else console.log('unknown scenario', n); }

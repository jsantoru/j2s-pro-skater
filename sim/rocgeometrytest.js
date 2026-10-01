// Pass 2: actual skating inputs across the A–L feature layout. Fixtures place a
// rider on valid approach ground once; all motion and captures then use update.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

// Preserve the pass-2 authored approach fixtures; production scale has its own suite.
const level = new RocCityLevel({ horizontalScale: 1 }), dt = 1 / 120, ray = new THREE.Raycaster();
let passed = 0, failed = 0;
const report = { level: 'roc-city-skatepark', method: 'Real Skater.update inputs with initial fixtures on actual collision surfaces; no direct grind attachment', checks: [], coverage: {
  A: 'Trail apron up/down, north entry to bowl deck', B: 'Repeated mini-ramp passes both ways, clear flat bottom and banked grind exits on both lips',
  C: 'Connected upper deck and street-bank ascent/descent', D: 'Deep bowl/shallow tail entry/exit; actual coping capture, continuous grind and ollie exit both ways',
  E: 'Seven-stair downhill handrail, early-held grind and late-ollie direction stability', F: 'Curved ledge capture, continuous linked grind and banked exit both ways',
  G: 'Nine-stair downhill handrail approach and banked exit', H: 'Continuous quarter/crest surface, back A-frame, both coping and kink-rail grinds in both directions',
  I: 'Bank up/down, west approach support and handrail grinds both ways', J: 'Flat rail capture and banked exits both ways',
  K: 'Manual-pad edge ollies and banked grinds both ways', L: 'Both quarter heights: approach, return and coping grinds',
} };
function check(name, fn) {
  if (process.env.QA_CHECK && !name.includes(process.env.QA_CHECK)) return;
  try { const result = fn(); passed++; report.checks.push({ name, passed: true, ...(result ? { detail: result } : {}) }); console.log(`PASS: ${name}${result ? ` ${JSON.stringify(result)}` : ''}`); }
  catch (error) { failed++; report.checks.push({ name, passed: false, error: error.message }); console.error(`FAIL: ${name}\n${error.stack}`); }
}
function support(x, z) {
  ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)); ray.far = 20;
  return ray.intersectObjects(level.colliders, false)[0];
}
function rider(x, z, dx, dz, speed = 6) {
  const hit = support(x, z); assert(hit, `Approach has no ground: ${x},${z}`);
  const skater = new Skater(level, () => .5);
  skater.pos.copy(hit.point); skater.heading.set(dx, 0, dz).normalize(); skater.facing.copy(skater.heading);
  skater.speed = speed; skater.vel.copy(skater.heading).multiplyScalar(speed);
  return skater;
}
function chain(first) {
  assert(first, 'Required rail is missing');
  const rails = [], seen = new Set();
  for (let rail = first; rail && !seen.has(rail); rail = rail.bLink?.rail) { rails.push(rail); seen.add(rail); }
  return rails;
}
function route(points, speed = 5, seconds = 30) {
  const start = points[0], next = points[1], skater = rider(...start, next[0] - start[0], next[1] - start[1], speed);
  const bails = []; let index = 1, time = 0, minimum = skater.pos.y, maximum = skater.pos.y;
  skater.events.bail = reason => bails.push(reason);
  while (time < seconds && index < points.length && !bails.length) {
    const [x, z] = points[index], dx = x - skater.pos.x, dz = z - skater.pos.z;
    const angle = Math.atan2(skater.heading.x * dz - skater.heading.z * dx, skater.heading.x * dx + skater.heading.z * dz);
    const input = makeState(), desired = Math.abs(angle) > .65 ? Math.min(speed, 3.5) : speed;
    input.steer = skater.state === 'ride' ? THREE.MathUtils.clamp(angle * 1.8, -1, 1) : 0;
    input.push = skater.speed < desired ? 1 : 0; input.brake = skater.speed > desired + .2 ? .5 : 0;
    skater.update(dt, input); time += dt; minimum = Math.min(minimum, skater.pos.y); maximum = Math.max(maximum, skater.pos.y);
    if (Math.hypot(dx, dz) < .6) index++;
  }
  return { index, reached: index === points.length, bails, time: +time.toFixed(2), minimum, maximum, position: skater.pos.toArray(), state: skater.state };
}
function grindRoute(rails, { dir = 1, speed = 7, lead = 7, pop = 3.5, duration = 7, targetRails = rails, offset = 0, exitAfter = null } = {}) {
  const closed = rails.at(-1).bLink?.rail === rails[0];
  const entry = dir === 1 || closed ? rails[0] : rails.at(-1);
  const edge = (dir === 1 ? entry.a : entry.b).clone();
  const tangent = entry.dir.clone().setY(0).normalize().multiplyScalar(dir);
  const start = edge.clone().addScaledVector(tangent, -lead);
  start.add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(offset));
  const approach = edge.clone().sub(start).setY(0).normalize();
  const skater = rider(start.x, start.z, approach.x, approach.z, speed), target = new Set(targetRails);
  const captured = [], bails = [], visited = new Set(); let previous = false, released = false, longest = 0, targetExited = false, exitAge = -1, minimumAirAlong = Infinity;
  skater.events.grindStart = () => {
    captured.push({ target: target.has(skater.grind.rail), dir: skater.grind.dir, along: +skater.vel.dot(tangent).toFixed(3) });
  };
  skater.events.grindEnd = () => { if (target.has(skater.grind?.rail)) targetExited = true; };
  skater.events.bail = reason => bails.push(reason);
  for (let i = 0; i < duration / dt; i++) {
    const input = makeState(), before = edge.clone().sub(skater.pos).dot(tangent);
    input.push = skater.speed < speed ? 1 : 0; input.brake = skater.speed > speed + .2 ? .5 : 0;
    input.ollie = !released && before > pop; if (!input.ollie) released = true;
    input.grind = true;
    if (skater.state === 'air' && !captured.length) minimumAirAlong = Math.min(minimumAirAlong, skater.vel.dot(tangent));
    if (skater.state === 'grind') {
      if (target.has(skater.grind.rail)) { longest = Math.max(longest, skater.grind.time); visited.add(skater.grind.rail); }
      input.steer = THREE.MathUtils.clamp(-skater.balance.x * 3 - skater.balance.v, -1, 1);
      if (exitAfter !== null && exitAge < 0 && skater.grind.time >= exitAfter) exitAge = 0;
    }
    if (exitAge >= 0) { input.ollie = exitAge < .3; input.grind = false; exitAge += dt; }
    input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous; previous = input.ollie;
    skater.update(dt, input);
    if (bails.length || (targetExited && skater.state === 'ride' && skater.score > 0)) break;
  }
  return { captured, bails, longest: +longest.toFixed(3), visited: visited.size, score: skater.score, minimumAirAlong: Number.isFinite(minimumAirAlong) ? +minimumAirAlong.toFixed(3) : null, position: skater.pos.toArray() };
}

const stairE = level.rails.find(rail => rail.kind === 'rail' && rail.feature === 'E');
const stairG = level.rails.find(rail => rail.kind === 'rail' && rail.feature === 'G');
const hip = level.hip?.backRail || chain(level.rails.find(rail => rail.feature === 'H' && rail.kind === 'rail' && rail.bLink && !rail.aLink));
const curvedF = chain(level.rails.find(rail => rail.feature === 'F' && rail.bLink && !rail.aLink));
const everyFRail = level.rails.filter(rail => rail.feature === 'F');
const pool = chain(level.rails.find(rail => rail.feature === 'D'));
const flatJ = level.rails.find(rail => rail.kind === 'rail' && rail.a.x === 8 && Math.abs(rail.a.y + .15) < .01);
const manualK = level.rails.find(rail => rail.kind === 'ledge' && Math.abs(rail.a.y + .42) < .01);
const bankI = level.rails.find(rail => rail.kind === 'rail' && rail.a.x === 10 && Math.abs(rail.a.z - 18.5) < .01);

{
  check('A–L rendered topography agrees with collisions and the playable footprint has no voids', () => {
    const visible = []; level.group.traverse(mesh => { if (mesh.isMesh && mesh.visible) visible.push(mesh); });
    const gSample=stairG.a.clone().lerp(stairG.b,.5).add(new THREE.Vector3(-stairG.dir.z,0,stairG.dir.x).setLength(.75));
    for (const [name, x, z] of [['A',2,-44],['B',1.5,-35],['C',1,-16],['D',-7,-15],['E',10.6,-18.5],['F',-16.55,-6],['G',gSample.x,gSample.z],['H',11,1],['I',8,21],['J',7,34],['K',13,35],['L',7.5,51]]) {
      const physical = support(x, z);
      ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)); ray.far = 20;
      const rendered = ray.intersectObjects(visible, false)[0];
      assert(physical && rendered, `${name} has visible and physical support`);
      assert(Math.abs(physical.point.y - rendered.point.y) < .055, `${name}: physical ${physical.point.y}, visible ${rendered.point.y}`);
    }
    const polygon = level.layout.perimeter;
    for (let z = -47.83; z < 54; z += .6) for (let x = -18.87; x < 15; x += .6) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [a,b] = polygon[i], [c,d] = polygon[j];
        if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) inside = !inside;
      }
      if (inside) assert(support(x, z), `Unsupported playable point ${x},${z}`);
    }
  });
  check('A and C: trail entry, raised north deck and return remain connected', () => {
    for (const points of [[[-7.3, -45], [0, -45], [2, -43]], [[0, -45], [-7.3, -45]]]) {
      const result = route(points, 5); assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []);
      assert(result.maximum - result.minimum > 1.3, 'Route crosses the real entry grade');
    }
    const result = route([[2, -44], [2, -41], [-4, -40], [-7, -38], [-7, -30]], 3.5);
    assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []);
  });
  check('B: both mini transitions support repeated passes with an open flat bottom', () => {
    const m = level.layout.mini;
    for (const sign of [1, -1]) {
      // Repeated transitions use w=-1, clear of the separate extension ledge.
      // The following grind case still starts at centre and exercises its lip.
      const skater = rider(m.center[0]+m.axis[1],m.center[1]-m.axis[0],m.axis[0] * sign,m.axis[1] * sign,7), bails = [];
      let minimum = 0, maximum = 0, landings = 0;
      skater.events.bail = reason => bails.push(reason); skater.events.land = () => landings++;
      for (let i = 0; i < 960; i++) {
        skater.update(dt, { ...makeState(), push: 1 });
        const along = (skater.pos.x - m.center[0]) * m.axis[0] + (skater.pos.z - m.center[1]) * m.axis[1];
        minimum = Math.min(minimum, along); maximum = Math.max(maximum, along);
      }
      assert.deepEqual(bails, []); assert(landings >= 4); assert(minimum < -m.flatHalf && maximum > m.flatHalf);
    }
  });
  check('B: either mini lip accepts a charged grind and exits onto the deck without a false bail', () => {
    const m = level.layout.mini, scores = [];
    for (const sign of [1, -1]) {
      const skater = rider(...m.center, m.axis[0] * sign, m.axis[1] * sign, 7), bails = [], captures = [];
      let previous = false, released = false, longest = 0;
      skater.events.bail = reason => bails.push(reason); skater.events.grindStart = () => captures.push(skater.grind.rail.feature);
      for (let i = 0; i < 480; i++) {
        const input = makeState(), along = (skater.pos.x - m.center[0]) * m.axis[0] + (skater.pos.z - m.center[1]) * m.axis[1];
        input.push = 1; input.grind = true; input.ollie = !released && sign * along < 2.6;
        if (!input.ollie) released = true;
        input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous; previous = input.ollie;
        if (skater.state === 'grind') { longest = Math.max(longest, skater.grind.time); input.steer = THREE.MathUtils.clamp(-skater.balance.x * 3 - skater.balance.v, -1, 1); }
        skater.update(dt, input); if (skater.score > 0 || bails.length) break;
      }
      assert(captures.includes('B')); assert.deepEqual(bails, [], `Lip ${sign} must land cleanly after its normal rail endpoint`);
      assert(longest > .5); assert(skater.score > 100);
      scores.push({ lip: sign, banked: skater.score, grindSeconds: +longest.toFixed(3) });
    }
    return scores;
  });
  check('C: bowl-to-street connector rides smoothly in both directions', () => {
    for (const points of [[[1, -10], [7, -10]], [[7, -10], [1, -10]]]) {
      const result = route(points, 6); assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []);
      assert(result.maximum - result.minimum > 1.5);
    }
  });
  check('D: deep bowl and shallow tail have reachable physical approaches and exits', () => {
    for (const points of [[[1, -15], [-7, -15]], [[-7, -15], [1, -15]], [[-5, 3], [-5, -3]], [[-5, -3], [-5, 3]]]) {
      const result = route(points, 8); assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []);
      assert(result.maximum - result.minimum > 1.3);
    }
  });
  check('E and G downhill handrails accept a normal early-held grind in the direction of travel', () => {
    for (const [name, rail] of [['E', stairE], ['G', stairG]]) {
      const result = grindRoute([rail], { pop: name === 'G' ? 2 : 3.5, lead: name === 'G' ? 4.5 : 7 });
      assert(result.captured.some(capture => capture.target && capture.dir === 1), `${name}: ${JSON.stringify(result)}`);
      assert(result.captured.filter(capture => capture.target).every(capture => capture.along > 0), 'Grind assist must not reverse an airborne downhill approach');
      assert.deepEqual(result.bails, []); assert(result.longest > .1);
    }
  });
  check('E: holding grind during a late high ollie never reverses the rider uphill', () => {
    const result = grindRoute([stairE], { pop: 1 });
    assert(result.minimumAirAlong > 6, JSON.stringify(result));
    assert(result.captured.every(capture => !capture.target || capture.dir === 1));
    assert.deepEqual(result.bails, []);
    return { minimumForwardSpeed: result.minimumAirAlong, reversedCaptures: result.captured.filter(capture => capture.target && capture.dir !== 1).length };
  });
  check('D: ollie capture, continuous pool coping and ollie exit work both ways', () => {
    const runs = [];
    for (const dir of [1, -1]) {
      const result = grindRoute(pool, { dir, pop: 3.5, exitAfter: 1.5 });
      assert(result.captured.some(capture => capture.target && capture.dir === dir), JSON.stringify(result));
      assert(result.longest > 1.7 && result.visited > 12, JSON.stringify(result));
      assert.deepEqual(result.bails, []); assert(result.score > 100, JSON.stringify(result));
      runs.push({ direction: dir, grindSeconds: result.longest, railSegments: result.visited, banked: result.score });
    }
    return runs;
  });
  check('F and H: an actual ollie captures each linked grind in both directions', () => {
    const runs = [];
    for (const [name, rails] of [['F', curvedF], ['H', hip], ['H coping', level.hip.frontCoping]]) for (const dir of [1, -1]) {
      const result = grindRoute(rails, { dir, pop: name === 'F' ? 1.5 : 3.5, lead: name === 'F' ? 3 : 7, offset: name === 'F' && dir === -1 ? 1 : 0, targetRails: name === 'F' ? everyFRail : rails });
      assert(result.captured.some(capture => capture.target && capture.dir === dir), `${name}: ${JSON.stringify(result)}`);
      assert(result.longest > 1, `${name} must sustain a continuous grind: ${JSON.stringify(result)}`);
      assert(result.visited >= 3); assert.deepEqual(result.bails, []); assert(result.score > 100);
      runs.push({ feature: name, direction: dir, grindSeconds: result.longest, railSegments: result.visited, banked: result.score });
    }
    return runs;
  });
  check('H: quarter face, crest and back A-frame have continuous riding surfaces', () => {
    for (const z of [2.1, 2.5, 3]) assert(Math.abs(support(13.249, z).point.y - support(13.251, z).point.y) < .003, 'No hard notch where the former quarter intersected the A-frame');
    const front = rider(10, .7, 1, 0, 7), bails = []; let maximum = 0, landed = false;
    front.events.bail = reason => bails.push(reason); front.events.land = () => { landed = true; };
    for (let i = 0; i < 360; i++) { front.update(dt, { ...makeState(), push: 1 }); maximum = Math.max(maximum, front.pos.y); }
    assert.deepEqual(bails, []); assert(maximum > 1.5); assert(landed);
    const result = route([[14.2, -6], [14.2, 8]], 7);
    assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []); assert(result.maximum > 1.5);
  });
  check('I: both bank directions and its western landing edge remain usable', () => {
    for (const points of [[[8, 16], [8, 28]], [[8, 28], [8, 16]], [[4.5, 16], [4.5, 30]]]) {
      const result = route(points, 7); assert(result.reached, JSON.stringify(result)); assert.deepEqual(result.bails, []);
      assert(result.maximum - result.minimum > .8);
    }
    for (const dir of [1, -1]) {
      const result = grindRoute([bankI], { dir, pop: 3.5 });
      assert(result.captured.some(capture => capture.target && capture.dir === dir), JSON.stringify(result));
      assert.deepEqual(result.bails, []); assert(result.score > 100);
    }
  });
  check('J and K: flat rail and manual-pad edges can be ollied onto and exited', () => {
    for (const [name, rail] of [['J', flatJ], ['K', manualK]]) for (const dir of [1, -1]) {
      const result = grindRoute([rail], { dir, pop: 3.5 });
      assert(result.captured.some(capture => capture.target && capture.dir === dir), `${name}: ${JSON.stringify(result)}`);
      assert(result.longest > .5); assert.deepEqual(result.bails, []); assert(result.score > 100);
    }
  });
  check('L: both quarter heights roll in and return without false floor or wall hits', () => {
    for (const x of [7.5, 13]) {
      const skater = rider(x, 43, 0, 1, 8), bails = []; let maximum = -.9, landed = false;
      skater.events.bail = reason => bails.push(reason); skater.events.land = () => { landed = true; };
      for (let i = 0; i < 480; i++) { skater.update(dt, { ...makeState(), push: 1 }); maximum = Math.max(maximum, skater.pos.y); }
      assert.deepEqual(bails, []); assert(maximum > (x < 11 ? 1.3 : 1.9)); assert(landed);
      assert(skater.pos.y >= -.91, 'Quarter return finds the actual lower promenade');
    }
  });
  check('L: both quarter copings accept a charged approach and bank the grind on exit', () => {
    for (const x of [7.5, 13]) {
      const skater = rider(x, 43, 0, 1, 7), bails = [], copings = []; let previous = false, released = false, longest = 0, targetExited = false;
      skater.events.bail = reason => bails.push(reason);
      skater.events.grindStart = () => copings.push({ kind: skater.grind.rail.kind, height: skater.grind.rail.a.y });
      skater.events.grindEnd = () => {
        const rail = skater.grind?.rail;
        if (rail?.kind === 'coping' && Math.abs(rail.a.y - (x < 11 ? 1.4 : 2)) < .001) targetExited = true;
      };
      for (let i = 0; i < 480; i++) {
        // Finish the intended quarter line. Continuing to hold Grind would now
        // deliberately transfer onto the newly grindable street curb nearby.
        const input = makeState(); input.push = 1; input.grind = !targetExited;
        input.ollie = !released && skater.pos.z < 47.5; if (!input.ollie) released = true;
        input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous; previous = input.ollie;
        if (skater.state === 'grind') { longest = Math.max(longest, skater.grind.time); input.steer = THREE.MathUtils.clamp(-skater.balance.x * 3 - skater.balance.v, -1, 1); }
        skater.update(dt, input); if (skater.score > 0) break;
      }
      assert(copings.some(coping => coping.kind === 'coping' && Math.abs(coping.height - (x < 11 ? 1.4 : 2)) < .001));
      assert.deepEqual(bails, []); assert(longest > .5); assert(targetExited); assert(skater.score > 100);
    }
  });
}

console.log(`${passed} ROC feature checks passed${failed ? `, ${failed} failed` : ''}.`);
if (process.env.ROC_REPORT) {
  const path = resolve(process.env.ROC_REPORT); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...report, passed, failed, recordedAt: new Date().toISOString(), runtime: process.version }, null, 2) + '\n');
}
if (failed) process.exitCode = 1;

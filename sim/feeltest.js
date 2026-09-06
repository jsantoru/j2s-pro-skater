// Deterministic checks for camera and haptic feel layers. These lock down relationships and event
// timing; final amplitudes still need a controller-in-hand playtest. Usage: npm run sim:feel
import * as THREE from 'three';
import { FollowCamera, CAMERA_TUNING } from '../src/camera.js';
import { Input, makeState } from '../src/input.js';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';

const DT = 1 / 120;
let failures = 0;
function check(label, condition, detail = '') {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!condition) failures++;
}

console.log('\n=== camera layers ===');
{
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  const follow = new FollowCamera(camera, { colliders: [] });
  const sk = {
    pos: new THREE.Vector3(), heading: new THREE.Vector3(1, 0, 0), facing: new THREE.Vector3(1, 0, 0),
    vel: new THREE.Vector3(8, 0, 0), state: 'ride', speed: 8, steer: 0, spinVelocity: 0,
  };
  follow.snap(sk);
  for (let i = 0; i < 240; i++) follow.update(DT, sk, 0);
  const target = sk.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  const rideDistance = follow.pos.distanceTo(target), rideFov = camera.fov;

  sk.state = 'grind';
  for (let i = 0; i < 240; i++) follow.update(DT, sk, 0);
  const grindDistance = follow.pos.distanceTo(target), grindFov = camera.fov;
  check('riding uses a close camera with rail context during grinds', rideDistance < 3.6 && grindDistance > rideDistance + 0.5,
    `${rideDistance.toFixed(2)}m -> ${grindDistance.toFixed(2)}m`);
  check('riding retains tighter framing than grinds', rideFov < 55 && grindFov > rideFov + 1,
    `${rideFov.toFixed(2)}° -> ${grindFov.toFixed(2)}°`);
  sk.state = 'ride';
  for (const speed of [0, 8, 16]) {
    sk.speed = speed;
    for (let i = 0; i < 480; i++) follow.update(DT, sk, 0);
    camera.updateMatrixWorld();
    const head = sk.pos.clone().add(new THREE.Vector3(0, 1.75, 0)).project(camera);
    const feet = sk.pos.clone().project(camera);
    const fraction = (head.y - feet.y) / 2;
    check(`skater fills roughly half the riding view at ${speed} m/s`, fraction > 0.40 && fraction < 0.58,
      `${(fraction * 100).toFixed(1)}% of screen height`);
    check('board and head remain in frame', feet.y > -0.93 && head.y < 0.85);
  }

  sk.state = 'air'; sk.spinVelocity = 560; sk.vel.set(8, 4, 0);
  for (let i = 0; i < 24; i++) follow.update(DT, sk, 0);
  const leadDeg = Math.abs(THREE.MathUtils.radToDeg(follow.spinLead));
  check('spin lead anticipates a full-rate spin', leadDeg > 4, `${leadDeg.toFixed(2)}°`);
  check('spin lead stays capped', leadDeg <= CAMERA_TUNING.spinLeadMax + 0.01);

  follow.land(1);
  let maxPunch = 0, maxShake = follow.shake;
  for (let i = 0; i < 180; i++) {
    follow.update(DT, sk, 0);
    maxPunch = Math.max(maxPunch, Math.abs(follow.punch)); maxShake = Math.max(maxShake, follow.shake);
  }
  check('a hard landing creates a visible positional punch', maxPunch > 0.05, `${maxPunch.toFixed(3)}m`);
  check('landing shake decays fully', maxShake > 0.4 && follow.shake === 0);
  check('the impact spring settles', Math.abs(follow.punch) < 0.001, `${follow.punch.toFixed(4)}m`);
  follow.bail();
  check('a bail drives the full shake envelope', follow.shake === 1);
  check('camera output remains finite', camera.position.toArray().every(Number.isFinite) && Number.isFinite(camera.fov));
}

console.log('\n=== haptic mixer ===');
{
  const input = new Input(), emitted = [];
  input._playRumble = (strong, weak, ms) => emitted.push({ strong, weak, ms });
  input.hapticsBegin();
  input.rumbleSustain(0.3, 0.2);
  input.rumbleSustain(0.4, 0.5);
  input.rumble(0.8, 0.1, 120);
  input.hapticsCommit(1 / 60);
  const e = emitted[0];
  check('simultaneous sustained signals combine', input._hapticStrong > 0.3 && input._hapticWeak > 0.5,
    `low=${input._hapticStrong.toFixed(2)} high=${input._hapticWeak.toFixed(2)}`);
  check('an impact mixes over sustained texture', e && e.strong > 0.9 && e.weak > 0.6,
    e ? `low=${e.strong.toFixed(2)} high=${e.weak.toFixed(2)}` : 'no output');
}

console.log('\n=== spin ticks ===');
{
  const level = new Level(), sk = new Skater(level), inp = makeState(), ticks = [];
  sk.pos.set(-10, 3, 14); sk.heading.set(1, 0, 0); sk.facing.set(1, 0, 0);
  sk.speed = 8; sk.vel.set(8, 5, 0);
  sk.events.spinTick = (degrees) => ticks.push(degrees);
  sk.startAir(new THREE.Vector3(0, 1, 0), true);
  inp.steer = 1;
  for (let i = 0; i < Math.round(0.7 / DT) && sk.state === 'air'; i++) sk.update(DT, inp);
  check('one tick fires at each crossed 180° boundary', ticks.join(',') === '180,360', ticks.join(',') || 'none');
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall camera and haptic checks passed\n');
process.exit(failures ? 1 : 0);

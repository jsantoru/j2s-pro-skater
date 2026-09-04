import * as THREE from 'three';
import { Level } from './level.js';
import { Skater } from './skater.js';
import { Character } from './character.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Effects } from './fx.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const RUN_TIME = 120;
const FIXED_DT = 1 / 120;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const LOWFX = new URLSearchParams(location.search).has('lowfx'); // ?lowfx for weak GPUs: no shadows, 1x pixels
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x35405a);
scene.fog = new THREE.Fog(0x35405a, 50, 120);
{ // image-based lighting for the PBR materials (chrome rails, coping, trucks)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xdcecff, 0x5a5044, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(18, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8fb7ff, 0.35); fill.position.set(-20, 15, -15); scene.add(fill);

const level = new Level();
scene.add(level.group);
const skater = new Skater(level);
const character = new Character();
scene.add(character.root);
const followCam = new FollowCamera(camera, level);
const input = new Input();
const hud = new HUD();
const audio = new Audio();
const fx = new Effects(scene);

// ---- game state ----
let mode = 'title'; // title | playing | over
let timeLeft = RUN_TIME;
let accumulator = 0, last = performance.now();
const EDGES = ['olliePressed', 'ollieReleased', 'flipPressed', 'grabPressed', 'grindPressed'];
const pending = {};

skater.events.ollie = (charge) => { audio.pop(charge); input.rumble(0.15 + charge * 0.25, 0.3, 60); };
skater.events.trickStart = (name) => { audio.trickStart(name); const c = skater.combo; hud.combo((c.text ? c.text + ' + ' : '') + name + '…', c.points, c.multiplier); };
skater.events.land = (points, text, mult) => {
  audio.land(skater.landSquash);
  fx.burst(skater.pos, 10 + Math.round(skater.landSquash * 16), [0.75, 0.72, 0.68], 1.6 + skater.landSquash * 1.5, 0.5);
  input.rumble(Math.min(1, 0.3 + skater.landSquash * 0.7), 0.2, 90 + skater.landSquash * 120);
  followCam.land(skater.landSquash);
  hud.landed(points, text, mult); // the trick names stay up next to the payout for a beat
  if (points > 0) audio.score();
};
skater.events.bail = (reason) => {
  audio.bail();
  fx.burst(skater.pos, 24, [0.8, 0.76, 0.7], 2.5, 0.6);
  input.rumbleSustainStop(); input.rumble(1, 1, 320);
  followCam.bail();
  const why = { wall: 'SLAMMED!', trick: 'BAILED MID-TRICK', sketchy: 'SKETCHY LANDING', void: 'LOST', balance: 'LOST BALANCE' }[reason] || 'BAILED';
  hud.bailed(why, skater.lostCombo || '', skater.lostPoints || 0, skater.lostMult || 0);
};
skater.events.trick = (name) => { audio.trick(name); refreshCombo(); };
skater.events.grindStart = () => { audio.grindStart(skater.grind?.rail.kind || 'metal', skater.speed); input.rumble(0.35, 0.75, 110); input.rumbleSustainStop(); refreshCombo(); };
skater.events.grindEnd = () => { audio.grindEnd(skater.grind?.rail.kind || 'metal'); input.rumbleSustainStop(); input.rumble(0.25, 0.4, 70); refreshCombo(); };
skater.events.manualStart = () => { audio.manualStart(); input.rumble(0.3, 0.15, 70); input.rumbleSustainStop(); refreshCombo(); };
skater.events.manualEnd = () => { input.rumbleSustainStop(); refreshCombo(); };
skater.events.spinTick = () => { input.rumble(0.08, 0.58, 34); };

function refreshCombo() {
  const c = skater.combo;
  if (c.tricks.length) hud.combo(c.text, c.points, c.multiplier);
}

input.onGamepadChange = (connected, id) => {
  hud.setPad(connected, id);
  hud.toast(connected ? 'CONTROLLER CONNECTED: ' + id.slice(0, 40) : 'CONTROLLER DISCONNECTED — keyboard active');
};
hud.setPad(false);

function startRun() {
  skater.reset();
  timeLeft = RUN_TIME; mode = 'playing';
  hud.overlay(false);
  hud.combo('', 0, 0);
  followCam.snap(skater);
}
function endRun() {
  mode = 'over';
  hud.overlay(true, 'Press START / ENTER to skate again', skater.score);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
followCam.snap(skater);

// idle demo input on the title screen: nothing pressed
const idle = { steer: 0, stickY: 0, push: 0, brake: 0, ollie: false, olliePressed: false, ollieReleased: false, flipPressed: false, grab: false, grabPressed: false, grind: false, grindPressed: false, spinLeft: false, spinRight: false, camX: 0, dir8: 'C', autoPush: false };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inp = input.poll(dt);
  input.hapticsBegin();
  if (inp.anyPressed && !audio.enabled) audio.init();
  if (inp.selectPressed) hud.toggleControls();
  if (inp.startPressed) {
    if (mode === 'title' || mode === 'over') startRun();
    else if (mode === 'playing') startRun(); // restart
  }
  if (mode === 'title' && inp.anyPressed && !inp.selectPressed) startRun();

  // fixed-step simulation. Edge inputs are latched until a substep consumes them, so a press is never
  // dropped on frames that run zero substeps (high-refresh displays) and never fires twice.
  const simInput = mode === 'playing' ? inp : idle;
  for (const k of EDGES) pending[k] = pending[k] || inp[k];
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 8) {
    if (mode === 'playing') for (const k of EDGES) { simInput[k] = pending[k]; pending[k] = false; }
    skater.update(FIXED_DT, simInput);
    accumulator -= FIXED_DT; steps++;
  }
  if (mode === 'playing') {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endRun(); }
  }
  // visuals
  character.root.position.copy(skater.pos);
  character.root.quaternion.copy(skater.modelQuat);
  character.update(skater, dt, now / 1000);
  followCam.update(dt, skater, inp.camX);
  audio.update(skater);
  fx.update(dt, skater);
  // Crouching loads the low motor progressively so ollie charge can be felt before the pop.
  // It mixes with grind texture when charging an ollie off a rail.
  if (mode === 'playing' && skater.crouching && (skater.state === 'ride' || skater.state === 'grind')) {
    const charge = Math.min(1, skater.crouchTime / skater.T.crouchFull);
    input.rumbleSustain(0.008 + Math.pow(charge, 1.6) * 0.07, 0.003 + charge * 0.015);
  }
  // grinding buzzes continuously: metal (rail / coping) rides the high-frequency motor, concrete ledges
  // are a coarser low rumble. Both scale with how fast you are travelling along the rail.
  if (mode === 'playing' && skater.state === 'grind' && skater.grind) {
    const g = Math.min(1, skater.speed / 10);
    const metal = skater.grind.rail.kind !== 'ledge';
    // Balance error rides on top of the surface buzz, squared so it stays quiet until you are genuinely
    // in trouble and then climbs fast. This is the real balance display: you feel yourself going over
    // a beat before the meter tells you, without having to look away from the skater.
    const wobble = skater.balance.error * skater.balance.error;
    input.rumbleSustain(
      (metal ? 0.1 + g * 0.14 : 0.24 + g * 0.26) + wobble * 0.55,
      (metal ? 0.42 + g * 0.38 : 0.2 + g * 0.2) * (1 - wobble * 0.35), dt);
  }
  // manuals buzz too, but lighter — it is wheels on tarmac, not trucks on steel
  if (mode === 'playing' && skater.manual) {
    const w = skater.manualBalance.error * skater.manualBalance.error;
    input.rumbleSustain(0.06 + w * 0.5, 0.12 + w * 0.2, dt);
  }
  const onRail = mode === 'playing' && skater.state === 'grind' && skater.balance.active;
  const onManual = mode === 'playing' && !!skater.manual && skater.manualBalance.active;
  if (onManual) hud.balance(true, skater.manualBalance.x, true, 'MANUAL');
  else hud.balance(onRail, skater.balance.x, false, 'BALANCE');
  hud.update(dt, skater.score, timeLeft, skater.speed / 14);
  if (skater.combo.tricks.length && (skater.state === 'grind' || skater.manual)) refreshCombo();
  input.hapticsCommit(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.__game = { skater, level, input, character, followCam, startRun };

import * as THREE from 'three';
import { Level } from './level.js';
import { Skater } from './skater.js';
import { Character } from './character.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

const RUN_TIME = 120;
const FIXED_DT = 1 / 120;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const LOWFX = new URLSearchParams(location.search).has('lowfx'); // ?lowfx for weak GPUs: no shadows, 1x pixels
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x35405a);
scene.fog = new THREE.Fog(0x35405a, 50, 120);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xdcecff, 0x5a5044, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
sun.position.set(18, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
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

// ---- game state ----
let mode = 'title'; // title | playing | over
let timeLeft = RUN_TIME;
let accumulator = 0, last = performance.now();
const EDGES = ['olliePressed', 'ollieReleased', 'flipPressed', 'grabPressed', 'grindPressed'];
const pending = {};

skater.events.ollie = (charge) => { audio.pop(charge); input.rumble(0.15 + charge * 0.25, 0.3, 60); };
skater.events.trickStart = (name) => { const c = skater.combo; hud.combo((c.text ? c.text + ' + ' : '') + name + '…', c.points, c.multiplier, false); };
skater.events.land = (points, text, mult) => {
  audio.land(skater.landSquash);
  input.rumble(Math.min(1, 0.3 + skater.landSquash * 0.7), 0.2, 90 + skater.landSquash * 120);
  if (points > 0) { hud.landed(points); audio.score(); }
};
skater.events.bail = (reason) => {
  audio.bail();
  input.rumble(1, 1, 320);
  const why = { wall: 'SLAMMED!', trick: 'BAILED MID-TRICK', sketchy: 'SKETCHY LANDING', void: 'LOST' }[reason] || 'BAILED';
  hud.combo(why + (skater.lostCombo ? '  (' + skater.lostCombo + ')' : ''), 0, 0, true);
};
skater.events.trick = () => { audio.trick(); refreshCombo(); };
skater.events.grindStart = () => { audio.burst(3000, 0.08, 0.3, 'highpass'); input.rumble(0.2, 0.5, 80); refreshCombo(); };
skater.events.grindEnd = () => refreshCombo();

function refreshCombo() {
  const c = skater.combo;
  if (c.tricks.length) hud.combo(c.text, c.points, c.multiplier, false);
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
  hud.combo('', 0, 0, false);
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
const idle = { steer: 0, stickY: 0, push: 0, brake: 0, ollie: false, olliePressed: false, ollieReleased: false, flipPressed: false, grab: false, grabPressed: false, grind: false, grindPressed: false, spinLeft: false, spinRight: false, camX: 0, dir8: 'C' };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inp = input.poll(dt);
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
  hud.update(dt, skater.score, timeLeft, skater.speed / 14);
  if (skater.combo.tricks.length && skater.state === 'grind') refreshCombo();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.__game = { skater, level, input, character, followCam, startRun };

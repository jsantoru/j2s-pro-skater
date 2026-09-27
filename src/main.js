import * as THREE from 'three';
import { Level } from './level.js';
import { Skater } from './skater.js';
import { Character } from './character.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { TouchControls } from './touch-controls.js';
import { HUD } from './hud.js';
import { HighScores } from './highscores.js';
import { Settings } from './settings.js';
import { Audio } from './audio.js';
import { Effects } from './fx.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ConcreteFloor } from './concrete-floor.js';
import { lightWarehouse } from './atmosphere.js';
import { GOALS, GoalProgress, GoalRun } from './goals.js';
import { Collectibles } from './collectibles.js';
import { LevelUI } from './level-ui.js';
import { SessionClock } from './session.js';

const RUN_TIME = 120;
const FIXED_DT = 1 / 120;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const touchEnabled = TouchControls.available();
document.body.classList.toggle('touch-enabled', touchEnabled);

const canvas = document.getElementById('game');
const renderOptions = new URLSearchParams(location.search);
// Touch devices start with the lighter renderer. ?highfx restores desktop effects.
const LOWFX = renderOptions.has('lowfx') || (touchEnabled && !renderOptions.has('highfx'));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWFX, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

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
const level = new Level();
scene.add(level.group);
const atmosphere = lightWarehouse(scene, level, { lowfx: LOWFX });
const floorSurface = new ConcreteFloor(level.floor, { lowfx: LOWFX, level });
const skater = new Skater(level);
const character = new Character();
scene.add(character.root);
const followCam = new FollowCamera(camera, level);
const input = new Input();
const touchControls = new TouchControls({ root: document.getElementById('touch-controls') });
input.setTouchSource(touchControls.source);
const hud = new HUD();
const highScores = new HighScores();
const audio = new Audio();
const settings = new Settings();
const fx = new Effects(scene, { level, lowfx: LOWFX });
const progress = new GoalProgress();
// Earlier versions already recorded two-minute runs. Keep that record visible on
// the new board without awarding any of the new goals retroactively.
progress.record({ score: highScores.best });
const goals = new GoalRun(progress);
const collectibles = new Collectibles(scene);
const sessionClock = new SessionClock(RUN_TIME);
const levelUI = new LevelUI(GOALS, { onStart: startRun, onBoard: showGoalBoard });

// ---- game state ----
let mode = 'title'; // title | playing | over
let runMode = 'goals', focusGoal = GOALS[0].id;
let bankedThisStep = false;
let accumulator = 0, last = performance.now(), visualTime = 0;
const EDGES = ['olliePressed', 'ollieReleased', 'flipPressed', 'grabPressed', 'grindPressed', 'revertLeftPressed', 'revertRightPressed'];
const pending = {};
input.onTouchCancel = ({ ollie }) => {
  for (const key of EDGES) pending[key] = false;
  if (ollie) {
    skater.crouching = false; skater.crouchTime = 0;
    skater.queued = null; skater.bufferedOllie = false;
  }
};
hud.setMode(mode);

skater.events.ollie = (charge) => { audio.pop(charge); fx.ollie(skater, charge); input.rumble(0.15 + charge * 0.25, 0.3, 60); };
skater.events.trickStart = (name) => { audio.trickStart(name); const c = skater.combo; hud.combo((c.text ? c.text + ' + ' : '') + name + '…', c.points, c.multiplier); };
skater.events.land = (points, text, mult, impactHandled = false) => {
  if (points > 0) bankedThisStep = true;
  if (mode === 'playing') handleGoalEvents(goals.bankCombo(points));
  if (!impactHandled) {
    audio.land(skater.landSquash);
    input.rumble(Math.min(1, 0.3 + skater.landSquash * 0.7), 0.2, 90 + skater.landSquash * 120);
    followCam.land(skater.landSquash);
    fx.land(skater);
  }
  hud.landed(points, text, mult); // the trick names stay up next to the payout for a beat
  if (points > 0) audio.score();
};
skater.events.bail = (reason) => {
  audio.bail();
  input.rumbleSustainStop(); input.rumble(1, 1, 320);
  followCam.bail();
  fx.land(skater, 1);
  const why = { wall: 'SLAMMED!', trick: 'BAILED MID-TRICK', sketchy: 'SKETCHY LANDING', void: 'LOST', balance: 'LOST BALANCE' }[reason] || 'BAILED';
  hud.bailed(why, skater.lostCombo || '', skater.lostPoints || 0, skater.lostMult || 0);
};
skater.events.trick = (name) => { audio.trick(name); refreshCombo(); };
skater.events.grindStart = () => { audio.grindStart(skater.grind?.rail.kind || 'metal', skater.speed, skater.grind?.slide); input.rumble(0.35, 0.75, 110); input.rumbleSustainStop(); refreshCombo(); };
skater.events.grindEnd = () => { audio.grindEnd(skater.grind?.rail.kind || 'metal', skater.grind?.slide); input.rumbleSustainStop(); input.rumble(0.25, 0.4, 70); refreshCombo(); };
skater.events.manualStart = () => { audio.manualStart(); input.rumble(0.3, 0.15, 70); input.rumbleSustainStop(); refreshCombo(); };
skater.events.manualEnd = () => { input.rumbleSustainStop(); refreshCombo(); };
skater.events.spinTick = () => { input.rumble(0.08, 0.58, 34); };
skater.events.touchdown = () => { audio.land(skater.landSquash); followCam.land(skater.landSquash); fx.land(skater); input.rumble(0.35, 0.2, 90); };
skater.events.revert = () => { audio.revert(skater.speed); fx.revert(skater); input.rumble(0.18, 0.48, 110); refreshCombo(); };

function refreshCombo() {
  const c = skater.combo;
  if (c.tricks.length) hud.combo(c.text, c.points, c.multiplier);
}

input.onGamepadChange = (connected, id) => {
  hud.setPad(connected, id);
  if (!connected && touchEnabled) hud.el.pad.textContent = 'TOUCH CONTROLS';
  hud.toast(connected ? 'CONTROLLER CONNECTED: ' + id.slice(0, 40) : `CONTROLLER DISCONNECTED — ${touchEnabled ? 'touch controls' : 'keyboard'} active`);
};
hud.setPad(false);
if (touchEnabled) hud.el.pad.textContent = 'TOUCH CONTROLS';
hud.highScores(highScores.list, 0);

// Settings. The score is off unless the player has switched it on, and switching it on is itself a
// gesture, so it doubles as the permission the browser needs to start the audio context.
audio.setMusic(settings.music);
hud.musicSetting(settings.music);
hud.onMusicToggle = () => {
  const on = settings.toggleMusic();
  if (on && !audio.enabled) audio.init();
  audio.setMusic(on);
  hud.musicSetting(on);
};
function syncPause() {
  const open = hud.settingsOpen || hud.controlsOpen;
  document.body.dataset.paused = String(open);
  input.setMenuOpen(open || mode !== 'playing');
  touchControls.setActive(touchEnabled && mode === 'playing' && !open);
  input.stopHaptics();
  audio.setPaused(open || mode !== 'playing');
  accumulator = 0; last = performance.now();
  for (const k of EDGES) pending[k] = false;
  if (!open) {
    // Releasing an ollie button in the menu must not pop on return to skating.
    // The visual pose eases out normally once simulation resumes.
    if (skater.crouching) { skater.crouching = false; skater.crouchTime = 0; skater.queued = null; }
    skater.bufferedOllie = false;
  }
}
hud.onPauseChange = syncPause;
hud.onControlsChange = syncPause;
hud.onRestart = () => {
  if (runMode === 'goals') levelUI.focusUnfinished(progress.snapshot());
  startRun(runMode, levelUI.selectedGoal);
};
hud.onBoard = () => showGoalBoard();

function handleGoalEvents(events) {
  for (const event of events) {
    if (event.type === 'goal') {
      levelUI.notifyGoal(event.goal);
      input.rumble(0.25, 0.5, 160);
    } else if (event.type === 'pickup') {
      audio.score();
      input.rumble(0.08, 0.3, 65);
    }
  }
  if (events.length) collectibles.sync(goals.collected, goals.availableGoals);
}

function startRun(selectedMode = 'goals', selectedGoal = levelUI.selectedGoal) {
  hud.toggleSettings(false);
  if (!audio.enabled) audio.init();
  input.stopHaptics();
  input.setMenuOpen(false);
  accumulator = 0; last = performance.now();
  for (const k of EDGES) pending[k] = false;
  skater.reset();
  fx.clear();
  const remaining = GOALS.filter(goal => !progress.has(goal.id));
  runMode = selectedMode === 'free' || !remaining.length ? 'free' : 'goals';
  const requestedGoal = selectedGoal ?? levelUI.selectedGoal;
  focusGoal = (remaining.find(goal => goal.id === requestedGoal) || remaining[0])?.id || null;
  levelUI.focusUnfinished(progress.snapshot());
  levelUI.selectGoal(focusGoal);
  goals.start({ mode: runMode, skater });
  sessionClock.start(runMode);
  collectibles.sync(goals.collected, goals.availableGoals);
  mode = 'playing';
  document.body.dataset.mode = mode;
  hud.setMode(mode);
  hud.toggleControls(false);
  levelUI.hide();
  hud.combo('', 0, 0);
  hud.shownScore = 0;
  hud.el.timer.classList.remove('overtime');
  document.querySelector('#venue > span:last-child').textContent = runMode === 'free' ? '01 / FREE SKATE' : '01 / GOAL RUN';
  document.getElementById('top-center').dataset.session = runMode === 'free' ? 'FREE SKATE' : 'GOAL RUN';
  followCam.snap(skater);
  audio.setPaused(false);
  touchControls.setActive(touchEnabled);
}
function endRun() {
  if (mode !== 'playing') return;
  mode = 'over';
  sessionClock.finish();
  const result = goals.finish();
  input.setMenuOpen(true);
  touchControls.setActive(false);
  input.stopHaptics();
  audio.setPaused(true);
  hud.toggleSettings(false);
  document.body.dataset.mode = mode;
  hud.setMode(mode);
  // Bank the run before the overlay draws, so the table shows where it landed. The score to beat
  // only moves now — during a run it stays the target you started with.
  const rank = runMode === 'goals' ? highScores.submit(skater.score) : 0;
  levelUI.showResults(result, progress.snapshot());
  hud.highScores(highScores.list, rank);
  collectibles.update(0, false, camera);
}

function showGoalBoard() {
  mode = 'title';
  sessionClock.finish();
  goals.finish();
  hud.toggleSettings(false);
  hud.setMode(mode);
  document.body.dataset.mode = mode;
  input.setMenuOpen(true);
  touchControls.setActive(false);
  input.stopHaptics();
  hud.toggleControls(false);
  hud.combo('', 0, 0);
  hud.balance(false, 0, false);
  fx.clear();
  skater.reset();
  followCam.snap(skater);
  collectibles.update(0, false, camera);
  levelUI.showBoard(progress.snapshot());
  audio.setPaused(true);
  accumulator = 0; last = performance.now();
}
document.getElementById('overlay-controls').addEventListener('click', (event) => {
  hud.toggleControls(); event.currentTarget.blur();
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
followCam.snap(skater);
showGoalBoard();

// Losing the tab must never burn a run or leave a held direction skating unattended.
window.addEventListener('blur', () => { if (mode === 'playing') hud.toggleSettings(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') hud.toggleSettings(true);
});

// idle demo input on the title screen: nothing pressed
const idle = { steer: 0, stickY: 0, push: 0, brake: 0, ollie: false, olliePressed: false, ollieReleased: false, flipPressed: false, grab: false, grabPressed: false, grind: false, grindPressed: false, spinLeft: false, spinRight: false, camX: 0, dir8: 'C', autoPush: false };

function frame(now) {
  requestAnimationFrame(frame);
  // The first RAF timestamp can precede `last` after synchronous asset creation.
  // Never let that subtract seconds from the fixed-step accumulator at startup.
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  const inp = input.poll(dt);
  if (inp.anyPressed && !audio.enabled) audio.init();
  if (hud.controlsOpen && !hud.settingsOpen) {
    if (inp.selectPressed || inp.pausePressed || inp.menuCancel || inp.startPressed) hud.toggleControls(false);
    audio.update(skater);
    renderer.render(scene, camera);
    return;
  }
  if (hud.settingsOpen) {
    hud.updateMenuInput(inp);
    audio.update(skater);
    renderer.render(scene, camera);
    return;
  }
  if (inp.pausePressed || (inp.startPressed && mode === 'playing')) {
    hud.toggleSettings(true);
    renderer.render(scene, camera);
    return;
  }
  input.hapticsBegin();
  if (inp.selectPressed) {
    hud.toggleControls(true);
    renderer.render(scene, camera);
    return;
  }
  if (mode !== 'playing') levelUI.updateMenuInput(inp);
  visualTime += dt;
  levelUI.tick?.(dt);

  // fixed-step simulation. Edge inputs are latched until a substep consumes them, so a press is never
  // dropped on frames that run zero substeps (high-refresh displays) and never fires twice.
  const simInput = mode === 'playing' ? inp : idle;
  for (const k of EDGES) pending[k] = pending[k] || inp[k];
  accumulator += mode === 'playing' ? dt : 0;
  let steps = 0;
  while (mode === 'playing' && accumulator >= FIXED_DT && steps < 12) {
    if (mode === 'playing') for (const k of EDGES) { simInput[k] = pending[k]; pending[k] = false; }
    bankedThisStep = false;
    skater.update(FIXED_DT, simInput);
    const ended = sessionClock.advance(FIXED_DT, skater, { banked: bankedThisStep });
    handleGoalEvents(goals.update(skater, { collect: !ended && !sessionClock.overtime && sessionClock.remaining > 0 }));
    accumulator -= FIXED_DT; steps++;
    if (ended) endRun();
  }
  // visuals
  character.root.position.copy(skater.pos);
  character.root.quaternion.copy(skater.modelQuat);
  character.update(skater, dt, visualTime);
  followCam.update(dt, skater, inp.camX);
  audio.update(skater);
  fx.update(dt, skater);
  collectibles.update(dt, mode === 'playing' && runMode === 'goals' && !sessionClock.overtime, camera);
  atmosphere.update(visualTime);
  if (mode === 'title') {
    // A slow establishing shot gives the title the same rendered park as gameplay.
    const t = reducedMotion.matches ? 0 : visualTime * 0.035;
    camera.position.set(-16 + Math.sin(t) * 3, 4.1, 18 + Math.cos(t) * 2);
    camera.lookAt(5, 1.4, -4);
    camera.fov = 56; camera.updateProjectionMatrix();
  }
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
  if (onManual) hud.balance(true, skater.manualBalance.x, true, character, camera);
  else hud.balance(onRail, skater.balance.x, false, character, camera);
  hud.update(dt, skater.score, sessionClock.remaining, highScores.best);
  hud.el.timer.classList.toggle('overtime', sessionClock.overtime);
  if (sessionClock.overtime) hud.el.timer.textContent = 'LAND IT!';
  levelUI.update({ ...goals.snapshot(), focusGoal, overtime: sessionClock.overtime });
  if (skater.combo.tricks.length && (skater.state === 'grind' || skater.manual)) refreshCombo();
  input.hapticsCommit(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.__game = { skater, level, input, touchControls, character, followCam, startRun, endRun, showGoalBoard, highScores, settings, audio, renderer, scene, camera, floorSurface, atmosphere, fx, goals, progress, collectibles, levelUI, sessionClock,
  get session() { return { mode, runMode, focusGoal, paused: hud.settingsOpen || hud.controlsOpen, timeLeft: sessionClock.remaining, overtime: sessionClock.overtime, visualTime }; } };

import * as THREE from 'three';
import { Level } from './level.js';
import { RocCityLevel } from './roc-city-level.js';
import { ROC_PICKUPS } from './roc-city-layout.js';
import { createRocCityArt } from './roc-city-art.js';
import { upgradeRocCityConcrete } from './roc-city-concrete.js';
import { PerintonLevel } from './perinton-level.js';
import { PERINTON_PICKUPS } from './perinton-layout.js';
import { createPerintonArt, registerPerintonArtFixtures } from './perinton-art.js';
import { upgradePerintonConcrete } from './perinton-concrete.js';
import { Skater } from './skater.js';
import { Character } from './character.js';
import { CHARACTERS, CharacterSelection } from './characters.js';
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
import { PICKUPS, GoalProgress, GoalRun } from './goals.js';
import { LEVEL_GOAL_CONFIGS } from './level-goals.js';
import { LEVELS } from './levels.js';
import { Collectibles } from './collectibles.js';
import { LevelUI } from './level-ui.js';
import { FrontEnd } from './front-end.js';
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
const worldDefinitions={
  'genesee-warehouse':{pickups:PICKUPS,build:()=>new Level(),light:lightWarehouse,
    floor:level=>new ConcreteFloor(level.floor,{lowfx:LOWFX,level})},
  'roc-city-skatepark':{pickups:ROC_PICKUPS,build:()=>new RocCityLevel(),light:createRocCityArt,floor:upgradeRocCityConcrete},
  'perinton-skatepark':{pickups:PERINTON_PICKUPS,build:()=>{
    const level=new PerintonLevel();registerPerintonArtFixtures(level);return level;
  },light:createPerintonArt,floor:upgradePerintonConcrete},
};
const careers = new Map(LEVELS.map(metadata => {
  const config = { ...metadata, ...LEVEL_GOAL_CONFIGS[metadata.id], pickups: worldDefinitions[metadata.id].pickups };
  const progress = new GoalProgress(undefined, { key: config.progressKey, goals: config.goals });
  const highScores = new HighScores(undefined, { key: config.highScoresKey });
  // Preserve the original recorded warehouse best without awarding new goals.
  progress.record({ score: highScores.best });
  return [metadata.id, { config, progress, highScores, goals: new GoalRun(progress, config), focusGoal: config.goals[0].id }];
}));
// Each park is built once. Inactive roots, including their lights and pickups,
// are detached entirely; switching never accumulates resources or colliders.
const levelRuntimes = new Map();
function runtimeFor(id) {
  if (levelRuntimes.has(id)) return levelRuntimes.get(id);
  const root = new THREE.Group(); root.name = `Level: ${id}`;
  const definition=worldDefinitions[id];
  const level = definition.build();
  root.add(level.group);
  const atmosphere = definition.light(root, level, { lowfx: LOWFX });
  const floorSurface = definition.floor(level,levelRuntimes.get('genesee-warehouse')?.floorSurface);
  const config = careers.get(id).config;
  const collectibles = new Collectibles(root, { pickups: config.pickups, name: `${config.title} goal pickups` });
  const runtime = { root, level, atmosphere, floorSurface, collectibles,
    background: atmosphere.background ?? root.background,
    fog: atmosphere.fog ?? root.fog,
    environmentIntensity: atmosphere.environmentIntensity ?? root.environmentIntensity ?? 0.32,
    toneMappingExposure: atmosphere.toneMappingExposure ?? 0.9,
  };
  levelRuntimes.set(id, runtime);
  return runtime;
}
function applyEnvironment(runtime) {
  scene.background = runtime.background;
  scene.fog = runtime.fog;
  scene.environmentIntensity = runtime.environmentIntensity;
  renderer.toneMappingExposure = runtime.toneMappingExposure;
  camera.far = runtime.atmosphere.cameraFar ?? 200;
  camera.updateProjectionMatrix();
}
let activeLevelId = 'genesee-warehouse';
let activeCareer = careers.get(activeLevelId), activeRuntime = runtimeFor(activeLevelId);
let { config: activeConfig, progress, goals, highScores } = activeCareer;
let { level, atmosphere, floorSurface, collectibles } = activeRuntime;
scene.add(activeRuntime.root);
applyEnvironment(activeRuntime);
const skater = new Skater(level);
const characterSelection = new CharacterSelection();
const character = new Character({ characterId: characterSelection.id });
scene.add(character.root);
const followCam = new FollowCamera(camera, level);
const input = new Input();
const touchControls = new TouchControls({ root: document.getElementById('touch-controls') });
input.setTouchSource(touchControls.source);
const hud = new HUD();
const audio = new Audio();
const settings = new Settings();
const fx = new Effects(scene, { level, lowfx: LOWFX });
const sessionClock = new SessionClock(RUN_TIME);
const levelUI = new LevelUI(activeConfig.goals, { onStart: startRun, onBoard: showGoalBoard, onLevels: showLevelSelect, onHome: showHome,
  onResetGoals: resetLevelGoals, onResetModalChange: () => { input.stopHaptics(); accumulator=0; last=performance.now(); } });
levelUI.setLevel(activeConfig, progress.snapshot());
const frontEnd = new FrontEnd({
  onLevels: showLevelSelect, onHome: showHome,
  onLevel: selectLevel,
  onCharacters: showCharacterSelect, onCharacter: selectCharacter, onCharacterBack: leaveCharacterSelect,
  onControls: () => hud.toggleControls(true), onSettings: () => hud.toggleSettings(true),
});
frontEnd.setCharacter(characterSelection.id);

// ---- game state ----
let mode = 'home'; // home | levels | characters | title (goal board) | playing | over
let characterReturnMode = 'home';
let runMode = 'goals', focusGoal = activeConfig.goals[0].id;
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
hud.onLevels = () => showLevelSelect();
hud.onHome = () => showHome();

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
  frontEnd.hide();
  hud.toggleSettings(false);
  if (!audio.enabled) audio.init();
  input.stopHaptics();
  input.setMenuOpen(false);
  accumulator = 0; last = performance.now();
  for (const k of EDGES) pending[k] = false;
  skater.reset();
  fx.clear();
  const remaining = activeConfig.goals.filter(goal => !progress.has(goal.id));
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
  document.querySelector('#venue > span:last-child').textContent = `${String(activeConfig.order).padStart(2, '0')} / ${runMode === 'free' ? 'FREE SKATE' : 'GOAL RUN'}`;
  document.getElementById('top-center').dataset.session = runMode === 'free' ? 'FREE SKATE' : 'GOAL RUN';
  followCam.snap(skater);
  audio.setPaused(false);
  touchControls.setActive(touchEnabled);
}
function endRun() {
  if (mode !== 'playing') return;
  mode = 'over';
  frontEnd.hide();
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

// Every route out of a session uses the same cleanup. Completed career goals are
// already saved at the moment they are earned; an unfinished combo is discarded.
function enterMenu(nextMode) {
  mode = nextMode;
  sessionClock.finish();
  goals.finish();
  hud.setMode(mode);
  document.body.dataset.mode = mode;
  hud.toggleSettings(false);
  hud.toggleControls(false);
  input.setMenuOpen(true);
  touchControls.setActive(false);
  input.stopHaptics();
  for (const k of EDGES) pending[k] = false;
  hud.combo('', 0, 0);
  hud.balance(false, 0, false);
  hud.toastTimer = 0;
  hud.el.toast.classList.remove('show');
  fx.clear();
  skater.reset();
  followCam.snap(skater);
  collectibles.update(0, false, camera);
  levelUI.hide();
  frontEnd.hide();
  audio.setPaused(true);
  document.body.dataset.paused = 'false';
  accumulator = 0; last = performance.now();
}
function showHome() {
  enterMenu('home');
  frontEnd.showHome(progressByLevel(), activeLevelId);
  document.getElementById('boot-screen').hidden = true;
}
function showLevelSelect() {
  enterMenu('levels');
  frontEnd.showLevels(progressByLevel(), activeLevelId);
}
function showCharacterSelect() {
  // Character changes belong between runs; opening a wardrobe must not end one.
  if (mode !== 'home' && mode !== 'levels') return false;
  characterReturnMode = mode;
  enterMenu('characters');
  frontEnd.showCharacters(progressByLevel(), activeLevelId, characterSelection.id, characterReturnMode);
  return true;
}
function selectCharacter(id) {
  if (mode !== 'characters' || !CHARACTERS.some(candidate => candidate.id === id)) return false;
  character.setCharacter(id);
  characterSelection.select(id);
  frontEnd.setCharacter(id);
  leaveCharacterSelect();
  return true;
}
function leaveCharacterSelect() {
  if (mode !== 'characters') return;
  if (characterReturnMode === 'levels') showLevelSelect();
  else showHome();
  // Return focus to the control that opened the selector.
  frontEnd.root.querySelector(characterReturnMode === 'levels' ? '#fe-level-skater' : '#fe-skater')?.focus({ preventScroll: false });
}
function progressByLevel() {
  return Object.fromEntries([...careers].map(([id, career]) => [id, career.progress.snapshot()]));
}
function selectLevel(id) {
  if (!careers.has(id) || !careers.get(id).config.playable) return false;
  if (id !== activeLevelId) {
    // Finish and cancel the old session before any object references change.
    enterMenu('levels');
    activeCareer.focusGoal = levelUI.selectedGoal;
    const nextRuntime = runtimeFor(id);
    activeRuntime.root.removeFromParent();
    activeLevelId = id;
    activeCareer = careers.get(id); activeRuntime = nextRuntime;
    ({ config: activeConfig, progress, goals, highScores } = activeCareer);
    ({ level, atmosphere, floorSurface, collectibles } = activeRuntime);
    scene.add(activeRuntime.root); activeRuntime.root.updateMatrixWorld(true);
    applyEnvironment(activeRuntime);
    skater.level = level; followCam.level = level; fx.level = level;
    skater.reset(); fx.clear();
    followCam.dirAngle = Math.atan2(skater.heading.x, skater.heading.z);
    followCam.nudge = 0; followCam.smoothSpeed = 0;
    followCam.snap(skater);
    levelUI.setLevel(activeConfig, progress.snapshot());
    levelUI.selectGoal(activeCareer.focusGoal);
    focusGoal = levelUI.selectedGoal; runMode = 'goals';
    hud.highScores(highScores.list, 0);
  }
  showGoalBoard();
  return true;
}
function showGoalBoard() {
  enterMenu('title');
  levelUI.showBoard(progress.snapshot());
}
function resetLevelGoals(id) {
  if(mode!=='title'||id!==activeLevelId)return false;
  // Discard the previous run before clearing career flags. Its old completed
  // snapshot must never write those flags back during a later menu transition.
  goals.reset();
  progress.resetCompleted();
  levelUI.focusUnfinished(progress.snapshot());
  focusGoal=levelUI.selectedGoal;activeCareer.focusGoal=focusGoal;
  showGoalBoard();
  return true;
}
function navigateBack() {
  if (mode === 'characters') leaveCharacterSelect();
  else if (mode === 'over') showGoalBoard();
  else if (mode === 'title') showLevelSelect();
  else if (mode === 'levels') showHome();
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
showHome();

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
  if(levelUI.resetDialogOpen){
    levelUI.updateResetInput(inp);
    audio.update(skater);renderer.render(scene,camera);return;
  }
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
  if (inp.pausePressed || (inp.startPressed && mode === 'playing') || (inp.menuCancel && mode !== 'playing')) {
    if (mode === 'playing' || (mode === 'home' && inp.pausePressed)) hud.toggleSettings(true);
    else navigateBack();
    renderer.render(scene, camera);
    return;
  }
  input.hapticsBegin();
  if (inp.selectPressed && !frontEnd.isOpen) {
    hud.toggleControls(true);
    renderer.render(scene, camera);
    return;
  }
  if (mode === 'home' || mode === 'levels' || mode === 'characters') frontEnd.updateMenuInput(inp);
  else if (mode !== 'playing') levelUI.updateMenuInput(inp);
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
  if (mode === 'home' || mode === 'levels' || mode === 'characters' || mode === 'title') {
    // A slow establishing shot gives the title the same rendered park as gameplay.
    const t = reducedMotion.matches ? 0 : visualTime * 0.035;
    if (activeLevelId === 'roc-city-skatepark') {
      const scale = level.horizontalScale;
      if (mode === 'home') {
        camera.position.set((-28 + Math.sin(t) * 2) * scale, 16 * scale, (-38 + Math.cos(t)) * scale);
        camera.lookAt(-2 * scale, 0, 8 * scale);
      } else {
        camera.position.set((-35 + Math.sin(t) * 2) * scale, 24 * scale, (35 + Math.cos(t) * 2) * scale);
        camera.lookAt(-1 * scale, 0, -5 * scale);
      }
      camera.fov = 60;
    } else if (activeLevelId==='perinton-skatepark') {
      const view=mode==='home'?(level.homeCamera||level.menuCamera):level.menuCamera;
      camera.position.fromArray(view.position);camera.position.x+=Math.sin(t)*1.3;camera.position.z+=Math.cos(t)*.7;
      camera.lookAt(...view.target);camera.fov=view.fov||58;
    } else if (mode === 'home') {
      camera.position.set(-9 + Math.sin(t) * 1.6, 3.1, 23 + Math.cos(t) * 0.7);
      camera.lookAt(4.5, 1.25, 2);
      camera.fov = 58;
    } else {
      camera.position.set(-16 + Math.sin(t) * 3, 4.1, 18 + Math.cos(t) * 2);
      camera.lookAt(5, 1.4, -4);
      camera.fov = 56;
    }
    camera.updateProjectionMatrix();
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

window.__game = { skater, input, touchControls, character, characterSelection, followCam, startRun, endRun, showHome, showLevelSelect, showCharacterSelect, selectCharacter, showGoalBoard, selectLevel, settings, audio, renderer, scene, camera, fx, levelUI, frontEnd, sessionClock,
  get level() { return level; }, get highScores() { return highScores; }, get floorSurface() { return floorSurface; }, get atmosphere() { return atmosphere; },
  get goals() { return goals; }, get progress() { return progress; }, get collectibles() { return collectibles; }, get levelConfig() { return activeConfig; },
  get loadedLevels() { return [...levelRuntimes.keys()]; }, get careers() { return progressByLevel(); },
  get session() { return { levelId: activeLevelId, mode, runMode, focusGoal, paused: hud.settingsOpen || hud.controlsOpen, timeLeft: sessionClock.remaining, overtime: sessionClock.overtime, visualTime }; } };

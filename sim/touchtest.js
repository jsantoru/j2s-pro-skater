// Input merging, rapid taps, pointer ownership and interrupted mobile gestures.
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';
import { TouchInput } from '../src/touch-input.js';
import { TouchControls } from '../src/touch-controls.js';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';

const DT = 1 / 120;
let checks = 0;
function check(label, fn) { fn(); checks++; console.log('PASS: ' + label); }
const fresh = () => { const input = new Input(), touch = new TouchInput(); input.setTouchSource(touch); return { input, touch }; };

check('idle touch preserves keyboard input, live stick supplies proportional axes and directions', () => {
  const { input, touch } = fresh();
  input.keys.add('KeyD'); input.keys.add('KeyW');
  let state = input.poll(1 / 6);
  assert.equal(state.steer, 1); assert.equal(state.push, 1);
  touch.setStick(-0.6, 0.6);
  state = input.poll(DT);
  assert(state.steer < -0.4 && state.steer > -0.7); assert.equal(state.dir8, 'NW');
  assert(state.push > 0 && state.push < 1); assert.equal(state.brake, 0);
  touch.setStick(0, -1);
  state = input.poll(DT); assert.equal(state.brake, 1); assert.equal(state.stickY, -1);
  touch.setStick(0, 0);
  state = input.poll(DT); assert.equal(state.steer, 0); assert.equal(state.push, 0);
  touch.setStick(0, 0, false);
  state = input.poll(DT); assert.equal(state.steer, 1); assert.equal(state.push, 1);
});

check('a whole Ollie tap between polls emits both edges once and really pops', () => {
  const { input, touch } = fresh(), skater = new Skater(new Level());
  let pops = 0; skater.events.ollie = () => pops++;
  touch.press('ollie'); touch.release('ollie');
  const state = input.poll(DT);
  assert.equal(state.ollie, false); assert.equal(state.olliePressed, true); assert.equal(state.ollieReleased, true);
  skater.update(DT, state); assert.equal(pops, 1); assert.equal(skater.state, 'air');
  assert.equal(input.poll(DT).olliePressed, false); assert.equal(input.state.ollieReleased, false);
});

check('held Ollie charges while a separate finger queues a flip and selects direction', () => {
  const { input, touch } = fresh(), skater = new Skater(new Level());
  touch.setStick(0, 1); touch.press('ollie');
  for (let step = 0; step < 60; step++) skater.update(DT, input.poll(DT));
  assert(skater.crouchTime >= 0.49);
  touch.press('flip'); touch.release('flip');
  skater.update(DT, input.poll(DT));
  assert.equal(skater.queued.kind, 'flip');
  touch.release('ollie'); skater.update(DT, input.poll(DT));
  assert.equal(skater.state, 'air'); assert.equal(skater.trick.name, 'Impossible');
});

check('tap Flip, Grind and Revert retain edges; Grab stays held until release', () => {
  const { input, touch } = fresh();
  for (const [action, edge] of [['flip', 'flipPressed'], ['grind', 'grindPressed'], ['revert', 'revertRightPressed']]) {
    touch.press(action); touch.release(action);
    assert.equal(input.poll(DT)[edge], true); assert.equal(input.poll(DT)[edge], false);
  }
  touch.press('grab');
  assert.equal(input.poll(DT).grabPressed, true); assert.equal(input.state.grab, true);
  assert.equal(input.poll(DT).grabPressed, false); assert.equal(input.state.grab, true);
  touch.release('grab'); assert.equal(input.poll(DT).grab, false);
});

check('down-up touch stick flick enters a real manual through existing physics', () => {
  const { input, touch } = fresh(), skater = new Skater(new Level(), () => 0.5);
  skater.speed = 7;
  skater.update(DT, input.poll(DT));
  touch.setStick(0, -1); skater.update(DT, input.poll(DT));
  touch.setStick(0, 1); skater.update(DT, input.poll(DT));
  assert(skater.manual);
});

check('cancel discards a charged touch Ollie without generating a pop or release', () => {
  const { input, touch } = fresh(), skater = new Skater(new Level());
  let pops = 0, cancellations = 0;
  skater.events.ollie = () => pops++;
  input.onTouchCancel = ({ ollie }) => {
    cancellations++;
    if (ollie) { skater.crouching = false; skater.crouchTime = 0; skater.queued = null; skater.bufferedOllie = false; }
  };
  touch.press('ollie'); skater.update(DT, input.poll(DT)); assert(skater.crouching);
  touch.reset();
  const state = input.poll(DT);
  assert.equal(state.olliePressed, false); assert.equal(state.ollieReleased, false);
  skater.update(DT, state); assert.equal(pops, 0); assert.equal(skater.state, 'ride'); assert.equal(cancellations, 1);
  touch.press('ollie'); touch.release('ollie'); touch.reset();
  assert.equal(input.poll(DT).olliePressed, false, 'cancelled rapid taps never reach gameplay');
});

check('menus cancel touches, reject new menu touches and require a fresh gesture after resume', () => {
  const { input, touch } = fresh();
  touch.press('ollie'); touch.setStick(1, 0); input.poll(DT);
  input.setMenuOpen(true);
  touch.press('flip'); touch.setStick(-1, 0);
  assert.equal(input.poll(DT).steer, 0); assert.equal(input.state.flipPressed, false);
  input.setMenuOpen(false);
  const state = input.poll(DT);
  assert.equal(state.ollie, false); assert.equal(state.ollieReleased, false); assert.equal(state.steer, 0);
  touch.press('ollie'); assert.equal(input.poll(DT).olliePressed, true);
});

check('cancelling an idle touch layer cannot interfere with a keyboard hold', () => {
  const { input, touch } = fresh(); let cancellations = 0;
  input.onTouchCancel = () => cancellations++;
  input.keys.add('Space'); input.poll(DT);
  touch.reset();
  const state = input.poll(DT);
  assert.equal(state.ollie, true); assert.equal(state.ollieReleased, false); assert.equal(cancellations, 0);
  touch.press('ollie'); touch.release('ollie');
  assert.equal(input.poll(DT).ollieReleased, false, 'a touch tap never releases a keyboard Ollie');
});

check('touch-idle preserves a controller, and cancelled stick restores controller direction', () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = { index: 0, connected: true, id: 'Touch QA pad', axes: [.8, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  try {
    const { input, touch } = fresh();
    assert(input.poll(DT).steer > .7);
    touch.setStick(-1, 0); assert.equal(input.poll(DT).steer, -1);
    touch.reset(); assert(input.poll(DT).steer > .7);
    pad.buttons[0] = { pressed: true, value: 1 };
    assert.equal(input.poll(DT).olliePressed, true);
    touch.press('ollie'); touch.release('ollie');
    assert.equal(input.poll(DT).ollieReleased, false);
    pad.buttons[0] = { pressed: false, value: 0 };
    assert.equal(input.poll(DT).ollieReleased, true);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  }
});

class Target {
  constructor() {
    this.listeners = new Map(); this.classes = new Set(); this.style = {}; this.dataset = {}; this.captured = new Set();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry !== fn)); }
  dispatch(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler({ preventDefault() {}, ...event }); }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; }
}

check('pointer capture supports simultaneous stick, Ollie and flip with independent owners', () => {
  const root = new Target(), view = new Target(), doc = new Target(), stick = new Target(), knob = new Target();
  const buttons = ['ollie', 'flip', 'grab', 'grind', 'revert'].map(action => { const button = new Target(); button.dataset.touchAction = action; return button; });
  root.ownerDocument = doc; doc.defaultView = view;
  root.querySelector = id => id === '#touch-stick' ? stick : knob;
  root.querySelectorAll = () => buttons;
  const controls = new TouchControls({ root }), input = new Input(); input.setTouchSource(controls.source);
  assert.equal(root.hidden, true); controls.setActive(true); assert.equal(root.hidden, false);
  stick.dispatch('pointerdown', { pointerId: 1, clientX: 60, clientY: 10 });
  buttons[0].dispatch('pointerdown', { pointerId: 2 });
  buttons[1].dispatch('pointerdown', { pointerId: 3 });
  let state = input.poll(DT); assert(state.push > .9 && state.ollie && state.flipPressed);
  buttons[0].dispatch('pointerdown', { pointerId: 4 });
  view.dispatch('pointerup', { pointerId: 4 }); assert.equal(controls.source.held.has('ollie'), true, 'another finger cannot steal or release Ollie');
  view.dispatch('pointerup', { pointerId: 3 }); assert.equal(controls.pointers.size, 2);
  root.dispatch('lostpointercapture', { pointerId: 3 }); assert.equal(controls.pointers.size, 2, 'normal capture release must not cancel other fingers');
  view.dispatch('pointerup', { pointerId: 2 });
  state = input.poll(DT); assert.equal(state.ollieReleased, true); assert(state.push > .9);
  root.dispatch('pointermove', { pointerId: 1, clientX: 10, clientY: 60 });
  assert.equal(input.poll(DT).steer, -1);
  root.dispatch('lostpointercapture', { pointerId: 1 });
  assert.equal(controls.pointers.size, 0); assert.equal(input.poll(DT).steer, 0);
  for (const interruption of ['pointercancel', 'blur', 'resize', 'visibilitychange']) {
    buttons[0].dispatch('pointerdown', { pointerId: 8 }); input.poll(DT);
    if (interruption === 'visibilitychange') { doc.hidden = true; doc.dispatch(interruption); }
    else view.dispatch(interruption, { pointerId: 8 });
    assert.equal(controls.pointers.size, 0, interruption);
    assert.equal(input.poll(DT).ollieReleased, false, interruption + ' has no phantom release');
  }
  controls.setActive(false); buttons[0].dispatch('pointerdown', { pointerId: 9 });
  assert.equal(controls.pointers.size, 0); assert.equal(root.inert, true);
  controls.dispose(); assert.equal([...view.listeners.values()].flat().length, 0);
});

console.log(`\n${checks} touch input checks passed.`);

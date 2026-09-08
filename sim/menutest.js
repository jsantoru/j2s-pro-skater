import { Input } from '../src/input.js';
import assert from 'node:assert/strict';
const listeners = {};
globalThis.window = { addEventListener(type, fn) { listeners[type] = fn; } };
const input = new Input();
for (const code of ['Enter','Space']) {
  listeners.keydown({ code, target: { closest: () => ({ tagName: 'BUTTON' }) } });
  assert.ok(!input.keys.has(code) && !input.latched.has(code), 'Menu activation must not leak into skating');
  listeners.keydown({ code, target: { closest: () => null }, preventDefault() {} });
  assert.ok(input.keys.has(code) && input.latched.has(code), 'Gameplay keys still latch normally');
  listeners.keyup({code}); input.latched.clear();
}
console.log('PASS: button activation and gameplay key edges remain separate.');

const down = code => listeners.keydown({ code, target: { closest: () => null }, preventDefault() {} });
const up = code => listeners.keyup({ code });
down('Escape');
assert.equal(input.poll(1 / 60).pausePressed, true);
assert.equal(input.poll(1 / 60).pausePressed, false, 'Holding Escape toggles only once');
up('Escape'); input.poll(1 / 60);
input.setMenuOpen(true);
down('KeyJ'); down('ArrowRight');
assert.equal(input.poll(1 / 60).flipPressed, false);
assert.equal(input.state.steer, 0, 'Keyboard navigation cannot steer while paused');
input.setMenuOpen(false);
assert.equal(input.poll(1 / 60).flipPressed, false, 'A menu key held through resume stays blocked');
assert.equal(input.state.steer, 0);
up('KeyJ'); up('ArrowRight'); input.poll(1 / 60);
down('KeyJ'); assert.equal(input.poll(1 / 60).flipPressed, true, 'A fresh gameplay key works after release');
up('KeyJ'); input.poll(1 / 60);

let resets = 0;
const pad = { index: 0, connected: true, id: 'QA', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  vibrationActuator: { reset() { resets++; return Promise.resolve(); } } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
const press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
press(9, true); assert.equal(input.poll(1 / 60).startPressed, true);
assert.equal(input.poll(1 / 60).startPressed, false, 'Holding Start cannot immediately close the menu');
press(9, false); input.poll(1 / 60);
input.setMenuOpen(true);
pad.axes[1] = .9; press(0, true);
let state = input.poll(1 / 60);
assert.equal(state.menuMove, 1); assert.equal(state.menuConfirm, true);
assert.equal(state.ollie, false); assert.equal(state.brake, 0);
state = input.poll(1 / 60);
assert.equal(state.menuMove, 0); assert.equal(state.menuConfirm, false, 'Menu selection is edge-triggered');
input.setMenuOpen(false);
state = input.poll(1 / 60);
assert.equal(state.ollie, false); assert.equal(state.ollieReleased, false); assert.equal(state.brake, 0);
press(0, false); pad.axes[1] = 0; input.poll(1 / 60);
press(0, true); assert.equal(input.poll(1 / 60).olliePressed, true);
press(0, false); assert.equal(input.poll(1 / 60).ollieReleased, true, 'Fresh A press/release still ollies');
input.rumble(1, 1, 500); input.stopHaptics();
assert.equal(resets, 1); assert.equal(input._pulseT, 0, 'Pausing stops hardware feedback and queued impacts');
console.log('PASS: pause edges, keyboard/controller menu isolation, held-input release and haptic cancellation.');

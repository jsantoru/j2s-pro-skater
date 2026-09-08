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

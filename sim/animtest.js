// Runs the character rig through every sim scenario and checks for NaNs / wild joint values.
import * as THREE from 'three';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { Character } from '../src/character.js';
import { makeState } from '../src/input.js';
const level = new Level(); const sk = new Skater(level); const ch = new Character();
const inp = makeState(); const DT = 1 / 120; let bad = 0, frames = 0;
const states = {}; sk.events.land = (pts, text, mult) => { if (pts > 3000) console.log('BIG LAND', pts, 'x' + mult, text.slice(0, 160)); };
sk.pos.set(-20, 0, 6); sk.heading.set(-1, 0, 0); sk.facing.set(-1, 0, 0); sk.speed = 6;
for (let t = 0; t < 40; t += DT) {
  const prev = { ollie: inp.ollie, grab: inp.grab, grind: inp.grind };
  // a busy scripted line: push, ollie every 2s, flips/grabs/grinds, spins
  inp.push = 1; inp.ollie = (t % 2) > 1.2 && (t % 2) < 1.5; inp.steer = (t % 7) > 5 ? 0.8 : 0;
  inp.olliePressed = inp.ollie && !prev.ollie; inp.ollieReleased = !inp.ollie && prev.ollie;
  inp.flipPressed = sk.state === 'air' && sk.airTime > 0.02 && sk.airTime < 0.03 && (t % 4) < 2;
  inp.grab = sk.state === 'air' && sk.airTime > 0.02 && sk.airTime < 0.4 && (t % 4) >= 2; inp.grabPressed = inp.grab && !prev.grab;
  inp.grind = (t % 3) > 1; inp.grindPressed = inp.grind && !prev.grind; inp.dir8 = ['W', 'E', 'S', 'N'][Math.floor(t) % 4];
  sk.update(DT, inp);
  ch.root.position.copy(sk.pos); ch.root.quaternion.copy(sk.modelQuat);
  ch.update(sk, 1 / 60, t);
  ch.root.updateMatrixWorld(true);
  states[sk.state] = (states[sk.state] || 0) + 1; frames++;
  ch.root.traverse((o) => { if (o.matrixWorld.elements.some((e) => !Number.isFinite(e))) bad++; });
  if (!Number.isFinite(sk.pos.x + sk.pos.y + sk.pos.z + sk.speed) || sk.modelQuat.toArray().some((e) => !Number.isFinite(e))) bad++;
}
console.log('frames', frames, 'bad', bad, 'states', states, 'score', sk.score);
process.exit(bad ? 1 : 0);

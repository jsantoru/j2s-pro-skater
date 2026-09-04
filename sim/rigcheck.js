// Rig geometry check: where do the shoes sit relative to the deck, per pose?
// Catches the feet drifting off the board as the legs flex. Usage: node sim/rigcheck.js
import * as THREE from 'three';
import { Character } from '../src/character.js';

const fake = (o = {}) => Object.assign({
  state: 'ride', crouch: 0, landSquash: 0, pushing: 0, stance: 1, lean: 0,
  speed: 5, bailT: 0, trick: null, grind: null,
}, o);

function measure(label, sk) {
  const c = new Character();
  for (let i = 0; i < 400; i++) c.update(sk, 1 / 60, 0);   // settle the pose blend
  c.root.updateMatrixWorld(true);
  const bb = (o) => new THREE.Box3().setFromObject(o);
  const deck = bb(c.board);
  const f = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
  console.log('\n=== ' + label + ' ===');
  console.log(`deck      x[${f(deck.min.x)}, ${f(deck.max.x)}]`);
  const zs = [];
  for (const [name, leg] of [['L(front)', c.lLeg], ['R(back)', c.rLeg]]) {
    const s = bb(leg.an);
    zs.push((s.min.z + s.max.z) / 2);
    const onDeck = s.min.y > deck.min.y ? '' : '   (off the deck)';
    console.log(`${name.padEnd(9)} x[${f(s.min.x)}, ${f(s.max.x)}]  overhang toe ${f(deck.min.x - s.min.x)}  heel ${f(s.max.x - deck.max.x)}${onDeck}`);
  }
  console.log(`stance ${f(Math.abs(zs[0] - zs[1]))}`);
}

measure('ride', fake());
measure('crouch', fake({ crouch: 1 }));
measure('push (mid-stroke)', fake({ pushing: 1 }));
measure('grind', fake({ state: 'grind' }));
measure('air', fake({ state: 'air' }));

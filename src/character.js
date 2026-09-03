// Low-poly procedural skater + board with pose-blend animation.
// Local frame: +z = nose / travel forward, +y up, +x right. Body faces +x (regular stance).
import * as THREE from 'three';

const L1 = 0.42, L2 = 0.42, BOARD_TOP = 0.13;
const D2R = Math.PI / 180;

// pose keys (degrees unless noted)
const KEYS = ['torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'lArmX', 'lArmZ', 'lElbow', 'rArmX', 'rArmZ', 'rElbow',
  'lHip', 'lKnee', 'lLegZ', 'rHip', 'rKnee', 'rLegZ', 'hipsX', 'hipsZ', 'hipsY'];
const P = (o) => { const p = {}; for (const k of KEYS) p[k] = 0; return Object.assign(p, o); };

export const POSES = {
  ride: P({ torsoX: 6, headY: -55, lArmX: 8, lArmZ: 14, lElbow: 18, rArmX: -6, rArmZ: -14, rElbow: 18, lHip: 12, lKnee: 20, rHip: 10, rKnee: 16 }),
  crouch: P({ torsoX: 34, headY: -55, headX: -20, lArmX: -30, lArmZ: 22, lElbow: 45, rArmX: -40, rArmZ: -22, rElbow: 45, lHip: 68, lKnee: 112, rHip: 66, rKnee: 110 }),
  air: P({ torsoX: 14, headY: -50, lArmX: 5, lArmZ: 60, lElbow: 35, rArmX: -5, rArmZ: -60, rElbow: 35, lHip: 42, lKnee: 78, rHip: 44, rKnee: 82 }),
  kickflip: P({ torsoX: 12, headY: -55, headX: 15, lArmX: 10, lArmZ: 70, lElbow: 30, rArmX: -10, rArmZ: -70, rElbow: 30, lHip: 25, lKnee: 12, lLegZ: 42, rHip: 60, rKnee: 105 }),
  heelflip: P({ torsoX: 10, headY: -55, headX: 15, lArmX: 10, lArmZ: 70, lElbow: 30, rArmX: -10, rArmZ: -70, rElbow: 30, lHip: 55, lKnee: 20, lLegZ: -30, rHip: 60, rKnee: 105 }),
  shoveit: P({ torsoX: 10, headY: -55, headX: 12, lArmX: 10, lArmZ: 65, lElbow: 30, rArmX: -10, rArmZ: -65, rElbow: 30, lHip: 40, lKnee: 60, lLegZ: 20, rHip: 45, rKnee: 95, rLegZ: -15 }),
  indy: P({ torsoX: 42, headY: -50, headX: -10, lArmX: -10, lArmZ: 75, lElbow: 20, rArmX: 78, rArmZ: -10, rElbow: 55, lHip: 70, lKnee: 118, rHip: 72, rKnee: 120, hipsZ: 8 }),
  melon: P({ torsoX: 30, torsoZ: -12, headY: -50, lArmX: 65, lArmZ: 8, lElbow: 55, rArmX: -10, rArmZ: -80, rElbow: 20, lHip: 70, lKnee: 118, rHip: 72, rKnee: 120 }),
  nosegrab: P({ torsoX: 45, torsoY: -30, headY: -60, lArmX: 95, lArmZ: 5, lElbow: 25, rArmX: -20, rArmZ: -70, rElbow: 30, lHip: 65, lKnee: 110, rHip: 75, rKnee: 125 }),
  tailgrab: P({ torsoX: 40, torsoY: 30, headY: -40, lArmX: -20, lArmZ: 70, lElbow: 30, rArmX: 95, rArmZ: -5, rElbow: 25, lHip: 75, lKnee: 125, rHip: 65, rKnee: 110 }),
  method: P({ torsoX: -18, headY: -50, headX: -25, lArmX: 70, lArmZ: 10, lElbow: 45, rArmX: -30, rArmZ: -80, rElbow: 20, lHip: 15, lKnee: 135, rHip: 12, rKnee: 130 }),
  grind: P({ torsoX: 18, headY: -55, lArmX: 0, lArmZ: 75, lElbow: 25, rArmX: 0, rArmZ: -75, rElbow: 25, lHip: 48, lKnee: 68, rHip: 46, rKnee: 64 }),
  bail: P({ torsoX: -35, headX: -25, headY: 0, lArmX: -40, lArmZ: 150, lElbow: 60, rArmX: -40, rArmZ: -150, rElbow: 60, lHip: -15, lKnee: 35, rHip: 20, rKnee: 60, lLegZ: 20, rLegZ: -20 }),
  pushA: P({ torsoX: 22, headY: -55, lArmX: -20, lArmZ: 20, lElbow: 40, rArmX: 30, rArmZ: -20, rElbow: 30, lHip: 32, lKnee: 48, rHip: 45, rKnee: 30, rLegZ: -18 }),
  pushB: P({ torsoX: 22, headY: -55, lArmX: 25, lArmZ: 20, lElbow: 40, rArmX: -30, rArmZ: -20, rElbow: 30, lHip: 32, lKnee: 48, rHip: -35, rKnee: 8, rLegZ: -20 }),
};
const GRAB_POSE = { Indy: 'indy', Melon: 'melon', Nosegrab: 'nosegrab', Tailgrab: 'tailgrab', Method: 'method', Stalefish: 'melon', Judo: 'method', Airwalk: 'nosegrab' };
const FLIP_POSE = { Kickflip: 'kickflip', Heelflip: 'heelflip', 'Pop Shove-it': 'shoveit', Impossible: 'shoveit', '360 Flip': 'kickflip', 'Varial Heelflip': 'heelflip', Hardflip: 'kickflip', 'Inward Heelflip': 'heelflip' };
// [rollTurns (around z), yawTurns (around y), pitchTurns (around x)]
const FLIP_SPIN = { Kickflip: [1, 0, 0], Heelflip: [-1, 0, 0], 'Pop Shove-it': [0, 0.5, 0], Impossible: [0, 0, 1], '360 Flip': [1, 1, 0], 'Varial Heelflip': [-1, -0.5, 0], Hardflip: [1, -0.5, 0], 'Inward Heelflip': [-1, 0.5, 0] };

function legDrop(hip, knee) { return L1 * Math.cos(hip * D2R) + L2 * Math.cos((hip - knee) * D2R); }
const STAND_DROP = legDrop(POSES.ride.lHip, POSES.ride.lKnee);

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; return m;
}

export class Character {
  constructor() {
    this.root = new THREE.Group();          // placed at skater.pos with skater.modelQuat
    this.body = new THREE.Group();          // rotated so the chest faces +x
    this.body.rotation.y = Math.PI / 2;
    this.root.add(this.body);
    this.cur = P({}); this.cur.hipsY = STAND_DROP;
    this.pushPhase = 0; this.bobT = 0;
    this.buildBoard(); this.buildBody();
  }

  buildBoard() {
    const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const grip = M(0x1b1b1f, 1), graphic = M(0xd9483b, 0.5), edge = M(0xc8a878, 0.6), truck = M(0xc4c8d0, 0.35, 0.9), wheel = M(0xf3efe0, 0.5);
    this.board = new THREE.Group(); this.root.add(this.board);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.022, 0.62), [edge, edge, grip, graphic, edge, edge]);
    deck.position.y = BOARD_TOP - 0.011; deck.castShadow = true; this.board.add(deck);
    for (const s of [-1, 1]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.022, 0.14), [edge, edge, grip, graphic, edge, edge]);
      kick.position.set(0, BOARD_TOP - 0.011 + 0.02, s * 0.37); kick.rotation.x = -s * 0.32; kick.castShadow = true; this.board.add(kick);
      this.board.add(box(0.12, 0.035, 0.05, truck, 0, BOARD_TOP - 0.045, s * 0.24));
      for (const w of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 8), wheel);
        wh.rotation.z = Math.PI / 2; wh.position.set(w * 0.09, BOARD_TOP - 0.098, s * 0.24); this.board.add(wh);
      }
    }
  }

  buildBody() {
    const M = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = M(0xe0b08a), shirt = M(0x2f6fb5), pants = M(0x3b3a45), shoe = M(0xf0efe8, 0.6), cap = M(0xc0392b), hair = M(0x3a2718), eye = M(0x1a1a1a, 0.3), white = M(0xf4f4f4);
    this.hips = new THREE.Group(); this.body.add(this.hips);
    this.hips.add(box(0.3, 0.14, 0.2, pants, 0, 0.03, 0));
    this.torso = new THREE.Group(); this.torso.position.y = 0.1; this.hips.add(this.torso);
    this.torso.add(box(0.36, 0.44, 0.2, shirt, 0, 0.24, 0));
    this.torso.add(box(0.38, 0.06, 0.22, shirt, 0, 0.44, 0));
    this.torso.add(box(0.16, 0.12, 0.012, white, 0, 0.27, 0.105)); // shirt graphic
    this.torso.add(box(0.06, 0.04, 0.014, cap, 0, 0.27, 0.106));
    this.head = new THREE.Group(); this.head.position.y = 0.5; this.torso.add(this.head);
    this.head.add(box(0.2, 0.22, 0.22, skin, 0, 0.13, 0));
    this.head.add(box(0.21, 0.06, 0.23, hair, 0, 0.25, 0));
    this.head.add(box(0.22, 0.05, 0.24, cap, 0, 0.27, 0.0));
    this.head.add(box(0.2, 0.02, 0.14, cap, 0, 0.26, 0.17));
    this.head.add(box(0.03, 0.03, 0.012, eye, -0.05, 0.14, 0.112)); this.head.add(box(0.03, 0.03, 0.012, eye, 0.05, 0.14, 0.112));
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.22, 0.42, 0); this.torso.add(sh);
      sh.add(box(0.09, 0.3, 0.09, white, 0, -0.14, 0)); sh.add(box(0.1, 0.06, 0.1, shirt, 0, 0, 0));
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      el.add(box(0.08, 0.28, 0.08, skin, 0, -0.14, 0)); el.add(box(0.09, 0.08, 0.09, skin, 0, -0.3, 0));
      return { sh, el };
    };
    this.lArm = arm(-1); this.rArm = arm(1);
    const leg = (side) => {
      const hp = new THREE.Group(); hp.position.set(side * 0.11, 0, 0); this.hips.add(hp);
      hp.add(box(0.14, L1, 0.15, pants, 0, -L1 / 2, 0));
      const kn = new THREE.Group(); kn.position.y = -L1; hp.add(kn);
      kn.add(box(0.12, L2, 0.13, pants, 0, -L2 / 2, 0));
      kn.add(box(0.11, 0.08, 0.27, shoe, 0, -L2 + 0.02, 0.05));
      return { hp, kn };
    };
    this.lLeg = leg(-1); this.rLeg = leg(1); // body -x = toward the nose (front foot = left)
  }

  // ---- animation ----
  computeTarget(sk, dt) {
    const T = P({});
    const mix = (pose, w) => { if (w <= 0) return; for (const k of KEYS) T[k] += pose[k] * w; T._w = (T._w || 0) + w; };
    const st = sk.state;
    if (st === 'bail') mix(POSES.bail, 1);
    else if (st === 'grind') { mix(POSES.grind, 1 - sk.crouch); mix(POSES.crouch, sk.crouch); }
    else if (st === 'air') {
      const tr = sk.trick;
      if (tr && tr.kind === 'grab') mix(POSES[GRAB_POSE[tr.name] || 'indy'], 1);
      else if (tr && tr.kind === 'flip') {
        const w = Math.sin(Math.min(1, tr.t / tr.dur) * Math.PI); // ease in/out of the kick
        mix(POSES[FLIP_POSE[tr.name] || 'kickflip'], w); mix(POSES.air, 1 - w);
      } else mix(POSES.air, 1);
    } else {
      const c = Math.min(1, sk.crouch + sk.landSquash * 0.7);
      if (sk.pushing > 0 && c < 0.3) {
        this.pushPhase += dt * 4.2;
        const s = 0.5 + 0.5 * Math.sin(this.pushPhase);
        mix(POSES.pushA, s * (1 - c)); mix(POSES.pushB, (1 - s) * (1 - c));
      } else { mix(POSES.ride, 1 - c); this.pushPhase = 0; }
      mix(POSES.crouch, c);
    }
    // normalise weights
    if (T._w && Math.abs(T._w - 1) > 1e-3) for (const k of KEYS) T[k] /= T._w;
    // fakie: look the other way
    if (sk.stance < 0 && st !== 'bail') T.headY = -T.headY;
    // carve lean
    T.hipsZ += -sk.lean * 40;
    // leg drop / hips height
    const drop = legDrop((T.lHip + T.rHip) / 2, (T.lKnee + T.rKnee) / 2);
    T.hipsY = st === 'air' ? STAND_DROP - 0.06 : drop;
    T._boardLift = st === 'air' ? Math.max(0, STAND_DROP - 0.06 - drop) : 0;
    return T;
  }

  update(sk, dt, time) {
    const T = this.computeTarget(sk, dt);
    const rate = sk.state === 'bail' ? 10 : (sk.state === 'air' ? 16 : 13);
    const a = Math.min(1, dt * rate);
    for (const k of KEYS) this.cur[k] += (T[k] - this.cur[k]) * a;
    this.cur._boardLift = (this.cur._boardLift || 0) + ((T._boardLift || 0) - (this.cur._boardLift || 0)) * a;
    const c = this.cur;
    // subtle riding bob
    this.bobT += dt * (2 + sk.speed * 0.4);
    const bob = sk.state === 'ride' ? Math.sin(this.bobT) * 0.006 * Math.min(1, sk.speed / 4) : 0;
    this.hips.position.set(0, BOARD_TOP + c.hipsY + bob, 0);
    this.hips.rotation.set(c.hipsX * D2R, 0, c.hipsZ * D2R);
    this.torso.rotation.set(c.torsoX * D2R, c.torsoY * D2R, c.torsoZ * D2R);
    this.head.rotation.set(c.headX * D2R, c.headY * D2R, 0);
    this.lArm.sh.rotation.set(-c.lArmX * D2R, 0, -c.lArmZ * D2R);
    this.rArm.sh.rotation.set(-c.rArmX * D2R, 0, -c.rArmZ * D2R);
    this.lArm.el.rotation.x = -c.lElbow * D2R; this.rArm.el.rotation.x = -c.rElbow * D2R;
    this.lLeg.hp.rotation.set(c.lHip * D2R, 0, c.lLegZ * D2R); this.lLeg.kn.rotation.x = -c.lKnee * D2R;
    this.rLeg.hp.rotation.set(c.rHip * D2R, 0, -c.rLegZ * D2R); this.rLeg.kn.rotation.x = -c.rKnee * D2R;

    // board: follows feet in the air, flips during flip tricks, tumbles on bail
    const b = this.board;
    b.position.set(0, 0, 0); b.rotation.set(0, 0, 0);
    if (sk.state === 'air') {
      b.position.y = c._boardLift;
      const tr = sk.trick;
      if (tr && tr.kind === 'flip') {
        const [r, y, p] = FLIP_SPIN[tr.name] || [1, 0, 0];
        const t = Math.min(1, tr.t / tr.dur);
        const e = t < 1 ? 1 - Math.pow(1 - t, 1.6) : 1; // snappy start, settle at the end
        b.rotation.set(p * e * Math.PI * 2, y * e * Math.PI * 2, -r * e * Math.PI * 2);
        b.position.y += Math.sin(t * Math.PI) * 0.08;
      } else if (tr && tr.kind === 'grab') {
        b.rotation.x = (tr.name === 'Nosegrab' ? 0.25 : tr.name === 'Tailgrab' ? -0.25 : 0);
      }
    } else if (sk.state === 'bail') {
      const t = sk.bailT;
      b.position.set(Math.sin(t * 3) * 0.4, Math.max(0, 1.2 * t - 2.2 * t * t) + 0.02, 0.9 + t * 1.2);
      b.rotation.set(t * 9, t * 4, 0.3);
    }
    // whole-body tumble while bailing
    if (sk.state === 'bail') {
      const t = Math.min(1, sk.bailT / 0.5);
      this.body.rotation.set(0, Math.PI / 2, 0); this.body.rotation.x = 1.35 * t;
      this.body.position.set(0, -0.5 * t * (STAND_DROP + 0.1) + 0.3 * t, 0.5 * t);
    } else {
      this.body.rotation.set(0, Math.PI / 2, 0); this.body.position.set(0, 0, 0);
    }
  }
}

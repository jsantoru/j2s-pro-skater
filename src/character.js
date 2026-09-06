// Detailed procedural skater + board with the original pose-blend animation.
// Root frame: +z = nose / travel forward, +y up, so the RIGHT of travel is -x (right-handed frame).
// The body group is rotated so the chest (+z body) faces root -x: regular stance, left foot forward.
// Body frame: +x = toward the nose, +z = toward the chest. Pose keys ending in Z swing limbs toward the
// nose (+) / tail (-); keys ending in X fold limbs toward the chest (+).
import * as THREE from 'three';
import { buildDetailedBoard, buildDetailedBody } from './skater-art.js';

const L1 = 0.42, L2 = 0.42, BOARD_TOP = 0.13;
const BOARD_TRACK = 0.05;   // how far the board may chase the feet sideways in the air
const MANUAL_PITCH = 22;    // degrees the deck sits nose-up (or nose-down) in a manual
const AXLE_Z = 0.24;        // distance from deck centre to a truck: the pivot a manual rocks on
const D2R = Math.PI / 180;
const SOLE_OFFSET = 0.0405;
const DOWN = new THREE.Vector3(0, -1, 0);

// pose keys (degrees unless noted)
const KEYS = ['torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'lArmX', 'lArmZ', 'lElbow', 'rArmX', 'rArmZ', 'rElbow',
  'lHip', 'lKnee', 'lLegZ', 'rHip', 'rKnee', 'rLegZ', 'hipsX', 'hipsZ', 'hipsY', 'hipsFwd'];
const P = (o) => { const p = {}; for (const k of KEYS) p[k] = 0; return Object.assign(p, o); };

export const POSES = {
  ride: P({ torsoX: 10, headY: -55, lArmX: 8, lArmZ: 24, lElbow: 22, rArmX: -6, rArmZ: -26, rElbow: 24, lHip: 23, lKnee: 38, rHip: 20, rKnee: 34 }),
  // Counter the forward torso lean so the arms hang beside the knees, ready to pop.
  crouch: P({ torsoX: 34, headY: -55, headX: -20, lArmX: 40, lArmZ: 8, lElbow: 16, rArmX: 38, rArmZ: -8, rElbow: 18, lHip: 68, lKnee: 112, rHip: 66, rKnee: 110 }),
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
  // manuals: weight over the back foot with the front leg reaching out, arms wide. hipsZ leans the whole
  // upper body back over the tail (negative) or forward over the nose (positive).
  manual: P({ torsoX: 4, headY: -55, lArmX: 20, lArmZ: 62, lElbow: 22, rArmX: -20, rArmZ: -62, rElbow: 22, lHip: 40, lKnee: 30, rHip: 24, rKnee: 56, hipsZ: -14 }),
  noseManual: P({ torsoX: 24, headY: -55, lArmX: 20, lArmZ: 62, lElbow: 22, rArmX: -20, rArmZ: -62, rElbow: 22, lHip: 26, lKnee: 58, rHip: 44, rKnee: 30, hipsZ: 16 }),
  bail: P({ torsoX: -35, headX: -25, headY: 0, lArmX: -40, lArmZ: 150, lElbow: 60, rArmX: -40, rArmZ: -150, rElbow: 60, lHip: -15, lKnee: 35, rHip: 20, rKnee: 60, lLegZ: 20, rLegZ: -20 }),
  // push cycle: the back (right) foot leaves the deck, lands beside it on the toe side (rHip) and strokes
  // nose -> tail along the travel axis (rLegZ + -> -) with a straight knee; the front leg bends so the
  // pushing foot reaches the ground (deck top is 0.13 m up); the torso turns toward the nose.
  pushPlant: P({ torsoX: 14, torsoY: -32, headY: -50, lArmX: -15, lArmZ: 18, lElbow: 35, rArmX: 25, rArmZ: -18, rElbow: 30, lHip: 55, lKnee: 80, rHip: 14, rKnee: 3, rLegZ: 20 }),
  pushStroke: P({ torsoX: 18, torsoY: -24, headY: -50, lArmX: 20, lArmZ: 18, lElbow: 35, rArmX: -25, rArmZ: -18, rElbow: 30, lHip: 55, lKnee: 80, rHip: 14, rKnee: 5, rLegZ: -22 }),
  pushReturn: P({ torsoX: 16, torsoY: -28, headY: -50, lArmX: 5, lArmZ: 18, lElbow: 35, rArmX: 0, rArmZ: -18, rElbow: 30, lHip: 52, lKnee: 76, rHip: 40, rKnee: 70, rLegZ: -4 }),
};
const GRAB_POSE = { Indy: 'indy', Melon: 'melon', Nosegrab: 'nosegrab', Tailgrab: 'tailgrab', Method: 'method', Stalefish: 'melon', Judo: 'method', Airwalk: 'nosegrab' };
const FLIP_POSE = { Kickflip: 'kickflip', Heelflip: 'heelflip', 'Pop Shove-it': 'shoveit', Impossible: 'shoveit', '360 Flip': 'kickflip', 'Varial Heelflip': 'heelflip', Hardflip: 'kickflip', 'Inward Heelflip': 'heelflip' };
// [rollTurns (around z), yawTurns (around y), pitchTurns (around x)]
const FLIP_SPIN = { Kickflip: [1, 0, 0], Heelflip: [-1, 0, 0], 'Pop Shove-it': [0, 0.5, 0], Impossible: [0, 0, 1], '360 Flip': [1, 1, 0], 'Varial Heelflip': [-1, -0.5, 0], Hardflip: [1, -0.5, 0], 'Inward Heelflip': [-1, 0.5, 0] };

// Where the ankle ends up relative to the hip, for the current hip/knee angles.
// legDrop = how far below; legReach = how far toward the chest (body +z, the toe side of the board).
function legDrop(hip, knee) { return L1 * Math.cos(hip * D2R) + L2 * Math.cos((hip - knee) * D2R); }
function legReach(hip, knee) { return L1 * Math.sin(hip * D2R) + L2 * Math.sin((hip - knee) * D2R); }
const STAND_DROP = legDrop(POSES.ride.lHip, POSES.ride.lKnee);

export class Character {
  constructor() {
    this.root = new THREE.Group();          // placed at skater.pos with skater.modelQuat
    this.body = new THREE.Group();          // rotated so the chest faces root -x (the right of travel: regular)
    this.body.rotation.y = -Math.PI / 2;
    this.root.add(this.body);
    this.cur = P({}); this.cur.hipsY = STAND_DROP;
    this.pushPhase = 0; this.bobT = 0;
    this.contactWeight = 1;
    this.pushContact = 0;
    this.buildBoard(); this.buildBody();
    this.ik = { target: new THREE.Vector3(), direction: new THREE.Vector3(), bend: new THREE.Vector3(),
      knee: new THREE.Vector3(), lower: new THREE.Vector3(), worldQ: new THREE.Quaternion(),
      footQ: new THREE.Quaternion(), parentQ: new THREE.Quaternion(), inv: new THREE.Quaternion(), offset: new THREE.Vector3(),
      authoredHip: new THREE.Quaternion(), authoredKnee: new THREE.Quaternion(), authoredAnkle: new THREE.Quaternion() };
  }

  buildBoard() { this.board = buildDetailedBoard(this.root); }

  buildBody() { buildDetailedBody(this); }

  // Render-only two-bone IK. Targets are on the deck; no simulation state is written.
  plantFoot(leg, target, orientation, weight) {
    if (weight <= 0) return;
    const v = this.ik;
    v.authoredHip.copy(leg.hp.quaternion); v.authoredKnee.copy(leg.kn.quaternion); v.authoredAnkle.copy(leg.ankle.quaternion);
    v.target.copy(target).sub(v.offset.copy(leg.an.position).applyQuaternion(orientation));
    this.hips.worldToLocal(v.target); v.target.sub(leg.hp.position);
    const distance = THREE.MathUtils.clamp(v.target.length(), 0.02, L1 + L2 - 0.0001);
    v.direction.copy(v.target).normalize();
    v.bend.set(0, 0, 1).addScaledVector(v.direction, -v.direction.z).normalize();
    const along = (L1 * L1 - L2 * L2 + distance * distance) / (2 * distance);
    v.knee.copy(v.direction).multiplyScalar(along).addScaledVector(v.bend, Math.sqrt(Math.max(0, L1 * L1 - along * along)));
    leg.hp.quaternion.setFromUnitVectors(DOWN, v.lower.copy(v.knee).normalize());
    v.inv.copy(leg.hp.quaternion).invert();
    v.lower.copy(v.target).sub(v.knee).normalize().applyQuaternion(v.inv);
    leg.kn.quaternion.setFromUnitVectors(DOWN, v.lower);
    leg.kn.updateWorldMatrix(true, false);
    leg.kn.getWorldQuaternion(v.parentQ).invert();
    leg.ankle.quaternion.copy(v.parentQ).multiply(orientation);
    leg.hp.quaternion.slerp(v.authoredHip, 1 - weight);
    leg.kn.quaternion.slerp(v.authoredKnee, 1 - weight);
    leg.ankle.quaternion.slerp(v.authoredAnkle, 1 - weight);
  }

  anchorFeet(sk, dt) {
    if (sk.state === 'bail') return;
    const flip = sk.state === 'air' && sk.trick?.kind === 'flip';
    const phase = flip ? THREE.MathUtils.clamp(sk.trick.t / sk.trick.dur, 0, 1) : 0;
    const release = flip ? THREE.MathUtils.smoothstep(Math.sin(phase * Math.PI), 0, 0.45) : 0;
    this.contactWeight = 1 - release;
    this.root.updateMatrixWorld(true);
    const targets = this.footTargets || (this.footTargets = [new THREE.Vector3(), new THREE.Vector3()]);
    const orientations = this.footOrientations || (this.footOrientations = [new THREE.Quaternion(), new THREE.Quaternion()]);
    const pushing = sk.state === 'ride' && sk.pushing > 0 && sk.crouch < 0.3 && Math.abs(sk.manualLean || 0) < 0.01;
    this.pushContact += ((pushing ? 1 : 0) - this.pushContact) * Math.min(1, dt * 14);
    if (sk.state !== 'ride') this.pushContact = 0;
    if (this.pushContact < 0.0001) this.pushContact = 0;
    const push = this.pushPhase % (Math.PI * 2);
    for (let i = 0; i < 2; i++) {
      const z = i === 0 ? 0.235 : -0.255;
      targets[i].set(0, BOARD_TOP + 0.002 + SOLE_OFFSET, z);
      // The deck is symmetric after a shove-it; the feet catch in their original stance.
      if (flip) targets[i].add(this.board.position).applyMatrix4(this.root.matrixWorld);
      else this.board.localToWorld(targets[i]);
      const footYaw = -Math.PI / 2 + (i === 0 ? 0.22 : -0.08);
      orientations[i].setFromEuler(new THREE.Euler(0, footYaw, 0));
      (flip ? this.root : this.board).getWorldQuaternion(this.ik.worldQ);
      orientations[i].premultiply(this.ik.worldQ);
      if (this.pushContact > 0 && i === 1) {
        // Plant beside the toe edge, stroke nose to tail, then lift and recover.
        const stroke = push < Math.PI ? push / Math.PI : (push - Math.PI) / Math.PI;
        const zPush = push < Math.PI ? 0.30 - stroke * 0.65 : -0.35 + stroke * 0.65;
        const lift = push < Math.PI ? 0 : Math.sin(stroke * Math.PI) * 0.19;
        this.ik.target.set(-0.29, SOLE_OFFSET + 0.003 + lift, zPush * sk.stance).applyMatrix4(this.root.matrixWorld);
        targets[i].lerp(this.ik.target, this.pushContact);
        this.ik.footQ.setFromEuler(new THREE.Euler(0, sk.stance < 0 ? Math.PI : 0, 0)).premultiply(this.root.getWorldQuaternion(this.ik.worldQ));
        orientations[i].slerp(this.ik.footQ, this.pushContact);
      }
    }
    // Lower the pelvis just enough to keep both ankles within physical leg reach.
    // This also absorbs the animation bob and balances manuals over the planted wheels.
    for (let iteration = 0; iteration < 8 && this.contactWeight > 0.99; iteration++) {
      let excess = 0;
      for (let i = 0; i < 2; i++) {
        const leg = i ? this.rLeg : this.lLeg;
        this.ik.target.copy(targets[i]).sub(this.ik.offset.copy(leg.an.position).applyQuaternion(orientations[i]));
        this.hips.worldToLocal(this.ik.target);
        excess = Math.max(excess, this.ik.target.sub(leg.hp.position).length() - (L1 + L2 - 0.008));
      }
      if (excess <= 0.0001) break;
      this.hips.position.y -= excess * 1.12; this.root.updateMatrixWorld(true);
    }
    this.plantFoot(this.lLeg, targets[0], orientations[0], this.contactWeight);
    this.plantFoot(this.rLeg, targets[1], orientations[1], this.contactWeight);
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
      const ml = sk.manualLean || 0;
      if (Math.abs(ml) > 0.01) {
        // blend from the neutral ride into the manual as the board rocks over
        const w = Math.min(1, Math.abs(ml));
        mix(ml > 0 ? POSES.manual : POSES.noseManual, w * (1 - c));
        mix(POSES.ride, (1 - w) * (1 - c));
      } else if (sk.pushing > 0 && c < 0.3) {
        // one cycle = 2π: first half the foot is on the ground stroking plant -> back, second half it
        // lifts (return pose) and swings forward to plant again
        this.pushPhase += dt * 7.5;
        const p = this.pushPhase % (Math.PI * 2);
        let a, b, s;
        if (p < Math.PI) { a = POSES.pushPlant; b = POSES.pushStroke; s = p / Math.PI; }
        else { const u = (p - Math.PI) / Math.PI; if (u < 0.5) { a = POSES.pushStroke; b = POSES.pushReturn; s = u * 2; } else { a = POSES.pushReturn; b = POSES.pushPlant; s = (u - 0.5) * 2; } }
        mix(a, (1 - s) * (1 - c)); mix(b, s * (1 - c));
      } else { mix(POSES.ride, 1 - c); this.pushPhase = 0; }
      mix(POSES.crouch, c);
    }
    // normalise weights
    if (T._w && Math.abs(T._w - 1) > 1e-3) for (const k of KEYS) T[k] /= T._w;
    // fakie: look (and turn the push) the other way
    if (sk.stance < 0 && st !== 'bail') { T.headY = -T.headY; T.torsoY = -T.torsoY; }
    // carve lean: tilt sideways into the turn (about the body's nose axis)
    T.hipsX += sk.lean * 40;
    // leg drop / hips height from the front (standing) leg, so an extended pushing leg reaches the ground
    const drop = legDrop(T.lHip, T.lKnee);
    T.hipsY = st === 'air' ? STAND_DROP - 0.06 : drop;
    // Flexing the hip swings the foot toward the toe side, which would walk the feet off the deck as you
    // crouch. On the ground, slide the pelvis back by the same amount so the front foot stays planted and
    // the hips travel back-and-down like a real squat. Airborne poses keep the old free-swinging look.
    T.hipsFwd = (st === 'air' || st === 'bail') ? 0 : -legReach(T.lHip, T.lKnee);
    // The board rides with BOTH feet, not the front one: a flick trick throws the front leg right out
    // (a heelflip reaches 0.59 m, nearly three deck widths) and tracking that alone glues the board to
    // the flicking foot instead of letting it spin free. Average the legs, and cap the sideways chase.
    const dropAvg = legDrop((T.lHip + T.rHip) / 2, (T.lKnee + T.rKnee) / 2);
    const reachAvg = (legReach(T.lHip, T.lKnee) + legReach(T.rHip, T.rKnee)) / 2;
    T._boardLift = st === 'air' ? Math.max(0, STAND_DROP - 0.06 - dropAvg) : 0;
    T._boardFwd = st === 'air' ? THREE.MathUtils.clamp(reachAvg, -BOARD_TRACK, BOARD_TRACK) : 0;
    return T;
  }

  update(sk, dt, time) {
    const T = this.computeTarget(sk, dt);
    const rate = sk.state === 'bail' ? 10 : (sk.state === 'air' ? 16 : 13);
    const a = Math.min(1, dt * rate);
    for (const k of KEYS) this.cur[k] += (T[k] - this.cur[k]) * a;
    this.cur._boardLift = (this.cur._boardLift || 0) + ((T._boardLift || 0) - (this.cur._boardLift || 0)) * a;
    this.cur._boardFwd = (this.cur._boardFwd || 0) + ((T._boardFwd || 0) - (this.cur._boardFwd || 0)) * a;
    const c = this.cur;
    // subtle riding bob
    this.bobT += dt * (2 + sk.speed * 0.4);
    const bob = sk.state === 'ride' ? Math.sin(this.bobT) * 0.006 * Math.min(1, sk.speed / 4) : 0;
    this.hips.position.set(0, BOARD_TOP + c.hipsY + bob, c.hipsFwd);
    // Y / Z keys are authored as "toward the nose = negative torsoY / positive limb Z"; body +x is the nose,
    // so rotations about y/z that should move things nose-ward get the signs below.
    this.hips.rotation.set(c.hipsX * D2R, 0, -c.hipsZ * D2R);
    this.torso.rotation.set(c.torsoX * D2R, -c.torsoY * D2R, -c.torsoZ * D2R);
    this.head.rotation.set(c.headX * D2R, -c.headY * D2R, 0);
    this.lArm.sh.rotation.set(-c.lArmX * D2R, 0, c.lArmZ * D2R);
    this.rArm.sh.rotation.set(-c.rArmX * D2R, 0, c.rArmZ * D2R);
    this.lArm.el.rotation.x = -c.lElbow * D2R; this.rArm.el.rotation.x = -c.rElbow * D2R;
    // hips flex forward (knee travels toward the chest, +z), knees fold the shin back behind the thigh;
    // the ankle counter-rotates on both axes so the foot stays flat whatever the squat depth or leg swing
    this.lLeg.hp.rotation.set(-c.lHip * D2R, 0, c.lLegZ * D2R); this.lLeg.kn.rotation.x = c.lKnee * D2R; this.lLeg.ankle.rotation.set((c.lHip - c.lKnee) * D2R, 0, -c.lLegZ * D2R);
    this.rLeg.hp.rotation.set(-c.rHip * D2R, 0, c.rLegZ * D2R); this.rLeg.kn.rotation.x = c.rKnee * D2R; this.rLeg.ankle.rotation.set((c.rHip - c.rKnee) * D2R, 0, -c.rLegZ * D2R);

    // board: follows feet in the air, flips during flip tricks, tumbles on bail
    const b = this.board;
    b.position.set(0, 0, 0); b.rotation.set(0, 0, 0);
    // manual: pitch about the axle that stays down, and lift by as much as that pivot raises the deck,
    // so the grounded wheels sit on the floor instead of sinking through it
    const ml = sk.manualLean || 0;
    if (Math.abs(ml) > 0.001 && sk.state === 'ride') {
      const pitch = ml * MANUAL_PITCH * D2R;
      b.rotation.x = -pitch;                       // root +z is the nose, so -x rotation lifts it
      b.position.y = Math.abs(Math.sin(pitch)) * AXLE_Z;
      this.hips.position.y += b.position.y;        // the skater rides up with it
    }
    if (sk.state === 'air') {
      b.position.y = c._boardLift;
      b.position.x = -c._boardFwd;                 // body +z (toe side) is root -x
      const tr = sk.trick;
      if (tr && tr.kind === 'flip') {
        const [r, y, p] = FLIP_SPIN[tr.name] || [1, 0, 0];
        const t = Math.min(1, tr.t / tr.dur);
        const e = t < 1 ? 1 - Math.pow(1 - t, 1.6) : 1; // snappy start, settle at the end
        // the stance flip mirrored the skater across the board's long axis, so roll and yaw invert
        // (pitch is about that axis and is unchanged) to keep each trick flipping the way it should
        b.rotation.set(p * e * Math.PI * 2, -y * e * Math.PI * 2, r * e * Math.PI * 2);
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
      this.body.rotation.set(0, -Math.PI / 2, 0); this.body.rotation.x = 1.35 * t;
      this.body.position.set(0, -0.5 * t * (STAND_DROP + 0.1) + 0.3 * t, 0.5 * t);
    } else {
      this.body.rotation.set(0, -Math.PI / 2, 0); this.body.position.set(0, 0, 0);
    }
    this.anchorFeet(sk, dt);
  }
}

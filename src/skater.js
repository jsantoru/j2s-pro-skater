// Skater controller: a hand-tuned kinematic character, not a rigid body.
// States: ride (on a surface), air, grind, bail. All units metres / seconds / radians unless noted.
import * as THREE from 'three';
import { FLIPS, GRABS, GRINDS, MANUALS, Combo, spinName } from './tricks.js';
import { Balance, BALANCE, MANUAL_BALANCE } from './balance.js';

export const TUNING = {
  gravity: 22,
  uphillGrav: 0.55,    // ramp assist: slopes slow you less than they speed you up
  maxPush: 9.6,        // top speed from pushing
  pushAcc: 7.5,        // m/s² while pushing (stick up / RT)
  crouchAcc: 9.5,      // m/s² while holding crouch on the ground (THPS: crouch = speed)
  crouchMax: 10.8,     // crouch is the fastest way to go: it tops out above the stick push
  autoPushSpeed: 5.4,  // below this on flat ground the skater pushes by itself
  autoPushAcc: 5.0,
  rollFriction: 0.32,  // constant decel
  drag: 0.0045,        // v² decel
  brakeAcc: 14,
  turnLow: 3.1,        // rad/s at standstill
  turnHigh: 1.75,      // rad/s at 12+ m/s
  crouchTurnMul: 1.3,
  carveDrag: 0.10,     // fraction of speed lost per second at full steer
  popMin: 5.7,
  popMax: 8.0,
  crouchFull: 0.55,    // seconds to full crouch
  spinRate: 560,       // deg/s at full stick
  vertAutoTurn: 380,   // deg/s auto 180 on vert airs
  airDrift: 2.2,       // m/s² lateral steer in air
  landTol: 65,         // degrees off-axis still lands
  snap: 0.45,          // ground stick distance
  launchThresh: 2.9,   // relative upward speed that pops you off convex edges
  splatSpeed: 6.5,
  grindMinSpeed: 3.2,
  grindFriction: 0.25,
  grindSnapAuto: 0.62,
  grindSnapAssist: 1.3,   // horizontal snap window while grind intent is live
  grindSnapBelow: 0.45,   // rail may sit this far above the feet and still pull you up onto it
  grindIntentTime: 0.6,   // a tap of grind stays "armed" this long (holding keeps it armed)
  grindMagnetRadius: 2.6, // rails inside this (horizontal) steer you in while armed
  grindMagnetAcc: 18,     // m/s² lateral pull
  grindMagnetSpeed: 4.5,  // max lateral closing speed
  trickBuffer: 0.25,      // flip/grab pressed this long before the pop still fires on takeoff
  // ---- manuals ----
  manualFlick: 0.3,       // seconds to complete the down-up (or up-down) flick that starts a manual
  manualEdge: 0.6,        // stick deflection that counts as one half of that flick
  manualCentre: 0.25,     // and it only arms from centre, so holding push then braking is not a flick
  manualMinSpeed: 1.6,    // below this you have run out of roll and the manual just ends
  manualDrag: 0.55,       // extra m/s² lost to riding on two wheels
  manualPitch: 22,        // degrees the board sits nose-up (or nose-down) while manualling
  grabMin: 0.3,
  pump: 4.0,           // m/s² while crouching down a transition
  vertKick: 1.3,       // outward push when leaving a vert lip without popping
  landBoost: 0.7,
  bailTime: 1.35,
};

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;

function shapeStick(x) { const a = Math.abs(x); return Math.sign(x) * (0.55 * a + 0.45 * a * a); }
function project(v, n, out) { return out.copy(v).addScaledVector(n, -v.dot(n)); }
function angleBetweenXZ(a, b) {
  const ax = a.x, az = a.z, bx = b.x, bz = b.z;
  const dot = ax * bx + az * bz, cr = ax * bz - az * bx;
  return Math.atan2(cr, dot); // signed, positive = b is clockwise from a (right turn)
}

export class Skater {
  constructor(level, rng) {
    this.level = level;
    this.T = TUNING;
    this.combo = new Combo();
    this.balance = new Balance(rng, BALANCE);              // grinds: side-to-side, stick X
    this.manualBalance = new Balance(rng, MANUAL_BALANCE); // manuals: fore-aft, stick Y
    this.events = {};
    this.score = 0;
    this.reset();
  }

  reset() {
    const s = this.level.spawn;
    this.pos = s.pos.clone();
    this.vel = new THREE.Vector3();
    this.heading = s.heading.clone(); // travel direction, tangent to ground
    this.normal = new THREE.Vector3(0, 1, 0);
    this.facing = s.heading.clone();  // XZ unit vector the body faces
    this.stance = 1;                  // 1 regular (facing == heading), -1 fakie
    this.speed = 0;
    this.state = 'ride';
    this.crouching = false; this.crouchTime = 0; this.crouch = 0;
    this.pushing = 0; this.braking = 0; this.steer = 0; this.lean = 0;
    this.airTime = 0; this.spinDeg = 0; this.spinDir = 1; this.vertAir = false; this.autoTurn = 0; this.autoTurnDir = 1;
    this.trick = null; this.airTrickIndex = -1;
    this.grind = null; this.bailT = 0; this.bailReason = '';
    this.balance.reset();
    this.manual = null; this.manualBalance.reset();
    this.flickDir = 0; this.flickT = 0; this.flickArmed = false; this.manualLean = 0;
    this.lastRail = null; this.railCooldown = 0;
    this.landSquash = 0; this.groundTime = 1;
    this.lastAirWasTiny = false;
    this.queued = null;                       // trick pressed on the ground, fired on the next takeoff
    this.grindIntent = 0; this.grindIntentDir = 'C'; // "I want to grind" window armed by a tap of Y
    this._inp = null;
    this.combo.newRun();
    this.score = 0;
    this.modelQuat = new THREE.Quaternion();
    this._targetQuat = new THREE.Quaternion();
  }

  emit(name, ...args) { const f = this.events[name]; if (f) f(...args); }

  raycast(origin, dir, far) {
    _ray.set(origin, dir); _ray.far = far; _ray.near = 0;
    const hits = _ray.intersectObjects(this.level.colliders, false);
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face.normal.clone().applyQuaternion(h.object.quaternion).normalize();
    return { point: h.point, normal: n, distance: h.distance };
  }

  // ---------- main update (fixed dt) ----------
  update(dt, inp) {
    this.steer = shapeStick(inp.steer);
    this._inp = inp;
    // input buffers (THPS forgiveness): a flip/grab pressed just before or exactly on the pop fires on takeoff,
    // and a tap of grind arms a window during which nearby rails pull you in.
    if (this.state === 'ride' || this.state === 'grind') {
      if (inp.flipPressed) this.queued = { kind: 'flip', dir: inp.dir8, age: 0 };
      else if (inp.grabPressed) this.queued = { kind: 'grab', dir: inp.dir8, age: 0 };
      else if (this.queued && !this.crouching) { this.queued.age += dt; if (this.queued.age > this.T.trickBuffer) this.queued = null; }
    }
    if (this.state !== 'bail') {
      if (inp.grindPressed || inp.grind) { this.grindIntent = this.T.grindIntentTime; if (inp.dir8 !== 'C' || inp.grindPressed) this.grindIntentDir = inp.dir8; }
      else this.grindIntent = Math.max(0, this.grindIntent - dt);
    }
    switch (this.state) {
      case 'ride': this.updateRide(dt, inp); break;
      case 'air': this.updateAir(dt, inp); break;
      case 'grind': this.updateGrind(dt, inp); break;
      case 'bail': this.updateBail(dt); break;
    }
    // visual manual pitch: +1 nose-up (tail manual), -1 nose-down (nose manual), eased so it rocks over
    const mTarget = this.manual ? (this.manual.kind === 'Nose Manual' ? -1 : 1) : 0;
    this.manualLean += (mTarget - this.manualLean) * Math.min(1, dt * 9);
    // visual crouch
    const target = this.state === 'bail' ? 0 : (this.crouching ? 0.35 + 0.65 * Math.min(1, this.crouchTime / this.T.crouchFull) : 0);
    this.crouch += (target - this.crouch) * Math.min(1, dt * (target > this.crouch ? 14 : 18));
    this.landSquash = Math.max(0, this.landSquash - dt * 3.2);
    // visual lean: into carves on the ground, and with the balance meter on a rail so you can read
    // how close you are to going over from the skater alone, without looking at the HUD
    const leanTarget = this.state === 'ride' ? this.steer * Math.min(1, this.speed / 7) * 0.5
      : (this.state === 'grind' ? this.balance.x * 0.75 : 0);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * (this.state === 'grind' ? 12 : 8));
    this.updateModelQuat(dt);
  }

  // ---------- RIDE ----------
  updateRide(dt, inp) {
    const T = this.T;
    this.groundTime += dt;
    this.handleCrouch(dt, inp);
    if (this.state !== 'ride') return;

    // longitudinal
    let sp = this.speed;
    sp += -T.gravity * this.heading.y * (this.heading.y > 0 ? T.uphillGrav : 1) * dt; // slopes (ramp assist uphill)
    this.pushing = 0; this.braking = inp.brake;
    // On two wheels you cannot push, pump or brake — the whole vertical stick axis belongs to balance,
    // which is also what keeps the manual input from fighting push/brake for the same stick.
    if (this.manual) {
      sp = Math.max(0, sp - T.manualDrag * dt);
    } else {
      if (inp.push > 0 && sp < T.maxPush) {
        const acc = T.pushAcc * inp.push * (sp < 2 ? 1.5 : 1);
        sp = Math.min(T.maxPush, sp + acc * dt); this.pushing = inp.push;
      }
      // THPS speed model: the skater pushes by himself when slow on flat ground, and holding crouch is the gas pedal
      if (this.crouching && sp < T.crouchMax && inp.brake === 0) sp = Math.min(T.crouchMax, sp + T.crouchAcc * (sp < 2 ? 1.4 : 1) * dt);
      else if (!this.pushing && !this.crouching && inp.brake === 0 && inp.autoPush !== false && sp < T.autoPushSpeed
        && this.normal.y > 0.92 && this.groundTime > 0.35) {
        sp = Math.min(T.autoPushSpeed, sp + T.autoPushAcc * (sp < 2 ? 1.5 : 1) * dt); this.pushing = 0.8;
      }
      if (inp.brake > 0) sp = Math.max(0, sp - T.brakeAcc * inp.brake * dt);
      if (this.crouching && this.normal.y < 0.85 && this.heading.y < -0.2) sp += T.pump * dt; // pumping transitions
    }
    const fr = (T.rollFriction + sp * sp * T.drag + Math.abs(this.steer) * sp * T.carveDrag) * dt;
    if (sp > 0) sp = Math.max(0, sp - fr);
    if (sp < 0) { // rollback on a slope: turn around, ride fakie
      sp = -sp; this.heading.negate(); this.stance = -this.stance;
    }
    this.speed = sp;

    // manuals: enter on a stick flick, then hold the pitch axis
    const flick = this.detectManualFlick(dt, inp);
    if (flick !== 0 && this.normal.y > 0.85 && sp > 2.2) {
      const want = flick < 0 ? 'tail' : 'nose';   // flicked down first = tail manual, up first = nose manual
      if (!this.manual) this.startManual(want);
      else if (this.manual.kind !== MANUALS[want][0]) { this.endManual(false); this.startManual(want); }
    }
    if (this.manual) {
      const m = this.manual;
      m.time += dt;
      if (!this.manualBalance.update(dt, inp.stickY || 0, sp)) { this.bail('balance'); return; }
      const tick = Math.floor(m.time * 10) - Math.floor((m.time - dt) * 10);
      if (tick > 0) this.combo.addToLast(10 * tick);
      // out of roll, or the ground stopped being flat enough to hold a wheelie on
      if (sp < T.manualMinSpeed || this.normal.y < 0.72) this.endManual(true);
    }

    // steering
    const turnRate = THREE.MathUtils.lerp(T.turnLow, T.turnHigh, Math.min(1, sp / 12)) * (this.crouching ? T.crouchTurnMul : 1);
    const canTurn = sp > 0.15 ? 1 : 0.35;
    if (this.steer !== 0) this.heading.applyAxisAngle(this.normal, -this.steer * turnRate * canTurn * dt).normalize();

    // integrate
    this.vel.copy(this.heading).multiplyScalar(sp);
    const travel = _v.copy(this.heading);
    // wall check (ray at knee height so low steps are ridden up)
    if (sp > 0.5) {
      const origin = _v2.copy(this.pos).addScaledVector(this.normal, 0.42);
      const hit = this.raycast(origin, travel, 0.5 + sp * dt);
      if (hit && hit.normal.dot(travel) < -0.5 && hit.normal.y < 0.35) {
        // tall wall at speed = slam; a low box / kicker side is just a bonk
        const tall = this.raycast(_v3.copy(this.pos).addScaledVector(this.normal, 1.0), travel, 0.5 + sp * dt);
        if (sp > T.splatSpeed && tall && tall.normal.y < 0.35) { this.bail('wall'); return; }
        this.speed = sp * 0.05;
        this.pos.copy(hit.point).addScaledVector(hit.normal, 0.45).addScaledVector(this.normal, -0.42);
        this.vel.set(0, 0, 0);
      }
    }
    this.pos.addScaledVector(this.vel, dt);

    // ground follow
    const origin = _v2.copy(this.pos).addScaledVector(this.normal, 0.5);
    const dir = _v3.copy(this.normal).negate();
    const hit = this.raycast(origin, dir, 0.5 + T.snap);
    if (hit) {
      const relUp = this.vel.dot(hit.normal);
      if (relUp > T.launchThresh && hit.distance > 0.6) { this.leaveGround(false); return; }
      this.pos.copy(hit.point);
      this.normal.copy(hit.normal);
      project(this.heading, this.normal, _v);
      if (_v.lengthSq() > 1e-4) this.heading.copy(_v.normalize());
    } else {
      this.leaveGround(false);
      return;
    }
    // keep facing in sync with travel on the ground
    const hx = _v.set(this.heading.x, 0, this.heading.z);
    if (hx.lengthSq() > 0.04) this.facing.copy(hx.normalize().multiplyScalar(this.stance));
  }

  // A manual starts on a down-up (or up-down) flick of the stick. It only arms from centre, so the
  // common push-then-brake sweep — which crosses both thresholds — is not mistaken for a flick.
  // Returns the direction it STARTED in: -1 down-first (tail manual), +1 up-first (nose manual).
  detectManualFlick(dt, inp) {
    const T = this.T, y = inp.stickY || 0;
    if (this.flickDir === 0) {
      if (Math.abs(y) < T.manualCentre) this.flickArmed = true;
      if (this.flickArmed && Math.abs(y) > T.manualEdge) { this.flickDir = Math.sign(y); this.flickT = 0; }
      return 0;
    }
    this.flickT += dt;
    if (this.flickT > T.manualFlick) { this.flickDir = 0; this.flickArmed = false; return 0; }
    if (Math.sign(y) === -this.flickDir && Math.abs(y) > T.manualEdge) {
      const started = this.flickDir;
      this.flickDir = 0; this.flickArmed = false;
      return started;
    }
    return 0;
  }

  startManual(which) {
    const [name, base] = MANUALS[which];
    this.manual = { kind: name, time: 0 };
    this.manualBalance.start(Math.min(MANUAL_BALANCE.comboMax, this.combo.tricks.length * MANUAL_BALANCE.comboStep));
    this.combo.add(name, base);
    this.emit('manualStart', name);
  }

  // banked=true settles the combo here on the ground; popping or bailing out of a manual does not,
  // because the combo carries on into the air.
  endManual(banked) {
    if (!this.manual) return;
    const m = this.manual;
    this.manual = null;
    this.manualBalance.stop();
    this.emit('manualEnd', m.kind, m.time);
    if (banked) this.bankCombo(false);
  }

  bankCombo(boost) {
    if (this.combo.tricks.length) {
      const banked = this.combo.total;
      this.score += banked;
      if (boost) this.speed = Math.min(this.speed + this.T.landBoost, 16);
      this.emit('land', banked, this.combo.text, this.combo.multiplier);
      this.combo.reset();
      return banked;
    }
    this.emit('land', 0, '', 0);
    return 0;
  }

  handleCrouch(dt, inp) {
    if (!inp.ollie) this.bufferedOllie = false;
    if (inp.olliePressed || (inp.ollie && this.bufferedOllie)) { this.crouching = true; this.crouchTime = 0; this.bufferedOllie = false; }
    if (this.crouching) {
      this.crouchTime += dt;
      if (inp.ollieReleased || !inp.ollie) this.pop();
    }
  }

  pop() {
    const T = this.T;
    const charge = Math.min(1, this.crouchTime / T.crouchFull);
    const power = THREE.MathUtils.lerp(T.popMin, T.popMax, charge);
    this.crouching = false;
    this.endManual(false);   // ollie out of a manual: the combo carries on into the air
    if (this.state === 'grind') {
      const g = this.grind;
      this.vel.copy(g.rail.dir).multiplyScalar(g.dir * g.speed);
      this.vel.y += power * 1.05;
      this.endGrind();
      this.startAir(UP, true);
    } else {
      this.vel.copy(this.heading).multiplyScalar(this.speed);
      this.vel.addScaledVector(this.normal, power * 0.8);
      this.vel.y += power * 0.3;
      this.startAir(this.normal, true);
    }
    this.emit('ollie', charge);
  }

  leaveGround(popped) {
    if (this.crouching) { this.pop(); return; } // still charging at the lip: pop now (late-release forgiveness)
    this.endManual(false);   // rolled off an edge while manualling: the combo stays open in the air
    this.vel.copy(this.heading).multiplyScalar(this.speed);
    if (this.normal.y < 0.45) this.vel.addScaledVector(this.normal, this.T.vertKick);
    this.startAir(this.normal, popped);
  }

  startAir(launchNormal, popped) {
    this.state = 'air';
    this.airTime = 0; this.spinDeg = 0;
    this.trick = null;
    this.airTrickIndex = this.combo.tricks.length;
    this.vertAir = launchNormal.y < 0.45;
    this.autoTurn = this.vertAir ? 180 : 0;
    this.autoTurnDir = this.steer !== 0 ? Math.sign(this.steer) : 1;
    this.launchNormal = launchNormal.clone();
    this.popped = popped;
    this.normal.set(0, 1, 0);
    // fire a buffered trick on takeoff (pressed during the crouch or on the same frame as the release)
    const q = this.queued; this.queued = null;
    if (q) {
      const inp = this._inp;
      const dir = inp && inp.dir8 !== 'C' ? inp.dir8 : q.dir;
      if (q.kind === 'flip' || (inp && inp.grab)) this.startTrick(q.kind, dir);
    }
  }

  startTrick(kind, dir8) {
    const T = this.T;
    if (kind === 'flip') {
      const [name, base, dur] = FLIPS[dir8] || FLIPS.C;
      this.trick = { kind: 'flip', name, base, t: 0, dur, dir: dir8 };
    } else {
      const [name, base] = GRABS[dir8] || GRABS.C;
      this.trick = { kind: 'grab', name, base, t: 0, dur: T.grabMin, dir: dir8, held: true };
    }
    this.emit('trickStart', this.trick.name);
  }

  // ---------- AIR ----------
  updateAir(dt, inp) {
    const T = this.T;
    this.airTime += dt;
    this.vel.y -= T.gravity * dt;

    // spin (analog) + bumper spin
    let spin = inp.steer + (inp.spinRight ? 1 : 0) - (inp.spinLeft ? 1 : 0);
    spin = Math.max(-1, Math.min(1, spin));
    const spinS = shapeStick(spin);
    let yawDeg = spinS * T.spinRate * dt;
    if (this.autoTurn > 0 && Math.abs(spinS) < 0.35) {
      const step = Math.min(this.autoTurn, T.vertAutoTurn * dt);
      this.autoTurn -= step; yawDeg += step * this.autoTurnDir;
    }
    if (yawDeg !== 0) {
      this.facing.applyAxisAngle(UP, -THREE.MathUtils.degToRad(yawDeg)).normalize();
      this.spinDeg += spinS * T.spinRate * dt;
    }
    // subtle lateral air steer (trajectory), relative to travel direction
    if (spinS !== 0 && !this.vertAir) {
      const hv = _v.set(this.vel.x, 0, this.vel.z);
      if (hv.lengthSq() > 1) {
        const right = _v2.crossVectors(hv.normalize(), UP);
        this.vel.addScaledVector(right, spinS * T.airDrift * dt);
      }
    }
    // tricks
    if (!this.trick) {
      if (inp.flipPressed) this.startTrick('flip', inp.dir8);
      else if (inp.grabPressed) this.startTrick('grab', inp.dir8);
    }
    if (this.trick) {
      const tr = this.trick; tr.t += dt;
      if (tr.kind === 'flip' && tr.t >= tr.dur) this.completeTrick();
      if (tr.kind === 'grab') {
        tr.held = inp.grab;
        if (!inp.grab && tr.t >= tr.dur) this.completeTrick();
      }
    }
    // crouch-in-air for the next pop? no; but allow pre-pressing ollie to land & re-pop quickly
    if (inp.olliePressed) { this.crouching = false; this.bufferedOllie = true; } // buffered: crouch on touchdown
    if (!inp.ollie) this.bufferedOllie = false;

    // grind magnet: while grind intent is armed, the nearest rail in range steers you onto it
    this.railCooldown -= dt;
    const armed = this.grindIntent > 0;
    if (armed && this.airTime > 0.04) {
      const r = this.findRail(T.grindMagnetRadius, dt, true, { dyMin: -T.grindSnapBelow, dyMax: 2.2, anyVy: true });
      if (r) {
        const ox = r.point.x - this.pos.x, oz = r.point.z - this.pos.z, d = Math.hypot(ox, oz);
        if (d > 0.03) {
          const nx = ox / d, nz = oz / d;
          const closing = this.vel.x * nx + this.vel.z * nz;
          const want = Math.min(T.grindMagnetSpeed, d * 5);
          const dv = THREE.MathUtils.clamp(want - closing, -T.grindMagnetAcc * dt, T.grindMagnetAcc * dt);
          this.vel.x += nx * dv; this.vel.z += nz * dv;
        }
      }
    }
    // grind snap
    if (this.vel.y < 0.5 || armed) {
      const tol = armed ? T.grindSnapAssist : T.grindSnapAuto;
      const r = this.findRail(tol, dt, armed, armed ? { dyMin: -T.grindSnapBelow } : null);
      if (r) { this.startGrind(r, inp); return; }
    }
    // move
    const step = _v.copy(this.vel).multiplyScalar(dt);
    const len = step.length();
    if (len > 0) {
      const hit = this.raycast(_v2.copy(this.pos).add(_v3.set(0, 0.25, 0)), _v3.copy(step).normalize(), len + 0.3);
      if (hit && hit.normal.dot(this.vel) < 0) {
        if (hit.normal.y < 0.3 && this.vel.dot(hit.normal) < -T.splatSpeed) { this.pos.copy(hit.point).addScaledVector(hit.normal, 0.3); this.bail('wall'); return; }
        // walls with upward-going velocity: slide along
        if (hit.normal.y < 0.3 && this.vel.y > 0) {
          this.pos.copy(hit.point).addScaledVector(hit.normal, 0.3);
          project(this.vel, hit.normal, this.vel);
          return;
        }
        this.land(hit.point, hit.normal); return;
      }
    }
    this.pos.add(step);
    // downward landing probe (covers flat landings where the velocity ray is shallow)
    if (this.vel.y <= 0) {
      const hit = this.raycast(_v2.copy(this.pos).add(_v3.set(0, 0.3, 0)), _v3.set(0, -1, 0), 0.3 + 0.05);
      if (hit) this.land(hit.point, hit.normal);
    }
    if (this.pos.y < -5) { this.pos.copy(this.level.spawn.pos); this.vel.set(0, 0, 0); this.bail('void'); }
  }

  completeTrick() {
    const tr = this.trick; this.trick = null;
    let pts = tr.base;
    if (tr.kind === 'grab') pts += Math.floor(Math.max(0, tr.t - tr.dur) * 10) * 10; // +10/0.1s held
    this.combo.add(tr.name, pts);
    this.emit('trick', tr.name);
  }

  // Award spin at the moment the air ends (landing or grind): prefixes the first trick of this air.
  bankSpin(prefixTarget) {
    const deg = Math.abs(this.spinDeg);
    if (deg < 150) return '';
    const name = spinName(this.spinDeg, -Math.sign(this.spinDeg) * this.stance);
    const bonus = 100 * Math.round(deg / 180);
    if (this.combo.tricks.length > this.airTrickIndex) {
      const t = this.combo.tricks[this.airTrickIndex];
      t.name = name + ' ' + t.name; t.points += bonus; this.combo.points += bonus;
    } else if (prefixTarget) {
      return name + ' ';
    } else {
      this.combo.add(name, bonus);
    }
    return '';
  }

  land(point, n) {
    const T = this.T;
    const tiny = !this.popped && this.airTime < 0.22 && this.combo.tricks.length === 0 && Math.abs(this.spinDeg) < 40;
    if (n.y < 0.3 && this.vel.dot(n) < -T.splatSpeed) { this.pos.copy(point); this.bail('wall'); return; }
    if (n.y < 0.3 && !this.vertAir) { // brushed a wall mid-air: scrub along it, keep flying
      this.pos.copy(point).addScaledVector(n, 0.3);
      project(this.vel, n, this.vel).multiplyScalar(0.7);
      return;
    }
    if (this.trick && !(this.trick.kind === 'grab' && this.trick.t >= this.trick.dur)) { this.pos.copy(point); this.bail('trick'); return; }
    if (this.trick) this.completeTrick();
    // new heading from velocity on the surface
    project(this.vel, n, _v);
    let sp = _v.length();
    if (sp > 0.5) this.heading.copy(_v.divideScalar(sp));
    else { // near-zero surface speed: face the way the body faces
      project(_v2.set(this.facing.x, 0, this.facing.z), n, this.heading);
      if (this.heading.lengthSq() < 1e-6) this.heading.set(this.facing.x, 0, this.facing.z);
      this.heading.normalize(); this.stance = 1;
    }
    this.normal.copy(n);
    this.pos.copy(point);
    // stance / landing angle
    const hx = _v2.set(this.heading.x, 0, this.heading.z);
    if (hx.lengthSq() > 0.05 && sp > 0.5) {
      hx.normalize();
      const ang = THREE.MathUtils.radToDeg(Math.abs(angleBetweenXZ(hx, this.facing)));
      const off = ang < 90 ? ang : 180 - ang;
      if (off > T.landTol && !tiny) { this.bail('sketchy'); return; }
      this.stance = ang < 90 ? 1 : -1;
      this.facing.copy(hx).multiplyScalar(this.stance);
      // sketchy-ish landings scrub speed
      sp *= 1 - Math.max(0, off - 25) / 100;
    }
    this.speed = sp;
    this.state = 'ride';
    this.groundTime = 0;
    this.grindIntent = 0; this.queued = null;
    this.landSquash = Math.min(1, 0.4 + Math.max(0, -this.vel.dot(n)) / 12);
    this.vel.copy(this.heading).multiplyScalar(sp);
    if (tiny) return;
    this.bankSpin(false);
    this.bankCombo(true);
  }

  // ---------- GRIND ----------
  findRail(tol, dt, assist, opts) {
    const dyMin = opts && opts.dyMin !== undefined ? opts.dyMin : -0.3;
    const dyMax = opts && opts.dyMax !== undefined ? opts.dyMax : null;
    let best = null, bestD = tol;
    for (const r of this.level.rails) {
      if (this.railCooldown > 0 && (r === this.lastRail || this.railCooldown > 0.25)) continue; // 0.2s global, 0.45s same rail
      if (assist && this.vel.y > 3.5 && !(opts && opts.anyVy)) continue;
      if (r.kind === 'coping' && !assist) continue;
      _v.copy(this.pos).sub(r.a);
      let t = _v.dot(r.dir) / r.len;
      if (t < -0.02 || t > 1.02) continue;
      t = Math.max(0, Math.min(1, t));
      const along = this.vel.x * r.dir.x + this.vel.z * r.dir.z;
      if ((t > 0.97 && along > 0) || (t < 0.03 && along < 0)) continue; // would exit the end immediately
      _v2.copy(r.a).addScaledVector(r.dir, t * r.len);
      const dy = this.pos.y - _v2.y;
      const fall = -this.vel.y * dt;
      if (dy < dyMin || dy > (dyMax !== null ? dyMax : 0.5 + fall)) continue;
      const d = Math.hypot(this.pos.x - _v2.x, this.pos.z - _v2.z);
      if (d < bestD) { bestD = d; best = { rail: r, t, point: _v2.clone() }; }
    }
    return best;
  }

  startGrind(found, inp) {
    if (this.trick && !(this.trick.kind === 'grab' && this.trick.t >= this.trick.dur)) { this.bail('trick'); return; }
    if (this.trick) this.completeTrick();
    const r = found.rail;
    const hv = _v.set(this.vel.x, 0, this.vel.z);
    const along = hv.dot(r.dir);
    let dir = along >= 0 ? 1 : -1;
    if (Math.abs(along) < 0.3) dir = this.facing.dot(r.dir) >= 0 ? 1 : -1;
    const speed = Math.max(this.T.grindMinSpeed, hv.length());
    const gdir = inp.dir8 !== 'C' ? inp.dir8 : this.grindIntentDir; // a tapped grind remembers the direction it was tapped with
    const [gname, base] = GRINDS[gdir] || GRINDS.C;
    this.grindIntent = 0; this.grindIntentDir = 'C'; this.queued = null;
    const slide = gname.includes('slide');
    const prefix = this.bankSpin(true);
    this.grind = { rail: r, t: found.t, dir, speed, name: gname, slide, time: 0 };
    this.balance.start(Math.min(BALANCE.comboMax, this.combo.tricks.length * BALANCE.comboStep));
    this.pos.copy(found.point); this.pos.y += 0.02;
    // facing: sideways for slides, along the rail otherwise (nearest stance)
    const rd = _v2.set(r.dir.x, 0, r.dir.z).normalize().multiplyScalar(dir);
    if (slide) {
      const side = _v3.crossVectors(rd, UP);
      this.facing.copy(side.dot(this.facing) >= 0 ? side : side.negate()).normalize();
    } else {
      this.stance = this.facing.dot(rd) >= 0 ? 1 : -1;
      this.facing.copy(rd).multiplyScalar(this.stance);
    }
    this.heading.copy(r.dir).multiplyScalar(dir);
    this.normal.set(0, 1, 0);
    this.state = 'grind';
    this.combo.add(prefix + gname, base);
    this.emit('grindStart', gname);
  }

  updateGrind(dt, inp) {
    const T = this.T, g = this.grind, r = g.rail;
    g.time += dt;
    this.handleCrouch(dt, inp);
    if (this.state !== 'grind') return;
    // hold the line: the stick leans the board, so counter a tip by pressing away from it
    // this.steer is the shaped stick, so small corrections near centre are gentle and full lock is full
    if (!this.balance.update(dt, this.steer, g.speed)) { this.bail('balance'); return; }
    g.speed += -T.gravity * r.dir.y * g.dir * dt - T.grindFriction * dt;
    if (g.speed < 1.0) g.speed = 1.0; // never stall on a rail
    g.t += g.dir * g.speed * dt / r.len;
    // accrue grind points
    const tick = Math.floor(g.time * 10) - Math.floor((g.time - dt) * 10);
    if (tick > 0) this.combo.addToLast(10 * tick);
    if (g.t < 0 || g.t > 1) {
      this.pos.copy(r.a).addScaledVector(r.dir, Math.max(0, Math.min(1, g.t)) * r.len); this.pos.y += 0.02;
      this.vel.copy(r.dir).multiplyScalar(g.dir * g.speed);
      this.vel.y += 1.0;
      this.endGrind();
      this.startAir(UP, false);
      return;
    }
    this.pos.copy(r.a).addScaledVector(r.dir, g.t * r.len); this.pos.y += 0.02;
    this.speed = g.speed;
    this.heading.copy(r.dir).multiplyScalar(g.dir);
  }

  endGrind() {
    this.balance.stop();
    this.emit('grindEnd', this.grind.name, this.grind.time);
    this.lastRail = this.grind.rail; this.railCooldown = 0.45;
    if (this.grind.slide) { // slides exit facing forward again
      const hx = _v.set(this.heading.x, 0, this.heading.z);
      if (hx.lengthSq() > 0.01) { this.facing.copy(hx.normalize()); this.stance = 1; }
    }
    this.grind = null;
    this.groundTime = 0;
  }

  // ---------- BAIL ----------
  bail(reason) {
    if (this.state === 'grind') this.grind = null;
    this.manual = null; this.manualBalance.stop();
    this.balance.stop();
    this.state = 'bail'; this.bailT = 0; this.bailReason = reason;
    this.trick = null; this.crouching = false; this.queued = null; this.grindIntent = 0;
    if (reason === 'wall') this.vel.multiplyScalar(-0.15).y += 2.5;
    else { this.vel.multiplyScalar(0.6); this.vel.y = Math.max(this.vel.y, 1.5); }
    this.lostCombo = this.combo.text; this.lostPoints = this.combo.points; this.lostMult = this.combo.multiplier;
    this.combo.reset();
    this.emit('bail', reason);
  }

  updateBail(dt) {
    const T = this.T;
    this.bailT += dt;
    this.vel.y -= T.gravity * dt;
    const step = _v.copy(this.vel).multiplyScalar(dt);
    const hitF = step.lengthSq() > 0 ? this.raycast(_v2.copy(this.pos).add(_v3.set(0, 0.3, 0)), _v3.copy(step).normalize(), step.length() + 0.35) : null;
    if (hitF && hitF.normal.y < 0.5) { project(this.vel, hitF.normal, this.vel); this.vel.multiplyScalar(0.5); }
    else this.pos.add(step);
    const hit = this.raycast(_v2.copy(this.pos).add(_v3.set(0, 0.5, 0)), _v3.set(0, -1, 0), 0.6 + Math.max(0, -this.vel.y * dt));
    if (!hit && this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; this.normal.set(0, 1, 0); }
    if (hit) {
      this.pos.copy(hit.point); this.normal.copy(hit.normal);
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 4.5));
    }
    if (this.bailT >= T.bailTime) {
      this.state = 'ride'; this.speed = 0; this.vel.set(0, 0, 0);
      this.stance = 1;
      this.heading.copy(this.facing);
      project(this.heading, this.normal, this.heading);
      if (this.heading.lengthSq() < 1e-4) this.heading.set(1, 0, 0);
      this.heading.normalize();
      this.groundTime = 0;
      this.emit('recover');
    }
  }

  // ---------- visuals ----------
  updateModelQuat(dt) {
    const up = _v.copy(this.normal);
    if (this.state === 'air') up.set(0, 1, 0);
    let fwd = _v2.copy(this.facing);
    if (this.state === 'ride' || this.state === 'grind') {
      // on surfaces the body forward is the true 3D travel direction (so it tilts up vert walls)
      const h = _v3.copy(this.heading).multiplyScalar(this.stance);
      if (this.grind && this.grind.slide) fwd.copy(this.facing);
      else if (h.lengthSq() > 0.01) fwd.copy(h);
    }
    project(fwd, up, fwd);
    if (fwd.lengthSq() < 1e-4) fwd.set(this.facing.x, 0, this.facing.z);
    fwd.normalize();
    const right = _v3.crossVectors(up, fwd).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, fwd);
    this._targetQuat.setFromRotationMatrix(m);
    const rate = this.state === 'air' ? 20 : 16;
    this.modelQuat.slerp(this._targetQuat, Math.min(1, dt * rate));
  }
}

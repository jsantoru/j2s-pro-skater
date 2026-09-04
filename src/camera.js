// Third-person follow camera: tracks travel direction (not the body spin), pulls back with speed,
// avoids walls, and never rolls.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Raycaster();
const _right = new THREE.Vector3();
const _renderPos = new THREE.Vector3();

export const CAMERA_TUNING = {
  grindDistance: 0.55,   // move closer so the rail reads as a narrow line
  grindHeight: 0.27,
  grindFov: 2.5,
  spinLeadMax: 8,        // degrees: enough anticipation without hiding the skater's rotation
  spinLeadScale: 0.014,  // degrees of camera lead per degree/second of body rotation
  punchSpring: 105,
  punchDamp: 17,
  shakeDecay: 2.8,
  shakeDistance: 0.075,
};

export class FollowCamera {
  constructor(camera, level) {
    this.cam = camera; this.level = level;
    this.dirAngle = 0;       // yaw of the follow direction
    this.nudge = 0;          // right-stick offset
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.first = true;
    this.smoothSpeed = 0;
    this.grindBlend = 0;
    this.spinLead = 0;
    this.punch = 0; this.punchVel = 0; this.fovKick = 0;
    this.shake = 0; this.shakeT = 0;
  }

  snap(sk) {
    this.first = true;
    this.grindBlend = sk.state === 'grind' ? 1 : 0;
    this.spinLead = 0; this.punch = 0; this.punchVel = 0; this.fovKick = 0; this.shake = 0;
    this.update(0.016, sk, 0);
  }

  land(strength) {
    const s = THREE.MathUtils.clamp(strength, 0, 1);
    this.punchVel += 0.75 + s * 1.2;
    this.fovKick = Math.max(this.fovKick, s * 1.35);
    this.shake = Math.max(this.shake, THREE.MathUtils.clamp((s - 0.5) / 0.5, 0, 1) * 0.55);
  }

  bail() {
    this.punchVel += 2.2;
    this.fovKick = Math.max(this.fovKick, 1.8);
    this.shake = 1;
  }

  update(dt, sk, camX) {
    // desired follow direction
    let dx = sk.heading.x, dz = sk.heading.z;
    if (sk.state === 'air' || sk.state === 'bail') { dx = sk.vel.x; dz = sk.vel.z; }
    let want = this.dirAngle;
    const speedXZ = Math.hypot(dx, dz);
    if (speedXZ > 0.6 || (sk.state === 'ride' && Math.hypot(sk.heading.x, sk.heading.z) > 0.3 && sk.speed > 0.6)) want = Math.atan2(dx, dz);
    else if (sk.state === 'ride' && sk.speed <= 0.6) want = Math.atan2(sk.facing.x, sk.facing.z);
    let diff = want - this.dirAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    // turn faster when the skater is carving hard, slower in the air so spins stay readable
    const rate = sk.state === 'air' ? 2.2 : (sk.state === 'grind' ? 5 : 4.5 + Math.abs(sk.steer) * 3);
    this.dirAngle += diff * Math.min(1, dt * rate);
    // Right-stick nudge and a small predictive yaw into body rotation. The base camera still follows
    // travel, not facing, so the spin remains readable instead of the camera rotating with the skater.
    this.nudge += (camX * 0.9 - this.nudge) * Math.min(1, dt * 5);
    const maxLead = THREE.MathUtils.degToRad(CAMERA_TUNING.spinLeadMax);
    const leadTarget = sk.state === 'air'
      ? THREE.MathUtils.clamp(THREE.MathUtils.degToRad(-(sk.spinVelocity || 0) * CAMERA_TUNING.spinLeadScale), -maxLead, maxLead)
      : 0;
    this.spinLead += (leadTarget - this.spinLead) * Math.min(1, dt * (leadTarget === 0 ? 7 : 11));
    const ang = this.dirAngle + this.nudge + this.spinLead;
    const fwd = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));

    this.smoothSpeed += (sk.speed - this.smoothSpeed) * Math.min(1, dt * 3);
    const sp = Math.min(16, this.smoothSpeed);
    const grindTarget = sk.state === 'grind' ? 1 : 0;
    this.grindBlend += (grindTarget - this.grindBlend) * Math.min(1, dt * (grindTarget ? 7 : 9));
    const dist = 4.6 + sp * 0.11 - this.grindBlend * CAMERA_TUNING.grindDistance;
    const height = 1.9 + sp * 0.03 - this.grindBlend * CAMERA_TUNING.grindHeight;
    const target = new THREE.Vector3().copy(sk.pos).addScaledVector(UP, 0.9);
    const desired = target.clone().addScaledVector(fwd, -dist).addScaledVector(UP, height);

    // A critically-damped-ish positional spring gives landings one coherent down/back punch followed
    // by a small recovery. Substeps keep it stable if a frame arrives late.
    let remain = Math.min(dt, 0.1);
    while (remain > 0) {
      const h = Math.min(remain, 1 / 120);
      this.punchVel += (-CAMERA_TUNING.punchSpring * this.punch - CAMERA_TUNING.punchDamp * this.punchVel) * h;
      this.punch += this.punchVel * h;
      remain -= h;
    }
    desired.addScaledVector(UP, -this.punch).addScaledVector(fwd, -this.punch * 0.55);
    this.fovKick *= Math.exp(-dt * 9);

    // keep the camera above nearby ground when the skater is high on a wall
    // wall / geometry avoidance
    const toCam = desired.clone().sub(target); const len = toCam.length();
    _ray.set(target, toCam.clone().normalize()); _ray.far = len; _ray.near = 0;
    const hits = _ray.intersectObjects(this.level.colliders, false);
    if (hits.length) desired.copy(target).addScaledVector(toCam.normalize(), Math.max(0.8, hits[0].distance - 0.35));
    if (desired.y < 0.5) desired.y = 0.5;

    // Two incommensurate sine pairs make a short, filtered impact shake. It is applied after normal
    // follow smoothing so that smoothing does not erase it, and to position only: there is no roll.
    this.shakeT += dt;
    let shakeX = 0, shakeY = 0;
    if (this.shake > 0) {
      const amp = this.shake * this.shake * CAMERA_TUNING.shakeDistance;
      _right.crossVectors(UP, fwd).normalize();
      shakeX = (Math.sin(this.shakeT * 91) + Math.sin(this.shakeT * 147) * 0.45) * amp;
      shakeY = (Math.sin(this.shakeT * 113) + Math.sin(this.shakeT * 173) * 0.35) * amp * 0.65;
      this.shake = Math.max(0, this.shake - dt * CAMERA_TUNING.shakeDecay);
    }

    const lookAt = target.clone().addScaledVector(fwd, 1.4);
    if (this.first) { this.pos.copy(desired); this.look.copy(lookAt); this.first = false; }
    else {
      const k = sk.state === 'air' ? 7 : 9;
      this.pos.lerp(desired, Math.min(1, dt * k));
      this.look.lerp(lookAt, Math.min(1, dt * 14));
    }
    _renderPos.copy(this.pos).addScaledVector(_right, shakeX).addScaledVector(UP, shakeY);
    this.cam.position.copy(_renderPos);
    this.cam.lookAt(this.look);
    const fov = 58 + sp * 0.9 - this.grindBlend * CAMERA_TUNING.grindFov + this.fovKick;
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 7);
    this.cam.updateProjectionMatrix();
  }
}

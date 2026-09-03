// Third-person follow camera: tracks travel direction (not the body spin), pulls back with speed,
// avoids walls, and never rolls.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Raycaster();

export class FollowCamera {
  constructor(camera, level) {
    this.cam = camera; this.level = level;
    this.dirAngle = 0;       // yaw of the follow direction
    this.nudge = 0;          // right-stick offset
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.first = true;
    this.smoothSpeed = 0;
  }

  snap(sk) { this.first = true; this.update(0.016, sk, 0); }

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
    // nudge
    this.nudge += (camX * 0.9 - this.nudge) * Math.min(1, dt * 5);
    const ang = this.dirAngle + this.nudge;
    const fwd = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));

    this.smoothSpeed += (sk.speed - this.smoothSpeed) * Math.min(1, dt * 3);
    const sp = Math.min(16, this.smoothSpeed);
    const dist = 4.6 + sp * 0.11, height = 1.9 + sp * 0.03;
    const target = new THREE.Vector3().copy(sk.pos).addScaledVector(UP, 0.9);
    const desired = target.clone().addScaledVector(fwd, -dist).addScaledVector(UP, height);
    // keep the camera above nearby ground when the skater is high on a wall
    // wall / geometry avoidance
    const toCam = desired.clone().sub(target); const len = toCam.length();
    _ray.set(target, toCam.clone().normalize()); _ray.far = len; _ray.near = 0;
    const hits = _ray.intersectObjects(this.level.colliders, false);
    if (hits.length) desired.copy(target).addScaledVector(toCam.normalize(), Math.max(0.8, hits[0].distance - 0.35));
    if (desired.y < 0.5) desired.y = 0.5;

    const lookAt = target.clone().addScaledVector(fwd, 1.4);
    if (this.first) { this.pos.copy(desired); this.look.copy(lookAt); this.first = false; }
    else {
      const k = sk.state === 'air' ? 7 : 9;
      this.pos.lerp(desired, Math.min(1, dt * k));
      this.look.lerp(lookAt, Math.min(1, dt * 14));
    }
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    this.cam.fov += (58 + sp * 0.9 - this.cam.fov) * Math.min(1, dt * 4);
    this.cam.updateProjectionMatrix();
  }
}

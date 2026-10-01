import * as THREE from 'three';
import { mirrorSwitchPose } from './stance-pose.js';

// Pose references: original team photographs and instructional sequences, inspected
// 2026-09-29. Angles below are readable animation choices, not measured photo data.
// https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/curb-rail/how-to-50-50/
// how-to-5-0/             rear hanger loaded, nose up, weight over back foot
// how-to-nosegrind/       front hanger loaded, tail up, shoulders over front foot
// how-to-bs-crooked/      front hanger pinched diagonally, tail raised to one side
// how-to-fs-smithgrind/   rear hanger loaded, front truck below and beside the rail
// how-to-bs-boardslide/ and how-to-fs-lipslide/  deck underside across the rail.
// A lipslide passes the rear truck over the obstacle on entry; its sustained
// contact is the same deck contact as a boardslide, not a different truck grind.
// Overcrook/Feeble are the opposite-side pinches of Crooked/Smith respectively.
// Red Bull original contest/athlete photos, also visually inspected by the team:
// https://www.redbull.com/int-en/mystic-skate-cup-highlights-2018
// Luiz Neto, frontside overcrook (Lukas Wagneter): front truck loaded on the
// far side, diagonal board, raised tail and bent rear knee.
// https://www.redbull.com/us-en/galleries/5for5-jamie-foy-gallery-c3
// Jamie Foy, frontside feeble: rear hanger supports the weight; nose/front
// truck hang beyond the opposite rail side, arms spread and knees flexed.
// Primary motion reference, watched at normal playback through entry/hold/exit:
// https://www.youtube.com/watch?v=E2-aLE2HZ1w (SkateDeluxe BS Crooked tutorial).
// The front leg takes the pinch while the rear knee/tail lift; on exit the board
// flattens and shoulders unwind before landing. Hence the short entry blend and
// decaying exit correction, rather than snapping to neutral on the last rail frame.

const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const IDENTITY = new THREE.Quaternion(), D = Math.PI / 180;
const BODY = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2);
const AXLE = .24, HANGER_Y = .043, HANGER_RADIUS = .017, DECK_BOTTOM = .114;
const ENTRY_TIME = .18, EXIT_RATE = 19;
const CAR_BODY_TILT = 22 * D, CAR_BODY_RATE = 18;

// Profiles describe the travel-leading nose and trailing tail. Root +Z stays
// anatomical; switch rendering mirrors the longitudinal pose/contact only.
export const GRIND_POSES = Object.freeze({
  '50-50':         { pivot: 'both', yaw: 0, pitch: 0, weight: 0, twist: 0, arms: [65, -62] },
  '5-0':           { pivot: 'rear', yaw: 0, pitch: -21, weight: -.13, twist: 3, arms: [58, -73] },
  'Nosegrind':     { pivot: 'front', yaw: 0, pitch: 17, weight: .13, twist: -7, arms: [76, -51] },
  'Boardslide':    { pivot: 'deck', yaw: 0, pitch: 0, weight: 0, twist: -17, arms: [72, -52] },
  'Lipslide':      { pivot: 'deck', yaw: 0, pitch: 0, weight: -.018, twist: 20, arms: [51, -76] },
  'Crooked Grind': { pivot: 'front', yaw: -31, pitch: 18, weight: .12, twist: 15, arms: [77, -44] },
  'Overcrook':     { pivot: 'front', yaw: 34, pitch: 18, weight: .12, twist: -19, arms: [49, -78] },
  'Smith Grind':   { pivot: 'rear', yaw: -26, pitch: 17, weight: -.12, twist: 17, arms: [59, -80] },
  'Feeble Grind':  { pivot: 'rear', yaw: 29, pitch: 17, weight: -.12, twist: -15, arms: [79, -53] },
});

const GRIND_BODY_POSES=Object.fromEntries(Object.entries(GRIND_POSES).map(([name,p])=>{
  const regular={torsoY:p.twist,torsoZ:-p.pitch*.5,hipsSide:p.weight,
    lArmZ:p.arms[0]-75,rArmZ:p.arms[1]+75,
    lElbow:p.pivot==='front'?12:3,rElbow:p.pivot==='rear'?13:2,
    headY:p.yaw*.5-p.twist*.35};
  return [name,[regular,mirrorSwitchPose({...regular})]];
}));

/** Render-only board/body transform. Apply after Character's normal board/body
 * transforms, BEFORE anchorFeet. Character.root stays at sk.pos/modelQuat.
 * update(sk,dt) -> pose(target) -> applyBoard(character) -> normal foot IK.
 * Reusable `contact` vectors are world-space diagnostics, never gameplay inputs.
 */
export class GrindAnimation {
  constructor() {
    this.boardQuaternion = new THREE.Quaternion();
    this.boardPosition = new THREE.Vector3();
    this.contact = { kind: null, local: new THREE.Vector3(), world: new THREE.Vector3(),
      normal: new THREE.Vector3(), railPoint: new THREE.Vector3(), railDirection: new THREE.Vector3(), radius: 0 };
    this._worldQ = new THREE.Quaternion(); this._entryQ = new THREE.Quaternion();
    this._bodyWorldQ = new THREE.Quaternion(); this._bodyQuaternion = new THREE.Quaternion();
    this._bodyTargetQ = new THREE.Quaternion(); this._uprightQ = new THREE.Quaternion();
    this._bodyForward = new THREE.Vector3(); this._bodyUp = new THREE.Vector3();
    this._frameQ = new THREE.Quaternion(); this._targetQ = new THREE.Quaternion();
    this._inverseQ = new THREE.Quaternion(); this._turnQ = new THREE.Quaternion();
    this._worldOffset = new THREE.Vector3(); this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(); this._nose = new THREE.Vector3();
    this._axle = new THREE.Vector3(); this._pivot = new THREE.Vector3();
    this._offset = new THREE.Vector3(); this._railOffset = new THREE.Vector3(); this._matrix = new THREE.Matrix4();
    this._angles = new THREE.Euler(0,0,0,'YXZ');
    this.reset();
  }

  reset() {
    this.active = false; this.weight = 0; this.name = null; this._grind = null;
    this._elapsed = 0; this._stance = 1; this._spec = null;
    this.boardQuaternion.identity(); this.boardPosition.set(0, 0, 0);
    this._bodyQuaternion.identity();
    this._worldOffset.set(0, 0, 0); this.contact.kind = null;
  }

  update(sk, dt) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    const g = sk.state === 'grind' ? sk.grind : null;
    if (!sk.modelQuat || !sk.pos || sk.state === 'bail') { this.reset(); return; }
    this._inverseQ.copy(sk.modelQuat).invert();
    if (!g?.rail?.dir || !GRIND_POSES[g.name]) {
      this.active = false; this.contact.kind = null; this._grind = null;
      if (this.weight <= .0001 || (sk.state !== 'air' && sk.state !== 'ride')) { this.reset(); return; }
      const keep = Math.exp(-EXIT_RATE * dt);
      this.weight *= keep;
      this.boardQuaternion.copy(this._inverseQ).multiply(this._worldQ).slerp(IDENTITY, 1 - keep);
      this._worldQ.copy(sk.modelQuat).multiply(this.boardQuaternion);
      this._bodyQuaternion.copy(this._inverseQ).multiply(this._bodyWorldQ).slerp(IDENTITY, 1 - keep);
      this._bodyWorldQ.copy(sk.modelQuat).multiply(this._bodyQuaternion);
      this._worldOffset.multiplyScalar(keep);
      this.boardPosition.copy(this._worldOffset).applyQuaternion(this._inverseQ);
      return;
    }
    if (this._grind !== g || this.name !== g.name) {
      this._elapsed = 0; this._entryQ.copy(this.weight > .0001 ? this._bodyWorldQ : sk.modelQuat);
      this._bodyWorldQ.copy(this._entryQ);
      this._grind = g; this.name = g.name;
    }
    this.active = true; this._stance = sk.stance < 0 ? -1 : 1; this._spec = GRIND_POSES[g.name];
    this._elapsed += dt;
    const t = Math.min(1, this._elapsed / ENTRY_TIME);
    this.weight = t * t * (3 - 2 * t);
    const c = this.contact, p = this._spec;
    c.kind = p.pivot;
    c.railDirection.copy(g.rail.dir).normalize();
    c.railPoint.copy(g.rail.a).addScaledVector(c.railDirection, g.t * g.rail.len);
    c.radius = Number.isFinite(g.rail.radius) ? Math.max(0, g.rail.radius)
      : Number.isFinite(g.rail.r) ? Math.max(0, g.rail.r) : g.rail.kind === 'ledge' ? 0 : .035;
    // Build a true sloping rail frame. Physics intentionally keeps grind normal
    // vertical; correcting locally avoids changing modelQuat, facing or travel.
    this._nose.copy(c.railDirection).multiplyScalar((g.dir || 1) * this._stance);
    this._right.crossVectors(UP, this._nose).normalize();
    if (this._right.lengthSq() < .01) this._right.copy(X);
    this._up.crossVectors(this._nose, this._right).normalize();
    if (p.pivot === 'deck') {
      // Preserve the side selected by the physical entry, including fakie.
      const side = this._right.dot(sk.facing) >= 0 ? 1 : -1;
      this._nose.copy(this._right).multiplyScalar(side);
      this._right.crossVectors(this._up, this._nose).normalize();
    }
    this._frameQ.setFromRotationMatrix(this._matrix.makeBasis(this._right, this._up, this._nose));
    this._turnQ.setFromEuler(this._angles.set(p.pitch * D * this._stance, p.yaw * D * this._stance, 0));
    this._targetQ.copy(this._frameQ).multiply(this._turnQ);
    if (g.rail.category === 'car') {
      // The board follows a steep windshield, but the rider balances above it.
      // Keep the same horizontal facing while limiting body pitch/roll; foot
      // IK absorbs the differing deck slope without changing truck contact.
      this._bodyForward.set(0,0,1).applyQuaternion(this._targetQ).setY(0);
      if (this._bodyForward.lengthSq() < 1e-8) this._bodyForward.copy(sk.facing).setY(0);
      this._bodyUp.copy(UP).applyQuaternion(this._targetQ);
      const tilt=Math.acos(THREE.MathUtils.clamp(this._bodyUp.y,-1,1));
      if (tilt>CAR_BODY_TILT) {
        const cross=Math.hypot(this._bodyUp.x,this._bodyUp.z);
        this._bodyUp.x*=Math.sin(CAR_BODY_TILT)/Math.max(cross,1e-8);
        this._bodyUp.z*=Math.sin(CAR_BODY_TILT)/Math.max(cross,1e-8);
        this._bodyUp.y=Math.cos(CAR_BODY_TILT);
      }
      // Rebuild an orthogonal frame with that up vector and unchanged projected
      // facing. A quaternion pitch/roll clamp can introduce unwanted yaw/roll.
      this._bodyForward.y=-(this._bodyForward.x*this._bodyUp.x+this._bodyForward.z*this._bodyUp.z)/this._bodyUp.y;
      this._bodyForward.normalize();this._right.crossVectors(this._bodyUp,this._bodyForward).normalize();
      this._bodyTargetQ.setFromRotationMatrix(this._matrix.makeBasis(this._right,this._bodyUp,this._bodyForward));
      this._uprightQ.copy(this._entryQ).slerp(this._bodyTargetQ,this.weight);
      this._bodyWorldQ.slerp(this._uprightQ,1-Math.exp(-CAR_BODY_RATE*dt));
    } else this._bodyWorldQ.copy(this._entryQ).slerp(this._targetQ, this.weight);
    this._bodyQuaternion.copy(this._inverseQ).multiply(this._bodyWorldQ);
    // The board must already straddle the rail at capture: easing an along-rail
    // board into a boardslide sweeps the trucks through the bar, and an angled
    // 50-50 can leave neither hanger touching. Ease the rider independently,
    // and blend only the supported pinch/pitch in the actual rail frame.
    // A Smith/Feeble turns its free truck aside BEFORE lowering the nose.
    const pitchWeight = p.pivot === 'rear' && p.pitch > 0
      ? Math.max(0,(this.weight-.68)/.32) : this.weight;
    this._turnQ.setFromEuler(this._angles.set(p.pitch * D * pitchWeight * this._stance, p.yaw * D * this.weight * this._stance, 0));
    this._worldQ.copy(this._frameQ).multiply(this._turnQ);

    // Cylinder/cylinder contact uses their common perpendicular, not board up:
    // pitched hangers otherwise hover by several millimetres. Deck slides use
    // the underside plane. Solve the pivot AFTER blending to keep it locked.
    this._pivot.set(0, p.pivot === 'deck' ? DECK_BOTTOM : HANGER_Y,
      (p.pivot === 'front' ? AXLE : p.pivot === 'rear' ? -AXLE : 0) * this._stance);
    if (p.pivot === 'deck') c.normal.copy(UP).applyQuaternion(this._worldQ);
    else {
      this._axle.copy(X).applyQuaternion(this._worldQ);
      c.normal.crossVectors(c.railDirection, this._axle).normalize();
      if (c.normal.lengthSq() < .01) c.normal.copy(this._up);
      if (c.normal.dot(this._up) < 0) c.normal.negate();
    }
    this._offset.copy(this._pivot).applyQuaternion(this._worldQ);
    // Leave the rider centred along the rail, shifting only across/up to put
    // the loaded truck under the weight. The support can lie ±one axle along it.
    c.world.copy(c.railPoint).addScaledVector(c.railDirection, this._offset.dot(c.railDirection));
    // ROC scales XZ, not height. Its round authored tubes become ellipses.
    // For normal n, the scaled cylinder support is r*S²n/|S*n|. The normal is
    // perpendicular to its world axis, so no axial projection is required.
    const scale=g.rail.radiusScale, sx=scale?.x||1, sy=scale?.y||1, sz=scale?.z||1;
    const supportLength=Math.hypot(sx*c.normal.x,sy*c.normal.y,sz*c.normal.z);
    this._railOffset.set(sx*sx*c.normal.x,sy*sy*c.normal.y,sz*sz*c.normal.z)
      .multiplyScalar(c.radius/supportLength);
    c.world.add(this._railOffset).addScaledVector(UP, g.rail.surfaceLift || 0);
    this._offset.addScaledVector(c.normal, p.pivot === 'deck' ? 0 : -HANGER_RADIUS);
    this._worldOffset.copy(c.world).sub(sk.pos).sub(this._offset);
    this.boardQuaternion.copy(this._inverseQ).multiply(this._worldQ);
    this.boardPosition.copy(this._worldOffset).applyQuaternion(this._inverseQ);
    c.local.copy(c.normal).applyQuaternion(this._targetQ.copy(this._worldQ).invert())
      .multiplyScalar(p.pivot === 'deck' ? 0 : -HANGER_RADIUS).add(this._pivot);
  }

  pose(target) {
    if (!this._spec || this.weight <= .0001) return target;
    const pose=GRIND_BODY_POSES[this.name][this._stance<0?1:0];
    for(const [key,value]of Object.entries(pose))target[key]=(target[key]||0)+value*this.weight;
    return target;
  }

  applyBoard(character) {
    if (this.weight <= .0001) return;
    const b = character.board, body = character.body;
    if (this.active) {
      b.quaternion.copy(this.boardQuaternion); b.position.copy(this.boardPosition);
    } else {
      // Preserve any newly started air trick; the departing grind correction
      // fades underneath it instead of replacing the flip/grab animation.
      b.quaternion.premultiply(this.boardQuaternion);
      b.position.applyQuaternion(this.boardQuaternion).add(this.boardPosition);
    }
    body.quaternion.copy(this._bodyQuaternion).multiply(BODY);
    body.position.copy(this.boardPosition);
  }
}

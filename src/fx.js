import * as THREE from 'three';
import { contactShadow } from './atmosphere.js';

const DOWN = new THREE.Vector3(0, -1, 0), Z = new THREE.Vector3(0, 0, 1);

// Fixed-size pools: no new particle objects, geometries or textures while skating.
class ParticlePool {
  constructor(scene, count, sparks) {
    this.count = count; this.sparks = sparks; this.next = 0;
    this.positions = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.life = new Float32Array(count); this.duration = new Float32Array(count);
    this.sizes = new Float32Array(count); this.alpha = new Float32Array(count);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: sparks ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { tint: { value: new THREE.Color(sparks ? 0xffb955 : 0xb9ac91) } },
      vertexShader: `attribute float size; attribute float alpha; varying float a;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(size * 500. / max(.3, -mv.z), 1., 48.); a = alpha; }`,
      fragmentShader: `uniform vec3 tint; varying float a;
        void main() { float d = length(gl_PointCoord - .5) * 2.;
          float falloff = 1. - smoothstep(0., 1., d);
          gl_FragColor = vec4(tint, a * falloff * falloff);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.name = sparks ? 'Metal grind sparks' : 'Wheel and concrete dust';
    this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  emit(p, heading, speed, size, duration) {
    const i = this.next++ % this.count, j = i * 3;
    this.positions[j] = p.x; this.positions[j + 1] = p.y + .035; this.positions[j + 2] = p.z;
    this.velocity[j] = -heading.x * speed + (Math.random() - .5) * speed;
    this.velocity[j + 1] = Math.random() * (this.sparks ? 1.7 : .45) + .1;
    this.velocity[j + 2] = -heading.z * speed + (Math.random() - .5) * speed;
    this.life[i] = this.duration[i] = duration; this.sizes[i] = size;
  }
  update(dt) {
    let active = 0;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      this.life[i] = Math.max(0, this.life[i] - dt);
      if (!this.life[i]) { this.alpha[i] = 0; continue; }
      active++;
      this.velocity[j + 1] -= (this.sparks ? 6 : -.06) * dt;
      this.positions[j] += this.velocity[j] * dt;
      this.positions[j + 1] += this.velocity[j + 1] * dt;
      this.positions[j + 2] += this.velocity[j + 2] * dt;
      this.alpha[i] = (this.sparks ? .95 : .38) * this.life[i] / this.duration[i];
      if (!this.sparks) this.sizes[i] += dt * .2;
    }
    this.mesh.visible = active > 0;
    for (const name of ['position', 'size', 'alpha']) this.geometry.attributes[name].needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.mesh.visible = false; }
}

export class Effects {
  constructor(scene, { level = null, lowfx = false } = {}) {
    this.level = level; this.lowfx = lowfx;
    this.dust = new ParticlePool(scene, lowfx ? 32 : 96, false);
    this.sparks = new ParticlePool(scene, lowfx ? 40 : 120, true);
    this.shadow = contactShadow(scene);
    this.ray = new THREE.Raycaster(); this.origin = new THREE.Vector3();
    this.contact = new THREE.Vector3(); this.normal = new THREE.Vector3(0, 1, 0);
    this.acc = 0;
  }
  land(sk, strength = sk.landSquash || .25) {
    const count = Math.ceil((this.lowfx ? 4 : 9) * Math.max(.25, strength));
    for (let i = 0; i < count; i++) this.dust.emit(sk.pos, sk.heading, .45 + strength, .12, .45 + strength * .3);
  }
  ollie(sk, charge) {
    this.contact.copy(sk.pos).addScaledVector(sk.heading, -.24);
    for (let i = 0; i < 3; i++) this.dust.emit(this.contact, sk.heading, .5, .07 + charge * .05, .35);
  }
  revert(sk) {
    for (let i = 0; i < (this.lowfx ? 4 : 10); i++) this.dust.emit(sk.pos, sk.heading, Math.min(1.5, sk.speed * .1), .1, .55);
  }
  clear() { this.acc = 0; this.dust.clear(); this.sparks.clear(); }
  update(dt, sk) {
    if (sk.state === 'grind' && sk.grind && sk.speed > .5) {
      this.acc += Math.min(dt, .1) * Math.min(sk.speed, 16) * (this.lowfx ? 2 : 4);
      const concrete = sk.grind.rail.kind === 'ledge';
      while (this.acc >= 1) {
        this.acc--;
        (concrete ? this.dust : this.sparks).emit(sk.pos, sk.heading, Math.min(2.4, sk.speed * .2), concrete ? .09 : .025, concrete ? .4 : .16 + Math.random() * .2);
      }
    } else this.acc = 0;
    this.dust.update(dt); this.sparks.update(dt);
    if (!this.level) { this.shadow.visible = false; return; }
    // Follow the actual skate surface, including banks and raised platforms.
    this.origin.copy(sk.pos); this.origin.y += .18;
    this.ray.set(this.origin, DOWN); this.ray.far = 4;
    const hit = this.ray.intersectObjects(this.level.colliders, false)[0];
    this.shadow.visible = !!hit && sk.state !== 'bail';
    if (hit) {
      const height = Math.max(0, sk.pos.y - hit.point.y);
      this.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      this.shadow.position.copy(hit.point).addScaledVector(this.normal, .008);
      this.shadow.quaternion.setFromUnitVectors(Z, this.normal);
      this.shadow.scale.set(.72 + height * .25, 1.25 + height * .35, 1);
      this.shadow.material.opacity = .55 * Math.max(0, 1 - height / 3.6);
    }
  }
}

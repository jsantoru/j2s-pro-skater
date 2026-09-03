// Small effects: grind sparks + landing dust, as a single pooled Points cloud.
import * as THREE from 'three';

const N = 240;
export class Effects {
  constructor(scene) {
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    this.next = 0; this.acc = 0;
  }
  spawn(p, dir, spread, speed, color, life) {
    const i = this.next; this.next = (this.next + 1) % N;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = (dir.x + (Math.random() - 0.5) * spread) * speed;
    this.vel[i * 3 + 1] = (dir.y + Math.random() * spread) * speed;
    this.vel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * spread) * speed;
    this.life[i] = life; this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
  }
  burst(p, n, color, speed, life) { for (let k = 0; k < n; k++) this.spawn(p, { x: 0, y: 0.6, z: 0 }, 2.2, speed, color, life); }
  update(dt, sk) {
    if (sk.state === 'grind') {
      this.acc += dt * 140;
      const back = { x: -sk.heading.x, y: 0.5, z: -sk.heading.z };
      while (this.acc > 1) { this.acc--; this.spawn(sk.pos, back, 1.2, 1.5 + sk.speed * 0.25, [1, 0.75, 0.3], 0.35); }
    }
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 12 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.3; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

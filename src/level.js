// Compact warehouse skatepark. Builds visual meshes, a collider list for raycasts,
// and grindable rail segments. Runs in Node (no canvas) for the sim harness.
import * as THREE from 'three';

const HAS_DOM = typeof document !== 'undefined';

function canvasTexture(draw, size = 256, repeat = 1) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, base, amount, count) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * amount);
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

export function makeMaterials() {
  const concrete = canvasTexture((ctx, s) => {
    noise(ctx, s, '#8d8f92', 90, 900);
    ctx.strokeStyle = 'rgba(40,40,45,0.35)'; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }, 256, 1);
  const floor = canvasTexture((ctx, s) => {
    noise(ctx, s, '#6f7278', 70, 4000);
    // large soft stains + fine speckle, then slab seams
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * s, cy = Math.random() * s;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 40 + Math.random() * 90);
      g.addColorStop(0, `rgba(40,40,48,${0.08 + Math.random() * 0.14})`); g.addColorStop(1, 'rgba(40,40,48,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    ctx.strokeStyle = 'rgba(25,25,30,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.strokeRect(5, 5, s - 10, s - 10);
  }, 512, 1);
  const wood = canvasTexture((ctx, s) => {
    ctx.fillStyle = '#b8905c'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(95,60,28,${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(0, Math.random() * s, s, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(60,35,15,${Math.random() * 0.12})`; ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 12, 1); }
    ctx.fillStyle = 'rgba(50,30,12,0.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * (s / 4), s, 2);
    ctx.fillStyle = 'rgba(30,30,30,0.5)'; for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc((i % 6) * (s / 6) + 20, Math.floor(i / 6) * (s / 4) + 8, 2, 0, 7); ctx.fill(); } // screws
  }, 256, 1);
  const wall = canvasTexture((ctx, s) => {
    noise(ctx, s, '#6b7480', 60, 900);
    ctx.fillStyle = 'rgba(35,40,48,0.9)';
    for (let r = 0; r < 8; r++) { ctx.fillRect(0, r * 32, s, 3); const off = (r % 2) * 32; for (let x = off; x < s; x += 64) ctx.fillRect(x, r * 32, 3, 32); }
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let r = 0; r < 8; r++) ctx.fillRect(0, r * 32 + 3, s, 2);
    ctx.fillStyle = 'rgba(230,60,45,0.95)'; ctx.fillRect(0, s * 0.72, s, s * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, s * 0.72, s, 2);
  }, 256, 1);
  const metal = canvasTexture((ctx, s) => { noise(ctx, s, '#c9ccd2', 60, 300); }, 128, 1);
  const roof = canvasTexture((ctx, s) => {
    ctx.fillStyle = '#2a2e36'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3a3f4a'; for (let x = 0; x < s; x += 16) ctx.fillRect(x, 0, 6, s);
  }, 128, 1);
  const M = (color, map, roughness = 0.9, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, map: map || null, roughness, metalness, ...extra });
  return {
    floor: M(0xffffff, floor, 0.85), concrete: M(0xffffff, concrete, 0.92), wood: M(0xffffff, wood, 0.7),
    wall: M(0xffffff, wall, 0.95), metal: M(0xffffff, metal, 0.45, 0.8), roof: M(0xffffff, roof, 0.9),
    coping: M(0xe8e6df, null, 0.3, 0.9),
    rail: M(0xdfe3ea, null, 0.28, 0.95),
    railDark: M(0x3a3f4a, null, 0.5, 0.7),
    rainbow: M(0xffffff, null, 0.45, 0.05, { vertexColors: true }),
    yellow: M(0xffcf3a, null, 0.6), red: M(0xc0392b, null, 0.6), blue: M(0x2f6fb5, null, 0.6), green: M(0x3c9d5a, null, 0.6),
    dark: M(0x23262d, null, 0.6, 0.4),
    sky: new THREE.MeshBasicMaterial({ color: 0xdff1ff }),
  };
}

export class Level {
  constructor() {
    this.group = new THREE.Group();
    this.colliders = [];
    this.rails = []; // { a: Vector3, b: Vector3, dir: Vector3, len, kind }
    this.mats = makeMaterials();
    this.spawn = { pos: new THREE.Vector3(-4, 0, 14), heading: new THREE.Vector3(1, 0, 0) };
    this.build();
  }

  add(mesh, collide = true, shadow = true) {
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) { mesh.updateMatrixWorld(true); this.colliders.push(mesh); }
    return mesh;
  }

  box(w, h, d, x, y, z, mat, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (opts.rotY) m.rotation.y = opts.rotY;
    return this.add(m, opts.collide !== false, opts.shadow !== false);
  }

  // Profile shapes are in XY (x: distance along approach, y: height), extruded along Z (width).
  extrude(points, width, mat, x, y, z, rotY) {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    return this.add(m);
  }

  addRail(a, b, kind = 'rail', visual = true) {
    const A = a.clone(), B = b.clone();
    const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
    this.rails.push({ a: A, b: B, dir, len, kind });
    if (visual && kind === 'rail') {
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 8);
      const m = new THREE.Mesh(g, this.mats.rail);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.castShadow = true; this.group.add(m);
      // posts
      const n = Math.max(2, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const p = A.clone().lerp(B, (i + 0.5) / n);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, p.y, 6), this.mats.railDark);
        post.position.set(p.x, p.y / 2, p.z); this.group.add(post);
      }
    }
  }

  // Quarter pipe: transition radius R, vertical extension vert, deck depth. Local +x = approach direction.
  quarterPipe(R, width, x, y, z, rotY, opts = {}) {
    const vert = opts.vert ?? 0.25, deck = opts.deck ?? 1.0, N = 14;
    const pts = [[0, 0]];
    for (let i = 1; i <= N; i++) { const a = (i / N) * Math.PI / 2; pts.push([R * Math.sin(a), R * (1 - Math.cos(a))]); }
    pts.push([R, R + vert], [R + deck, R + vert], [R + deck, 0]);
    const m = this.extrude(pts, width, opts.mat || this.mats.wood, x, y, z, rotY);
    // coping along the lip
    const A = new THREE.Vector3(R, R + vert, -width / 2).applyMatrix4(m.matrixWorld);
    const B = new THREE.Vector3(R, R + vert, width / 2).applyMatrix4(m.matrixWorld);
    this.addRail(A, B, 'coping', false);
    const cop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width, 8), this.mats.coping);
    cop.position.copy(A).add(B).multiplyScalar(0.5);
    cop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.group.add(cop);
    return m;
  }

  // Paint a mesh in rainbow bands by height. One colour per triangle so the stripes stay crisp, and
  // driven by position rather than UVs so they follow the curve of a transition however it is mapped.
  paintRainbow(mesh, bands = 7) {
    let g = mesh.geometry;
    if (g.index) { g = g.toNonIndexed(); mesh.geometry = g; }
    const pos = g.attributes.position;
    g.computeBoundingBox();
    const y0 = g.boundingBox.min.y, span = (g.boundingBox.max.y - y0) || 1;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const yAvg = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const t = Math.min(0.999, Math.max(0, (yAvg - y0) / span));
      // red at the base up to violet at the lip. Saturated and fairly dark on purpose: the filmic tone
      // mapping washes bright colours out, so mid-lightness reads as vivid once it reaches the screen.
      c.setHSL(Math.floor(t * bands) / bands * 0.78, 1.0, 0.42);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return mesh;
  }

  bank(len, h, width, x, y, z, rotY, mat) {
    return this.extrude([[0, 0], [len, h], [len, 0]], width, mat || this.mats.concrete, x, y, z, rotY);
  }

  kicker(len, h, width, x, y, z, rotY) {
    // gently curved launch profile
    const pts = [[0, 0]]; const N = 6;
    for (let i = 1; i <= N; i++) { const t = i / N; pts.push([len * t, h * t * t * 0.55 + h * t * 0.45]); }
    pts.push([len, 0]);
    return this.extrude(pts, width, this.mats.wood, x, y, z, rotY);
  }

  // Four mitered banks around a flat top (a proper pyramid, no exposed wedge end-caps).
  pyramid(x, z, top, bank, h, mat) {
    const ht = top / 2, hb = top / 2 + bank, v = [];
    const tri = (a, b, c) => v.push(...a, ...b, ...c);
    const rot = (p, k) => { let [px, py, pz] = p; for (let i = 0; i < k; i++) [px, pz] = [pz, -px]; return [px, py, pz]; };
    for (let k = 0; k < 4; k++) {
      const a = rot([hb, 0, -hb], k), b = rot([hb, 0, hb], k), c = rot([ht, h, ht], k), d = rot([ht, h, -ht], k);
      tri(a, c, b); tri(a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    const uv = []; for (let i = 0; i < v.length / 3; i++) uv.push((v[i * 3] + v[i * 3 + 2]) * 0.25, v[i * 3 + 1] * 0.5);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat); m.position.set(x, 0, z);
    this.add(m);
    this.box(top, h, top, x, h / 2, z, mat);
    return m;
  }

  ledge(w, h, d, x, y, z, mat, rotY = 0) {
    const m = this.box(w, h, d, x, y + h / 2, z, mat || this.mats.concrete, { rotY });
    // grindable top edges along the long axis
    const hw = w / 2, hd = d / 2;
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(-hw, h, s * hd).applyMatrix4(m.matrixWorld);
      const b = new THREE.Vector3(hw, h, s * hd).applyMatrix4(m.matrixWorld);
      this.addRail(a, b, 'ledge', false);
    }
    return m;
  }

  build() {
    const M = this.mats;
    const W = 72, D = 46, H = 9;
    // floor
    if (M.floor.map) M.floor.map.repeat.set(W / 6, D / 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor);
    floor.rotation.x = -Math.PI / 2; this.add(floor, true, false);
    // walls (single-sided, facing inward) + roof
    if (M.wall.map) M.wall.map.repeat.set(9, 1.2);
    const wallGeo = (len) => new THREE.PlaneGeometry(len, H);
    const wallDefs = [
      [0, -D / 2, 0, W], [0, D / 2, Math.PI, W], [-W / 2, 0, Math.PI / 2, D], [W / 2, 0, -Math.PI / 2, D],
    ];
    for (const [x, z, ry, len] of wallDefs) {
      const m = new THREE.Mesh(wallGeo(len), M.wall); m.position.set(x, H / 2, z); m.rotation.y = ry;
      this.add(m, true, false);
    }
    if (M.roof.map) M.roof.map.repeat.set(24, 16);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.roof);
    roof.rotation.x = Math.PI / 2; roof.position.y = H; this.add(roof, false, false);
    // roof trusses + skylights
    for (let x = -30; x <= 30; x += 10) {
      this.box(0.4, 0.6, D, x, H - 0.3, 0, M.dark, { collide: false });
      const sk = new THREE.Mesh(new THREE.PlaneGeometry(4, D - 6), M.sky);
      sk.rotation.x = Math.PI / 2; sk.position.set(x + 5, H - 0.05, 0); this.group.add(sk);
    }
    for (let z = -20; z <= 20; z += 10) this.box(W, 0.5, 0.35, 0, H - 0.25, z, M.dark, { collide: false });
    // support columns along walls
    for (let x = -30; x <= 30; x += 12) { this.box(0.6, H, 0.6, x, H / 2, -D / 2 + 0.3, M.dark); this.box(0.6, H, 0.6, x, H / 2, D / 2 - 0.3, M.dark); }

    // ---- HALF PIPE (north) : QPs facing each other across z, entry from the x ends ----
    const hpW = 22;
    this.quarterPipe(2.6, hpW, 0, 0, -17, Math.PI / 2, { vert: 0.25, deck: 1.0 });   // rides toward -z
    this.quarterPipe(2.6, hpW, 0, 0, -10.5, -Math.PI / 2, { vert: 0.25, deck: 1.0 }); // rides toward +z
    // side walls of the half pipe (closed off at the back)
    
    // deck safety back of the south deck: a low ledge for grinding on the deck
    // ---- WEST long quarter pipe (rides toward -x) ----
    this.paintRainbow(this.quarterPipe(2.7, 24, -31.5, 0, 6, Math.PI, { vert: 0.25, deck: 1.4, mat: M.rainbow }));
    // ---- EAST quarter pipe (rides toward +x) ----
    this.quarterPipe(2.7, 14, 31.5, 0, -6, 0, { vert: 0.25, deck: 1.4 });
    // ---- SOUTH bank wall (rides toward +z), long shallow bank to carve on ----
    this.bank(5, 2.2, 22, 0, 0, 17.5, -Math.PI / 2, M.concrete);
    this.box(22, 2.2, 0.5, 0, 1.1, 22.75, M.concrete);
    // ---- Raised platform (south-east) with bank approach, stairs + handrail + hubba ----
    const PH = 1.6;
    this.box(12, PH, 12, 28, PH / 2, 16, M.concrete);                   // platform x:22..34, z:10..22
    this.bank(5, PH, 12, 17, 0, 16, 0, M.concrete);                     // bank approaching toward +x
    const steps = 5, rise = PH / steps, tread = 0.5;
    for (let i = 0; i < steps; i++) {
      const h = PH - rise * (i + 1);
      this.box(6, h, tread, 26.5, h / 2, 10 - tread / 2 - i * tread, M.concrete);
    }
    // handrail down the stairs (west side of the stairs)
    this.addRail(new THREE.Vector3(23.4, PH + 0.75, 10.4), new THREE.Vector3(23.4, 0.75, 7.0), 'rail');
    // hubba ledge on the east side of the stairs (sloped box)
    {
      const len = Math.hypot(tread * steps + 0.5, PH); const ang = Math.atan2(PH, tread * steps + 0.5);
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, len + 0.3), M.concrete);
      hub.position.set(29.8, PH * 0.5 + 0.2, 10 - (tread * steps + 0.5) / 2 + 0.1);
      hub.rotation.x = ang; this.add(hub);
      const a = new THREE.Vector3(29.8, PH + 0.45 - 0.02, 10.4), b = new THREE.Vector3(29.8, 0.43, 10 - tread * steps - 0.5);
      this.addRail(a, b, 'ledge', false);
    }
    // ---- Fun box pyramid (center) with ledge on top ----
    const fb = { x: 2, z: 2, h: 1.0, top: 3.5, bank: 2.6 };
    this.pyramid(fb.x, fb.z, fb.top, fb.bank, fb.h, M.concrete);
    this.ledge(fb.top, 0.35, 0.4, fb.x, fb.h, fb.z, M.yellow);
    // ---- Kicker -> flat rail line (west-center) ----
    this.kicker(2.0, 0.65, 3, -22, 0, 4, 0);                                        // launches toward +x
    this.addRail(new THREE.Vector3(-17.5, 0.7, 4), new THREE.Vector3(-10, 0.7, 4), 'rail');
    // ---- Kicker gap (south-center) ----
    this.kicker(2.0, 0.7, 3.5, 6, 0, 12, 0);                                        // launch toward +x
    this.kicker(2.0, 0.7, 3.5, 14.5, 0, 12, Math.PI);                               // landing kicker
    // ---- Long ledges ----
    this.ledge(8, 0.45, 0.6, 12, 0, -2, M.concrete);
    this.ledge(7, 0.5, 0.6, -12, 0, -4, M.red);
    // ---- Flat rails ----
    this.addRail(new THREE.Vector3(-8, 0.55, 10), new THREE.Vector3(-1, 0.55, 10), 'rail');
    this.addRail(new THREE.Vector3(20, 0.6, 2), new THREE.Vector3(20, 0.6, -6), 'rail');
    // ---- Small bank + kink rail near east QP (down bar) ----
    this.box(3, 1.2, 4, 26, 0.6, -14, M.concrete);
    this.bank(3, 1.2, 4, 23, 0, -14, 0, M.concrete);
    this.addRail(new THREE.Vector3(27.6, 1.75, -14), new THREE.Vector3(33, 0.6, -14), 'rail');
    // ---- Props (non-critical, add readability) ----
    const barrel = (x, z, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), mat); m.position.set(x, 0.55, z); this.add(m); };
    barrel(-33, -19, M.blue); barrel(-32, -20.2, M.red); barrel(33, 20, M.green); barrel(32, 21.2, M.yellow);
    this.box(1.6, 0.16, 1.6, -30, 0.08, -8, M.wood, { collide: false }); this.box(1.6, 0.16, 1.6, -30, 0.24, -7.9, M.wood, { collide: false });
    this.box(2, 2, 2, 30, 1, -20, M.wood); this.box(1.4, 1.4, 1.4, 30.2, 2.7, -20, M.wood);
    this.box(4, 1.8, 0.2, 0, 4.5, -22.85, M.red, { collide: false }); // banner
    this.box(3, 1.2, 0.2, -20, 5, -22.85, M.blue, { collide: false });
    this.box(3, 1.2, 0.2, 20, 5, -22.85, M.yellow, { collide: false });
    for (let z = -18; z <= 18; z += 9) { this.box(0.2, 1.2, 3, 35.85, 6, z, M.green, { collide: false }); this.box(0.2, 1.2, 3, -35.85, 6, z, M.red, { collide: false }); }
    // lane markings (visual only)
    for (const [x, z, ry] of [[-16, 4, 0], [10, 12, 0], [20, -2, Math.PI / 2]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.12), M.yellow);
      s.rotation.x = -Math.PI / 2; s.rotation.z = ry; s.position.set(x, 0.01, z + 1.6); this.group.add(s);
    }
    this.group.updateMatrixWorld(true);
  }
}

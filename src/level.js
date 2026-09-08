// Compact warehouse skatepark. Builds visual meshes, a collider list for raycasts,
// and grindable rail segments. Runs in Node (no canvas) for the sim harness.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterials, surfaceUV, HAS_DOM } from './materials.js';
import { dressWarehouse } from './warehouse-art.js';
export { makeMaterials } from './materials.js';

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
    this.add(m, opts.collide !== false, opts.shadow !== false);
    if (HAS_DOM && [this.mats.concrete, this.mats.wood, this.mats.red, this.mats.yellow].includes(mat)) {
      const visual = new THREE.Mesh(surfaceUV(new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, h * 0.08)), 3), mat);
      visual.position.copy(m.position); visual.quaternion.copy(m.quaternion);
      this.add(visual, false, opts.shadow !== false); m.visible = false;
    } else surfaceUV(g, 3);
    return m;
  }

  // Profile shapes are in XY (x: distance along approach, y: height), extruded along Z (width).
  extrude(points, width, mat, x, y, z, rotY, detail = {}) {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.add(m);
    if (HAS_DOM) {
      const visualShape = new THREE.Shape((detail.points || points).map(p => new THREE.Vector2(...p)));
      const vg = new THREE.ExtrudeGeometry(visualShape, { depth: width, bevelEnabled: false });
      vg.translate(0, 0, -width / 2); surfaceUV(vg, 2.44);
      if (detail.radius) {
        const p = vg.attributes.position, n = vg.attributes.normal, uv = vg.attributes.uv, R = detail.radius;
        for (let i = 0; i < p.count; i++) if (Math.abs(n.getZ(i)) < 0.5) {
          if (p.getX(i) > R + 0.001 && n.getX(i) > 0.5) {
            uv.setXY(i, p.getZ(i) / 2.44, p.getY(i) / 2.44); continue;
          }
          const travel = Math.atan2(Math.min(R, p.getX(i)), Math.max(0, R - p.getY(i))) * R + Math.max(0, p.getY(i) - R) + Math.max(0, p.getX(i) - R);
          uv.setXY(i, p.getZ(i) / 2.44, travel / 2.44);
        }
      }
      const visual = new THREE.Mesh(toCreasedNormals(vg, Math.PI / 6), mat);
      visual.position.copy(m.position); visual.quaternion.copy(m.quaternion);
      this.add(visual, false); m.visible = false; m.userData.visual = visual;
    }
    return m;
  }

  addRail(a, b, kind = 'rail', visual = true) {
    const A = a.clone(), B = b.clone();
    const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
    this.rails.push({ a: A, b: B, dir, len, kind });
    if (visual && kind === 'rail') {
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 20);
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
    const detail = [[0, 0]];
    for (let i = 1; i <= 56; i++) { const a = i / 56 * Math.PI / 2; detail.push([R * Math.sin(a), R * (1 - Math.cos(a))]); }
    detail.push([R, R + vert], [R + deck, R + vert], [R + deck, 0]);
    const m = this.extrude(pts, width, opts.mat || this.mats.wood, x, y, z, rotY, { points: detail, radius: R });
    // coping along the lip
    const A = new THREE.Vector3(R, R + vert, -width / 2).applyMatrix4(m.matrixWorld);
    const B = new THREE.Vector3(R, R + vert, width / 2).applyMatrix4(m.matrixWorld);
    this.addRail(A, B, 'coping', false);
    const cop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width, 20), this.mats.coping);
    cop.position.copy(A).add(B).multiplyScalar(0.5);
    cop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.group.add(cop);
    if (HAS_DOM) {
      // Thin steel toe plates and dark plywood side fascia visually finish the transition.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.008, width), this.mats.metal);
      plate.position.set(0.09, 0.006, 0); m.userData.visual.add(plate);
      for (const side of [-1, 1]) {
        const fascia = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(detail.map(p => new THREE.Vector2(...p)))), this.mats.railDark);
        fascia.position.z = side * (width / 2 + 0.002);
        if (side < 0) { fascia.material = this.mats.railDark.clone(); fascia.material.side = THREE.DoubleSide; }
        m.userData.visual.add(fascia);
      }
    }
    return m;
  }

  // Paint a mesh in rainbow bands by height. One colour per triangle so the stripes stay crisp, and
  // driven by position rather than UVs so they follow the curve of a transition however it is mapped.
  paintRainbow(mesh, bands = 7) {
    if (mesh.userData.visual) this.paintRainbow(mesh.userData.visual, bands);
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
    surfaceUV(g, 3);
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
      if (HAS_DOM) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, 0.04), this.mats.metal);
        edge.position.set(0, h / 2 - 0.01, s * (hd - 0.012)); m.updateMatrix();
        edge.applyMatrix4(m.matrix); this.add(edge, false, false);
      }
    }
    return m;
  }

  build() {
    const M = this.mats;
    const W = 72, D = 46, H = 9;
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor);
    this.floor = floor;
    surfaceUV(floor.geometry, 6);
    floor.rotation.x = -Math.PI / 2; this.add(floor, true, false);
    // walls (single-sided, facing inward) + roof
    const wallGeo = (len) => surfaceUV(new THREE.PlaneGeometry(len, H), 2.4);
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
    // The floor is the final landing; a fifth box would have zero height and
    // put its faces directly on the floor, causing visible z-fighting.
    for (let i = 0; i < steps - 1; i++) {
      const h = PH - rise * (i + 1);
      this.box(6, h, tread, 26.5, h / 2, 10 - tread / 2 - i * tread, M.concrete);
    }
    // handrail down the stairs (west side of the stairs)
    this.addRail(new THREE.Vector3(23.4, PH + 0.75, 10.4), new THREE.Vector3(23.4, 0.75, 7.0), 'rail');
    // hubba ledge on the east side of the stairs (sloped box)
    {
      const len = Math.hypot(tread * steps + 0.5, PH); const ang = Math.atan2(PH, tread * steps + 0.5);
      const hub = new THREE.Mesh(surfaceUV(new THREE.BoxGeometry(0.6, 0.45, len + 0.3), 3), M.concrete);
      hub.position.set(29.8, PH * 0.5 + 0.2, 10 - (tread * steps + 0.5) / 2 + 0.1);
      // Positive world Z is the platform end; the hubba must rise toward it,
      // matching the stairs and the grind segment instead of jutting uphill into space.
      hub.name = 'Stair hubba';
      hub.rotation.x = -ang; this.add(hub);
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
    // lane markings (visual only)
    for (const [x, z, ry] of [[-16, 4, 0], [10, 12, 0], [20, -2, Math.PI / 2]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.12), M.yellow);
      s.rotation.x = -Math.PI / 2; s.rotation.z = ry; s.position.set(x, 0.01, z + 1.6); this.group.add(s);
    }
    if (HAS_DOM) dressWarehouse(this);
    this.group.updateMatrixWorld(true);
  }
}

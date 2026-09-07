import * as THREE from 'three';

// A single skin surface, including the finger webs, knuckles and thumb saddle.
// Generated once and shared by every rig; no implicit-surface work happens per frame.
const cache = new Map();
export function handGeometry(side) {
  if (cache.has(side)) return cache.get(side);
  if (side < 0) {
    const g = handGeometry(1).clone(); g.scale(-1, 1, 1);
    const index = g.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    cache.set(side, g); return g;
  }
  const parts = [];
  const ellipsoid = (cx, cy, cz, rx, ry, rz) => parts.push((x, y, z) =>
    (Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz) - 1) * Math.min(rx, ry, rz));
  const capsule = (a, b, ra, rb) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], lengthSq = dx * dx + dy * dy + dz * dz;
    parts.push((x, y, z) => {
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / lengthSq, 0, 1);
      return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t) - THREE.MathUtils.lerp(ra, rb, t);
    });
  };
  ellipsoid(0, -0.010, 0, 0.022, 0.028, 0.016);
  ellipsoid(0, -0.046, 0, 0.029, 0.036, 0.013);
  ellipsoid(0.017, -0.038, 0.003, 0.017, 0.025, 0.015);
  ellipsoid(-0.021, -0.048, 0, 0.010, 0.023, 0.012);
  for (let f = 0; f < 4; f++) {
    const x = 0.023 - f * 0.0153, y = [-0.070, -0.074, -0.072, -0.065][f];
    const length = [0.049, 0.055, 0.050, 0.039][f], radius = [0.0071, 0.0075, 0.0071, 0.0062][f];
    const curl = [0.50, 0.61, 0.71, 0.82][f], fan = (1.5 - f) * 0.001;
    let previous = [x, y, 0];
    ellipsoid(x, y + 0.003, -0.003, radius * 1.15, 0.012, radius);
    for (let j = 1; j <= 3; j++) {
      const t = j / 3, angle = t * curl;
      const next = [x + fan * t, y - length * Math.sin(angle) / curl, length * (1 - Math.cos(angle)) / curl];
      capsule(previous, next, radius * (1 - (j - 1) * 0.065), radius * (1 - j * 0.065)); previous = next;
    }
  }
  capsule([0.020, -0.030, 0.003], [0.035, -0.048, 0.008], 0.012, 0.010);
  capsule([0.035, -0.048, 0.008], [0.039, -0.062, 0.019], 0.010, 0.008);
  const field = (x, y, z) => {
    let d = 1;
    for (const part of parts) {
      const b = part(x, y, z), h = Math.max(0.004 - Math.abs(d - b), 0) / 0.004;
      d = Math.min(d, b) - h * h * 0.001;
    }
    return d;
  };
  // Marching tetrahedra with shared edge vertices keeps the webbing connected.
  const step = 0.0038, min = [-0.044, -0.144, -0.026], dims = [27, 46, 23];
  const [nx, ny, nz] = dims, values = new Float32Array(nx * ny * nz);
  const id = (x, y, z) => (z * ny + y) * nx + x;
  const point = index => {
    const x = index % nx, y = Math.floor(index / nx) % ny, z = Math.floor(index / (nx * ny));
    return [min[0] + x * step, min[1] + y * step, min[2] + z * step];
  };
  for (let i = 0; i < values.length; i++) values[i] = field(...point(i));
  const positions = [], normals = [], uv = [], triangles = [], edges = new Map();
  const vertex = (a, b) => {
    const key = Math.min(a, b) * values.length + Math.max(a, b);
    if (edges.has(key)) return edges.get(key);
    const pa = point(a), pb = point(b), t = values[a] / (values[a] - values[b]);
    const p = pa.map((v, axis) => THREE.MathUtils.lerp(v, pb[axis], t)), e = 0.0002;
    const n = new THREE.Vector3(field(p[0] + e, p[1], p[2]) - field(p[0] - e, p[1], p[2]),
      field(p[0], p[1] + e, p[2]) - field(p[0], p[1] - e, p[2]),
      field(p[0], p[1], p[2] + e) - field(p[0], p[1], p[2] - e)).normalize();
    const index = positions.length / 3;
    positions.push(...p); normals.push(n.x, n.y, n.z); uv.push((p[0] + 0.045) / 0.1, (p[1] + 0.145) / 0.17);
    edges.set(key, index); return index;
  };
  const add = (a, b, c) => {
    const pa = new THREE.Vector3().fromArray(positions, a * 3), pb = new THREE.Vector3().fromArray(positions, b * 3);
    const pc = new THREE.Vector3().fromArray(positions, c * 3), n = new THREE.Vector3().fromArray(normals, a * 3);
    if (pb.sub(pa).cross(pc.sub(pa)).dot(n) < 0) triangles.push(a, c, b); else triangles.push(a, b, c);
  };
  const tets = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const cube = [id(x,y,z), id(x+1,y,z), id(x+1,y+1,z), id(x,y+1,z), id(x,y,z+1), id(x+1,y,z+1), id(x+1,y+1,z+1), id(x,y+1,z+1)];
    if (cube.every(i => values[i] < 0) || cube.every(i => values[i] >= 0)) continue;
    for (const tet of tets) {
      const inside = tet.map(i => cube[i]).filter(i => values[i] < 0), outside = tet.map(i => cube[i]).filter(i => values[i] >= 0);
      if (!inside.length || !outside.length) continue;
      if (inside.length === 1 || outside.length === 1) {
        const single = inside.length === 1 ? inside : outside, other = inside.length === 1 ? outside : inside;
        add(...other.map(i => vertex(single[0], i)));
      } else {
        const a = vertex(inside[0], outside[0]), b = vertex(inside[0], outside[1]);
        const c = vertex(inside[1], outside[0]), d = vertex(inside[1], outside[1]);
        add(a, b, c); add(b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(triangles);
  g.computeBoundingBox(); g.computeBoundingSphere(); cache.set(side, g); return g;
}

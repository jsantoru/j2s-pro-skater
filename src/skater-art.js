import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasMap } from './materials.js';

const mat = (color, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function rounded(parent, w, h, d, material, x = 0, y = 0, z = 0, radius = 0.025) {
  return mesh(parent, new RoundedBoxGeometry(w, h, d, 2, radius), material, x, y, z);
}
function oval(parent, rx, ry, rz, material, x, y, z) {
  const m = mesh(parent, new THREE.SphereGeometry(1, 20, 14), material, x, y, z); m.scale.set(rx, ry, rz); return m;
}
// Elliptical rings give fabric a shaped silhouette and small folds without changing any rig pivots.
function garment(parent, rings, material, zScale = 1, foldAmount = 0.023) {
  const p = [], uv = [], indices = [], segments = 24;
  for (let r = 0; r < rings.length; r++) {
    const [y, rx, rz, centerZ = 0, centerX = 0] = rings[r];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const fold = 1 + Math.sin(a * 6 + r * 0.8) * foldAmount;
      p.push(centerX + Math.cos(a) * rx * fold, y, centerZ + Math.sin(a) * rz * zScale * fold);
      uv.push(i / segments, r / (rings.length - 1));
      if (r && i) {
        const b = r * (segments + 1) + i, a0 = b - segments - 1;
        if (rings[1][0] < rings[0][0]) indices.push(a0 - 1, b, b - 1, a0 - 1, a0, b);
        else indices.push(a0 - 1, b - 1, b, a0 - 1, b, a0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  return mesh(parent, g, material);
}

export function buildDetailedBoard(parent) {
  const board = new THREE.Group(); parent.add(board);
  const grip = mat(0xffffff, 1), graphic = mat(0xffffff, 0.53), maple = mat(0xffffff, 0.66);
  grip.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#252928'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 95000; i++) { const v = 24 + Math.floor(rng() * 55); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(rng() * s, rng() * s, 1, 1); }
    c.strokeStyle = '#ac9e7e'; c.lineWidth = 7; c.beginPath(); c.moveTo(s * 0.3, s * 0.21); c.lineTo(s * 0.7, s * 0.24); c.stroke();
    c.fillStyle = '#c9c4ad'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.fillText('J2S', s / 2, s * 0.58);
  }, 512);
  graphic.map = canvasMap((c, s) => {
    c.fillStyle = '#d7cbb0'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#c4432d'; c.beginPath(); c.moveTo(s * 0.9, 0); c.lineTo(s * 0.35, s * 0.55); c.lineTo(s * 0.65, s * 0.51); c.lineTo(0, s); c.lineTo(s, s * 0.55); c.lineTo(s * 0.6, s * 0.55); c.fill();
    c.save(); c.translate(s * 0.53, s * 0.52); c.rotate(-Math.PI / 2);
    c.fillStyle = '#202a2b'; c.textAlign = 'center'; c.font = '900 170px sans-serif'; c.fillText('J2S', 0, 0);
    c.font = 'bold 24px sans-serif'; c.fillText('BUILT TO SKATE / 1999', 0, 46); c.restore();
  }, 512);
  maple.map = canvasMap((c, s) => {
    c.fillStyle = '#bd9057'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#795232' : '#e0b87a'; c.fillRect(0, i * s / 7, s, s / 14); }
  }, 128);
  // One continuous deck, with concave shoulders and smoothly rising kicktails.
  const p = [], uv = [], indices = [], nz = 56, nx = 10;
  function point(i, j, bottom) {
    const z = -0.44 + i / nz * 0.88;
    const cap = Math.max(0, Math.abs(z) - 0.31) / 0.13;
    const width = 0.11 * Math.sqrt(Math.max(0.002, 1 - cap * cap));
    const x = (j / nx * 2 - 1) * width;
    const kick = Math.pow(Math.max(0, Math.abs(z) - 0.27) / 0.17, 1.7) * 0.049;
    return [x, 0.13 + kick + Math.pow(x / 0.11, 2) * 0.004 - (bottom ? 0.016 : 0), z];
  }
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    p.push(...point(i, j, layer)); uv.push(j / nx, i / nz);
  }
  const layerSize = (nx + 1) * (nz + 1);
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = layer * layerSize + i * (nx + 1) + j, b = a + nx + 1;
    if (layer === 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
    else indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices);
  g.addGroup(0, nx * nz * 6, 0); g.addGroup(nx * nz * 6, nx * nz * 6, 1); g.computeVertexNormals(); mesh(board, g, [grip, graphic]);
  const rim = [], rimUV = [], rimIndex = [], perimeter = [];
  for (let i = 0; i <= nz; i++) perimeter.push([i, 0]);
  for (let j = 1; j <= nx; j++) perimeter.push([nz, j]);
  for (let i = nz - 1; i >= 0; i--) perimeter.push([i, nx]);
  for (let j = nx - 1; j >= 0; j--) perimeter.push([0, j]);
  perimeter.push(perimeter[0]);
  perimeter.forEach(([i, j], k) => {
    rim.push(...point(i, j, 0), ...point(i, j, 1)); rimUV.push(k / perimeter.length, 1, k / perimeter.length, 0);
    if (k) { const a = k * 2; rimIndex.push(a - 2, a - 1, a, a - 1, a + 1, a); }
  });
  const e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  e.setAttribute('uv', new THREE.Float32BufferAttribute(rimUV, 2)); e.setIndex(rimIndex); e.computeVertexNormals(); mesh(board, e, maple);
  const alloy = mat(0xaab4b5, 0.25, 0.92), rubber = mat(0x272d2a), urethane = mat(0xe7ddbc, 0.58), ink = mat(0x943e2c);
  for (const s of [-1, 1]) {
    rounded(board, 0.077, 0.012, 0.085, alloy, 0, 0.105, s * 0.24, 0.006);
    const hanger = mesh(board, new THREE.CylinderGeometry(0.014, 0.02, 0.18, 12), alloy, 0, 0.043, s * 0.24); hanger.rotation.z = Math.PI / 2;
    const kingpin = mesh(board, new THREE.CylinderGeometry(0.017, 0.011, 0.056, 10), alloy, 0, 0.073, s * 0.23); kingpin.rotation.x = s * 0.3;
    mesh(board, new THREE.CylinderGeometry(0.022, 0.022, 0.015, 14), rubber, 0, 0.068, s * 0.235);
    for (const w of [-1, 1]) {
      const profile = [[0.007, -0.0165], [0.026, -0.0165], [0.030, -0.014], [0.032, -0.009], [0.032, 0.009], [0.030, 0.014], [0.026, 0.0165], [0.007, 0.0165]].map(p => new THREE.Vector2(...p));
      const wheel = mesh(board, new THREE.LatheGeometry(profile, 24), urethane, w * 0.091, 0.032, s * 0.24); wheel.rotation.z = Math.PI / 2;
      const ring = mesh(board, new THREE.TorusGeometry(0.02, 0.002, 6, 24), ink, w * 0.108, 0.032, s * 0.24); ring.rotation.y = Math.PI / 2;
      const nut = mesh(board, new THREE.CylinderGeometry(0.007, 0.007, 0.037, 6), alloy, w * 0.091, 0.032, s * 0.24); nut.rotation.z = Math.PI / 2;
      for (const dz of [-0.025, 0.025]) mesh(board, new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), alloy, w * 0.031, 0.132, s * 0.24 + dz);
    }
  }
  return board;
}

function buildConnectedHead(rig, { skin, cap, hair, eye, cloth }) {
  // Both bones share the existing head pivot. The lower neck stays with the torso,
  // while the upper neck blends into the animated head: no separate cylinder or jaw seam.
  const anchor = new THREE.Bone(); anchor.position.y = 0.5; rig.torso.add(anchor);
  rig.head = new THREE.Bone(); rig.head.position.y = 0.5; rig.torso.add(rig.head);
  const rings = [
    [-0.066, 0.061, 0.054, -0.008], [-0.04, 0.054, 0.048, -0.009],
    [-0.015, 0.048, 0.043, -0.009], [0.01, 0.047, 0.044, -0.008],
    [0.028, 0.051, 0.049, -0.001], [0.043, 0.059, 0.060, 0.009],
    [0.058, 0.067, 0.068, 0.011], [0.08, 0.075, 0.074, 0.006],
    [0.105, 0.082, 0.081, 0.001], [0.143, 0.085, 0.085],
    [0.18, 0.084, 0.089, -0.003], [0.22, 0.075, 0.085, -0.009],
    [0.253, 0.047, 0.057, -0.009], [0.263, 0, 0, -0.009],
  ];
  const shell = garment(rig.torso, rings, skin, 1, 0);
  rig.torso.remove(shell);
  const geometry = shell.geometry, positions = geometry.attributes.position;
  const indices = [], weights = [];
  for (let i = 0; i < positions.count; i++) {
    const headWeight = THREE.MathUtils.smoothstep(positions.getY(i), -0.035, 0.06);
    indices.push(0, 1, 0, 0); weights.push(1 - headWeight, headWeight, 0, 0);
  }
  // Average duplicated UV-seam normals so the back/side of the neck shades continuously.
  const normals = geometry.attributes.normal, n = new THREE.Vector3(), other = new THREE.Vector3();
  for (let r = 0; r < rings.length; r++) {
    const a = r * 25, b = a + 24;
    n.fromBufferAttribute(normals, a).add(other.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const headSurface = new THREE.SkinnedMesh(geometry, skin);
  headSurface.name = 'Continuous head and neck'; headSurface.castShadow = headSurface.receiveShadow = true;
  // Keep the small animated surface visible even at extreme head turns.
  headSurface.frustumCulled = false; rig.torso.add(headSurface);
  rig.root.updateMatrixWorld(true);
  headSurface.bind(new THREE.Skeleton([anchor, rig.head]));

  oval(rig.head, 0.012, 0.027, 0.018, skin, 0, 0.122, 0.083);
  for (const side of [-1, 1]) {
    oval(rig.head, 0.012, 0.024, 0.014, skin, side * 0.084, 0.123, -0.002);
    oval(rig.head, 0.009, 0.003, 0.003, eye, side * 0.033, 0.146, 0.079);
    rounded(rig.head, 0.025, 0.004, 0.005, hair, side * 0.033, 0.16, 0.079, 0.002);
  }
  rounded(rig.head, 0.03, 0.002, 0.003, mat(0x95694f, 0.95), 0, 0.081, 0.084, 0.001);

  hair.roughness = 0.96; hair.color.setHex(0x514337);
  hair.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#cdbbaa'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const x = rng() * s, y = rng() * s;
      c.strokeStyle = rng() > 0.5 ? 'rgba(30,22,18,0.20)' : 'rgba(235,216,180,0.16)';
      c.lineWidth = 0.5 + rng(); c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + 3, y + 12, x + 8, y + 28); c.stroke();
    }
  }, 256);
  // A close-fitting hair shell with a higher temple line and longer, irregular nape.
  const hairGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = hairGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), a = Math.atan2(z, x);
    const front = Math.max(0, Math.sin(a)), back = Math.max(0, -Math.sin(a));
    const temple = Math.sin(a) > 0 ? Math.exp(-Math.pow((front - 0.28) / 0.14, 2)) * 0.039 : 0;
    const edge = 0.158 + front * 0.048 - back * 0.065 - temple + Math.sin(a * 19) * 0.002;
    const radius = 1 + Math.sin(a * 17 + y * 6) * 0.018 * (1 - y);
    const height = edge + (0.266 - edge) * y;
    // Follow the actual cranium profile; a stretched hemisphere intersects the skull at the back.
    let r = 0;
    while (r < rings.length - 2 && rings[r + 1][0] < height) r++;
    const lo = rings[r], hi = rings[r + 1], t = THREE.MathUtils.clamp((height - lo[0]) / (hi[0] - lo[0]), 0, 1);
    const rx = THREE.MathUtils.lerp(lo[1], hi[1], t) + 0.003;
    const rz = THREE.MathUtils.lerp(lo[2], hi[2], t) + 0.003;
    const centerZ = THREE.MathUtils.lerp(lo[3] || 0, hi[3] || 0, t);
    const horizontal = Math.hypot(x, z);
    hp.setXYZ(i, horizontal > 1e-6 ? x / horizontal * rx * radius : 0, height,
      centerZ + (horizontal > 1e-6 ? z / horizontal * rz * radius : 0));
  }
  hairGeo.computeVertexNormals(); mesh(rig.head, hairGeo, hair);

  cap.roughness = 0.94; cap.bumpMap = cloth; cap.bumpScale = 0.0008;
  cap.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#c2b5aa'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 18000; i++) {
      c.fillStyle = `rgba(35,25,22,${rng() * 0.1})`; c.fillRect(rng() * s, rng() * s, 1, 1);
    }
    for (let panel = 0; panel < 6; panel++) {
      const x = panel * s / 6;
      c.fillStyle = 'rgba(55,27,24,0.22)'; c.fillRect(x, 0, 2, s);
      c.strokeStyle = 'rgba(241,210,181,0.42)'; c.lineWidth = 1; c.setLineDash([2, 2]);
      for (const offset of [-3, 4]) { c.beginPath(); c.moveTo(x + offset, 0); c.lineTo(x + offset, s); c.stroke(); }
    }
  }, 512);
  const crown = mesh(rig.head, new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.208, -0.006);
  crown.scale.set(0.099, 0.078, 0.11);
  const band = mesh(rig.head, new THREE.TorusGeometry(1, 0.022, 6, 48), cap, 0, 0.209, -0.006);
  band.rotation.x = Math.PI / 2; band.scale.set(0.098, 0.109, 0.098);
  // Solid curved visor: rounded outline, downturned sides, dark underside and visible thickness.
  const bp = [], buv = [], bi = [], across = 24, along = 8, count = (across + 1) * (along + 1);
  for (let layer = 0; layer < 2; layer++) for (let j = 0; j <= along; j++) for (let i = 0; i <= across; i++) {
    const u = i / across * 2 - 1, t = j / along;
    bp.push(u * (0.075 + t * 0.025), 0.211 - t * 0.009 - u * u * 0.012 - layer * 0.003,
      0.04 + t * (0.065 + 0.07 * Math.sqrt(Math.max(0, 1 - u * u))));
    buv.push(i / across, t);
  }
  for (let layer = 0; layer < 2; layer++) for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
    const a = layer * count + j * (across + 1) + i, b = a + across + 1;
    if (!layer) bi.push(a, b, a + 1, a + 1, b, b + 1);
    else bi.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const surfaceCount = across * along * 6;
  const edge = [];
  for (let i = 0; i <= across; i++) edge.push(i);
  for (let j = 1; j <= along; j++) edge.push(j * (across + 1) + across);
  for (let i = across - 1; i >= 0; i--) edge.push(along * (across + 1) + i);
  for (let j = along - 1; j > 0; j--) edge.push(j * (across + 1));
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length]; bi.push(a, b, a + count, b, b + count, a + count);
  }
  const brimGeo = new THREE.BufferGeometry();
  brimGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); brimGeo.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
  brimGeo.setIndex(bi); brimGeo.addGroup(0, surfaceCount, 0); brimGeo.addGroup(surfaceCount, surfaceCount, 1);
  brimGeo.addGroup(surfaceCount * 2, bi.length - surfaceCount * 2, 0); brimGeo.computeVertexNormals();
  mesh(rig.head, brimGeo, [cap, mat(0x513e35, 0.98)]);
  oval(rig.head, 0.007, 0.004, 0.007, cap, 0, 0.286, -0.006);
  const badge = mat(0xffffff, 0.98);
  badge.map = canvasMap((c, s) => {
    c.fillStyle = '#54332e'; c.fillRect(0, 0, s, s); c.strokeStyle = '#b89879'; c.lineWidth = 10; c.strokeRect(12, 12, s - 24, s - 24);
    c.fillStyle = '#dfccb0'; c.font = '900 140px sans-serif'; c.textAlign = 'center'; c.fillText('J2S', s / 2, s * 0.69);
  }, 256);
  const patch = mesh(rig.head, new THREE.PlaneGeometry(0.035, 0.018), badge, 0, 0.237, 0.101);
  patch.rotation.x = -0.32;
}

export function buildDetailedBody(rig) {
  const skin = mat(0xc99570, 0.88), shirt = mat(0x426574, 0.96), pants = mat(0x39454b, 0.98), shoe = mat(0x242d30, 0.88);
  const sole = mat(0xd4cdb7, 0.82), cap = mat(0x9e4132), hair = mat(0x392c24), eye = mat(0x302a27, 0.5);
  const cloth = canvasMap((c, s, rng) => {
    c.fillStyle = '#b7b7b7'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { c.fillStyle = i % 4 ? '#b0b0b0' : '#c3c3c3'; c.fillRect(i, 0, 1, s); c.fillRect(0, i, s, 0.5); }
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(30,30,30,${rng() * 0.13})`; c.fillRect(rng() * s, rng() * s, 1, 1); }
  }, 256, false);
  for (const m of [shirt, pants, cap]) { m.bumpMap = cloth; m.bumpScale = 0.0018; }
  // Small shared garment maps: faded cotton/denim, stitched seams and uneven wash.
  // Generated once at load, with no downloads or per-frame cloth simulation.
  const fabricColor = (denim) => canvasMap((c, s, rng) => {
    c.fillStyle = denim ? '#b7bcc0' : '#c4c8c6'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 48; i++) {
      const x = rng() * s, y = rng() * s, radius = 20 + rng() * 100;
      const g = c.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(245,241,222,${denim ? 0.10 : 0.05})`);
      g.addColorStop(1, 'rgba(245,241,222,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
    for (let i = 0; i < 22000; i++) {
      c.fillStyle = `rgba(40,47,48,${rng() * 0.10})`;
      const x = rng() * s, y = rng() * s;
      c.fillRect(x, y, 1, denim ? 2 : 1);
    }
    for (const x of [2, s / 2]) {
      c.fillStyle = 'rgba(25,32,36,0.18)'; c.fillRect(x, 0, 3, s);
      c.strokeStyle = 'rgba(218,207,174,0.26)'; c.lineWidth = 1;
      c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x + 5, 0); c.lineTo(x + 5, s); c.stroke();
    }
    c.setLineDash([]); c.fillStyle = 'rgba(25,32,36,0.16)'; c.fillRect(0, 3, s, 2);
  }, 512);
  shirt.map = fabricColor(false); pants.map = fabricColor(true);
  rig.hips = new THREE.Group(); rig.body.add(rig.hips);
  rounded(rig.hips, 0.34, 0.16, 0.21, pants, 0, 0.02, 0, 0.06);
  rig.torso = new THREE.Group(); rig.torso.position.y = 0.1; rig.hips.add(rig.torso);
  // Relaxed, untucked tee covers the pelvis seam; broader sloping shoulders meet the sleeves.
  garment(rig.torso, [[-0.075, 0.218, 0.143], [-0.06, 0.22, 0.145], [-0.02, 0.205, 0.132], [0.09, 0.18, 0.113], [0.25, 0.19, 0.118], [0.36, 0.213, 0.114], [0.415, 0.216, 0.102], [0.445, 0.198, 0.083], [0.47, 0.065, 0.06]], shirt, 1, 0.038);
  const collar = mesh(rig.torso, new THREE.TorusGeometry(0.061, 0.01, 8, 24), shirt, 0, 0.466, 0); collar.rotation.x = Math.PI / 2;
  const print = new THREE.MeshStandardMaterial({ roughness: 0.93, transparent: true, depthWrite: false,
    map: canvasMap((c, s) => { c.fillStyle = '#ddd6bd'; c.textAlign = 'center'; c.font = 'italic 900 170px sans-serif'; c.fillText('J2S', s / 2, s * 0.49); c.fillStyle = '#d98254'; c.fillRect(s * 0.19, s * 0.55, s * 0.62, 10); c.font = 'bold 34px sans-serif'; c.fillStyle = '#ddd6bd'; c.fillText('SKATE DIVISION', s / 2, s * 0.66); }, 512) });
  mesh(rig.torso, new THREE.PlaneGeometry(0.25, 0.23), print, 0, 0.29, 0.122);
  const backPrint = mesh(rig.torso, new THREE.PlaneGeometry(0.25, 0.23), print, 0, 0.29, -0.122); backPrint.rotation.y = Math.PI;
  buildConnectedHead(rig, { skin, cap, hair, eye, cloth });
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.22, 0.42, 0); rig.torso.add(sh);
    garment(sh, [[0.039, 0, 0], [0.026, 0.041, 0.043], [0.009, 0.065, 0.062], [-0.04, 0.076, 0.073], [-0.12, 0.074, 0.068], [-0.177, 0.068, 0.065], [-0.185, 0.070, 0.066]], shirt, 1, 0.038);
    oval(sh, 0.043, 0.115, 0.042, skin, 0, -0.204, 0);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    oval(el, 0.042, 0.045, 0.042, skin, 0, 0, 0);
    garment(el, [[0, 0.041, 0.041], [-0.08, 0.042, 0.038], [-0.2, 0.03, 0.029], [-0.26, 0.028, 0.027]], skin, 1, 0);
    rounded(el, 0.07, 0.095, 0.04, skin, 0, -0.3, 0, 0.019);
    oval(el, 0.018, 0.035, 0.018, skin, -side * 0.037, -0.287, 0.008);
    if (side < 0) mesh(el, new THREE.CylinderGeometry(0.032, 0.032, 0.029, 16), shoe, 0, -0.24, 0);
    return { sh, el };
  };
  rig.lArm = arm(1); rig.rArm = arm(-1);
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.15, 0, 0); rig.hips.add(hp);
    garment(hp, [[0.015, 0.08, 0.085, 0, -side * 0.04], [-0.08, 0.106, 0.105], [-0.23, 0.096, 0.098], [-0.34, 0.086, 0.085], [-0.40, 0.089, 0.09], [-0.455, 0.083, 0.084]], pants, 1, 0.035);
    const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
    oval(kn, 0.082, 0.068, 0.084, pants, 0, 0, 0);
    garment(kn, [[0.025, 0.083, 0.084], [-0.06, 0.09, 0.088], [-0.20, 0.082, 0.083], [-0.29, 0.074, 0.075], [-0.33, 0.08, 0.078], [-0.36, 0.072, 0.073], [-0.39, 0.074, 0.075]], pants, 1, 0.045);
    const an = new THREE.Group(); an.position.y = -0.4; kn.add(an);
    rounded(an, 0.11, 0.063, 0.25, shoe, 0, 0.008, 0, 0.023);
    rounded(an, 0.112, 0.019, 0.25, sole, 0, -0.031, 0, 0.008);
    rounded(an, 0.065, 0.018, 0.12, shoe, 0, 0.038, -0.014, 0.008);
    for (let i = 0; i < 4; i++) rounded(an, 0.057, 0.004, 0.006, sole, 0, 0.049, -0.025 + i * 0.018, 0.002);
    for (const s of [-1, 1]) { const stripe = rounded(an, 0.003, 0.012, 0.095, sole, s * 0.055, 0.009, -0.01, 0.001); stripe.rotation.x = -0.18; }
    return { hp, kn, an };
  };
  rig.lLeg = leg(1); rig.rLeg = leg(-1);
}

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
// UVs need duplicate seam vertices; lighting must still treat them as one surface.
function smoothRingSeams(g, segments, rows, columnMajor = false) {
  const normal = g.attributes.normal, n = new THREE.Vector3(), end = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    const a = columnMajor ? r : r * (segments + 1), b = columnMajor ? segments * rows + r : a + segments;
    n.fromBufferAttribute(normal, a).add(end.fromBufferAttribute(normal, b)).normalize();
    normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
  }
}
// Elliptical rings give fabric a shaped silhouette and small folds without changing any rig pivots.
function garment(parent, rings, material, zScale = 1, foldAmount = 0.023) {
  // Interpolate the tailoring profiles so folds and shoulders shade as cloth,
  // rather than a stack of straight-sided cones.
  const profile = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[0], r[1], r[2])), false, 'catmullrom', 0.25);
  const centers = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[3] || 0, r[4] || 0, 0)), false, 'catmullrom', 0.25);
  const steps = (rings.length - 1) * 4;
  rings = Array.from({ length: steps + 1 }, (_, i) => {
    const p = profile.getPoint(i / steps), c = centers.getPoint(i / steps);
    return [p.x, Math.max(0, p.y), Math.max(0, p.z), c.x, c.y];
  });
  const p = [], uv = [], indices = [], segments = 24;
  for (let r = 0; r < rings.length; r++) {
    const [y, rx, rz, centerZ = 0, centerX = 0] = rings[r];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const denim = material.name === 'Worn indigo denim';
      const fleece = material.name === 'Washed black hoodie';
      const gather = denim ? Math.exp(-(((y + 0.75) / 0.085) ** 2)) + 0.55 * Math.exp(-(((y + 0.42) / 0.07) ** 2))
        : fleece ? Math.exp(-(((y + 0.47) / 0.075) ** 2)) + 0.34 * Math.exp(-(((y - 0.03) / 0.075) ** 2)) : 0;
      const wrinkle = gather * Math.sin(y * 115 + Math.sin(a * 3) * 1.8) * 0.055;
      const fold = 1 + Math.sin(a * 5 + r * 0.16) * foldAmount + Math.sin(a * 9 - r * 0.32) * foldAmount * 0.35 + wrinkle;
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
  smoothRingSeams(g, segments, rings.length);
  return mesh(parent, g, material);
}

// A turned-back knit edge, including its inner wall. The shared top ring closes
// inside the sleeve; the rounded lower edge hugs the wrist instead of ending in paper-thin points.
function sleeveCuff(parent, material) {
  const cuff = garment(parent, [
    [-0.220, 0.045, 0.041], [-0.238, 0.041, 0.037],
    [-0.262, 0.033, 0.029], [-0.273, 0.030, 0.025],
    [-0.276, 0.026, 0.021], [-0.272, 0.023, 0.018],
    [-0.255, 0.025, 0.021], [-0.232, 0.034, 0.030],
    [-0.220, 0.045, 0.041],
  ], material, 1, 0);
  cuff.name = 'Closed ribbed cuff';
  return cuff;
}

// Continuous cloth across the elbow/knee, with a soft transition between bones.
function jointCloth(rig, upper, lower, rings, material, joint, folds, anchor = null) {
  const shell = garment(upper, rings, material, 1, folds);
  upper.remove(shell);
  const g = shell.geometry, p = g.attributes.position, indices = [], weights = [];
  for (let i = 0; i < p.count; i++) {
    const w = THREE.MathUtils.smoothstep(-p.getY(i), joint - 0.065, joint + 0.065);
    const fixed = anchor ? 1 - THREE.MathUtils.smoothstep(-p.getY(i), 0.015, 0.15) : 0;
    indices.push(0, 1, 2, 0); weights.push((1 - w) * (1 - fixed), w * (1 - fixed), fixed, 0);
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const cloth = new THREE.SkinnedMesh(g, material); upper.add(cloth);
  cloth.castShadow = cloth.receiveShadow = true; cloth.frustumCulled = false;
  rig.root.updateMatrixWorld(true); cloth.bind(new THREE.Skeleton(anchor ? [upper, lower, anchor] : [upper, lower, upper]));
  return cloth;
}

// A shoe-shaped shell: superellipse cross-sections lofted from heel to toe, with both
// ends closed. Stations are [t, halfWidth, bottomY, topY]; t runs 0 at the heel to 1 at the toe.
function lastedShell(parent, stations, material, exponent, length) {
  const around = 24, p = [], uv = [], indices = [], rows = stations.length;
  for (let r = 0; r < rows; r++) {
    const [t, halfW, low, high] = stations[r], midY = (low + high) / 2, halfH = (high - low) / 2;
    for (let i = 0; i <= around; i++) {
      const a = i / around * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), k = 2 / exponent;
      p.push(halfW * Math.sign(c) * Math.abs(c) ** k, midY + halfH * Math.sign(sn) * Math.abs(sn) ** k, (t - 0.5) * length);
      uv.push(i / around, t);
      if (r && i) { const b = r * (around + 1) + i, a0 = b - around - 1; indices.push(a0 - 1, b, b - 1, a0 - 1, a0, b); }
    }
  }
  // Fan the open heel and toe rings shut on their own centres.
  for (const [row, flip] of [[0, false], [rows - 1, true]]) {
    const [t, , low, high] = stations[row], base = row * (around + 1), hub = p.length / 3;
    p.push(0, (low + high) / 2, (t - 0.5) * length); uv.push(0.5, t);
    for (let i = 0; i < around; i++) {
      if (flip) indices.push(base + i, base + i + 1, hub); else indices.push(base + i + 1, base + i, hub);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  smoothRingSeams(g, around, rows);
  g.name = 'Seamless shoe last';
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
    [0.028, 0.054, 0.049, -0.001], [0.043, 0.067, 0.064, 0.010],
    [0.058, 0.075, 0.070, 0.012], [0.08, 0.078, 0.075, 0.006],
    [0.105, 0.083, 0.080, 0.001], [0.143, 0.081, 0.081],
    [0.18, 0.084, 0.089, -0.003], [0.22, 0.075, 0.085, -0.009],
    [0.253, 0.047, 0.057, -0.009], [0.263, 0, 0, -0.009],
  ];
  const shell = garment(rig.torso, rings, skin, 1, 0);
  rig.torso.remove(shell);
  const geometry = shell.geometry, positions = geometry.attributes.position;
  // Sculpt the face into the continuous head surface: cheekbones, eye sockets,
  // brow, nose bridge and chin. This avoids separate floating facial primitives.
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (z <= 0 || y < 0.035 || y > 0.185) continue;
    const gaussian = (cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
    const front = Math.pow(Math.max(0, z / 0.086), 2);
    const contour = 0.018 * gaussian(0, 0.125, 0.014, 0.034)
      + 0.008 * gaussian(0, 0.053, 0.033, 0.017)
      + 0.007 * (gaussian(-0.043, 0.112, 0.020, 0.017) + gaussian(0.043, 0.112, 0.020, 0.017))
      - 0.007 * (gaussian(-0.033, 0.144, 0.016, 0.009) + gaussian(0.033, 0.144, 0.016, 0.009));
    positions.setZ(i, z + contour * front);
  }
  geometry.computeVertexNormals();
  const faceSkin = skin.clone();
  faceSkin.map = canvasMap((c, s, rng) => {
    const pixels = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const t = (1 - y / (s - 1)) * (rings.length - 1), r = Math.min(rings.length - 2, Math.floor(t));
      const height = THREE.MathUtils.lerp(rings[r][0], rings[r + 1][0], t - r);
      const a = x / s * Math.PI * 2, front = Math.max(0, Math.sin(a)), side = Math.abs(Math.cos(a));
      const beardTop = 0.081 + side * 0.044;
      let beard = THREE.MathUtils.smoothstep(height, 0.020, 0.046) * (1 - THREE.MathUtils.smoothstep(height, beardTop - 0.015, beardTop + 0.005));
      beard *= THREE.MathUtils.smoothstep(Math.sin(a), -0.50, 0.15);
      const moustache = Math.exp(-(((height - 0.095) / 0.006) ** 2)) * Math.pow(front, 28) * 0.72;
      beard = Math.max(beard * 0.72, moustache);
      const grain = (rng() - 0.5) * (6 + beard * 28), o = (y * s + x) * 4;
      const flush = Math.exp(-(((height - 0.115) / 0.018) ** 2)) * front * side;
      pixels.data[o] = 238 - beard * 134 + grain;
      pixels.data[o + 1] = 227 - beard * 135 - flush * 12 + grain;
      pixels.data[o + 2] = 217 - beard * 133 - flush * 16 + grain;
      pixels.data[o + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
  }, 1024);
  const indices = [], weights = [];
  for (let i = 0; i < positions.count; i++) {
    const headWeight = THREE.MathUtils.smoothstep(positions.getY(i), -0.035, 0.06);
    indices.push(0, 1, 0, 0); weights.push(1 - headWeight, headWeight, 0, 0);
  }
  // Average duplicated UV-seam normals so the back/side of the neck shades continuously.
  const normals = geometry.attributes.normal, n = new THREE.Vector3(), other = new THREE.Vector3();
  for (let r = 0; r < positions.count / 25; r++) {
    const a = r * 25, b = a + 24;
    n.fromBufferAttribute(normals, a).add(other.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const headSurface = new THREE.SkinnedMesh(geometry, faceSkin);
  headSurface.name = 'Continuous head and neck'; headSurface.castShadow = headSurface.receiveShadow = true;
  // Keep the small animated surface visible even at extreme head turns.
  headSurface.frustumCulled = false; rig.torso.add(headSurface);
  rig.root.updateMatrixWorld(true);
  headSurface.bind(new THREE.Skeleton([anchor, rig.head]));

  // Brow, cheek planes and a shaped nose give the face adult proportions.
  garment(rig.head, [[0.103, 0.011, 0.004, 0.089], [0.108, 0.015, 0.010, 0.094], [0.117, 0.010, 0.013, 0.095], [0.136, 0.008, 0.007, 0.089], [0.153, 0.004, 0.002, 0.084]], skin, 1, 0);
  const crease = mat(0x704c3b, 1), lip = mat(0x9d6954, 0.96);
  oval(rig.head, 0.019, 0.003, 0.003, lip, 0, 0.079, 0.084);
  oval(rig.head, 0.016, 0.003, 0.003, lip, 0, 0.085, 0.084);
  for (const side of [-1, 1]) {
    oval(rig.head, 0.012, 0.024, 0.014, skin, side * 0.084, 0.123, -0.002);
    oval(rig.head, 0.005, 0.013, 0.008, lip, side * 0.093, 0.125, 0.004);
    oval(rig.head, 0.004, 0.002, 0.003, crease, side * 0.009, 0.105, 0.099);
    oval(rig.head, 0.014, 0.006, 0.003, lip, side * 0.033, 0.143, 0.074);
    oval(rig.head, 0.012, 0.003, 0.003, mat(0xb0a89b), side * 0.033, 0.144, 0.075);
    oval(rig.head, 0.003, 0.003, 0.002, eye, side * 0.033, 0.144, 0.078);
    const brow = rounded(rig.head, 0.027, 0.003, 0.003, hair, side * 0.033, 0.155, 0.075, 0.001); brow.rotation.z = side * 0.09;
  }
  rounded(rig.head, 0.03, 0.002, 0.003, mat(0x95694f, 0.95), 0, 0.081, 0.084, 0.001);

  hair.roughness = 0.96; hair.color.setHex(0x2c2623);
  hair.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#cdbbaa'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const x = rng() * s, y = rng() * s;
      c.strokeStyle = rng() > 0.5 ? 'rgba(30,22,18,0.20)' : 'rgba(235,216,180,0.16)';
      c.lineWidth = 0.5 + rng(); c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + 3, y + 12, x + 8, y + 28); c.stroke();
    }
  }, 256);
  // The cranium profile, sampled at a height: everything worn on the head follows it,
  // because a stretched hemisphere intersects the skull at the back.
  const skullAt = (height) => {
    let r = 0;
    while (r < rings.length - 2 && rings[r + 1][0] < height) r++;
    const lo = rings[r], hi = rings[r + 1], t = THREE.MathUtils.clamp((height - lo[0]) / (hi[0] - lo[0]), 0, 1);
    return [THREE.MathUtils.lerp(lo[1], hi[1], t), THREE.MathUtils.lerp(lo[2], hi[2], t),
      THREE.MathUtils.lerp(lo[3] || 0, hi[3] || 0, t)];
  };
  // A close-fitting hair shell with a higher temple line and longer, irregular nape.
  const hairGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = hairGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), a = Math.atan2(z, x);
    const front = Math.max(0, Math.sin(a)), back = Math.max(0, -Math.sin(a));
    // A broad, shallow sideburn transition, not the narrow triangular tooth below the band.
    const temple = Math.exp(-Math.pow((Math.sin(a) - 0.18) / 0.34, 2)) * 0.009;
    const edge = 0.158 + front * 0.048 - back * 0.065 - temple + Math.sin(a * 19) * 0.0005;
    const radius = 1 + Math.sin(a * 17 + y * 6) * 0.018 * (1 - y);
    const height = edge + (0.266 - edge) * y;
    const [srx, srz, centerZ] = skullAt(height);
    const rx = srx + 0.003, rz = srz + 0.003;
    const horizontal = Math.hypot(x, z);
    hp.setXYZ(i, horizontal > 1e-6 ? x / horizontal * rx * radius : 0, height,
      centerZ + (horizontal > 1e-6 ? z / horizontal * rz * radius : 0));
  }
  hairGeo.computeVertexNormals(); smoothRingSeams(hairGeo, 48, 17);
  mesh(rig.head, hairGeo, hair).name = 'Tailored hairline';

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
  // The cap is worn, not perched: one shell that starts as a sweatband just above the
  // ears and on the brow, then rises in six panels over the actual shape of the skull.
  // A scaled hemisphere sat on top of the head instead, which read as a moulded bowl.
  const hat = new THREE.Group(); hat.name = 'Fitted cap'; rig.head.add(hat);
  const cp = [], cuv = [], ci = [], around = 44, up = 15, apex = 0.269;
  for (let j = 0; j <= up; j++) for (let i = 0; i <= around; i++) {
    const a = i / around * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const front = Math.max(0, sn), back = Math.max(0, -sn), side = Math.abs(c);
    const edge = 0.166 + front * 0.007 - back * 0.002;
    const t = Math.max(0, (j - 1) / (up - 1));            // j = 0 is the sweatband's lower lip
    const height = j === 0 ? edge - 0.012 : edge + (apex - edge) * Math.pow(t, 0.8);
    const [srx, srz, centerZ] = skullAt(height);
    // The band grips the head; the panels above it stand off a little, deepest at the back.
    // Fabric has to clear the hair shell, and a touch more where it passes over the ears.
    const grip = Math.max(0, 1 - Math.pow(t, 12));
    const pad = grip * (0.0040 + 0.0015 * side + 0.0010 * t + 0.0010 * back * t);
    // Near the crown the cranium profile pinches to a point; hold the panels out on a dome.
    const dome = Math.pow(Math.max(0, 1 - t * t), 0.42);
    const seam = 1 - Math.abs(Math.cos(a * 3)) * 0.006 * t;
    const rx = Math.max(srx + pad, 0.078 * dome) * seam, rz = Math.max(srz + pad, 0.086 * dome) * seam;
    cp.push(c * rx, height, centerZ + sn * rz);
    cuv.push(i / around, j / up);
    if (i && j) { const b = j * (around + 1) + i, a0 = b - around - 1; ci.push(a0 - 1, b - 1, b, a0 - 1, b, a0); }
  }
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  crownGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  crownGeo.setIndex(ci); crownGeo.computeVertexNormals(); smoothRingSeams(crownGeo, around, up + 1);
  mesh(hat, crownGeo, cap).name = 'Seamless cap crown';
  // Solid curved visor: rounded outline, downturned sides, dark underside and visible thickness.
  const bp = [], buv = [], bi = [], across = 24, along = 8, count = (across + 1) * (along + 1);
  for (let layer = 0; layer < 2; layer++) for (let j = 0; j <= along; j++) for (let i = 0; i <= across; i++) {
    const u = i / across * 2 - 1, t = j / along;
    bp.push(u * (0.068 + t * 0.025), 0.173 - t * 0.011 - u * u * (0.005 + t * 0.010) - layer * 0.0022,
      0.038 + t * (0.052 + 0.058 * Math.sqrt(Math.max(0, 1 - u * u))));
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
  mesh(hat, brimGeo, [cap, mat(0x191b1e, 0.98)]);
  oval(hat, 0.0055, 0.002, 0.0055, cap, 0, 0.2695, -0.008);
  const badge = mat(0xffffff, 0.98);
  badge.map = canvasMap((c, s) => {
    c.fillStyle = '#25282b'; c.fillRect(0, 0, s, s); c.strokeStyle = '#666b70'; c.lineWidth = 5; c.strokeRect(12, 12, s - 24, s - 24);
    c.fillStyle = '#dfccb0'; c.font = '900 140px sans-serif'; c.textAlign = 'center'; c.fillText('J2S', s / 2, s * 0.69);
  }, 256);
  const patch = mesh(hat, new THREE.PlaneGeometry(0.035, 0.018), badge, 0, 0.209, 0.085);
  patch.rotation.x = -0.30;
}

export function buildDetailedBody(rig) {
  const skin = mat(0xb88364, 0.83), shirt = mat(0x383a3d, 0.96), pants = mat(0x425d7b, 0.97), shoe = mat(0x202329, 0.9);
  shirt.name = 'Washed black hoodie'; pants.name = 'Worn indigo denim';
  const sole = mat(0xd6d4cb, 0.86), cap = mat(0x292b30), hair = mat(0x392c24), eye = mat(0x302a27, 0.5);
  const cloth = canvasMap((c, s, rng) => {
    c.fillStyle = '#b7b7b7'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { c.fillStyle = i % 4 ? '#b0b0b0' : '#c3c3c3'; c.fillRect(i, 0, 1, s); c.fillRect(0, i, s, 0.5); }
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(30,30,30,${rng() * 0.13})`; c.fillRect(rng() * s, rng() * s, 1, 1); }
  }, 256, false);
  for (const m of [shirt, pants, cap]) { m.bumpMap = cloth; m.bumpScale = 0.0018; }
  // Small shared garment maps: cotton fleece/twill, stitched seams and uneven wash.
  // Generated once at load, with no downloads or per-frame cloth simulation.
  const fabricColor = (twill) => canvasMap((c, s, rng) => {
    c.fillStyle = twill ? '#d2cec4' : '#c4c8c6'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 48; i++) {
      const x = rng() * s, y = rng() * s, radius = 20 + rng() * 100;
      const g = c.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(245,241,222,${twill ? 0.07 : 0.05})`);
      g.addColorStop(1, 'rgba(245,241,222,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
    for (let i = 0; i < 22000; i++) {
      c.fillStyle = `rgba(40,47,48,${rng() * 0.10})`;
      const x = rng() * s, y = rng() * s;
      c.fillRect(x, y, 1, twill ? 2 : 1);
    }
    // Broad wear and short crease highlights remain visible at gameplay distance.
    for (const v of [0.13, 0.22, 0.47, 0.53, 0.82, 0.90]) {
      for (let side = 0; side < 2; side++) {
        const x = s * (0.12 + side * 0.5), y = v * s, width = s * (0.10 + rng() * 0.10);
        c.lineCap = 'round'; c.lineWidth = twill ? 4 : 3;
        c.strokeStyle = twill ? 'rgba(40,52,67,0.15)' : 'rgba(35,37,40,0.15)';
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + width * 0.5, y - 9, x + width, y + 4); c.stroke();
        c.lineWidth = 2; c.strokeStyle = 'rgba(238,237,230,0.16)';
        c.beginPath(); c.moveTo(x + 2, y + 4); c.quadraticCurveTo(x + width * 0.5, y - 5, x + width, y + 8); c.stroke();
      }
    }
    for (const x of [2, s / 2]) {
      c.fillStyle = 'rgba(25,32,36,0.18)'; c.fillRect(x, 0, 3, s);
      c.strokeStyle = 'rgba(218,207,174,0.26)'; c.lineWidth = 1;
      c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x + 5, 0); c.lineTo(x + 5, s); c.stroke();
    }
    c.setLineDash([]); c.fillStyle = 'rgba(25,32,36,0.16)'; c.fillRect(0, 3, s, 2);
  }, 512);
  shirt.map = fabricColor(false); pants.map = fabricColor(true);
  pants.bumpMap = canvasMap((c, s) => {
    c.fillStyle = '#777'; c.fillRect(0, 0, s, s);
    for (let y = -s; y < s * 2; y += 4) {
      c.strokeStyle = '#aaa'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); c.lineTo(s, y + s); c.stroke();
    }
  }, 256, false); pants.bumpScale = 0.0009;
  const rib = shirt.clone(); rib.name = 'Hoodie rib knit';
  rib.bumpMap = canvasMap((c, s) => {
    c.fillStyle = '#888'; c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 4) { c.fillStyle = '#aaa'; c.fillRect(x, 0, 2, s); }
  }, 128, false); rib.bumpScale = 0.0013;
  rig.hips = new THREE.Bone(); rig.body.add(rig.hips);
  rounded(rig.hips, 0.33, 0.19, 0.20, pants, 0, 0.015, 0, 0.080);
  rig.torso = new THREE.Group(); rig.torso.position.y = 0.1; rig.hips.add(rig.torso);
  // Heavier fleece hangs away from the body, gathering above a ribbed waistband.
  // The hem has to clear the pelvis and the tops of the thighs at every fold, or the
  // denim saws through the fleece in front; it flares out and draws back in at the lip.
  garment(rig.torso, [[-0.088, 0.236, 0.157], [-0.072, 0.245, 0.164], [-0.045, 0.240, 0.160], [-0.015, 0.221, 0.150], [0.09, 0.206, 0.140], [0.25, 0.203, 0.131], [0.36, 0.22, 0.122], [0.415, 0.224, 0.11], [0.445, 0.198, 0.091], [0.47, 0.065, 0.06]], shirt, 1, 0.030);
  // Ribbed waistband, tucked just inside the fleece so a fold never uncovers the jeans.
  garment(rig.torso, [[-0.104, 0.211, 0.140], [-0.090, 0.219, 0.146], [-0.072, 0.223, 0.149], [-0.048, 0.216, 0.144]], rib, 1, 0.012);
  const collar = mesh(rig.torso, new THREE.TorusGeometry(0.061, 0.01, 8, 24), shirt, 0, 0.466, 0); collar.rotation.x = Math.PI / 2;
  // A hood that is down, not stuffed: wide and flat against the back rather than a pouch.
  // Its inner face is buried inside the torso so only the draped panel reads.
  // The upper hood bends forward into the neckline, not vertically up behind it.
  garment(rig.torso, [[0.240, 0.038, 0.014, -0.114], [0.286, 0.096, 0.026, -0.129], [0.334, 0.128, 0.040, -0.125], [0.386, 0.144, 0.045, -0.125], [0.436, 0.146, 0.051, -0.113], [0.455, 0.128, 0.048, -0.103], [0.472, 0.101, 0.043, -0.090]], shirt, 1, 0.026).name = 'Hood attached to neckline';
  // Roll continuously into a recessed lining. An open ring around a raised oval
  // left daylight slits on either side of the old hood opening.
  const hoodLip = garment(rig.torso, [
    [0.457, 0.110, 0.050, -0.102], [0.471, 0.116, 0.052, -0.094],
    [0.480, 0.107, 0.046, -0.087], [0.476, 0.095, 0.036, -0.086],
    [0.461, 0.091, 0.033, -0.087], [0.448, 0, 0, -0.090],
  ], rib, 1, 0.006);
  hoodLip.name = 'Lined hood opening';
  const cord = mat(0x8a8880, 0.98);
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([[side * 0.045, 0.465, 0.064], [side * 0.056, 0.415, 0.115], [side * 0.048, 0.34, 0.135], [side * 0.061, 0.285, 0.13]].map(p => new THREE.Vector3(...p)));
    mesh(rig.torso, new THREE.TubeGeometry(curve, 12, 0.0025, 6, false), cord);
    rounded(rig.torso, 0.004, 0.014, 0.004, cord, side * 0.061, 0.278, 0.13, 0.001);
  }
  // Curved kangaroo pocket follows the fleece surface instead of floating as a flat box.
  const pocketP = [], pocketUV = [], pocketI = [], cols = 16, rows = 4;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols * 2 - 1, x = u * 0.136;
    pocketP.push(x, -0.015 + j / rows * (0.15 - 0.035 * u ** 4), 0.143 * Math.sqrt(1 - (x / 0.21) ** 2) + 0.005);
    pocketUV.push(i / cols, j / rows);
    if (i && j) { const b = j * (cols + 1) + i, a = b - cols - 1; pocketI.push(a - 1, a, b, a - 1, b, b - 1); }
  }
  const pocketGeo = new THREE.BufferGeometry(); pocketGeo.setAttribute('position', new THREE.Float32BufferAttribute(pocketP, 3));
  pocketGeo.setAttribute('uv', new THREE.Float32BufferAttribute(pocketUV, 2)); pocketGeo.setIndex(pocketI); pocketGeo.computeVertexNormals();
  mesh(rig.torso, pocketGeo, rib);
  buildConnectedHead(rig, { skin, cap, hair, eye, cloth });
  const arm = (side) => {
    const sh = new THREE.Bone(); sh.position.set(side * 0.22, 0.42, 0); rig.torso.add(sh);
    const el = new THREE.Bone(); el.position.y = -0.29; sh.add(el);
    // Bury the sleeve's final ring inside the knit so gathered folds cannot poke
    // through its upper seam as little triangular tabs.
    const sleeve = jointCloth(rig, sh, el, [[0.055, 0, 0], [0.025, 0.06, 0.06], [-0.035, 0.093, 0.087], [-0.13, 0.086, 0.079], [-0.23, 0.079, 0.074], [-0.29, 0.076, 0.073], [-0.34, 0.081, 0.076], [-0.43, 0.070, 0.063], [-0.47, 0.074, 0.065], [-0.530, 0.035, 0.031]], shirt, 0.29, 0.037);
    sleeve.name = 'Sleeve tucked into cuff';
    sleeveCuff(el, rib);
    // A relaxed hand rather than a paddle: a shaped palm with the thumb and little-finger
    // pads either side of it, fingers that curl over two joints, and a thumb folded alongside.
    const hand = new THREE.Group(); hand.position.set(0, -0.262, 0.002);
    // Body +x is the left arm. Thumbs point forward and palms face the thighs.
    hand.name = side === 1 ? 'Left hand' : 'Right hand';
    hand.rotation.set(-0.06, -side * (Math.PI / 2 - 0.12), 0); el.add(hand);
    const palm = garment(hand, [
      [0.012, 0, 0], [0.002, 0.021, 0.016], [-0.015, 0.023, 0.017],
      [-0.033, 0.030, 0.017, 0.001, side * 0.002],
      [-0.052, 0.031, 0.016, 0.002], [-0.069, 0.030, 0.014, 0.002],
      [-0.080, 0.025, 0.011, 0.003], [-0.084, 0, 0, 0.003],
    ], skin, 1, 0);
    palm.name = 'Continuous palm and wrist';
    const digit = (x, y, z, spread, length, radius, curl) => {
      const knuckle = new THREE.Group(); knuckle.position.set(x, y, z);
      knuckle.rotation.z = spread; hand.add(knuckle);
      // One tapering curved surface per digit: no detached capsule tips or bead-like joints.
      const g = new THREE.CapsuleGeometry(radius, length - radius * 2, 5, 12);
      const p = g.attributes.position, turn = curl * 1.8;
      for (let i = 0; i < p.count; i++) {
        const t = THREE.MathUtils.clamp((length / 2 - p.getY(i)) / length, 0, 1), theta = t * turn;
        const crossZ = p.getZ(i) * (1 - 0.15 * t);
        p.setXYZ(i, p.getX(i) * (1 - 0.15 * t),
          -length * Math.sin(theta) / turn + crossZ * Math.sin(theta),
          length * (1 - Math.cos(theta)) / turn + crossZ * Math.cos(theta));
      }
      // Capsule/Lathe stores columns first, unlike the row-major clothing grids.
      g.computeVertexNormals(); smoothRingSeams(g, 12, p.count / 13, true);
      mesh(knuckle, g, skin).name = 'Continuous curled digit';
      return knuckle;
    };
    for (let f = 0; f < 4; f++) {
      digit(side * (0.024 - f * 0.016), [-0.069, -0.074, -0.072, -0.065][f], [0.002, 0.002, 0.001, 0][f],
        side * (0.045 - f * 0.03), [0.052, 0.058, 0.054, 0.043][f], [0.0082, 0.0085, 0.0080, 0.0071][f],
        [0.28, 0.34, 0.40, 0.46][f]);
    }
    digit(side * 0.023, -0.029, 0.006, side * 0.52, 0.047, 0.0105, 0.38).name = 'Thumb root';
    return { sh, el, hand };
  };
  rig.lArm = arm(1); rig.rArm = arm(-1);
  const leg = (side) => {
    const hp = new THREE.Bone(); hp.position.set(side * 0.15, 0, 0); rig.hips.add(hp);
    const kn = new THREE.Bone(); kn.position.y = -0.42; hp.add(kn);
    const jeans = jointCloth(rig, hp, kn, [[0.080, 0, 0, 0, -side * 0.045], [0.045, 0.074, 0.092, 0, -side * 0.046], [0.000, 0.096, 0.104, 0, -side * 0.028], [-0.07, 0.113, 0.113], [-0.19, 0.107, 0.105], [-0.31, 0.091, 0.092], [-0.38, 0.097, 0.098], [-0.43, 0.089, 0.089], [-0.48, 0.098, 0.094], [-0.58, 0.088, 0.083], [-0.68, 0.074, 0.076], [-0.72, 0.086, 0.083], [-0.75, 0.078, 0.074], [-0.78, 0.086, 0.078], [-0.81, 0.072, 0.068]], pants, 0.42, 0.036, rig.hips);
    jeans.name = side === 1 ? 'Front jeans continuous hip' : 'Back jeans continuous hip';
    const ankle = new THREE.Group(); ankle.position.y = -0.42; kn.add(ankle);
    // Anatomical ankle is behind the shoe centre. Keep the shoe-centre frame for
    // deck contacts; IK compensates this offset instead of sliding the soles forward.
    const an = new THREE.Group(); an.position.z = 0.055; ankle.add(an);
    // A lasted skate shoe: the upper narrows at the heel and arch, swells over the ball of
    // the foot and rounds off at the toe, and a vulcanised cupsole wraps up around it.
    // The old stack of rounded boxes read as a brick whichever way the foot turned.
    lastedShell(an, [
      [0.00, 0.014, -0.016, 0.021], [0.05, 0.033, -0.015, 0.043], [0.15, 0.040, -0.014, 0.050],
      [0.34, 0.040, -0.015, 0.047], [0.52, 0.043, -0.016, 0.039], [0.70, 0.047, -0.017, 0.029],
      [0.85, 0.045, -0.019, 0.019], [0.94, 0.036, -0.023, 0.009], [1.00, 0.014, -0.024, 0.004],
    ], shoe, 2.4, 0.244);
    lastedShell(an, [
      [0.00, 0.023, -0.0320, -0.011], [0.05, 0.039, -0.0392, -0.008], [0.15, 0.046, -0.0405, -0.007],
      [0.34, 0.046, -0.0405, -0.008], [0.52, 0.049, -0.0405, -0.009], [0.70, 0.053, -0.0405, -0.010],
      [0.85, 0.051, -0.0400, -0.012], [0.94, 0.042, -0.0372, -0.016], [1.00, 0.023, -0.0318, -0.021],
    ], sole, 3.4, 0.25);
    // Tongue and laces sit in the throat of the upper, not on top of a box.
    const tongue = rounded(an, 0.044, 0.014, 0.085, shoe, 0, 0.043, -0.022, 0.007); tongue.rotation.x = 0.12;
    for (let i = 0; i < 4; i++) {
      const lace = rounded(an, 0.046 - i * 0.003, 0.0035, 0.005, sole, 0, 0.050 - i * 0.0015, -0.040 + i * 0.019, 0.0016);
      lace.rotation.x = 0.12;
    }
    lastedShell(an, [
      [0.00, 0.012, 0.006, 0.013], [0.05, 0.032, 0.008, 0.015], [0.15, 0.0412, 0.008, 0.015],
      [0.34, 0.0412, 0.006, 0.013], [0.52, 0.0442, 0.002, 0.009], [0.70, 0.0482, -0.002, 0.005],
      [0.85, 0.0452, -0.005, 0.002], [0.94, 0.031, -0.009, -0.002], [1.00, 0.012, -0.013, -0.006],
    ], sole, 6, 0.232);
    return { hp, kn, ankle, an };
  };
  rig.lLeg = leg(1); rig.rLeg = leg(-1);
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasMap } from './materials.js';
import { handGeometry } from './hand-art.js';
import { skaterMaterials } from './skater-materials.js';
import { addBeard, addShaggyHair } from './groom-art.js';

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
function garment(parent, rings, material, zScale = 1, foldAmount = 0.023, segments = 24) {
  // Interpolate the tailoring profiles so folds and shoulders shade as cloth,
  // rather than a stack of straight-sided cones.
  const profile = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[0], r[1], r[2])), false, 'catmullrom', 0.25);
  const centers = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[3] || 0, r[4] || 0, 0)), false, 'catmullrom', 0.25);
  const steps = (rings.length - 1) * 4;
  rings = Array.from({ length: steps + 1 }, (_, i) => {
    const p = profile.getPoint(i / steps), c = centers.getPoint(i / steps);
    return [p.x, Math.max(0, p.y), Math.max(0, p.z), c.x, c.y];
  });
  const p = [], uv = [], indices = [];
  for (let r = 0; r < rings.length; r++) {
    const [y, rx, rz, centerZ = 0, centerX = 0] = rings[r];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const denim = material.name === 'Worn indigo denim';
      const fleece = material.name.startsWith('Washed navy cotton');
      const gather = denim ? Math.exp(-(((y + 0.75) / 0.085) ** 2)) + 0.55 * Math.exp(-(((y + 0.42) / 0.07) ** 2))
        : fleece ? Math.exp(-(((y + 0.06) / 0.10) ** 2)) + .55 * Math.exp(-(((y - .13) / .16) ** 2)) : 0;
      const wrinkle = gather * Math.sin(y * 48 + Math.sin(a * 3) * 2.4) * .045;
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
  board.userData.wheels = [];
  for (const s of [-1, 1]) {
    rounded(board, 0.077, 0.012, 0.085, alloy, 0, 0.105, s * 0.24, 0.006);
    const hanger = mesh(board, new THREE.CylinderGeometry(0.014, 0.02, 0.18, 12), alloy, 0, 0.043, s * 0.24); hanger.rotation.z = Math.PI / 2;
    const kingpin = mesh(board, new THREE.CylinderGeometry(0.017, 0.011, 0.056, 10), alloy, 0, 0.073, s * 0.23); kingpin.rotation.x = s * 0.3;
    mesh(board, new THREE.CylinderGeometry(0.022, 0.022, 0.015, 14), rubber, 0, 0.068, s * 0.235);
    for (const w of [-1, 1]) {
      const profile = [[0.007, -0.0165], [0.026, -0.0165], [0.030, -0.014], [0.032, -0.009], [0.032, 0.009], [0.030, 0.014], [0.026, 0.0165], [0.007, 0.0165]].map(p => new THREE.Vector2(...p));
      const rolling = new THREE.Group(); rolling.position.set(w * .091, .032, s * .24);
      rolling.name = 'Rolling urethane wheel'; board.add(rolling); board.userData.wheels.push(rolling);
      const wheel = mesh(rolling, new THREE.LatheGeometry(profile, 24), urethane); wheel.rotation.z = Math.PI / 2;
      const ring = mesh(rolling, new THREE.TorusGeometry(0.02, 0.002, 6, 24), ink, w * .017, 0, 0); ring.rotation.y = Math.PI / 2;
      // Sidewall markings make rotation readable, even at the end of an ollie.
      for (const angle of [0, 2.0, 4.0]) {
        const mark = mesh(rolling, new THREE.BoxGeometry(.001, .006, .009), ink, w * .0175, Math.cos(angle) * .02, Math.sin(angle) * .02);
        mark.rotation.x = angle;
      }
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
    [0.028, 0.052, 0.049, -0.001], [0.043, 0.059, 0.062, 0.010],
    [0.058, 0.067, 0.069, 0.009], [0.08, 0.074, 0.075, 0.003],
    [0.105, 0.080, 0.080, 0.001], [0.143, 0.081, 0.081],
    [0.18, 0.084, 0.089, -0.003], [0.22, 0.075, 0.085, -0.009],
    [0.253, 0.047, 0.057, -0.009], [0.263, 0, 0, -0.009],
  ];
  const headSegments = 64;
  const shell = garment(rig.torso, rings, skin, 1, 0, headSegments);
  rig.torso.remove(shell);
  const geometry = shell.geometry, positions = geometry.attributes.position;
  // Sculpt the face into the continuous head surface: cheekbones, eye sockets,
  // brow, nose bridge and chin. This avoids separate floating facial primitives.
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (z <= 0 || y < 0.035 || y > 0.185) continue;
    const gaussian = (cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
    const front = Math.pow(Math.max(0, z / 0.086), 2);
    const contour = 0.013 * gaussian(0, 0.125, 0.013, 0.028)
      + 0.012 * gaussian(0, 0.108, 0.012, 0.009)
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
      // Stubble belongs in the skin, not a dark painted mask over the lower face.
      beard = Math.max(beard * 0.60, moustache * 0.60);
      const grain = (rng() - 0.5) * (4 + beard * 18), o = (y * s + x) * 4;
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
  smoothRingSeams(geometry, headSegments, positions.count / (headSegments + 1));
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const headSurface = new THREE.SkinnedMesh(geometry, faceSkin);
  headSurface.name = 'Continuous head and neck'; headSurface.castShadow = headSurface.receiveShadow = true;
  // Keep the small animated surface visible even at extreme head turns.
  headSurface.frustumCulled = false; rig.torso.add(headSurface);
  rig.root.updateMatrixWorld(true);
  headSurface.bind(new THREE.Skeleton([anchor, rig.head]));
  addBeard(rig, headSurface, rings);

  // Brow, cheek planes and a shaped nose give the face adult proportions.
  // The bridge and tip now belong to the face mesh, not a separate pasted-on wedge.
  const crease = mat(0x704c3b, 1), lip = mat(0x9d6954, 0.96);
  const faceProbe = new THREE.Mesh(geometry, skin), faceRay = new THREE.Raycaster();
  const faceDepth = (x, y) => {
    faceRay.set(new THREE.Vector3(x, y + 0.5, 0.3), new THREE.Vector3(0, 0, -1));
    const hit = faceRay.intersectObject(faceProbe, false)[0];
    if (!hit) throw new Error('Facial detail lies outside the head surface');
    return hit.point.z;
  };
  // Taper both lips to shared corners and follow the actual muzzle curvature.
  // Their boundary blends back into skin instead of ending as two raised bars.
  const lipSkin = skin.color.clone().multiply(new THREE.Color(238 / 255, 227 / 255, 217 / 255));
  for (const upper of [true, false]) {
    const p = [], colors = [], indices = [], columns = 32, rows = 6;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      const u = i / columns * 2 - 1, v = j / rows, taper = Math.max(0, 1 - u * u);
      const x = u * 0.0185, seam = 0.081 - 0.0008 * taper;
      const bow = 0.0025 + 0.0018 * Math.exp(-(((Math.abs(u) - 0.32) / 0.22) ** 2));
      const y = seam + (upper ? bow : -0.0045) * taper * v;
      p.push(x, y, faceDepth(x, y) + 0.00025 + Math.sin(v * Math.PI) * taper * 0.0011);
      const color = lip.color.clone().lerp(lipSkin, THREE.MathUtils.smoothstep(v, 0.4, 1));
      color.multiplyScalar(0.78 + 0.22 * THREE.MathUtils.smoothstep(v, 0, 0.35));
      colors.push(color.r, color.g, color.b);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i, b = a + columns + 1;
        if (upper) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices); g.computeVertexNormals();
    const material = mat(0xffffff, 0.85); material.vertexColors = true;
    mesh(rig.head, g, material).name = upper ? 'Contoured upper lip' : 'Contoured lower lip';
  }
  const sclera = mat(0xc1b9ab, 0.5), pupil = mat(0x171916, 0.42);
  for (const side of [-1, 1]) {
    oval(rig.head, 0.009, 0.023, 0.011, skin, side * 0.084, 0.123, -0.002);
    oval(rig.head, 0.003, 0.012, 0.006, lip, side * 0.090, 0.125, 0.003);
    const nostril = new THREE.CircleGeometry(1, 16), np = nostril.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const x = side * 0.008 + np.getX(i) * 0.0027, y = 0.103 + np.getY(i) * 0.0011;
      np.setXYZ(i, x, y, faceDepth(x, y) + 0.0003);
    }
    nostril.computeVertexNormals();
    mesh(rig.head, nostril, crease).name = 'Recessed nostril shading';
    oval(rig.head, 0.0105, 0.0035, 0.0035, sclera, side * 0.033, 0.143, 0.0735);
    oval(rig.head, 0.0032, 0.0032, 0.001, eye, side * 0.033, 0.143, 0.0767);
    oval(rig.head, 0.0015, 0.0022, 0.0006, pupil, side * 0.033, 0.143, 0.0774);
    for (const upper of [true, false]) {
      const points = Array.from({length: 9}, (_, i) => {
        const u = i / 8 * 2 - 1;
        return new THREE.Vector3(side * 0.033 + u * 0.011,
          0.143 + Math.sin(i / 8 * Math.PI) * (upper ? 0.0035 : -0.0026),
          0.074 + Math.sin(i / 8 * Math.PI) * 0.0029);
      });
      mesh(rig.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, upper ? 0.0012 : 0.0009, 6, false), skin).name = 'Sculpted eyelid';
    }
    const brow = rounded(rig.head, 0.027, 0.003, 0.003, hair, side * 0.033, 0.155, 0.075, 0.001); brow.rotation.z = side * 0.09;
  }

  hair.roughness = 0.91; hair.color.setHex(0x785034);
  hair.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#cfbda8'; c.fillRect(0, 0, s, s);
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
    const edge = 0.147 + front * 0.059 - back * 0.042 - temple + Math.sin(a * 19) * 0.002;
    const radius = 1 + Math.sin(a * 17 + y * 6) * 0.018 * (1 - y);
    const height = edge + (0.266 - edge) * y;
    const [srx, srz, centerZ] = skullAt(height);
    const inset = THREE.MathUtils.smoothstep(height, .16, .19) * .004;
    const rx = srx + 0.003 - inset, rz = srz + 0.003 - inset;
    const horizontal = Math.hypot(x, z);
    hp.setXYZ(i, horizontal > 1e-6 ? x / horizontal * rx * radius : 0, height,
      centerZ + (horizontal > 1e-6 ? z / horizontal * rz * radius : 0));
  }
  hairGeo.computeVertexNormals(); smoothRingSeams(hairGeo, 48, 17);
  mesh(rig.head, hairGeo, hair).name = 'Tailored hairline';
  addShaggyHair(rig, skullAt, hair);

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
  // Increase the adult head/body ratio after binding: the neck blends into the
  // larger head while the collar remains fixed to the torso.
  rig.head.scale.setScalar(1.10);
}

export function buildDetailedBody(rig) {
  const { skin, shoe, shirt, pants, sole, sock } = skaterMaterials();
  const cap = mat(0x383736), hair = mat(0x392c24), eye = mat(0x302a27, .5);
  const cloth = shirt.normalMap;
  const rib = shirt.clone(); rib.name = 'Cotton collar binding';
  rig.hips = new THREE.Bone(); rig.body.add(rig.hips);
  rounded(rig.hips, .265, .16, .17, pants, 0, .02, 0, .065);
  rig.torso = new THREE.Bone(); rig.torso.position.y = 0.1; rig.hips.add(rig.torso);
  // The elastic hem follows the pelvis while the chest can lean and twist.
  // A rigid torso-parented hem otherwise swings straight through the hip-anchored denim.
  const anchorHem = surface => {
    const g = surface.geometry, p = g.attributes.position, indices = [], weights = [];
    for (let i = 0; i < p.count; i++) {
      const chest = THREE.MathUtils.smoothstep(p.getY(i), -0.025, 0.18);
      indices.push(0, 1, 0, 0); weights.push(1 - chest, chest, 0, 0);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    rig.torso.remove(surface);
    const cloth = new THREE.SkinnedMesh(g, surface.material);
    cloth.name = surface.name; cloth.castShadow = cloth.receiveShadow = true; cloth.frustumCulled = false;
    rig.torso.add(cloth); rig.root.updateMatrixWorld(true);
    cloth.bind(new THREE.Skeleton([rig.hips, rig.torso]));
    return cloth;
  };
  // Loose straight-cut cotton, narrower than the shoulders and without a flared hip silhouette.
  const tee = garment(rig.torso, [[-.10,.181,.122],[-.08,.182,.122],[-.02,.175,.116],[.10,.171,.111],[.25,.177,.106],[.35,.185,.105],[.40,.185,.098],[.44,.136,.077],[.47,.063,.056]], shirt, 1, .013, 48);
  tee.name = 'Tailored cotton tee';
  const printed = shirt.clone(); printed.name = 'Washed navy cotton with worn back print';
  printed.map = canvasMap((c,s,rng) => {
    c.drawImage(shirt.map.image,0,0,s,s);
    c.save(); c.translate(s*.75,s*.49); c.scale(-1,1);
    c.fillStyle='#ac4037'; c.fillRect(-s*.067,-s*.16,s*.134,s*.31);
    c.fillStyle='#e0d6b8'; c.textAlign='center'; c.font='italic 900 144px Georgia, serif'; c.fillText('G',0,s*.045,s*.114);
    c.font='bold 14px sans-serif'; c.fillText('ROCHESTER',0,s*.103,s*.117); c.font='bold 13px sans-serif'; c.fillText('1878',0,s*.13);
    // Screenprint wear reveals the underlying cotton through small broken strokes.
    for(let i=0;i<1400;i++){ const x=(rng()-.5)*s*.134,y=(rng()-.5)*s*.31; c.globalAlpha=.18; c.fillStyle='#303e66'; c.fillRect(x,y,rng()*3+1,rng()*1.5+.4); }
    c.restore();
  },1024);
  tee.material = printed; anchorHem(tee);
  anchorHem(garment(rig.torso,[[-.105,.180,.122],[-.098,.183,.124],[-.088,.182,.123],[-.082,.179,.120]],shirt,1,.009,48));
  const collar=mesh(rig.torso,new THREE.TorusGeometry(.059,.007,10,40),rib,0,.467,0); collar.rotation.x=Math.PI/2;
  buildConnectedHead(rig, { skin, cap, hair, eye, cloth });
  const arm = (side) => {
    const sh = new THREE.Bone(); sh.position.set(side * 0.177, 0.392, 0); rig.torso.add(sh);
    const el = new THREE.Bone(); el.position.y = -0.29; sh.add(el);
    const sleeve = garment(sh,[[.05,0,0],[.025,.048,.049],[-.025,.063,.062],[-.11,.068,.064],[-.17,.064,.061],[-.19,.061,.058],[-.192,.055,.052],[-.175,.055,.052]],shirt,1,.018,32);
    sleeve.name='Short cotton sleeve';
    jointCloth(rig,sh,el,[[-.14,.041,.043],[-.20,.040,.041],[-.26,.034,.036],[-.29,.032,.034],[-.33,.039,.038],[-.39,.035,.035],[-.47,.026,.027],[-.535,.020,.024],[-.550,.016,.021],[-.560,.014,.018]],skin,.29,.002).name='Continuous bare arm';
    // A relaxed hand rather than a paddle: a shaped palm with the thumb and little-finger
    // pads either side of it, fingers that curl over two joints, and a thumb folded alongside.
    const hand = new THREE.Group(); hand.position.set(0, -0.262, 0.002);
    // Body +x is the left arm. Thumbs point forward and palms face the thighs.
    hand.name = side === 1 ? 'Left hand' : 'Right hand';
    hand.rotation.set(-0.06, -side * (Math.PI / 2 - 0.12), 0); el.add(hand);
    const palm = mesh(hand, handGeometry(side), skin);
    palm.name = 'Continuous palm and wrist';
    // Anatomical landmark for orientation checks and future grab targets.
    const thumb = new THREE.Object3D(); thumb.name = 'Thumb root';
    thumb.position.set(side * 0.035, -0.048, 0.008); hand.add(thumb);
    return { sh, el, hand };
  };
  rig.lArm = arm(1); rig.rArm = arm(-1);
  const leg = (side) => {
    const hp = new THREE.Bone(); hp.position.set(side * .103, 0, 0); rig.hips.add(hp);
    const kn = new THREE.Bone(); kn.position.y = -0.42; hp.add(kn);
    const shorts = jointCloth(rig,hp,kn,[[.080,0,0,0,-side*.022],[.045,.072,.082,0,-side*.023],[0,.083,.091,0,-side*.015],[-.08,.088,.091],[-.19,.087,.085],[-.29,.080,.080],[-.35,.078,.074],[-.39,.080,.075],[-.40,.076,.071],[-.385,.067,.063]],pants,.42,.019,rig.hips);
    shorts.name=side===1?'Front shorts continuous hip':'Back shorts continuous hip';
    // A sculpted knee, shin ridge and tapered calf; one smooth skin surface spans the knee.
    jointCloth(rig,hp,kn,[[-.24,.055,.060],[-.33,.043,.046],[-.385,.041,.045,.004],[-.42,.038,.043,.004],[-.455,.039,.040],[-.51,.051,.049,-.007],[-.57,.051,.048,-.01],[-.65,.041,.039,-.004],[-.74,.027,.030],[-.82,.025,.028]],skin,.42,.002).name='Continuous knee and calf';
    // Sewn pocket follows the thigh's curvature instead of standing off as a rigid box.
    const pp=[],pu=[],pi=[];
    for(let j=0;j<=6;j++)for(let i=0;i<=10;i++){
      const z=(i/10-.5)*.105,y=-.14-j/6*.16;
      const radius=.089-j/6*.009;
      pp.push(side*(radius*Math.sqrt(1-(z/.086)**2)+.002),y,z);
      pu.push(i/10,j/6);
      if(i&&j){const b=j*11+i,a=b-11; if(side>0)pi.push(a-1,b,a,a-1,b-1,b);else pi.push(a-1,a,b,a-1,b,b-1);}
    }
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));pg.setAttribute('uv',new THREE.Float32BufferAttribute(pu,2));pg.setIndex(pi);pg.computeVertexNormals();
    mesh(hp,pg,pants).name='Sewn cargo pocket';
    const socks=garment(kn,[[-.235,.043,.043,-.004],[-.242,.044,.044,-.004],[-.26,.040,.040,-.003],[-.33,.030,.033],[-.41,.028,.032]],sock,1,.012,32); socks.name='Crew sock';
    const ankle = new THREE.Group(); ankle.position.y = -0.42; kn.add(ankle);
    // Anatomical ankle is behind the shoe centre. Keep the shoe-centre frame for
    // deck contacts; IK compensates this offset instead of sliding the soles forward.
    const an = new THREE.Group(); an.position.z = 0.078; ankle.add(an);
    // Padded heel opening wraps the sock at the anatomical ankle. The forefoot
    // remains fixed over the truck because plantFoot solves the offset in shoe space.
    const opening = mesh(an, new THREE.TorusGeometry(1, .13, 8, 32), shoe, 0, .037, -.075);
    opening.name = 'Padded heel opening'; opening.rotation.x = Math.PI / 2;
    opening.scale.set(.030, .033, .033);
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

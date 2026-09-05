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
function garment(parent, rings, material, zScale = 1) {
  const p = [], uv = [], indices = [], segments = 24;
  for (let r = 0; r < rings.length; r++) {
    const [y, rx, rz] = rings[r];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const fold = 1 + Math.sin(a * 6 + r * 0.8) * 0.023;
      p.push(Math.cos(a) * rx * fold, y, Math.sin(a) * rz * zScale * fold);
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

export function buildDetailedBody(rig) {
  const skin = mat(0xc99570, 0.78), shirt = mat(0x315f74), pants = mat(0x30383c), shoe = mat(0x242d30, 0.78);
  const sole = mat(0xd4cdb7, 0.82), cap = mat(0x9e4132), hair = mat(0x392c24), eye = mat(0x302a27, 0.5);
  const cloth = canvasMap((c, s, rng) => {
    c.fillStyle = '#b7b7b7'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { c.fillStyle = i % 4 ? '#b0b0b0' : '#c3c3c3'; c.fillRect(i, 0, 1, s); c.fillRect(0, i, s, 0.5); }
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(30,30,30,${rng() * 0.13})`; c.fillRect(rng() * s, rng() * s, 1, 1); }
  }, 256, false);
  for (const m of [shirt, pants, cap]) { m.bumpMap = cloth; m.bumpScale = 0.0018; }
  rig.hips = new THREE.Group(); rig.body.add(rig.hips);
  rounded(rig.hips, 0.34, 0.16, 0.21, pants, 0, 0.02, 0, 0.06);
  rig.torso = new THREE.Group(); rig.torso.position.y = 0.1; rig.hips.add(rig.torso);
  garment(rig.torso, [[-0.035, 0.17, 0.115], [-0.022, 0.173, 0.117], [0.02, 0.163, 0.108], [0.09, 0.165, 0.105], [0.25, 0.172, 0.112], [0.37, 0.19, 0.107], [0.43, 0.17, 0.094], [0.47, 0.065, 0.06]], shirt);
  const collar = mesh(rig.torso, new THREE.TorusGeometry(0.061, 0.01, 8, 24), shirt, 0, 0.466, 0); collar.rotation.x = Math.PI / 2;
  mesh(rig.torso, new THREE.CylinderGeometry(0.048, 0.055, 0.085, 16), skin, 0, 0.482, 0);
  const print = new THREE.MeshStandardMaterial({ roughness: 0.93, transparent: true, depthWrite: false,
    map: canvasMap((c, s) => { c.fillStyle = '#ddd6bd'; c.textAlign = 'center'; c.font = 'italic 900 170px sans-serif'; c.fillText('J2S', s / 2, s * 0.49); c.fillStyle = '#d98254'; c.fillRect(s * 0.19, s * 0.55, s * 0.62, 10); c.font = 'bold 34px sans-serif'; c.fillStyle = '#ddd6bd'; c.fillText('SKATE DIVISION', s / 2, s * 0.66); }, 512) });
  mesh(rig.torso, new THREE.PlaneGeometry(0.25, 0.23), print, 0, 0.29, 0.114);
  const backPrint = mesh(rig.torso, new THREE.PlaneGeometry(0.25, 0.23), print, 0, 0.29, -0.114); backPrint.rotation.y = Math.PI;
  rig.head = new THREE.Group(); rig.head.position.y = 0.5; rig.torso.add(rig.head);
  oval(rig.head, 0.096, 0.119, 0.105, skin, 0, 0.13, 0);
  oval(rig.head, 0.073, 0.062, 0.084, skin, 0, 0.074, 0.013);
  oval(rig.head, 0.014, 0.026, 0.019, skin, 0, 0.125, 0.102);
  for (const side of [-1, 1]) {
    oval(rig.head, 0.018, 0.028, 0.016, skin, side * 0.096, 0.123, 0);
    oval(rig.head, 0.009, 0.006, 0.005, eye, side * 0.04, 0.148, 0.096);
    rounded(rig.head, 0.028, 0.007, 0.006, hair, side * 0.041, 0.166, 0.096, 0.003);
  }
  rounded(rig.head, 0.032, 0.004, 0.004, hair, 0, 0.078, 0.093, 0.002);
  oval(rig.head, 0.101, 0.079, 0.105, hair, 0, 0.211, -0.013);
  const crown = mesh(rig.head, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.215, 0); crown.scale.set(0.111, 0.081, 0.119);
  rounded(rig.head, 0.21, 0.014, 0.17, cap, 0, 0.219, 0.105, 0.006);
  oval(rig.head, 0.009, 0.006, 0.009, cap, 0, 0.296, 0);
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.22, 0.42, 0); rig.torso.add(sh);
    garment(sh, [[0.043, 0.002, 0.002], [0.027, 0.047, 0.049], [-0.01, 0.061, 0.061], [-0.07, 0.061, 0.057], [-0.13, 0.056, 0.052], [-0.145, 0.056, 0.052]], shirt);
    oval(sh, 0.043, 0.115, 0.042, skin, 0, -0.204, 0);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    oval(el, 0.042, 0.045, 0.042, skin, 0, 0, 0);
    garment(el, [[0, 0.041, 0.041], [-0.08, 0.042, 0.038], [-0.2, 0.03, 0.029], [-0.26, 0.028, 0.027]], skin);
    rounded(el, 0.07, 0.095, 0.04, skin, 0, -0.3, 0, 0.019);
    oval(el, 0.018, 0.035, 0.018, skin, -side * 0.037, -0.287, 0.008);
    if (side < 0) mesh(el, new THREE.CylinderGeometry(0.032, 0.032, 0.029, 16), shoe, 0, -0.24, 0);
    return { sh, el };
  };
  rig.lArm = arm(1); rig.rArm = arm(-1);
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.15, 0, 0); rig.hips.add(hp);
    garment(hp, [[0.03, 0.083, 0.085], [-0.08, 0.084, 0.088], [-0.23, 0.072, 0.079], [-0.37, 0.065, 0.068], [-0.43, 0.069, 0.071]], pants);
    const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
    oval(kn, 0.066, 0.06, 0.071, pants, 0, 0, 0);
    garment(kn, [[0, 0.067, 0.069], [-0.06, 0.072, 0.071], [-0.23, 0.061, 0.063], [-0.32, 0.056, 0.06], [-0.36, 0.062, 0.064], [-0.39, 0.055, 0.056]], pants);
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

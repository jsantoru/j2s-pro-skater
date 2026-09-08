// Visual dressing only. Static details are merged by material so hundreds of pieces
// add a handful of draw calls, and never enter the skating/camera collider lists.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasMap } from './materials.js';

export function dressWarehouse(level) {
  const M = level.mats, batches = new Map(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const add = (g, mat, pos, rotation = null) => {
    q.identity(); if (rotation) q.setFromEuler(rotation);
    matrix.compose(new THREE.Vector3(...pos), q, one); g.applyMatrix4(matrix);
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(g);
  };
  const box = (w, h, d, x, y, z, mat = M.dark) => add(new THREE.BoxGeometry(w, h, d), mat, [x, y, z]);
  const bar = (a, b, radius = 0.035, mat = M.dark) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(radius, radius, dir.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    add(g, mat, A.add(B).multiplyScalar(0.5).toArray());
  };
  const flat = (w, h, x, y, z, mat, ry = 0, rx = 0) => add(new THREE.PlaneGeometry(w, h), mat, [x, y, z], new THREE.Euler(rx, ry, 0));
  const lit = new THREE.MeshBasicMaterial({ color: 0xffedcb, toneMapped: false });
  const windowMap = canvasMap((c, s, rng) => {
    const gradient = c.createLinearGradient(0, 0, 0, s);
    gradient.addColorStop(0, '#a2c5cd'); gradient.addColorStop(.65, '#d4d5bd'); gradient.addColorStop(1, '#dca56c');
    c.fillStyle = gradient; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 250; i++) {
      c.fillStyle = `rgba(55,74,71,${rng() * .10})`;
      c.fillRect(rng() * s, 0, 1 + rng() * 3, s);
    }
    c.fillStyle = '#425e6455';
    for (let x = 0; x < s; x += 42) c.fillRect(x, s * (.72 + rng() * .13), 34, s);
  }, 256);
  const glass = new THREE.MeshBasicMaterial({ map: windowMap });
  const paint = new THREE.MeshStandardMaterial({ color: 0x3c5659, roughness: 0.86 });

  // Open-web roof trusses and skylight mullions; leave the existing shadow-casting beams in charge.
  for (let x = -30; x <= 30; x += 10) {
    box(0.12, 0.14, 44, x, 7.6, 0);
    for (let z = -21; z < 21; z += 3) {
      bar([x, 7.6, z], [x, 8.65, z + 1.5], 0.047);
      bar([x, 8.65, z + 1.5], [x, 7.6, z + 3], 0.047);
      box(4, 0.04, 0.07, x + 5, 8.92, z);
    }
    box(0.06, 0.04, 40, x + 5, 8.91, 0);
    for (const z of [-13, 1, 15]) {
      bar([x, 8.5, z], [x, 7.05, z], 0.015);
      box(1.65, 0.13, 0.4, x, 7.0, z);
      flat(1.48, 0.24, x, 6.928, z, lit, 0, Math.PI / 2);
    }
  }
  for (const z of [-22.65, 22.65]) {
    bar([-35, 6.9, z], [35, 6.9, z], 0.065, M.railDark);
    bar([-35, 6.68, z], [35, 6.68, z], 0.027, M.metal);
    for (let x = -30; x <= 30; x += 12) {
      box(0.85, 0.15, 0.85, x, 0.08, z > 0 ? 22.7 : -22.7);
      box(0.75, 0.1, 0.75, x, 2.5, z > 0 ? 22.7 : -22.7, M.railDark);
    }
  }

  // Painted lower masonry, a dirty base course, and perimeter joints.
  const dado = canvasMap((c, s, rng) => {
    c.fillStyle = '#577075'; c.fillRect(0, 0, s, s);
    const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(17,22,19,0)'); g.addColorStop(1, 'rgba(17,22,19,0.65)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 7000; i++) { c.fillStyle = `rgba(168,158,133,${rng() * 0.45})`; c.fillRect(rng() * s, rng() * s, rng() * 4, rng() * 3); }
    c.fillStyle = '#d0b986'; c.fillRect(0, 0, s, 13);
  }, 512);
  dado.repeat.set(24, 1);
  const lower = new THREE.MeshStandardMaterial({ map: dado, roughness: 0.94 });
  for (const [x, z, ry, width] of [[0, -22.97, 0, 72], [0, 22.97, Math.PI, 72], [-35.97, 0, Math.PI / 2, 46], [35.97, 0, -Math.PI / 2, 46]]) {
    flat(width, 1.8, x, 0.9, z, lower, ry);
  }

  const signMaterial = (title, sub, bg = '#dbd1b5', fg = '#253e42') => new THREE.MeshStandardMaterial({
    roughness: 0.87, map: canvasMap((c, s, rng) => {
      const h = s / 4;
      c.fillStyle = bg; c.fillRect(0, 0, s, h);
      c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(16, 12, s - 32, h - 24);
      c.textAlign = 'center'; c.fillStyle = fg; c.font = '900 88px sans-serif'; c.fillText(title, s / 2, h * 0.59, s * 0.89);
      c.font = 'bold 20px sans-serif'; c.fillText(sub, s / 2, h * 0.8, s * 0.83);
      c.font = 'bold 14px sans-serif'; c.fillText('EST. 1999  /  INDEPENDENT SKATEPARK', s / 2, h * 0.22, s * 0.8);
      for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(31,28,21,${rng() * 0.16})`; c.fillRect(rng() * s, rng() * h, rng() * 6, rng() * 1.2); }
    }, 1024, true, 256),
  });
  flat(12, 3.1, 0, 5.1, -22.9, signMaterial('J2S / WAREHOUSE', 'SESSION 01     •     KEEP THE LINE ALIVE'));
  flat(8, 2.2, 0, 5.5, 22.9, signMaterial('MAKE SOME NOISE', 'NO SPECTATORS. JUST SKATERS.', '#a64735', '#e6d9b6'), Math.PI);
  flat(7, 2, -35.9, 5.7, 3, signMaterial('CONCRETE CLUB', 'FALL. GET UP. GO AGAIN.', '#d6c397', '#2d4549'), Math.PI / 2);
  flat(6, 2, 35.9, 5.5, -5, signMaterial('PUSH / REPEAT', 'J2S SKATE DIVISION', '#2e4a4e', '#dcd2b7'), -Math.PI / 2);

  // High factory windows, framed loading doors, vents and electrical service boxes.
  for (const z of [-22.86, 22.86]) for (const x of [-24, -14, 14, 24]) {
    const ry = z < 0 ? 0 : Math.PI;
    flat(6, 1.8, x, 5.4, z, glass, ry);
    for (const dx of [-3.05, -1.5, 0, 1.5, 3.05]) box(0.07, 1.96, 0.12, x + dx, 5.4, z);
    for (const dy of [-0.95, 0, 0.95]) box(6.2, 0.07, 0.12, x, 5.4 + dy, z);
  }
  for (const [x, z] of [[-24, 22.82], [24, -22.82]]) {
    box(5.6, 4.15, 0.14, x, 2.08, z, M.railDark);
    for (let y = 0.12; y < 4; y += 0.16) box(5.2, 0.032, 0.09, x, y, z + (z > 0 ? -0.1 : 0.1), M.metal);
    for (const dx of [-2.8, 2.8]) box(0.15, 4.25, 0.2, x + dx, 2.125, z, paint);
    box(5.8, 0.28, 0.32, x, 4.2, z, paint);
  }
  for (const x of [-32, 32]) {
    box(0.9, 1.4, 0.25, x, 2.1, 22.7, M.railDark);
    for (let y = 1.8; y <= 2.5; y += 0.1) box(0.65, 0.018, 0.04, x, y, 22.55, M.metal);
    bar([x, 2.8, 22.7], [x, 6.6, 22.7], 0.024, M.metal);
  }

  // High maintenance gallery: a strong silhouette above the north wall, with
  // open steel grating, triangular brackets and a continuous ochre handrail.
  // Entirely above the perimeter decks; no props placed in approach lanes.
  const safety = new THREE.MeshStandardMaterial({ color: 0xb2834c, metalness: .55, roughness: .57 });
  box(66, .16, 1.0, 0, 6.65, -22.25, M.railDark);
  for (let x = -32; x <= 32; x += 2) {
    bar([x, 6.7, -21.75], [x, 7.6, -21.75], .023, safety);
    bar([x, 6.6, -21.75], [x, 6.0, -22.86], .042, M.railDark);
  }
  for (const y of [7.15, 7.6]) bar([-33, y, -21.75], [33, y, -21.75], .024, safety);
  box(66, .16, .04, 0, 6.82, -21.75, safety);
  for (const x of [-28, 28]) {
    for (const dx of [-.26, .26]) bar([x + dx, 4.8, -22.7], [x + dx, 7.4, -22.7], .023, M.metal);
    for (let y = 4.9; y < 7.4; y += .27) bar([x - .26, y, -22.7], [x + .26, y, -22.7], .017, M.metal);
  }

  // Service-bay practicals and original wall graphics make opposite sides of
  // the park recognisable immediately from the follow camera.
  const bayInk = new THREE.MeshStandardMaterial({
    roughness: .9, transparent: true, depthWrite: false,
    map: canvasMap((c, s, rng) => {
      c.fillStyle = '#deb778'; c.font = '900 760px Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('01', s / 2, s * .77, s * .88);
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 3000; i++) c.clearRect(rng() * s, rng() * s, 1 + rng() * 9, 1 + rng() * 2);
    }, 1024),
  });
  flat(5, 4.0, 35.89, 4.3, 9, bayInk, -Math.PI / 2);
  flat(4.5, 3.7, -35.89, 4.5, -13, bayInk, Math.PI / 2);
  for (const [x, z] of [[-24, 22.6], [24, -22.6]]) {
    box(5.5, .15, .55, x, 4.5, z, M.dark);
    flat(4.8, .16, x, 4.412, z, lit, 0, Math.PI / 2);
    flat(4.8, .7, x, 4.95, z, signMaterial('LOADING / 01', 'KEEP THE APPROACH CLEAR', '#b4804d', '#1d3236'), z > 0 ? Math.PI : 0);
  }

  // A welded ventilation run, flange seams and mounts under the east eaves.
  for (let z = -18; z <= 18; z += 6) {
    const duct = new THREE.CylinderGeometry(.27, .27, 5.96, 16);
    add(duct, M.railDark, [35.4, 7.15, z], new THREE.Euler(Math.PI / 2, 0, 0));
    add(new THREE.TorusGeometry(.275, .025, 6, 20), M.metal, [35.4, 7.15, z - 3]);
    box(.6, .08, .10, 35.6, 6.8, z, M.dark);
  }

  // Stacked flyposters at human scale near the two service doors.
  const poster = (title, subtitle, color) => new THREE.MeshStandardMaterial({ roughness: .98,
    map: canvasMap((c, s, rng) => {
      c.fillStyle = color; c.fillRect(0, 0, s, s);
      c.strokeStyle = '#e6dac2'; c.lineWidth = 5; c.strokeRect(20, 20, s - 40, s - 40);
      c.fillStyle = '#e6dac2'; c.font = '900 96px Impact, sans-serif'; c.textAlign = 'center';
      c.fillText(title, s / 2, s * .4, s * .86);
      c.font = 'bold 24px sans-serif'; c.fillText(subtitle, s / 2, s * .53, s * .84);
      c.font = '900 140px Impact, sans-serif'; c.fillText('J2S', s / 2, s * .83);
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(12,24,26,${rng() * .22})`; c.fillRect(rng() * s, rng() * s, rng() * 8, rng() * 2); }
    }, 512),
  });
  for (const [x, z, ry] of [[-19.6, 22.82, Math.PI], [19.6, -22.82, 0]]) {
    flat(.8, 1.12, x, 1.8, z, poster('NIGHT JAM', 'FRIDAY / OPEN SESSION', '#8a493b'), ry);
    flat(.65, .88, x + 1, 2.0, z, poster('NO LIMIT', 'LOCAL CREW / ALL WELCOME', '#375b5c'), ry);
  }

  // Wall mural: layered original lettering and skate marks, built into one transparent decal.
  const mural = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 1,
    map: canvasMap((c, s, rng) => {
      c.save(); c.translate(s / 2, s / 2); c.rotate(-0.08); c.textAlign = 'center';
      c.font = 'italic 900 238px sans-serif'; c.lineJoin = 'round'; c.lineWidth = 24; c.strokeStyle = '#28383a'; c.strokeText('STAY', -20, -30); c.strokeText('ROLLING', 0, 190, s * 0.92);
      c.lineWidth = 5; c.strokeStyle = '#dcbd83'; c.strokeText('STAY', -20, -30); c.strokeText('ROLLING', 0, 190, s * 0.92);
      c.fillStyle = '#c97545'; c.fillText('STAY', -20, -30); c.fillStyle = '#9daf9e'; c.fillText('ROLLING', 0, 190, s * 0.92);
      c.restore(); c.fillStyle = '#b66a43';
      for (let i = 0; i < 28; i++) { c.beginPath(); c.arc(rng() * s, s * 0.15 + rng() * s * 0.7, rng() * 4 + 1, 0, 7); c.fill(); }
    }, 1024) });
  flat(10, 3.2, -15, 2.8, 22.92, mural, Math.PI);
  flat(8, 2.8, 15, 2.3, -22.92, mural);

  // Scuffed lane paint and wheel tracks, in one transparent ground decal.
  const groundMap = canvasMap((c, s, rng) => {
    c.scale(s / 72, s / 46); c.translate(36, 23);
    c.strokeStyle = '#bda76d'; c.lineWidth = 0.055;
    for (const [x, z, w, d] of [[-14, 4, 12, 4.2], [10.2, 12, 10, 5.2], [20, -2, 3, 10]]) c.strokeRect(x - w / 2, z - d / 2, w, d);
    c.fillStyle = '#bbaa80'; c.font = 'bold 0.48px sans-serif'; c.fillText('01 / STREET', -9, 8.5); c.fillText('02 / TRANSITION', -8, -5.5); c.fillText('KEEP CLEAR', 23, 5.5);
    c.save(); c.translate(-4, 15); c.rotate(-Math.PI / 2); c.textAlign = 'center';
    c.font = 'italic 900 2px sans-serif'; c.fillStyle = 'rgba(218,209,178,0.55)'; c.fillText('J2S', 0, 0); c.font = 'bold 0.25px sans-serif'; c.fillText('WAREHOUSE / SKATE DIVISION', 0, 0.6); c.restore();
    for (let i = 0; i < 160; i++) {
      const x = rng() * 60 - 30, z = rng() * 38 - 19;
      c.strokeStyle = `rgba(40,37,30,${0.025 + rng() * 0.08})`; c.lineWidth = 0.012 + rng() * 0.023;
      c.beginPath(); c.ellipse(x, z, 0.7 + rng() * 2, 1.5 + rng() * 3, rng() * 6, 0, rng() * 1.6); c.stroke();
    }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 13000; i++) c.clearRect(rng() * 72 - 36, rng() * 46 - 23, 0.03 + rng() * 0.09, 0.01 + rng() * 0.025);
  }, 2048);
  level.floor.userData.paintMap = groundMap;

  // Rail shoes and sleeves, worn ledge edges, barrel hoops and crate framing.
  for (const rail of level.rails) if (rail.kind === 'rail') {
    const n = Math.max(2, Math.round(rail.len / 2));
    for (let i = 0; i < n; i++) {
      const p = rail.a.clone().lerp(rail.b, (i + 0.5) / n);
      box(0.19, 0.018, 0.19, p.x, 0.012, p.z, M.railDark);
      for (const dx of [-0.063, 0.063]) for (const dz of [-0.063, 0.063]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), M.metal, [p.x + dx, 0.027, p.z + dz]);
    }
  }
  for (const [x, z] of [[-33, -19], [-32, -20.2], [33, 20], [32, 21.2]]) {
    for (const y of [0.07, 0.34, 0.76, 1.07]) add(new THREE.TorusGeometry(0.451, 0.014, 6, 24), M.railDark, [x, y, z], new THREE.Euler(Math.PI / 2, 0, 0));
    add(new THREE.CylinderGeometry(0.426, 0.426, 0.014, 24), M.railDark, [x, 1.106, z]);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.019, 12), M.metal, [x + 0.2, 1.12, z]);
  }
  for (const [x, y, z, size] of [[30, 1, -20, 2], [30.2, 2.7, -20, 1.4]]) {
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(0.07, size, 0.07, x + dx * size / 2, y, z + dz * size / 2, M.railDark);
    for (const dy of [-1, 1]) { box(size + 0.08, 0.065, size + 0.08, x, y + dy * (size / 2 - 0.03), z, M.railDark); }
  }
  // Commit static batches, including opaque and transparent parts separately by material.
  const dressing = new THREE.Group(); dressing.name = 'Warehouse visual details';
  for (const [material, geometries] of batches) {
    const combined = mergeGeometries(geometries, false);
    const m = new THREE.Mesh(combined, material); m.receiveShadow = true;
    // Existing structural meshes already supply the shadows. Avoid a second shadow pass for tiny dressing.
    m.castShadow = false; dressing.add(m); geometries.forEach(g => g.dispose());
  }
  level.group.add(dressing);
}

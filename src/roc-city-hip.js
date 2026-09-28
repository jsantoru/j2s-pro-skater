import * as THREE from 'three';
import { surfaceUV } from './materials.js';

const FRONT_STEPS = 36;
const AF_PROFILE = [[-3, 0], [.2, 1.55], [1.2, 1.55], [5.6, 0]];

function peak(z) {
  if (z < .2) return THREE.MathUtils.clamp((z + 3) / 3.2, 0, 1);
  if (z <= 1.2) return 1;
  return THREE.MathUtils.clamp((5.6 - z) / 4.4, 0, 1);
}

/** H is one connected surface: quarter face, narrow crest, and back A-frame. */
export function buildRocCityHip(level) {
  const stations = [];
  for (let span = 0; span < AF_PROFILE.length - 1; span++) {
    const a = AF_PROFILE[span][0], b = AF_PROFILE[span + 1][0], count = Math.ceil((b - a) / .2);
    for (let i = 0; i < count; i++) stations.push(THREE.MathUtils.lerp(a, b, i / count));
  }
  stations.push(AF_PROFILE.at(-1)[0]);
  const rows = [], positions = [], indices = [], crest = [];
  for (const z of stations) {
    const p = peak(z), height = 1.12 + .43 * p, crestX = 12.7 - .75 * p, toeX = crestX - 3.2;
    const row = [];
    for (let i = 0; i <= FRONT_STEPS; i++) {
      const angle = i / FRONT_STEPS * Math.PI / 2;
      row.push(new THREE.Vector3(toeX + 3.2 * Math.sin(angle), height * (1 - Math.cos(angle)), z));
    }
    crest.push(row.at(-1).clone());
    row.push(new THREE.Vector3(crestX + .3, height, z));
    // A broad continuous blend joins the crest to the narrow rail runway.
    // Its endpoints share vertices, so no quarter or bank side cuts the hip.
    row.push(new THREE.Vector3(14, 1.55 * p, z));
    row.push(new THREE.Vector3(14.6, 1.55 * p, z));
    rows.push(row);
    for (const point of row) positions.push(...point);
  }
  const width = rows[0].length;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < width - 1; i++) {
    const a = j * width + i, b = a + 1, c = a + width, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  // Close only the exposed perimeter; the interior has no overlapping faces.
  const edge = (a, b) => {
    if (a.y < 1e-8 && b.y < 1e-8) return;
    const base = positions.length / 3;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, 0, b.z, a.x, 0, a.z);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < width - 1; i++) {
    edge(rows[0][i], rows[0][i + 1]);
    edge(rows.at(-1)[i + 1], rows.at(-1)[i]);
  }
  for (let j = 0; j < rows.length - 1; j++) edge(rows[j].at(-1), rows[j + 1].at(-1));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); surfaceUV(geometry, 3);
  const mesh = level.add(new THREE.Mesh(geometry, level.mats.concrete));
  mesh.name = 'H — Continuous quarter-pipe hip and A-frame';
  mesh.userData = { feature: 'H', surfaceVertices: rows.length * width, stations, frontSteps: FRONT_STEPS, rowWidth: width };

  const frontCoping = [];
  for (let i = 0; i < crest.length - 1; i++) {
    const rail = level.addRail(crest[i], crest[i + 1], 'coping', { color: level.mats.rocYellow, radius: .045 });
    rail.feature = 'H'; frontCoping.push(rail);
  }
  level.linkRails(frontCoping);
  const backRail = [];
  for (let i = 0; i < AF_PROFILE.length - 1; i++) {
    const [az, ay] = AF_PROFILE[i], [bz, by] = AF_PROFILE[i + 1];
    const rail = level.addRail(new THREE.Vector3(14.2, ay + .72, az), new THREE.Vector3(14.2, by + .72, bz), 'rail');
    rail.feature = 'H'; backRail.push(rail);
  }
  level.linkRails(backRail);
  for (const z of [-2.5, .2, 1.2, 5.1]) {
    const y = 1.55 * peak(z);
    level.beam(new THREE.Vector3(14.2, y, z), new THREE.Vector3(14.2, y + .72, z), .028, level.mats.rocYellow);
  }
  // A separate low ledge sits beside the approach, outside the quarter's toe.
  const ledge = level.ledge(7, .34, .42, 8.35, 0, .7, { rotation: Math.PI / 2, color: level.mats.rocYellow });
  ledge.userData.feature = 'H';
  for (const rail of ledge.railEdges) rail.feature = 'H';
  return { mesh, frontCoping, backRail, ledge };
}

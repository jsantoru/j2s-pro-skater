import * as THREE from 'three';

// The map establishes the west-side route, but not surveyed grades. Keep one
// ribbon definition for the rendered trail and its physical support.
export function trailPoints(layout, segments = 120) {
  return new THREE.CatmullRomCurve3(layout.trail.map(([x, z]) => new THREE.Vector3(x, layout.trailY ?? .005, z)))
    .getPoints(segments);
}

function trailEdges(layout) {
  const points = trailPoints(layout), half = (layout.trailWidth ?? 3.2) / 2;
  return points.map((point, i) => {
    const direction = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]);
    const length = Math.hypot(direction.x, direction.z);
    const dx = -direction.z / length * half, dz = direction.x / length * half;
    return [new THREE.Vector3(point.x + dx, point.y, point.z + dz), new THREE.Vector3(point.x - dx, point.y, point.z - dz)];
  });
}

export function createTrailGeometry(layout) {
  const edges = trailEdges(layout), positions = [], uv = [], indices = [];
  for (const edge of edges) for (const point of edge) {
    positions.push(point.x, point.y, point.z); uv.push(point.x / 5, point.z / 5);
  }
  for (let i = 0; i < edges.length - 1; i++) {
    const a = i * 2; indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createTrailFoundationGeometry(layout) {
  const edges = trailEdges(layout), positions = [], indices = [], uv = [];
  const bottom = point => point.z >= 24 ? (layout.bridge?.floorY ?? -.9) - .06 : -.06;
  const quad = (a, b, c, d) => {
    const start = positions.length / 3;
    for (const point of [a, b, c, d]) { positions.push(point.x, point.y, point.z); uv.push(point.x / 3, point.y / 3 + point.z / 3); }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (let i = 0; i < edges.length - 1; i++) for (const side of [0, 1]) {
    const a = edges[i][side], b = edges[i + 1][side], c = b.clone().setY(bottom(b)), d = a.clone().setY(bottom(a));
    if (side === 0) quad(a, d, c, b); else quad(a, b, c, d);
  }
  const first = edges[0], last = edges[edges.length - 1];
  quad(first[0], first[1], first[1].clone().setY(bottom(first[1])), first[0].clone().setY(bottom(first[0])));
  quad(last[1], last[0], last[0].clone().setY(bottom(last[0])), last[1].clone().setY(bottom(last[1])));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

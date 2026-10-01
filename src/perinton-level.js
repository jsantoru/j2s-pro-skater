// Perinton's riding surfaces are built once and shared by rendering and physics.
// Distances are metres; the real park is not stretched to ROC City's play scale.
import * as THREE from 'three';
import { makeMaterials, surfaceUV } from './materials.js';
import { PERINTON_LAYOUT } from './perinton-layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = p => new THREE.Vector3(...p);
const smooth = t => t * t * (3 - 2 * t);
const clamp = THREE.MathUtils.clamp;

function geometry(positions, indices) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setIndex(indices); result.computeVertexNormals(); surfaceUV(result, 3);
  return result;
}

export function perintonPolygon(outline, holes = [], height = 0) {
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(...p)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
  const result = new THREE.ShapeGeometry(shape);
  const p = result.attributes.position, index = result.index.array;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), height, p.getY(i));
  for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  result.computeVertexNormals(); surfaceUV(result, 3); return result;
}

// Subtract a partly intersecting outline without passing overlapping holes to
// ShapeGeometry. The strip boundaries include every crossing, so each interval
// has an unambiguous inside/outside order and the shared edge remains exact.
function polygonDifference(outline, cutout, height = 0) {
  const polygons = [outline, cutout], edges = [], stations = [];
  polygons.forEach((polygon, owner) => polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]; stations.push(a[0]);
    if (Math.abs(b[0] - a[0]) > 1e-9) edges.push({ a, b, owner, z: x => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) });
  }));
  for (const a of edges.filter(e => e.owner === 0)) for (const b of edges.filter(e => e.owner === 1)) {
    const dx = a.b[0] - a.a[0], dz = a.b[1] - a.a[1], ex = b.b[0] - b.a[0], ez = b.b[1] - b.a[1], denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const ox = b.a[0] - a.a[0], oz = b.a[1] - a.a[1], t = (ox * ez - oz * ex) / denominator, u = (ox * dz - oz * dx) / denominator;
    if (t > 0 && t < 1 && u > 0 && u < 1) stations.push(a.a[0] + t * dx);
  }
  const xs = [...new Set(stations.map(x => Math.round(x * 1e7) / 1e7))].sort((a, b) => a - b), positions = [], indices = [];
  const triangle = (a, b, c) => {
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) return;
    const n = positions.length / 3; positions.push(a[0], height, a[1], b[0], height, b[1], c[0], height, c[1]); indices.push(n, n + 1, n + 2);
  };
  const strip = (x0, x1, low, high) => {
    triangle([x0, low.z(x0)], [x0, high.z(x0)], [x1, low.z(x1)]);
    triangle([x1, low.z(x1)], [x0, high.z(x0)], [x1, high.z(x1)]);
  };
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1], x1 = xs[i], mid = (x0 + x1) / 2;
    const boundaries = [0, 1].map(owner => edges.filter(e => e.owner === owner && mid > Math.min(e.a[0], e.b[0]) && mid < Math.max(e.a[0], e.b[0])).sort((a, b) => a.z(mid) - b.z(mid)));
    for (let j = 0; j + 1 < boundaries[0].length; j += 2) {
      let low = boundaries[0][j]; const high = boundaries[0][j + 1];
      for (let k = 0; k + 1 < boundaries[1].length; k += 2) {
        const a = boundaries[1][k], b = boundaries[1][k + 1];
        if (b.z(mid) <= low.z(mid)) continue;
        if (a.z(mid) >= high.z(mid)) break;
        if (a.z(mid) > low.z(mid)) strip(x0, x1, low, a);
        if (b.z(mid) > low.z(mid)) low = b;
        if (low.z(mid) >= high.z(mid)) break;
      }
      if (high.z(mid) > low.z(mid) + 1e-9) strip(x0, x1, low, high);
    }
  }
  return geometry(positions, indices);
}

function samplePath(points, segments = 120, closed = true) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => V([x, 0, z])), closed, 'centripetal').getSpacedPoints(segments).slice(0, closed ? -1 : undefined).map(p => [p.x, p.z]);
}

function distanceToBoundary(outline, x, z) {
  let distance = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return distance;
}

// Fine, clipped cells keep a shaped bowl's flat bottom and two unequal lobes.
// There is no radial fan, hidden plane across the opening, or doubled floor.
function clippedHeightField(outline, heightAt, cell = .24) {
  const positions = [], indices = [], vertices = new Map();
  const minX = Math.min(...outline.map(p => p[0])), maxX = Math.max(...outline.map(p => p[0]));
  const minZ = Math.min(...outline.map(p => p[1])), maxZ = Math.max(...outline.map(p => p[1]));
  const vertex = p => {
    const key = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
    if (vertices.has(key)) return vertices.get(key);
    const index = positions.length / 3;
    positions.push(p[0], heightAt(p[0], p[1]), p[1]); vertices.set(key, index); return index;
  };
  const clip = (polygon, axis, bound, greater) => {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const ia = greater ? a[axis] >= bound - 1e-9 : a[axis] <= bound + 1e-9;
      const ib = greater ? b[axis] >= bound - 1e-9 : b[axis] <= bound + 1e-9;
      if (ia) result.push(a);
      if (ia !== ib) { const t = (bound - a[axis]) / (b[axis] - a[axis]); result.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)]); }
    }
    return result;
  };
  for (let z = minZ; z < maxZ; z += cell) for (let x = minX; x < maxX; x += cell) {
    let polygon = clip(outline, 0, x, true); if (polygon.length < 3) continue;
    polygon = clip(polygon, 0, x + cell, false); polygon = clip(polygon, 1, z, true); polygon = clip(polygon, 1, z + cell, false);
    polygon = polygon.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-7);
    if (polygon.length > 2 && Math.hypot(polygon[0][0] - polygon.at(-1)[0], polygon[0][1] - polygon.at(-1)[1]) < 1e-7) polygon.pop();
    for (let i = polygon.length - 1; i >= 0 && polygon.length > 3; i--) {
      const a = polygon[(i + polygon.length - 1) % polygon.length], b = polygon[i], c = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (length && Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / length < 1e-5) polygon.splice(i, 1);
    }
    if (polygon.length < 3) continue;
    const local = polygon.map(vertex);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(...p)), [])) {
      const pa = polygon[a], pb = polygon[b], pc = polygon[c];
      if (Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) > 1e-9) indices.push(local[a], local[c], local[b]);
    }
  }
  return geometry(positions, indices);
}

// Resolve the steep rim by its curvature instead of the accident of where a
// square grid meets the coping. The analytic profile remains unchanged. The
// interior keeps coarse cells, and the final strip reuses its boundary indices
// so there are no independently interpolated edges or cracks between surfaces.
function bowlHeightField(outline, heightAt) {
  const count = outline.length, width = .24;
  const area = outline.reduce((sum, a, i) => { const b = outline[(i + 1) % count]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  const sign = area > 0 ? 1 : -1;
  const inset = outline.map((p, i) => {
    const a = outline[(i + count - 1) % count], b = outline[(i + 1) % count];
    const u = new THREE.Vector2(p[0] - a[0], p[1] - a[1]).normalize(), v = new THREE.Vector2(b[0] - p[0], b[1] - p[1]).normalize();
    return [p[0] - (u.y + v.y) * sign * width / (1 + u.dot(v)), p[1] + (u.x + v.x) * sign * width / (1 + u.dot(v))];
  });
  const interior = clippedHeightField(inset, heightAt), positions = [...interior.attributes.position.array], indices = [...interior.index.array], edges = new Map();
  for (let i = 0; i < indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = indices[i + j], b = indices[i + (j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
    const edge = edges.get(key); if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
  }
  const boundaryIndices = new Set();
  for (const edge of edges.values()) if (edge.count === 1) { boundaryIndices.add(edge.a); boundaryIndices.add(edge.b); }
  const boundary = [...boundaryIndices].map(index => {
    const x = positions[index * 3], z = positions[index * 3 + 2]; let closest = Infinity, segment = 0, fraction = 0;
    for (let i = 0; i < count; i++) {
      const a = inset[i], b = inset[(i + 1) % count], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
      const distance = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
      if (distance < closest) { closest = distance; segment = i; fraction = t; }
    }
    const a = outline[segment], b = outline[(segment + 1) % count];
    return { index, order: (segment + fraction) % count, outer: [THREE.MathUtils.lerp(a[0], b[0], fraction), THREE.MathUtils.lerp(a[1], b[1], fraction)], inner: [x, z] };
  }).sort((a, b) => a.order - b.order);
  // Millimetre spacing at the nearly vertical lip resolves its tangent; rows
  // spread out toward the .24 m interior where the same curve is much flatter.
  // Uniform XZ cells otherwise launch from arbitrary shallow rim facets.
  const rows = [0, .002, .008, .018, .032, .05, .075, .1, .15].map(distance => boundary.map(point => {
    const x = THREE.MathUtils.lerp(point.outer[0], point.inner[0], distance / width), z = THREE.MathUtils.lerp(point.outer[1], point.inner[1], distance / width);
    const index = positions.length / 3; positions.push(x, heightAt(x, z), z); return index;
  }));
  rows.push(boundary.map(point => point.index));
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < boundary.length; i++) {
    const next = (i + 1) % boundary.length, a = rows[j][i], b = rows[j][next], c = rows[j + 1][i], d = rows[j + 1][next];
    if (sign > 0) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
  }
  interior.dispose(); return geometry(positions, indices);
}

function gridSurface(rows) {
  const positions = rows.flatMap(row => row.flat()), indices = [], width = rows[0].length;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < width - 1; i++) {
    const a = j * width + i, b = a + 1, c = a + width, d = c + 1;
    // Force upward winding even when the authored strip runs in reverse.
    const pa = V(positions.slice(a * 3, a * 3 + 3)), pb = V(positions.slice(b * 3, b * 3 + 3)), pc = V(positions.slice(c * 3, c * 3 + 3));
    if (pb.sub(pa).cross(pc.sub(pa)).y > 0) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
  return geometry(positions, indices);
}

function perimeterSkirt(outline, top, bottom) {
  const positions = [], indices = [];
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % outline.length]; return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], n = positions.length / 3;
    positions.push(a[0], top, a[1], b[0], top, b[1], b[0], bottom, b[1], a[0], bottom, a[1]);
    indices.push(...(area > 0 ? [n,n+1,n+2,n,n+2,n+3] : [n,n+2,n+1,n,n+3,n+2]));
  }
  return geometry(positions, indices);
}

export class PerintonLevel {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'Perinton Skatepark';
    this.colliders = []; this.rails = []; this.mats = makeMaterials();
    this.layout = this.designLayout = PERINTON_LAYOUT;
    this.horizontalScale = 1; this.worldScale = Object.freeze({ x: 1, y: 1, z: 1 });
    this.bounds = this.layout.bounds; this.features = this.layout.features;
    this.mats.concrete.color.set(0xd7d6ce); this.mats.floor.color.set(0xd7d6ce);
    this.mats.tan = new THREE.MeshStandardMaterial({ color: 0xd4b894, roughness: .85 });
    this.mats.blendedConcrete = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .85 });
    this.mats.centralConcrete = this.mats.blendedConcrete.clone();
    // The scan shader evaluates this deck/wall colour boundary per fragment.
    // Vertex colours remain a graceful untextured fallback, but a narrow pour
    // boundary crossing the curved lip must not reveal the rectangular grid.
    this.mats.centralConcrete.userData.perintonCentralHeight = this.layout.centralTransition.height;
    this.mats.turf = new THREE.MeshStandardMaterial({ color: 0x42642f, roughness: .97 });
    this.spawn = { pos: V(this.layout.spawn.position), heading: V(this.layout.spawn.heading) };
    this.bailFloorY = -3.5; this.horizontalRailCapture = true;
    this.menuCamera = { position: [-31, 27, 37], target: [0, -.3, -1], fov: 59 };
    this.build(); this.group.updateMatrixWorld(true);
  }

  add(mesh, collide = true, shadow = true) {
    mesh.castShadow = shadow; mesh.receiveShadow = true; this.group.add(mesh);
    mesh.updateMatrixWorld(true); if (collide) this.colliders.push(mesh); return mesh;
  }

  isTransitionLip(position) {
    // Scope the existing steep-to-flat momentum rule to actual coping seams.
    // No special pumping, gravity or ollie constants belong to this park.
    for (const rail of this.rails) {
      if (rail.kind !== 'coping' || Math.abs(position.y - rail.a.y) > .19) continue;
      const dx = rail.b.x - rail.a.x, dz = rail.b.z - rail.a.z, length = dx * dx + dz * dz;
      const t = clamp(((position.x - rail.a.x) * dx + (position.z - rail.a.z) * dz) / length, 0, 1);
      if (Math.hypot(position.x - rail.a.x - dx * t, position.z - rail.a.z - dz * t) < .15) return true;
    }
    return false;
  }

  box(w, h, d, x, y, z, material = this.mats.concrete, { rotation = 0, collide = true } = {}) {
    const mesh = new THREE.Mesh(surfaceUV(new THREE.BoxGeometry(w, h, d), 3), material);
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; return this.add(mesh, collide);
  }

  profile(points, width, x, y, z, rotation = 0, material = this.mats.tan) {
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -width / 2); surfaceUV(g, 3);
    const mesh = new THREE.Mesh(g, material); mesh.position.set(x, y, z); mesh.rotation.y = rotation;
    return this.add(mesh);
  }

  beam(a, b, radius = .035, material = this.mats.rail) {
    const dir = b.clone().sub(a), length = dir.length(); if (length < .001) return null;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    mesh.position.copy(a).lerp(b, .5); mesh.quaternion.setFromUnitVectors(UP, dir.normalize()); return this.add(mesh, false);
  }

  addRail(a, b, kind = 'rail', { feature = '', visual = true, radius = kind === 'coping' ? .04 : .033, posts = false, floor = 0 } = {}) {
    const dir = b.clone().sub(a), len = dir.length(); if (len < .001) return null;
    const rail = { a: a.clone(), b: b.clone(), dir: dir.normalize(), len, kind, feature, radius: kind === 'ledge' ? 0 : radius, surface: kind === 'ledge' ? 'flat' : 'round', visuals: [] };
    this.rails.push(rail);
    if (visual) rail.visuals.push(this.beam(a, b, radius));
    if (posts) for (const t of [.12, .88]) { const p = a.clone().lerp(b, t); this.beam(V([p.x, typeof floor === 'function' ? floor(t) : floor, p.z]), p, .023); }
    return rail;
  }

  linkRails(rails, closed = false) {
    for (let i = 0; i < rails.length - (closed ? 0 : 1); i++) {
      const rail = rails[i], next = rails[(i + 1) % rails.length]; rail.bLink = { rail: next, dir: 1 }; next.aLink = { rail, dir: -1 };
    }
  }

  quarter(radius, width, x, y, z, rotation = 0, { deck = 1, feature = 'quarter', height = radius, curveHeight = height } = {}) {
    const points = [[0, 0]];
    for (let i = 1; i <= 40; i++) { const angle = i / 40 * Math.PI / 2; points.push([radius * Math.sin(angle), curveHeight * (1 - Math.cos(angle))]); }
    if (height > curveHeight) points.push([radius, height]);
    points.push([radius + deck, height], [radius + deck, 0]);
    const mesh = this.profile(points, width, x, y, z, rotation); mesh.name = `${feature} — quarter transition`; mesh.userData.feature = feature;
    const a = V([radius, height + .012, -width / 2]).applyMatrix4(mesh.matrixWorld), b = V([radius, height + .012, width / 2]).applyMatrix4(mesh.matrixWorld);
    const rail = this.addRail(a, b, 'coping', { feature, radius: .038 });
    const deckMesh = this.add(new THREE.Mesh(perintonPolygon([[radius, -width / 2], [radius + deck, -width / 2], [radius + deck, width / 2], [radius, width / 2]], [], height + .002), this.mats.concrete), false, false);
    deckMesh.position.copy(mesh.position); deckMesh.quaternion.copy(mesh.quaternion); deckMesh.name = `${feature} — gray deck`;
    (this.transitions ??= []).push({ mesh, rail, radius, height, width }); return mesh;
  }

  ledge(w, h, d, x, y, z, { rotation = 0, feature = 'ledge', top = this.mats.tan } = {}) {
    const mesh = this.box(w, h, d, x, y + h / 2, z, this.mats.concrete, { rotation });
    mesh.name = `${feature} — concrete ledge`; mesh.userData = { feature, solidBoundary: true }; mesh.railEdges = [];
    const cap = this.box(w, .006, d, x, y + h + .003, z, top, { rotation, collide: false }); cap.name = `${feature} — ledge cap`;
    for (const side of [-1, 1]) {
      const a = V([-w / 2, h / 2 + .006, side * d / 2]).applyMatrix4(mesh.matrixWorld), b = V([w / 2, h / 2 + .006, side * d / 2]).applyMatrix4(mesh.matrixWorld);
      const rail = this.addRail(a, b, 'ledge', { feature, visual: false }); rail.visuals = [cap]; mesh.railEdges.push(rail);
      const metal = this.box(w, .045, .035, 0, 0, 0, this.mats.rail, { rotation, collide: false });
      metal.position.copy(a).lerp(b, .5).add(V([0, -.022, 0])); metal.name = `${feature} — steel edge`;
    }
    return mesh;
  }

  stairSet(spec) {
    const { start, direction, width, count, rise, treads, feature = 'stairs' } = spec;
    const height = count * rise, run = treads.reduce((sum, value) => sum + value, 0), angle = -Math.atan2(direction[1], direction[0]);
    const points = [[0, height]];
    let along = 0;
    for (let i = 0; i < count; i++) {
      const y = Math.max(0, height - (i + 1) * rise); points.push([along, y]);
      if (i < count - 1) { along += treads[i]; points.push([along, y]); }
    }
    points.push([0, 0]);
    const mesh = this.profile(points, width, ...start, angle); mesh.name = `${feature} — four risers and central landing`; mesh.userData = { feature, count, rise, treads, run };
    const local = (x, y, z) => V([x, y, z]).applyMatrix4(mesh.matrixWorld);
    const rails = [];
    for (const side of [-1, 1]) {
      const rail = this.addRail(local(-.2, height + .72, side * width / 2), local(run + .25, .72, side * width / 2), 'rail', { feature }); rails.push(rail);
      for (const t of [.1, .9]) { const p = rail.a.clone().lerp(rail.b, t); this.beam(V([p.x, start[1] + height * (1 - t), p.z]), p, .023); }
    }
    return { mesh, rails, top: local(0, height, 0), bottom: local(run, 0, 0) };
  }

  seal(surface, floor = -.04) {
    const p = surface.geometry.attributes.position, idx = surface.geometry.index, edges = new Map();
    const key = i => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    for (let i = 0; i < idx.count; i += 3) for (const [a, b] of [[idx.getX(i), idx.getX(i + 1)], [idx.getX(i + 1), idx.getX(i + 2)], [idx.getX(i + 2), idx.getX(i)]]) {
      const ka = key(a), kb = key(b), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (edges.has(k)) edges.get(k).count++; else edges.set(k, { a, b, count: 1 });
    }
    const positions = [], indices = [];
    for (const { a, b, count } of edges.values()) if (count === 1 && Math.max(p.getY(a), p.getY(b)) > floor + .002) {
      const n = positions.length / 3;
      positions.push(p.getX(a), p.getY(a), p.getZ(a), p.getX(a), floor, p.getZ(a), p.getX(b), floor, p.getZ(b), p.getX(b), p.getY(b), p.getZ(b));
      indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const wall = this.add(new THREE.Mesh(geometry(positions, indices), this.mats.concrete));
    wall.name = `${surface.name} — solid perimeter`; wall.userData = { ...surface.userData, part: 'solid-perimeter', solidBoundary: true }; return wall;
  }

  buildBowl() {
    const spec = this.layout.bowl;
    this.bowlOutline = samplePath(spec.outline, 176);
    this.bowlDeckOutline = samplePath(spec.deck, 176);
    const depthAt = x => THREE.MathUtils.lerp(spec.deep, spec.shallow, smooth(clamp((x - spec.blend[0]) / (spec.blend[1] - spec.blend[0]), 0, 1)));
    this.bowlHeightAt = (x, z) => {
      const depth = depthAt(x), width = THREE.MathUtils.lerp(2.05, 1.65, (spec.deep - depth) / (spec.deep - spec.shallow));
      const t = clamp(distanceToBoundary(this.bowlOutline, x, z) / width, 0, 1);
      return spec.rimY - depth * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
    };
    const g = bowlHeightField(this.bowlOutline, this.bowlHeightAt), p = g.attributes.position;
    // One continuous surface, tan walls and a gray poured floor, as built.
    // Interpolate the pour colour through the same vertices instead of choosing
    // whole triangles: a sloping floor must not acquire a saw-toothed paint edge.
    const colors = [], color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const floor = spec.rimY - depthAt(p.getX(i));
      const blend = smooth(clamp((p.getY(i) - floor - .005) / .16, 0, 1));
      color.copy(this.mats.concrete.color).lerp(this.mats.tan.color, blend); colors.push(color.r, color.g, color.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.bowl = this.add(new THREE.Mesh(g, this.mats.blendedConcrete), true, false);
    this.bowl.name = 'Bowl — connected deep and shallow pockets'; this.bowl.userData = { feature: 'bowl', rimY: spec.rimY, deep: spec.deep, shallow: spec.shallow };
    this.bowlDeck = this.add(new THREE.Mesh(perintonPolygon(this.bowlDeckOutline, [this.bowlOutline], spec.rimY), this.mats.concrete), true, false);
    this.bowlDeck.name = 'Bowl — continuous white deck surround';
    this.bowlCoping = [];
    const coping = new THREE.InstancedMesh(new THREE.CylinderGeometry(.038, .038, 1, 8), this.mats.rail, this.bowlOutline.length);
    const transform = new THREE.Object3D(); coping.name = 'Bowl — continuous metal coping';
    for (let i = 0; i < this.bowlOutline.length; i++) {
      const a = this.bowlOutline[i], b = this.bowlOutline[(i + 1) % this.bowlOutline.length];
      const rail = this.addRail(V([a[0], spec.rimY + .015, a[1]]), V([b[0], spec.rimY + .015, b[1]]), 'coping', { feature: 'bowl', radius: .038, visual: false });
      this.bowlCoping.push(rail); rail.visuals = [coping]; rail.instanceIndex = i;
      transform.position.copy(rail.a).lerp(rail.b, .5); transform.quaternion.setFromUnitVectors(UP, rail.dir); transform.scale.set(1, rail.len, 1); transform.updateMatrix(); coping.setMatrixAt(i, transform.matrix);
    }
    this.add(coping, false, false);
    this.linkRails(this.bowlCoping, true);
  }

  buildPump() {
    const spec = this.layout.pump;
    const path = new THREE.CatmullRomCurve3(spec.path.map(([x, z]) => V([x, 0, z])), false, 'centripetal');
    const points = path.getSpacedPoints(spec.segments), tangents = [], rows = [], half = spec.width / 2;
    const cumulative = [0];
    for (let i = 0; i < points.length; i++) {
      const direction = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
      tangents.push(direction);
      if (i) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
    }
    const total = cumulative.at(-1);
    this.pumpPoints = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i], direction = tangents[i], before = tangents[Math.max(0, i - 3)], after = tangents[Math.min(points.length - 1, i + 3)];
      const distance = cumulative[Math.min(points.length - 1, i + 3)] - cumulative[Math.max(0, i - 3)];
      const curvature = Math.atan2(before.x * after.z - before.z * after.x, before.dot(after)) / Math.max(.01, distance);
      const bend = smooth(clamp((Math.abs(curvature) - .055) / .23, 0, 1));
      const bankSign = Math.sign(curvature);
      let roller = 0;
      for (const run of spec.rollers) {
        const t = (cumulative[i] - run.start) / (run.end - run.start);
        if (t > 0 && t < 1) roller += run.height * (1 - Math.cos(t * Math.PI * 2 * run.count)) / 2;
      }
      const endFade = smooth(clamp(Math.min(cumulative[i], total - cumulative[i]) / 2, 0, 1));
      const row = [];
      for (let j = 0; j <= 16; j++) {
        const w = -half + spec.width * j / 16, across = w / half;
        // The raised outer half forms a riding berm; the inside blends to turf.
        const outer = Math.max(0, -across * bankSign);
        const y = endFade * (roller + bend * spec.bermHeight * outer * outer);
        row.push([point.x - direction.z * w, y, point.z + direction.x * w]);
      }
      rows.push(row); this.pumpPoints.push([point.x, roller * endFade, point.z]);
    }
    this.pumpEdges = [rows.map(row => [row[0][0], row[0][2]]), rows.map(row => [row.at(-1)[0], row.at(-1)[2]])];
    this.pumpOutline = [...this.pumpEdges[0], ...this.pumpEdges[1].toReversed()];
    this.pump = this.add(new THREE.Mesh(gridSurface(rows), this.mats.concrete), true, false);
    this.pump.name = 'Pump track — open roller and berm ribbon';
    this.pump.userData = { feature: 'pump', width: spec.width, pathLength: total, endpoints: [this.pumpPoints[0], this.pumpPoints.at(-1)] };
    this.pumpShell = this.seal(this.pump);
  }

  buildCentralTransition() {
    const spec = this.layout.centralTransition, rows = [];
    const quarter = distance => {
      const t = clamp(distance / spec.radius, 0, 1);
      return spec.height * (1 - Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
    };
    const middleZ = (spec.backLipZ + spec.frontLipZ) / 2, halfZ = (spec.frontLipZ + -spec.backLipZ) / 2;
    this.centralHeightAt = (x, z) => {
      // Rounded inner corners connect all three faces into a single open-C
      // riding surface. The western end is deliberately open to the plaza.
      const qx = Math.abs(x - (spec.lipX - 10)) - (10 - 1.65), qz = Math.abs(z - middleZ) - (halfZ - 1.65);
      const signed = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 1.65;
      let h = quarter(Math.max(0, -signed));
      if (z > spec.frontLipZ + 1) {
        const t = clamp((z - spec.frontLipZ - 1) / spec.radius, 0, 1);
        h = spec.height * (1 - Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
      }
      return h;
    };
    const xs = [spec.minX]; for (let x = spec.minX + .15; x < spec.maxX; x += .15) xs.push(x); xs.push(spec.maxX);
    const zs = [spec.minZ, spec.backLipZ, spec.frontLipZ, spec.frontLipZ + 1, spec.frontLipZ + 1 + spec.radius, spec.maxZ];
    for (let z = spec.minZ + .13; z < spec.maxZ; z += .13) zs.push(z); zs.sort((a, b) => a - b);
    const distinctZs = zs.filter((z, i) => !i || Math.abs(z - zs[i - 1]) > 1e-6);
    for (const z of distinctZs) rows.push(xs.map(x => [x, this.centralHeightAt(x, z), z]));
    const g = gridSurface(rows), p = g.attributes.position, colors = [], color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), blend = smooth(clamp((y - .008) / .09, 0, 1)) * smooth(clamp((spec.height - y) / .045, 0, 1));
      color.copy(this.mats.concrete.color).lerp(this.mats.tan.color, blend); colors.push(color.r, color.g, color.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.centralTransition = this.add(new THREE.Mesh(g, this.mats.centralConcrete), true, false);
    this.centralTransition.name = 'Central open-C — three connected transitions and outer quarter'; this.centralTransition.userData.feature = 'flow'; this.seal(this.centralTransition);
    // Sample the same rounded inner lip that defines the transition profile.
    const lips = [];
    lips.push([-10, spec.backLipZ], [-3.05, spec.backLipZ]);
    for (let i = 1; i <= 24; i++) { const a = -Math.PI / 2 + i / 24 * Math.PI / 2; lips.push([-3.05 + Math.cos(a) * 1.65, spec.backLipZ + 1.65 + Math.sin(a) * 1.65]); }
    lips.push([spec.lipX, spec.frontLipZ - 1.65]);
    for (let i = 1; i <= 24; i++) { const a = i / 24 * Math.PI / 2; lips.push([-3.05 + Math.cos(a) * 1.65, spec.frontLipZ - 1.65 + Math.sin(a) * 1.65]); }
    lips.push([-10, spec.frontLipZ]);
    this.centralCoping = [];
    for (let i = 0; i < lips.length - 1; i++) this.centralCoping.push(this.addRail(V([lips[i][0], spec.height + .012, lips[i][1]]), V([lips[i + 1][0], spec.height + .012, lips[i + 1][1]]), 'coping', { feature: 'flow', radius: .038 }));
    this.linkRails(this.centralCoping);
    this.addRail(V([-10, spec.height + .012, spec.frontLipZ + 1]), V([0, spec.height + .012, spec.frontLipZ + 1]), 'coping', { feature: 'flow', radius: .038 });
  }

  buildStreet() {
    const p = this.layout.platform, height = p.height;
    const topOutline = [[0,p.minZ],[p.maxX,p.minZ],[p.maxX,p.maxZ],[0,p.maxZ]];
    const rows = [], xs = [0, .3, .6, .9, 1.2, 1.5, 1.8, 2.1, 2.4, 4, 6, p.maxX];
    for (const z of [p.minZ, -2, 0, p.maxZ]) rows.push(xs.map(x => [x, x < 2.4 ? THREE.MathUtils.lerp(this.layout.centralTransition.height, height, x / 2.4) : height, z]));
    this.platform = this.add(new THREE.Mesh(gridSurface(rows), this.mats.concrete), true, false);
    this.platform.name = 'Street platform — connected bank and raised deck'; this.platform.userData.feature = 'platform'; this.seal(this.platform);
    this.stairs = this.stairSet(this.layout.stairs);
    const bankStart = [p.maxX, 0, 1.5], run = p.bankRun, width = 3;
    this.bank = this.profile([[0,0],[0,height],[run,0]], width, ...bankStart);
    this.bank.name = 'Street bank — mellow descent beside the stair'; this.bank.userData.feature = 'bank';
    this.profile([[0,0],[0,height],[run,0]],1.3,p.maxX,0,-3.85).name='Street stair — outer bank';
    this.bankRail = this.addRail(V([p.maxX-.3,height+.68,3.1]), V([p.maxX+run+.3,.68,3.1]), 'rail', { feature: 'bank', posts:true, floor:t=>Math.max(0,height*(1-t)) });
    // A solid hubba separates stairs and bank, and the long back ledge is an
    // accessible low edge rather than a fence through the riding line.
    this.hubba = this.profile([[0,0],[0,height+.28],[run,.28],[run,0]], .42, p.maxX, 0, -.25, 0, this.mats.concrete);
    this.hubba.name = 'Street bank — solid hubba'; this.hubba.userData = { feature: 'hubba', solidBoundary: true };
    for (const side of [-1, 1]) this.addRail(V([p.maxX,height+.28,-.25+side*.21]), V([p.maxX+run,.28,-.25+side*.21]), 'ledge', { feature:'hubba',visual:false });
    const kink = [V([2.8,height+.3,p.minZ-.35]),V([8,height+.3,p.minZ-.35]),V([11,.3,p.minZ-.35])], kinkRails=[];
    for (let i=0;i<kink.length-1;i++) {
      const a=kink[i],b=kink[i+1],len=b.x-a.x;
      this.profile([[0,0],[0,a.y],[len,b.y],[len,0]],.45,a.x,0,a.z,0,this.mats.concrete);
      kinkRails.push(this.addRail(a,b,'ledge',{feature:'back-ledge',visual:false}));
    }
    this.linkRails(kinkRails);
    this.addRail(V([2.5,height,3]),V([8,height,3]),'ledge',{feature:'platform',visual:false});
    // Photo33/visitor01 show a second, peaked bank below the straight stair
    // bank. Share the back row exactly, then taper the front to a broad point.
    const frameHeight=(x,z)=>{
      const rear=height*clamp((11-x)/3,0,1),crest=height*Math.max(0,1-Math.abs(x-10.1)/(x<10.1?2.6:2.9));
      return z<=4.5?THREE.MathUtils.lerp(rear,crest,smooth(clamp((z-3)/1.5,0,1))):crest*clamp((7.8-z)/3.3,0,1);
    };
    const frameRows=[];
    for(const z of [3,3.2,3.5,4,4.5,5,5.5,6,6.5,7,7.5,7.8]){
      const taper=clamp((z-5.2)/2.6,0,1),left=THREE.MathUtils.lerp(7.5,10.06,taper),right=THREE.MathUtils.lerp(13,10.14,taper);
      frameRows.push(Array.from({length:25},(_,i)=>{const x=THREE.MathUtils.lerp(left,right,i/24);return [x,frameHeight(x,z),z];}));
    }
    this.aFrame=this.add(new THREE.Mesh(gridSurface(frameRows),this.mats.tan),true,false);this.aFrame.name='Peaked A-frame bank — continuous street connection';this.aFrame.userData.feature='a-frame';this.seal(this.aFrame);
    const ridge=[7.5,10.1,13],frameRails=[];
    for(let i=0;i<ridge.length-1;i++){
      const a=V([ridge[i],frameHeight(ridge[i],5.4)+.62,5.4]),b=V([ridge[i+1],frameHeight(ridge[i+1],5.4)+.62,5.4]);
      const rail=this.addRail(a,b,'rail',{feature:'a-frame'});frameRails.push(rail);
      for(const t of [0,.9]){const top=a.clone().lerp(b,t);this.beam(V([top.x,frameHeight(top.x,top.z),top.z]),top,.023);}
    }
    this.linkRails(frameRails);this.aFrameRails=frameRails;
    const hubba=this.profile([[0,0],[0,.25],[2.6,height+.25],[5.5,.25],[5.5,0]],.38,7.5,0,4.5,0,this.mats.concrete);
    hubba.name='A-frame — peaked hubba';hubba.userData={feature:'a-frame',solidBoundary:true};
    for(const side of [-1,1]){
      const chain=[];
      for(let i=0;i<ridge.length-1;i++)chain.push(this.addRail(V([ridge[i],frameHeight(ridge[i],4.5)+.25,4.5+side*.19]),V([ridge[i+1],frameHeight(ridge[i+1],4.5)+.25,4.5+side*.19]),'ledge',{feature:'a-frame',visual:false}));
      this.linkRails(chain);
    }
    // Opposing perimeter quarters and their real height extensions.
    this.quarter(1.35, 6, -19.6, 0, -2.8, Math.PI, { height:1.22,feature:'west-quarter' });
    this.quarter(1.5, 7.4, -19.5, 0, 3.9, Math.PI, { height:1.22,feature:'west-quarter' });
    for(const segment of [{z:-5.7,width:2,height:.91},{z:-3,width:3.4,height:1.37},{z:.75,width:4.1,height:.91},{z:4.25,width:2.9,height:1.52},{z:7.15,width:2.9,height:.91}])
      this.quarter(1.35,segment.width,19.5,0,segment.z,0,{height:segment.height,curveHeight:.91,feature:'east-quarter'});
    const dome = Array.from({length:64},(_,i)=>[-14+Math.cos(i/64*Math.PI*2)*1.65,1+Math.sin(i/64*Math.PI*2)*1.65]);
    this.dome=this.add(new THREE.Mesh(clippedHeightField(dome,(x,z)=>.24*(1+Math.cos(Math.PI*clamp(Math.hypot(x+14,z-1)/1.65,0,1))),.18),this.mats.tan),true,false);
    this.dome.name='Low round roller';this.dome.userData.feature='dome';
    const padOutline=[[-7.4,6.5],[-4,6.5],[-3.1,7.2],[-3.1,7.85],[-8,7.85],[-8,7.2]];
    this.manualPad=this.add(new THREE.Mesh(perintonPolygon(padOutline,[],.24),this.mats.concrete));this.manualPad.name='Low hexagonal manual pad';this.manualPad.userData.feature='manual';this.seal(this.manualPad,0);
    this.addRail(V([-8,.24,7.85]),V([-3.1,.24,7.85]),'ledge',{feature:'manual',visual:false});
    this.flatbar=this.addRail(V([1,.56,10]),V([7,.56,10]),'rail',{feature:'flatbar',posts:true});
    this.ledge(4,.3,.6,-4,0,14,{feature:'entry-ledge'});
    this.ledge(4.6,.3,.6,11,0,14,{feature:'entry-ledge'});
  }

  build() {
    const L = this.layout;
    this.buildBowl(); this.buildPump();
    // Only the bowl opening removes the outdoor support. The pump has solid
    // perimeter closures; turf remains a safe, level runout around the track.
    this.surround = this.add(new THREE.Mesh(perintonPolygon([[-65,-65],[65,-65],[65,60],[-65,60]],[this.bowlOutline],-.04),this.mats.turf),true,false);
    this.surround.visible=false;this.surround.name='Park landscape support with open bowl';
    // The C insert has its own flat bottom. Cut it out of the base slab rather
    // than relying on a camera-dependent polygon offset to hide duplicate faces.
    const c=L.centralTransition;
    const floorOutline=L.mainOutline.flatMap(p=>p[0]===c.minX&&p[1]===c.minZ?[p,[c.minX,c.maxZ],[c.maxX,c.maxZ],[c.maxX,c.minZ]]:[p]);
    // The wider bowl deck meets the eastern plaza. Give their shared area to
    // the deck once rather than rendering two coplanar concrete sheets.
    this.floor=this.add(new THREE.Mesh(polygonDifference(floorOutline,this.bowlDeckOutline,0),this.mats.floor),true,false);this.floor.name='Perinton street plaza';
    this.turf=this.add(new THREE.Mesh(perintonPolygon(L.turfOutline,[this.bowlDeckOutline],-.012),this.mats.turf),false,false);this.turf.name='Artificial turf island';
    // The lawn is slightly lower than the turf. Close that exposed 2.5 cm edge
    // so a grazing camera cannot see the sky through the two separate sheets.
    const turfEdge=this.add(new THREE.Mesh(perimeterSkirt(L.turfOutline,-.012,-.04),this.mats.turf),false,false);
    turfEdge.name='Artificial turf island — closed lawn edge';
    this.buildCentralTransition(); this.buildStreet();
  }
}

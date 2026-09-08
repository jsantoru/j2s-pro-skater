import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const c = new Character();
// Check authored silhouette independently from camera perspective and pose blends.
const sleeve = c.lArm.sh.getObjectByName('Continuous hoodie sleeve').geometry;
sleeve.computeBoundingBox();
const face = c.head.getObjectByName('Seamless cap crown').geometry;
face.computeBoundingBox();
const shoulderWidth = 2 * (c.lArm.sh.position.x + sleeve.boundingBox.max.x);
const headWidth = (face.boundingBox.max.x - face.boundingBox.min.x) * c.head.scale.x;
assert.ok(shoulderWidth / headWidth < 2.9, 'Head is not dwarfed by padded shoulders');
assert.ok(shoulderWidth / headWidth > 2.2, 'Keep an adult rather than oversized cartoon head');
assert.ok(c.lArm.sh.position.y < 0.41, 'Shoulders slope below the neckline');
const jeans = c.lLeg.hp.getObjectByName('Front jeans continuous hip').geometry;
jeans.computeBoundingBox();
const hipWidth = 2 * (c.lLeg.hp.position.x + jeans.boundingBox.max.x);
assert.ok(hipWidth / shoulderWidth < .85, 'Clothed hips remain narrower than the shoulders');

const hoodie = c.torso.getObjectByName('Tailored black hoodie');
assert.ok(hoodie.isSkinnedMesh, 'Hoodie bends between hips and chest');
const hem = [], vtx = new THREE.Vector3();
c.root.updateMatrixWorld(true);
for (let i = 0; i < hoodie.geometry.attributes.position.count; i++) {
  if (hoodie.geometry.attributes.position.getY(i) > -0.026) continue;
  hoodie.getVertexPosition(i, vtx); hoodie.localToWorld(vtx); c.hips.worldToLocal(vtx);
  hem.push([i, vtx.clone()]);
}
assert.ok(hem.length > 100, 'Test the full elastic hem, not just one point');
for (const lean of [-0.6, 0, 0.3, 0.8]) for (const twist of [-0.5, 0, 0.5]) {
  c.torso.rotation.set(lean, twist, 0.1); c.root.updateMatrixWorld(true);
  for (const [i, rest] of hem) {
    hoodie.getVertexPosition(i, vtx); hoodie.localToWorld(vtx); c.hips.worldToLocal(vtx);
    assert.ok(vtx.distanceTo(rest) < 1e-6, 'Hem stays around the pelvis when chest leans or twists');
  }
}
c.torso.rotation.set(0, 0, 0); c.root.updateMatrixWorld(true);

let triangles = 0;
for (const arm of [c.lArm, c.rArm]) {
  const g = arm.hand.getObjectByName('Continuous palm and wrist').geometry;
  const p = g.attributes.position, n = g.attributes.normal, indices = g.index.array;
  const neighbors = Array.from({length: p.count}, () => new Set()), edges = new Map();
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    a.fromBufferAttribute(p, tri[0]); b.fromBufferAttribute(p, tri[1]); v.fromBufferAttribute(p, tri[2]);
    volume += a.dot(b.cross(v)) / 6;
    for (let j = 0; j < 3; j++) {
      const from = tri[j], to = tri[(j + 1) % 3], key = [Math.min(from, to), Math.max(from, to)].join(',');
      neighbors[from].add(to); neighbors[to].add(from);
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const count of edges.values()) assert.equal(count, 2, 'No open seams between palm, thumb or fingers');
  const seen = new Set([0]), pending = [0];
  while (pending.length) for (const next of neighbors[pending.pop()]) if (!seen.has(next)) { seen.add(next); pending.push(next); }
  assert.equal(seen.size, p.count, 'Hand is one connected surface, not overlapping islands');
  assert.ok(volume > 0, 'Mirrored hand retains outward triangle winding');
  for (let i = 0; i < p.count; i++) {
    assert.ok(a.fromBufferAttribute(p, i).toArray().every(Number.isFinite), 'Finite hand positions');
    assert.ok(Math.abs(a.fromBufferAttribute(n, i).length() - 1) < 1e-5, 'Unit skin normals');
  }
  triangles += indices.length / 3;
}
console.log(`PASS: shoulder/head ratio ${(shoulderWidth / headWidth).toFixed(2)}, sloped shoulders, hip-anchored hem, two watertight connected hands (${triangles} triangles combined).`);

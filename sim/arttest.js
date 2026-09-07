// Geometry regressions for the close-up polish: closed cuffs, a lined hood,
// continuous palms and smooth shading across duplicated UV seams.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';

const character = new Character();
const ray = new THREE.Raycaster(), a = new THREE.Vector3(), b = new THREE.Vector3();
let seamChecks = 0;
function checkSeam(g, around, rows, columnMajor = false) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let row = 1; row < rows - 1; row++) {
    const first = columnMajor ? row : row * (around + 1), last = columnMajor ? around * rows + row : first + around;
    assert.ok(a.fromBufferAttribute(p, first).distanceTo(b.fromBufferAttribute(p, last)) < 1e-5, 'UV seam positions coincide');
    assert.ok(a.fromBufferAttribute(n, first).distanceTo(b.fromBufferAttribute(n, last)) < 1e-5, 'No hard lighting seam');
    seamChecks++;
  }
}
function localMesh(source) {
  const result = new THREE.Mesh(source.geometry, source.material);
  result.updateMatrixWorld(true);
  return result;
}
function assertClosed(g) {
  // Weld only for topology inspection: separate UV vertices are intentional.
  const p = g.attributes.position, ids = new Map(), vertices = [];
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    if (!ids.has(key)) ids.set(key, ids.size);
    vertices.push(ids.get(key));
  }
  const edges = new Map(), index = g.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const tri = [vertices[index[i]], vertices[index[i + 1]], vertices[index[i + 2]]];
    if (new Set(tri).size < 3) continue;
    for (let j = 0; j < 3; j++) {
      const from = tri[j], to = tri[(j + 1) % 3], key = [Math.min(from, to), Math.max(from, to)].join(',');
      const edge = edges.get(key) || { count: 0, winding: 0 };
      edge.count++; edge.winding += from < to ? 1 : -1; edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'Cuff has no boundary or non-manifold edges');
    assert.equal(edge.winding, 0, 'Cuff faces have consistent winding');
  }
}

for (const arm of [character.lArm, character.rArm]) {
  const cuff = arm.el.getObjectByName('Closed ribbed cuff');
  assert.ok(cuff, 'Both wrists have a finished cuff');
  assertClosed(cuff.geometry);
  const isolated = localMesh(cuff);
  const sleeveP = arm.sh.getObjectByName('Sleeve tucked into cuff').geometry.attributes.position;
  for (let i = sleeveP.count - 25; i < sleeveP.count; i++) {
    const x = sleeveP.getX(i), z = sleeveP.getZ(i), radius = Math.hypot(x, z);
    // Avoid casting exactly through a shared triangle edge (ambiguous at floating-point precision).
    const angle = Math.atan2(z, x) + 1e-6;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const origin = direction.clone().multiplyScalar(0.1); origin.y = sleeveP.getY(i) - arm.el.position.y;
    ray.set(origin, direction.negate());
    const hit = ray.intersectObject(isolated)[0];
    assert.ok(hit && hit.distance < 0.1 - radius, `Sleeve endpoint remains buried in the cuff: vertex ${i}, radius ${radius}, hit ${hit?.distance}, y ${origin.y}`);
  }
  for (let i = 0; i < 48; i++) {
    const angle = i / 48 * Math.PI * 2;
    ray.set(new THREE.Vector3(Math.cos(angle) * 0.027, -0.32, Math.sin(angle) * 0.022), new THREE.Vector3(0, 1, 0));
    assert.ok(ray.intersectObject(isolated).length, 'Rolled cuff lip is visible from the hand, all around');
  }
  assert.ok(arm.el.getObjectByName('Continuous palm and wrist'), 'No stacked palm/wrist blobs');
  const side = Math.sign(arm.sh.position.x), thumb = arm.hand.getObjectByName('Thumb root');
  assert.ok(thumb.position.x * side > 0, 'Correct left/right hand anatomy');
  const palmFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(arm.hand.quaternion);
  assert.ok(palmFacing.x * side < -0.9, 'Relaxed palms face inward, not forward');
  assert.ok(thumb.position.clone().applyQuaternion(arm.hand.quaternion).z > 0.015, 'Thumbs lie on the forward side of each wrist');
}
const hood = localMesh(character.torso.getObjectByName('Lined hood opening'));
for (const x of [-0.10, -0.07, 0, 0.07, 0.10]) for (const z of [-0.01, 0, 0.01]) {
  ray.set(new THREE.Vector3(x, 0.55, -0.090 + z), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(hood).length, 'Hood opening has a continuous, front-facing lining');
}
for (const z of [-0.055, -0.065, -0.080, -0.10]) {
  ray.set(new THREE.Vector3(0, 0.55, z), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(hood).length, 'Fabric bridges the hood to the rear collar without daylight');
}
let shoes = 0, hands = 0;
character.root.traverse(object => {
  if (object.name === 'Continuous palm and wrist') {
    hands++;
    assert.equal(object.parent.children.filter(child => child.isMesh).length, 1, 'Palm, thumb and fingers share one skin surface');
  }
  if (object.geometry?.name === 'Seamless shoe last') {
    const g = object.geometry;
    checkSeam(g, 24, (g.attributes.position.count - 2) / 25); shoes++;
  }
});
assert.equal(shoes, 6, 'Upper, sole and stripe on both feet');
assert.equal(hands, 2, 'Both hands use connected skin');
checkSeam(character.head.getObjectByName('Seamless cap crown').geometry, 44, 16);
checkSeam(character.head.getObjectByName('Tailored hairline').geometry, 48, 17);
console.log(`PASS: closed cuffs and visible inner lips, lined hood, continuous palms, ${seamChecks} smooth UV seams.`);

// Geometry regressions for the close-up polish: finished hoodie sleeves, cuff openings,
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
for (const arm of [character.lArm, character.rArm]) {
  const sleeve=arm.sh.getObjectByName('Continuous hoodie sleeve');
  const cuff=arm.el.getObjectByName('Ribbed wrist cuff');
  assert.ok(sleeve?.isSkinnedMesh && cuff, 'Full sleeves bend continuously into finished cuffs');
  checkSeam(sleeve.geometry,32,sleeve.geometry.attributes.position.count/33);
  checkSeam(cuff.geometry,32,cuff.geometry.attributes.position.count/33);
  const isolated=localMesh(cuff);
  for(let i=0;i<32;i++){
    const angle=i/32*Math.PI*2;
    ray.set(new THREE.Vector3(Math.cos(angle)*.024,-.29,Math.sin(angle)*.025),new THREE.Vector3(0,1,0));
    assert.ok(ray.intersectObject(isolated).length,'Wrist cuff has a visible turned hem from below');
  }
  assert.ok(arm.el.getObjectByName('Continuous palm and wrist'), 'No stacked palm/wrist blobs');
  const side = Math.sign(arm.sh.position.x), thumb = arm.hand.getObjectByName('Thumb root');
  assert.ok(thumb.position.x * side > 0, 'Correct left/right hand anatomy');
  const palmFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(arm.hand.quaternion);
  assert.ok(palmFacing.x * side < -0.9, 'Relaxed palms face inward, not forward');
  assert.ok(thumb.position.clone().applyQuaternion(arm.hand.quaternion).z > 0.015, 'Thumbs lie on the forward side of each wrist');
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
console.log(`PASS: turned wrist cuffs, continuous sleeves and palms, ${seamChecks} smooth UV seams.`);

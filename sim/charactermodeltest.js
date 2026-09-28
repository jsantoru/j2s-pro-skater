import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Character } from '../src/character.js';

let passed=0;
function test(name,run){run();passed++;console.log(`PASS: ${name}`);}
function owned(root){
  const out={geometry:new Set(),material:new Set(),texture:new Set(),skeleton:new Set()};
  root.traverse(object=>{
    if(object.geometry)out.geometry.add(object.geometry);
    if(object.skeleton)out.skeleton.add(object.skeleton);
    for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
      out.material.add(material);for(const value of Object.values(material))if(value?.isTexture)out.texture.add(value);
    }
  });return out;
}
function fingerprint(character){
  const rows=[];
  character.root.traverse(o=>rows.push([o.type,o.name,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),
    o.geometry?Object.entries(o.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)]):null,
    o.geometry?.index?Array.from(o.geometry.index.array):null,
    (Array.isArray(o.material)?o.material:o.material?[o.material]:[]).map(m=>[m.type,m.name,m.color.toArray(),m.roughness,m.metalness,m.side]),
  ]));return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
const state=extra=>({state:'ride',crouch:0,landSquash:0,pushing:0,stance:1,lean:0,speed:7,bailT:0,trick:null,manualLean:0,...extra});

test('Default Joe retains the exact pre-selection model and material construction',()=>{
  const character=new Character();
  // Captured from the merged model at2413740, before adding selectable appearances.
  assert.equal(fingerprint(character),'4bc8313c18494826b8609fd292b3dc2df2021257343fdb6165356044e51d2fce');
  assert.equal(character.characterId,'joe');character.dispose();
});

test('Aaron has a genuinely open overshirt, clear rectangular glasses and a distinct head finish',()=>{
  const character=new Character({characterId:'aaron'});
  const shirt=character.root.getObjectByName('Aaron open plaid overshirt');
  assert(shirt?.isSkinnedMesh);assert(character.root.getObjectByName('Aaron faded red tee'));
  assert(character.root.getObjectByName('Aaron salt and pepper full stubble'));
  assert.equal(character.head.children.filter(object=>object.name==='Aaron rectangular eyeglass rim').length,2);
  const p=shirt.geometry.attributes.position,index=shirt.geometry.index;
  for(let i=0;i<index.count;i+=3){
    const center=new THREE.Vector3();for(let k=0;k<3;k++)center.add(new THREE.Vector3().fromBufferAttribute(p,index.getX(i+k)));center.multiplyScalar(1/3);
    assert(!(center.z>.05&&center.y>.08&&center.y<.32&&Math.abs(center.x)<.035),'The front opening exposes the red tee rather than a printed imitation');
  }
  let triangles=0;character.root.traverse(object=>{if(object.geometry)triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;});
  assert(triangles<100000,'Second appearance stays within the existing model cost');character.dispose();
});

test('Body switching disposes every owned resource once and preserves the board and active pose',()=>{
  const character=new Character(),board=character.board,root=character.root;
  character.root.position.set(3,2,-7);character.root.rotation.set(.2,.7,-.1);
  for(let i=0;i<60;i++)character.update(state({crouch:.7,manualLean:.4}),1/60,i/60);
  const hips=character.hips.position.clone(),head=character.head.quaternion.clone(),cur=JSON.stringify(character.cur),boardMatrix=board.matrixWorld.clone();
  const old=owned(character.body),protectedResources=owned(board),counts=new Map();
  for(const set of Object.values(old))for(const resource of set){
    counts.set(resource,0);const dispose=resource.dispose.bind(resource);resource.dispose=()=>{counts.set(resource,counts.get(resource)+1);dispose();};
  }
  let boardDisposals=0;for(const set of Object.values(protectedResources))for(const resource of set)resource.addEventListener?.('dispose',()=>boardDisposals++);
  assert.equal(character.setCharacter('aaron'),'aaron');
  assert.equal(character.root,root);assert.equal(character.board,board);assert.equal(boardDisposals,0);
  assert(character.hips.position.distanceTo(hips)<1e-12);assert(character.head.quaternion.angleTo(head)<1e-7);
  assert.equal(JSON.stringify(character.cur),cur);assert.deepEqual(board.matrixWorld.toArray(),boardMatrix.toArray());
  for(const count of counts.values())assert.equal(count,1);
  const newHips=character.hips;assert.equal(character.setCharacter('aaron'),'aaron');assert.equal(character.hips,newHips,'Selecting the active appearance is a no-op');
  assert.equal(character.setCharacter('missing'),'joe');
  character.dispose();const after=boardDisposals;character.dispose();assert.equal(boardDisposals,after,'Full disposal is idempotent');assert(after>0);
});

test('Both appearances retain shared deck contacts through poses and switches without mutating simulation state',()=>{
  const character=new Character(),point=new THREE.Vector3();let frames=0;
  for(const characterId of ['aaron','joe','aaron']){
    character.setCharacter(characterId);
    for(const extra of [{},{crouch:1},{manualLean:1},{state:'grind'},{state:'air',trick:{kind:'grab',name:'Indy'}},{state:'air',trick:{kind:'grab',name:'Method'}}]){
      const skater=state(extra),before=JSON.stringify(skater);
      for(let i=0;i<40;i++){character.update(skater,1/60,frames++/60);character.root.updateMatrixWorld(true);}
      assert.equal(JSON.stringify(skater),before);
      for(const [leg,z] of [[character.lLeg,.235],[character.rLeg,-.255]]){
        point.set(0,-.0405,0);leg.an.localToWorld(point);character.board.worldToLocal(point);
        assert(Math.abs(point.x)<.001&&Math.abs(point.y-.132)<.001&&Math.abs(point.z-z)<.001,'Same rig keeps soles planted on the grip');
      }
      character.root.traverse(object=>assert(object.matrixWorld.elements.every(Number.isFinite)));
    }
  }
  character.dispose();
});

console.log(`${passed}/${passed} character model checks passed.`);

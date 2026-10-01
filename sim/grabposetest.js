import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Character } from '../src/character.js';
import { GRAB_DEFINITIONS, GRAB_PALM_CONTACT, getGrabDefinition } from '../src/grab-animation.js';

const dt=1/120,names=Object.keys(GRAB_DEFINITIONS);
let checks=0;
function test(name,run){run();checks++;console.log(`PASS: ${name}`);}
function state(){return {state:'air',speed:7,stance:1,lean:0,crouch:0,landSquash:0,pushing:0,manualLean:0,bailT:0,trick:null};}
function advance(character,sk,frames=90) {for(let i=0;i<frames;i++){if(sk.trick)sk.trick.t+=dt;character.update(sk,dt,i*dt);}character.root.updateMatrixWorld(true);}
function begin(character,sk,name) {character.grabAnimation.reset();sk.state='air';sk.trick={kind:'grab',name,t:0,dur:.3,held:true};advance(character,sk);}
const point=new THREE.Vector3(),expected=new THREE.Vector3();
const characters=['joe','aaron'].map(characterId=>new Character({characterId}));

test('Eight grab identities retain physical toe/heel edges and swap front/back limb roles in switch',()=>{
  assert.deepEqual(names,['Indy','Melon','Nosegrab','Tailgrab','Method','Stalefish','Judo','Airwalk']);
  const sites={Indy:['right','toe-edge'],Melon:['left','heel-edge'],Nosegrab:['left','nose'],Tailgrab:['right','tail'],Method:['left','heel-edge'],Stalefish:['right','heel-edge'],Judo:['left','nose'],Airwalk:['left','nose']};
  for(const [name,[hand,site]]of Object.entries(sites))assert.deepEqual([GRAB_DEFINITIONS[name].hand,GRAB_DEFINITIONS[name].site],[hand,site]);
  for(const name of names){
    const regular=GRAB_DEFINITIONS[name],sw=getGrabDefinition(name,-1);
    assert.equal(sw.hand,regular.hand==='left'?'right':'left');assert.equal(sw.site,regular.site);
    assert.equal(sw.grip[0],regular.grip[0],'toe/heel edge stays relative to the rider');
    assert.equal(sw.grip[2],-regular.grip[2],'front/rear grip follows the travel-leading/trailing end');
  }
  assert.equal(new Set(names.map(name=>JSON.stringify([GRAB_DEFINITIONS[name].board,GRAB_DEFINITIONS[name].rotation,GRAB_DEFINITIONS[name].pose]))).size,8,'No profile is an alias');
});

for(const character of characters)test(`${character.characterId}: real palms meet the intended deck rim under rotations and switch`,()=>{
  const sk=state();
  for(const stance of [1,-1])for(const angles of [[0,0,0],[.65,1.1,-.3],[-1.2,2.2,.8]])for(const name of names) {
    sk.stance=stance;character.root.position.set(4,3,-5);character.root.quaternion.setFromEuler(new THREE.Euler(...angles));begin(character,sk,name);
    const definition=getGrabDefinition(name,stance),arm=definition.hand==='left'?character.lArm:character.rArm;
    expected.fromArray(definition.grip);character.board.localToWorld(expected);
    point.fromArray(GRAB_PALM_CONTACT);arm.hand.localToWorld(point);
    assert.ok(point.distanceTo(expected)<.006,`${name} ${stance} palm error ${point.distanceTo(expected)}`);
    assert.equal(character.grabAnimation.contact.hand,definition.hand);
    assert.ok(character.grabAnimation.contact.palmWorld.distanceTo(point)<1e-7,'Telemetry is the actual mesh landmark');
    assert.ok(character.grabAnimation.contact.targetWorld.distanceTo(expected)<1e-7,'Telemetry follows the rotated deck');
    // Independently check the rendered palm has skin close to the rim point.
    const skin=arm.hand.getObjectByName('Continuous palm and wrist'),positions=skin.geometry.attributes.position;
    let nearest=Infinity;for(let i=0;i<positions.count;i++)nearest=Math.min(nearest,skin.getVertexPosition(i,point).applyMatrix4(skin.matrixWorld).distanceTo(expected));
    assert.ok(nearest<.012,`${name} visible palm misses its contact by ${nearest}`);
  }
});

for(const character of characters)test(`${character.characterId}: ordinary grabs retain both feet; Judo and Airwalk deliberately release the correct feet`,()=>{
  const sk=state();character.root.position.set(0,0,0);character.root.quaternion.identity();
  for(const stance of [1,-1])for(const name of names) {
    sk.stance=stance;begin(character,sk,name);const definition=getGrabDefinition(name,stance);
    for(const [i,leg]of[character.lLeg,character.rLeg].entries()) {
      leg.an.getWorldPosition(point);
      if(!definition.feet?.[i]) {
        const hip=leg.hp.getWorldPosition(new THREE.Vector3()),ankle=leg.ankle.getWorldPosition(new THREE.Vector3());
        assert.ok(hip.distanceTo(ankle)>.30,`${name} retains anatomical space between pelvis and ankles`);
      }
      if(definition.feet?.[i]) {
        expected.fromArray(definition.feet[i].position);character.root.localToWorld(expected);
        assert.ok(point.distanceTo(expected)<.008,`${name} foot ${i} reaches the kick target`);
        character.board.worldToLocal(point);
        assert.ok(Math.abs(point.x)>.2||Math.abs(point.z)>.55||Math.abs(point.y-.1725)>.2,`${name} foot ${i} visibly leaves the deck`);
      } else {
        character.board.worldToLocal(point);expected.set(0,.1725,i===0?.235:-.255);
        assert.ok(point.distanceTo(expected)<.006,`${name} foot ${i} remains planted on grip: ${point.toArray()}`);
      }
    }
  }
});

test('Reach and release are continuous; a ground/grind/bail/flip interruption never chases the loose board',()=>{
  const character=characters[0],sk=state();character.root.position.set(0,0,0);character.root.quaternion.identity();
  for(const name of names)for(const destination of ['air','ride','grind','bail','flip']) {
    begin(character,sk,name);const side=GRAB_DEFINITIONS[name].hand,arm=side==='left'?character.lArm:character.rArm;
    const priorShoulder=arm.sh.quaternion.clone(),priorElbow=arm.el.quaternion.clone(),priorHand=arm.hand.quaternion.clone();
    sk.state=destination==='flip'?'air':destination;sk.trick=destination==='flip'?{kind:'flip',name:'Kickflip',t:0,dur:.6}:null;
    for(let frame=0;frame<80;frame++) {
      sk.bailT=destination==='bail'?frame*dt:0;character.update(sk,dt,frame*dt);
      assert.ok([...arm.sh.quaternion,...arm.el.quaternion,...arm.hand.quaternion].every(Number.isFinite),`${name} finite interruption`);
      assert.ok(arm.sh.quaternion.angleTo(priorShoulder)<.8&&arm.el.quaternion.angleTo(priorElbow)<.8&&arm.hand.quaternion.angleTo(priorHand)<.8,`${name} smooth ${destination} at ${frame}`);
      if(destination!=='air')assert.equal(character.grabAnimation.contact.attached,false);
      priorShoulder.copy(arm.sh.quaternion);priorElbow.copy(arm.el.quaternion);priorHand.copy(arm.hand.quaternion);
    }
    assert.equal(character.grabAnimation.weight,0,'Release fully settles and cannot keep a latent grab');
  }
});

test('Minimum-duration released taps still visibly reach the board, with continuous tuck and recovery',()=>{
  const character=characters[0],sk=state();character.root.position.set(0,0,0);character.root.quaternion.identity();
  for(const name of names) {
    character.grabAnimation.reset();sk.state='air';sk.trick=null;advance(character,sk,100);
    sk.trick={kind:'grab',name,t:0,dur:.3,held:false};
    let nearest=Infinity;
    for(let frame=0;frame<36;frame++) {
      sk.trick.t+=dt;character.update(sk,dt,frame*dt);
      nearest=Math.min(nearest,character.grabAnimation.contact.error);
    }
    assert.ok(nearest<.025,`${name} released tap still visibly completes its minimum tuck (${nearest})`);
    sk.trick=null;advance(character,sk,80);assert.equal(character.grabAnimation.weight,0);
  }
});

test('Landing stance changes retain the outgoing grab hand; a new switch grab blends to its own hand',()=>{
  for(const character of characters)for(const name of names)for(const stance of [1,-1]) {
    const sk=state();sk.stance=stance;character.root.position.set(0,0,0);character.root.quaternion.identity();begin(character,sk,name);
    const outgoing=getGrabDefinition(name,stance).hand;
    const before=character.grabAnimation.contacts.find(c=>c.hand===outgoing).boardLocal.clone();
    sk.state='ride';sk.trick=null;sk.stance=-stance;
    character.update(sk,dt,0);
    const contact=character.grabAnimation.contacts.find(c=>c.hand===outgoing);
    assert.ok(contact.weight>.8,'landing begins releasing the same anatomical hand');
    assert.ok(contact.boardLocal.distanceTo(before)<1e-7,'landing cannot reinterpret the outgoing physical grip');
    assert.equal(character.grabAnimation.contacts.find(c=>c.hand!==outgoing).weight,0,'no sudden opposite-hand grab on landing');
    sk.state='air';sk.trick={kind:'grab',name,t:0,dur:.3,held:true};
    character.update(sk,dt,dt);
    assert.ok(character.grabAnimation.contacts.every(c=>c.weight>0),'new opposite-stance grab crossfades instead of transferring a contact instantly');
    advance(character,sk);
    assert.equal(character.grabAnimation.contact.hand,getGrabDefinition(name,-stance).hand);
    assert.ok(character.grabAnimation.contact.error<.006,'new variant reaches its own physical rim');
  }
});

test('Character switches refresh hand references and never mutate simulation state',()=>{
  const character=characters[0],sk=state();
  for(const id of ['aaron','joe','aaron','joe'])for(const name of names) {
    character.setCharacter(id);begin(character,sk,name);const before=JSON.stringify(sk);
    character.update(sk,dt,1);
    assert.equal(JSON.stringify(sk),before,'Animation is read-only with respect to physics/tricks');
    assert.ok(character.grabAnimation.contact.error<.006,`${id} ${name} has current rig contact`);
  }
});

test('Finger curl preserves the cached neutral hand and palm, opens smoothly, and is owned by each character rig',()=>{
  const character=new Character(),sk=state();sk.state='ride';
  const source=character.rArm.hand.getObjectByName('Continuous palm and wrist').geometry;
  const original=source.getAttribute('position').array.slice();
  advance(character,sk,1);
  let disposed=0;
  for(const id of ['joe','aaron','joe']) {
    character.setCharacter(id);sk.state='ride';sk.trick=null;advance(character,sk,90);
    const mesh=character.rArm.hand.getObjectByName('Continuous palm and wrist'),geometry=mesh.geometry;
    assert.notEqual(geometry,source,'The cached source is never mutated');
    assert.equal(geometry.userData.grabGripMorph,true);
    const positions=geometry.getAttribute('position'),morph=geometry.morphAttributes.position[0];
    for(let i=0;i<positions.count;i++) {
      mesh.getVertexPosition(i,point);expected.fromBufferAttribute(positions,i);
      assert.equal(point.distanceTo(expected),0,'Neutral hand vertices remain exact');
      if(positions.getY(i)>=-.057)assert.equal(expected.distanceTo(point.fromBufferAttribute(morph,i)),0,'The physical palm and wrist stay fixed');
    }
    geometry.addEventListener('dispose',()=>disposed++);
    begin(character,sk,'Indy');assert.equal(mesh.morphTargetInfluences[0],1);
    let furthest=0;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<-.10) {
      mesh.getVertexPosition(i,point);furthest=Math.max(furthest,point.z-positions.getZ(i));
    }
    assert.ok(furthest>.025,'Fingertips wrap inward beneath the rim');
    sk.trick=null;let previous=1;
    for(let i=0;i<80;i++) {
      character.update(sk,dt,i*dt);const value=mesh.morphTargetInfluences[0];
      assert.ok(value<=previous&&previous-value<.3,'Release opens the fingers continuously');previous=value;
    }
    assert.equal(previous,0);
    assert.deepEqual(source.getAttribute('position').array,original,'Shared body art remains unmodified');
  }
  character.dispose();assert.equal(disposed,3,'Switches and final disposal release all owned morph geometry');
});

for(const character of characters)character.dispose();
console.log(`${checks}/${checks} grab pose checks passed.`);

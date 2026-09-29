// Focused physical/visual contracts for the filled C bank and supported park
// fixtures. Inputs drive real skating; rendering checks inspect built geometry.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {RocCityLevel} from '../src/roc-city-level.js';
import {createRocPickups} from '../src/roc-city-layout.js';
import {createRocCityArt} from '../src/roc-city-art.js';
import {Skater} from '../src/skater.js';
import {makeState} from '../src/input.js';
import {trailPoints} from '../src/roc-city-surroundings.js';

const dt=1/120,ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),checks=[];
let passed=0,failed=0;
function check(name,run){
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
  try{const detail=run();passed++;checks.push({name,passed:true,detail});console.log('PASS: '+name);}
  catch(error){failed++;checks.push({name,passed:false,error:error.message});console.error('FAIL: '+name+'\n'+error.stack);}
}
function ground(level,point,objects=level.colliders){
  ray.set(point.clone().setY(10),down);ray.far=25;return ray.intersectObjects(objects,false)[0];
}
function fixture(level,point,direction,speed=5){
  const s=new Skater(level,()=>.5),hit=ground(level,point);assert(hit,'Starting fixture needs actual ground');
  s.pos.copy(hit.point);s.normal.copy(hit.normal||new THREE.Vector3(0,1,0));
  s.heading.copy(direction).setY(0).normalize();s.facing.copy(s.heading);s.speed=speed;s.vel.copy(s.heading).multiplyScalar(speed);return s;
}
function traverse(level,from,to){
  const s=fixture(level,from,to.clone().sub(from)),bails=[];let reached=false,min=s.pos.y,max=min;
  s.events.bail=reason=>bails.push(reason);
  for(let i=0;i<1200&&!bails.length;i++){
    const dx=to.x-s.pos.x,dz=to.z-s.pos.z;if(Math.hypot(dx,dz)<.35){reached=true;break;}
    const angle=Math.atan2(s.heading.x*dz-s.heading.z*dx,s.heading.x*dx+s.heading.z*dz),input=makeState();
    input.steer=s.state==='ride'?THREE.MathUtils.clamp(angle*1.8,-1,1):0;
    input.push=s.speed<5?1:0;input.brake=s.speed>5.2?.5:0;s.update(dt,input);min=Math.min(min,s.pos.y);max=Math.max(max,s.pos.y);
  }
  return{reached,bails,min,max,position:s.pos.toArray()};
}

check('Glancing contacts are opt-in: solid boundaries block while untagged Warehouse-style walls retain their response',()=>{
  const results=[];
  for(const solidBoundary of [false,true]){
    const material=new THREE.MeshBasicMaterial(),floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),material);
    floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(.06,2,50),material);wall.position.y=1;wall.userData.solidBoundary=solidBoundary;wall.updateMatrixWorld(true);
    const heading=new THREE.Vector3(.3,0,Math.sqrt(1-.3**2));
    const level={colliders:[floor,wall],rails:[],spawn:{pos:new THREE.Vector3(-.9,0,-4),heading}},s=new Skater(level,()=>.5),bails=[];
    s.speed=5;s.vel.copy(heading).multiplyScalar(5);s.events.bail=reason=>bails.push(reason);let furthestX=s.pos.x;
    for(let i=0;i<180&&!bails.length;i++){s.update(dt,{...makeState(),push:1});furthestX=Math.max(furthestX,s.pos.x);}
    if(solidBoundary)assert(furthestX<-.03,'Opted-in wall must prevent penetration at the shallow approach angle');
    else assert(furthestX>.5,'Untagged collision response must remain unchanged');
    results.push({solidBoundary,furthestX,bails});floor.geometry.dispose();wall.geometry.dispose();material.dispose();
  }
  return results;
});

for(const scale of [1,1.25]){
  const level=new RocCityLevel({horizontalScale:scale}),root=new THREE.Group();root.add(level.group);
  const art=createRocCityArt(root,level,{lowfx:true});root.updateMatrixWorld(true);
  const world=p=>new THREE.Vector3(p[0]*scale,p[1],p[2]*scale);
  const dressing=level.group.getObjectByName('ROC City / Riverway landscape and I-490');
  const terrain=level.colliders.filter(mesh=>!level.fixtureColliders.includes(mesh));
  check(`C at ${scale}×: a lower-side approach cannot ride beneath the visible bank`,()=>{
    const s=fixture(level,world([7,0,8]),new THREE.Vector3(-1,0,-1)),bails=[];
    s.events.bail=reason=>bails.push(reason);let minimumClearance=Infinity;const contacts=[];
    const roofs=[level.deckConnector,level.deckConnectorEnd,level.flowerDeck];
    for(let i=0;i<240;i++){
      const previousSpeed=s.speed;s.update(dt,{...makeState(),push:1});
      if(s.speed<previousSpeed*.2)contacts.push({frame:i,speed:s.speed,position:s.pos.toArray()});
      const roof=ground(level,s.pos,roofs);
      if(roof)minimumClearance=Math.min(minimumClearance,s.pos.y-roof.point.y);
      if(s.state==='bail')break;
    }
    assert(minimumClearance>=-.1,'Rider entered beneath ramp by '+(-minimumClearance).toFixed(3)+'m');
    assert(bails.includes('wall')||contacts.length>0,'Solid concrete must interrupt this lower-side approach');
    return{minimumClearance:Number.isFinite(minimumClearance)?minimumClearance:null,contacts,bails,position:s.pos.toArray()};
  });
  check(`C at ${scale}×: filling the underside preserves ordinary bank ascent and descent`,()=>{
    const results=[];
    for(const [a,b]of [[[1,1.62,0],[7,0,0]],[[1.6,1.62,3.3],[7,0,4.6]]]){
      for(const [from,to]of [[a,b],[b,a]]){
        const result=traverse(level,world(from),world(to));assert(result.reached,JSON.stringify(result));
        assert.deepEqual(result.bails,[]);assert(result.max-result.min>1.5);results.push(result);
      }
    }
    return results;
  });
  check(`Deck fences at ${scale}×: every foot rests on the real deck and spans remain continuous`,()=>{
    const results=[];
    assert.deepEqual(dressing.userData.fixtures,level.fixtures,'Art and collision consume the same paths');
    for(const fence of level.fixtures.railings){
      const positions=new Set();let samples=0;
      for(const post of fence.posts){
        const [x,y,z]=post.position,key=`${x.toFixed(6)},${z.toFixed(6)}`;
        assert(!positions.has(key),'Joined spans should share one corner post');positions.add(key);
        for(const dx of [-post.footSize[0]/2,post.footSize[0]/2])for(const dz of [-post.footSize[2]/2,post.footSize[2]/2]){
          const hit=ground(level,world([x+dx,y,z+dz]),terrain);assert(hit,'Rail foot needs ground');
          assert(Math.abs(hit.point.y-y)<.015,`Floating rail foot: ${x+dx},${z+dz}, support ${hit.point.y}`);samples++;
        }
      }
      const rendered=dressing.getObjectByName('Galvanized park railing');assert(rendered);
      for(const rail of fence.rails){
        const middle=world(rail.a).lerp(world(rail.b),.5);
        ray.set(middle.clone().add(new THREE.Vector3(0,.1,0)),down);ray.far=.2;
        assert(ray.intersectObject(rendered,false).length,'Rendered metal must occupy every shared rail span');
      }
      for(let i=3;i<fence.rails.length;i++)assert.deepEqual(fence.rails[i].a,fence.rails[i-3].b,'Rails meet without corner gaps');
      results.push({id:fence.id,posts:positions.size,footCornerSamples:samples,visibleSpans:fence.rails.length});
    }
    return results;
  });
  check(`West fence at ${scale}×: riding into a span stops before the edge while entrances stay open`,()=>{
    const fence=level.fixtures.westRailing,a=world([fence.points[1][0],fence.baseY,fence.points[1][1]]);
    const b=world([fence.points[2][0],fence.baseY,fence.points[2][1]]),middle=a.clone().lerp(b,.5);
    const outward=new THREE.Vector3(-(b.z-a.z),0,b.x-a.x).normalize();
    const s=fixture(level,middle.clone().addScaledVector(outward,-1.5*scale),outward),bails=[];
    s.events.bail=reason=>bails.push(reason);
    for(let i=0;i<180&&!bails.length;i++)s.update(dt,{...makeState(),push:1});
    assert(bails.includes('wall')||s.speed<1,'The visible safety fence blocks a rider between its posts');
    assert(s.pos.clone().sub(middle).dot(outward)<0,'Rider must stop on the deck side');
    const routes=[];
    for(const [from,to]of [[[-7.3,0,-45],[0,1.62,-45]],[[0,1.62,-45],[-7.3,0,-45]],[[-12,0,11],[-5,0,11]],[[-5,0,11],[-12,0,11]]]){
      const result=traverse(level,world(from),world(to));assert(result.reached,JSON.stringify(result));assert.deepEqual(result.bails,[]);routes.push(result);
    }
    return{blockedAt:s.pos.toArray(),openRoutes:routes};
  });
  check(`Benches at ${scale}×: built seat ends align, feet are planted and the trail remains clear`,()=>{
    const seats=dressing.getObjectByName('Galvanized park railing'),frames=dressing.getObjectByName('Park light graphite');
    const path=trailPoints(level.layout),results=[];
    for(const bench of level.fixtures.benches){
      // Invert one complete bench transform, independent of how its individual
      // boxes were authored. Former staggered slats fail these common end planes.
      const transform=new THREE.Matrix4().compose(world(bench.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),bench.rotationY),new THREE.Vector3(scale,1,scale));
      const inverse=transform.clone().invert(),localVertices=mesh=>{
        const values=[],attribute=mesh.geometry.attributes.position;
        for(let i=0;i<attribute.count;i++){
          const vertex=new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          if(Math.abs(vertex.x)<bench.width/2+.05&&Math.abs(vertex.z)<bench.depth/2+.05&&vertex.y>=-.01&&vertex.y<=bench.height+.02)values.push(vertex);
        }
        return values;
      };
      const seatVertices=localVertices(seats).filter(v=>Math.abs(v.y-.525)<1e-5);
      assert(seatVertices.length>=24,'All seat slats must appear in the rendered model');
      for(const vertex of seatVertices)assert(Math.abs(Math.abs(vertex.x)-bench.width/2)<1e-4,'Seat slats share two straight end planes');
      const seatRows=new Set(seatVertices.map(v=>v.z.toFixed(4)));assert.equal(seatRows.size,8,'Four distinct slats retain visible gaps');
      const feet=localVertices(frames).filter(v=>Math.abs(v.y)<1e-5),unique=new Map(feet.map(v=>[`${v.x.toFixed(4)},${v.z.toFixed(4)}`,v]));
      assert.equal(unique.size,16,'Four feet have four planted corners each');
      let maxGap=0,minimumTrailDistance=Infinity;
      for(const local of unique.values()){
        const point=local.clone().applyMatrix4(transform),hit=ground(level,point,terrain);assert(hit,'Bench foot needs real support');
        maxGap=Math.max(maxGap,Math.abs(point.y-hit.point.y));
      }
      assert(maxGap<.02,`Bench feet float above actual terrain by ${maxGap}`);
      for(const vertex of [...seatVertices,...unique.values()]){
        const point=vertex.clone().applyMatrix4(transform);
        for(const p of path)minimumTrailDistance=Math.min(minimumTrailDistance,Math.hypot(point.x/scale-p.x,point.z/scale-p.z));
      }
      assert(minimumTrailDistance>level.layout.trailWidth/2+.2,'Furniture leaves the Riverway travel lane open');
      results.push({id:bench.id,seatEndVertices:seatVertices.length,footCorners:unique.size,maxGroundGap:maxGap,minimumTrailDistance});
    }
    return results;
  });
  check(`Benches at ${scale}×: an ordinary approach meets the visible frame`,()=>{
    const results=[];
    for(const bench of level.fixtures.benches){
      const direction=new THREE.Vector3(Math.sin(bench.rotationY),0,Math.cos(bench.rotationY));
      const center=world(bench.position),s=fixture(level,center.clone().addScaledVector(direction,-2*scale),direction),bails=[];
      s.events.bail=reason=>bails.push(reason);
      for(let i=0;i<120&&!bails.length;i++)s.update(dt,{...makeState(),push:1});
      assert(bails.includes('wall')||s.speed<1,'A rider cannot pass through the center of the bench frame');
      assert(s.pos.clone().sub(center).dot(direction)<.05,'Bench collision precedes the rear frame');
      results.push({id:bench.id,position:s.pos.toArray(),bails});
    }
    return results;
  });
  check(`F at ${scale}×: clearance relocation preserves its established shape and keeps cap two on deck`,()=>{
    const rails=level.rails.filter(rail=>rail.feature==='F');assert.equal(rails.length,36);
    const canonical=rails.map(rail=>[rail.kind,...[rail.a,rail.b].map(p=>[p.x/scale-1,p.y,p.z/scale].map(v=>Math.round(v*1e5)/1e5))]);
    assert.equal(createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),'2b1a526c1f8000de72b2ca7b54155d6aa410272f8e432b449bf1f9c8d607fc73','Only the intentional one-metre authored translation changes F');
    const cap=createRocPickups(scale).find(p=>p.id==='cap-2'),hit=ground(level,new THREE.Vector3().fromArray(cap.position),terrain);
    assert(hit);assert(Math.abs(hit.point.y-1.62)<.002,'Cap two stays over the ordinary deck, clear of the moved ledge');
    return{linkedRails:rails.length,capSupport:hit.point.y};
  });
  art.dispose();
}
if(process.env.ROC_FIXTURE_REPORT){
  const path=resolve(process.env.ROC_FIXTURE_REPORT);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify({recordedAt:new Date().toISOString(),checks,passed:failed===0},null,2)+'\n');
}
console.log(`${passed} ROC fixture checks passed${failed?', '+failed+' failed':''}.`);
if(failed)process.exitCode=1;

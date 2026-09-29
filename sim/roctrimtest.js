// Visible finish must stay aligned with the physical skate surfaces. The later
// layout correction revises B/C/G and fixture clearance moves F; preserve the
// unaffected features. F's translated path is covered by rocfixturetest.js.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';

// Hashes below were captured before the B/C/G layout correction at scale 1.
const level=new RocCityLevel({horizontalScale:1}),up=new THREE.Vector3(0,1,0),ray=new THREE.Raycaster();
let passed=0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function test(name,run){run();passed++;console.log(`PASS: ${name}`);}

test('Unchanged D/E/H/I/J/K/L features retain their validated surfaces and grind paths',()=>{
  const unchanged=new Set(['D','E','H','I','J','K','L']);
  const rails=level.rails.filter(rail=>unchanged.has(rail.feature)).map(rail=>[rail.feature,rail.kind,rail.a.toArray(),rail.b.toArray()]);
  const colliders=level.colliders.filter(mesh=>unchanged.has(mesh.userData.feature)).map(mesh=>[
    mesh.userData.feature,
    Array.from(mesh.geometry.attributes.position.array),
    mesh.geometry.index?Array.from(mesh.geometry.index.array):null,
    mesh.matrixWorld.toArray(),
  ]);
  assert.equal(rails.length,199);assert.equal(colliders.length,10);
  assert.equal(hash(rails),'25487e5e07caf4d0ae365632207203852d9636f6186d034c7ac71d0a0c8d361b');
  assert.equal(hash(colliders),'9cea3947b7aa9178c539f13062f214345cf89c0e804782d0cc3ae32b9bb3d59b');
});

test('Broad painted borders follow the exact grind targets and stay visual only',()=>{
  assert(level.paintedTrim.length>40);
  for(const {rail,mesh,width} of level.paintedTrim){
    assert(width>=.15,'Caps are broad painted strips rather than thin rods');
    assert(!level.colliders.includes(mesh),'Paint introduces no new riding collision');
    for(const t of [.05,.5,.95]){
      const target=rail.a.clone().lerp(rail.b,t);
      ray.set(target.clone().addScaledVector(up,.5),up.clone().negate());ray.far=1;
      const hit=ray.intersectObject(mesh,false)[0];
      assert(hit,`${mesh.name} visibly covers its grind line`);
      assert(Math.abs(hit.point.y-target.y)<.006,'Visual edge aligns within6mm of the validated target');
    }
    const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;
    for(let i=0;i<indices.count;i+=3){
      const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,indices.getX(i+k)));
      const cross=points[1].sub(points[0]).cross(points[2].sub(points[0]));
      assert(Number.isFinite(cross.length())&&cross.length()>1e-7,'Cap faces are finite and nondegenerate');
    }
  }
});

test('E/J arches and I posts meet the visible skating surface and stay under their rail',()=>{
  const arches=level.railSupports.filter(support=>support.kind==='arch');
  assert.equal(arches.length,4,'One stair arch and three flatbar bays');
  assert.equal(level.railSupports.filter(support=>support.mesh.name.startsWith('I —')).length,3);
  for(const support of level.railSupports){
    assert(!level.colliders.includes(support.mesh));
    for(const bottom of [support.bottom,support.otherBottom].filter(Boolean)){
      ray.set(bottom.clone().addScaledVector(up,.5),up.clone().negate());ray.far=1;
      const ground=ray.intersectObjects(level.colliders,false)[0];
      assert(ground&&ground.point.distanceTo(bottom)<.002,'Every support is seated on an actual collision surface');
    }
    if(support.kind==='arch')for(let i=0;i<=24;i++){
      const point=support.curve.getPoint(i/24),rail=support.rail;
      const t=THREE.MathUtils.clamp(point.clone().sub(rail.a).dot(rail.dir)/rail.len,0,1);
      assert(point.y<rail.a.clone().lerp(rail.b,t).y-.025,'The arch never crosses the grind surface');
    }
  }
});

test('J flatbar top and rounded D coping remain centered on their grind paths',()=>{
  const flat=level.rails.find(rail=>rail.feature==='J'),mesh=flat.visuals[0];
  assert.equal(mesh.geometry.type,'BoxGeometry');
  const midpoint=flat.a.clone().lerp(flat.b,.5);
  ray.set(midpoint.clone().addScaledVector(up,.5),up.clone().negate());ray.far=1;
  const hit=ray.intersectObject(mesh,false)[0];assert(hit&&Math.abs(hit.point.y-midpoint.y)<1e-6);
  const pool=level.rails.filter(rail=>rail.feature==='D'),pale=pool.filter(rail=>rail.visuals[0].material===level.mats.poolCoping);
  assert(pale.length>pool.length*.6&&pale.length<pool.length*.9,'Mostly pale coping retains a distinct yellow lobe accent');
  for(const rail of pool)assert(rail.visuals[0].position.distanceTo(rail.a.clone().lerp(rail.b,.5))<1e-8);
});

test('The deep-lobe tile strip has continuous arc-length UVs and only two draw groups',()=>{
  const mesh=level.poolBand,g=mesh.geometry,uv=g.attributes.uv,p=g.attributes.position;
  assert.equal(g.groups.length,2);assert(g.groups.every(group=>group.count>0));
  assert.equal(g.groups.reduce((sum,group)=>sum+group.count,0),g.index.count);
  for(let i=0;i<p.count;i++){
    assert(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));
    assert(uv.getY(i)>=0&&uv.getY(i)<=1);
    assert(p.getY(i)>1.38&&p.getY(i)<1.627,'The band stays on its original wall strip');
  }
  for(let i=0;i<g.index.count;i+=3){
    const values=[0,1,2].map(k=>uv.getX(g.index.getX(i+k)));
    assert(Math.max(...values)-Math.min(...values)<1,'No triangle stretches its pattern across the perimeter seam');
  }
});

console.log(`${passed}/${passed} ROC trim checks passed.`);

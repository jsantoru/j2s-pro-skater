// Pass 3 must improve the visible finish without changing the validated skate
// surfaces or grind paths from the pass 2 checkpoint (e4834a0).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';

const level=new RocCityLevel(),up=new THREE.Vector3(0,1,0),ray=new THREE.Raycaster();
let passed=0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function test(name,run){run();passed++;console.log(`PASS: ${name}`);}

test('The complete pass 2 collider surfaces and grind endpoints remain unchanged',()=>{
  const rails=level.rails.map(rail=>[rail.kind,rail.a.toArray(),rail.b.toArray()]);
  const colliders=level.colliders.map(mesh=>[
    Array.from(mesh.geometry.attributes.position.array),
    mesh.geometry.index?Array.from(mesh.geometry.index.array):null,
    mesh.matrixWorld.toArray(),
  ]);
  assert.equal(hash(rails),'0f2a83a3efd019c9b34c918ac9680c5cff99fadab11a1a39a6cdf0abf3e4f0fd');
  assert.equal(hash(colliders),'6109205ae05935ff0d0642f2b312ebfee8f184b08b19768099abda17c67611b6');
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

// Scenery registration is independent of rendering quality, and dressing may
// never alter the park's riding surfaces or leak resources across world changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {PerintonLevel} from '../src/perinton-level.js';
import {registerPerintonArtFixtures,createPerintonArt} from '../src/perinton-art.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function gameplay(level){
  level.group.updateMatrixWorld(true);const railIndex=new Map(level.rails.map((r,i)=>[r,i]));
  const mesh=m=>({id:m.uuid,geometry:m.geometry.uuid,matrix:m.matrixWorld.toArray(),visible:m.visible,
    shape:hash({p:Array.from(m.geometry.attributes.position.array),n:Array.from(m.geometry.attributes.normal.array),index:m.geometry.index?Array.from(m.geometry.index.array):null}),data:m.userData});
  const serialize=v=>railIndex.has(v)?{rail:railIndex.get(v)}:v?.isVector3?v.toArray():v?.isMesh?mesh(v):Array.isArray(v)?v.map(serialize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,n])=>[k,serialize(n)])):v;
  return {colliders:level.colliders.map(mesh),rails:level.rails.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,serialize(v)])))};
}
function resources(group,result=new Set()){
  group.traverse(node=>{if(node.geometry)result.add(node.geometry);if(node.isInstancedMesh)result.add(node);
    for(const material of[...(Array.isArray(node.material)?node.material:node.material?[node.material]:[]),node.customDepthMaterial,node.customDistanceMaterial].filter(Boolean))result.add(material);
  });
  for(const material of [...result].filter(r=>r.isMaterial))for(const v of Object.values(material))if(v?.isTexture)result.add(v);return result;
}
function watch(set){const result=new Map();for(const item of set){result.set(item,0);item.addEventListener('dispose',()=>result.set(item,result.get(item)+1));}return result;}
function ground(objects,x,z,y=10){const ray=new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0),0,30);return ray.intersectObjects(objects,true).find(hit=>hit.face.normal.y>.01);}
function inside(p,x,z){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const stats=[];let passed=0;
function check(name,test){test();passed++;console.log('PASS: '+name);}

for(const lowfx of[false,true]){
  const name=lowfx?'mobile':'desktop',level=new PerintonLevel(),root=new THREE.Group();root.add(level.group);
  const originalCount=level.colliders.length;registerPerintonArtFixtures(level);const fixtureCount=level.artColliders.length;
  check(`${name} shared fixtures register once and support all visitor pads`,()=>{
    const fixtures=level.artFixtures;registerPerintonArtFixtures(level);assert.equal(level.colliders.length,originalCount+fixtureCount);
    assert.equal(level.artFixtures,fixtures);assert.equal(level.artFixtures.cars.length,6);assert.equal(level.artFixtures.tables.length,5);
    for(const pad of fixtures.pads)for(const dx of[-.49,.49])for(const dz of[-.49,.49]){
      const hit=ground(level.colliders,pad.position[0]+dx*pad.size[0],pad.position[2]+dz*pad.size[2],.15);
      assert(hit&&Math.abs(hit.point.y)<1e-6,`${pad.id} has an unsupported corner`);
    }
    assert(level.artRails.every(r=>r.requiresIntent&&r.captureRadius<=.65),'Scenery must not steal ordinary airs');
  });
  const original=gameplay(level),gameResources=resources(level.group),gameDisposed=watch(gameResources);
  for(let cycle=0;cycle<2;cycle++){
    const art=createPerintonArt(root,level,{lowfx});root.updateMatrixWorld(true);
    check(`${name} ${cycle?'rebuilt':'initial'} art preserves full collision and rail data`,()=>{
      assert.equal(createPerintonArt(root,level,{lowfx}),art,'Repeated world selection reuses art');
      const initialGeometry=resources(art.dressing);
      for(const time of[0,.1,1,17.5,58,120,0])art.update(time);
      assert.deepEqual(gameplay(level),original);assert.deepEqual(resources(art.dressing),initialGeometry,'Animation does not allocate geometry or materials');
      art.dressing.traverse(node=>{
        if(node.geometry)for(const attribute of Object.values(node.geometry.attributes))assert([...attribute.array].every(Number.isFinite),`${node.name} finite geometry`);
        for(const mat of[...(Array.isArray(node.material)?node.material:node.material?[node.material]:[]),node.customDepthMaterial,node.customDistanceMaterial].filter(Boolean))assert(art.dressing.userData.materials.has(mat),'Register even shadow-only material');
      });
    });
    if(cycle===0){
      check(`${name} bowl opening, pump and entry remain visibly unobstructed`,()=>{
        for(const [x,z]of[[6,-11],[12.5,-11],[-5,12],[4,10],[17,8]]){
          const hit=ground([art.dressing],x,z,2);
          if(x>3&&z<-8)assert(!hit,'Scenery must not cover the bowl opening');
          else assert(!hit,'No lawn is rendered beneath the plaza, regardless of camera depth bias');
        }
        for(const p of level.pumpPoints.filter((_,i,all)=>i>0&&i<all.length-1&&i%16===0)){
          const hit=ground([art.dressing],p[0],p[2],2);
          assert(!hit,`Lawn must be cut out beneath the pump track at ${p}`);
        }
        // The broad visitor entry stays passable below the shade; neither its
        // posts nor the two picnic tables cross the centre access corridor.
        const ray=new THREE.Raycaster(new THREE.Vector3(0,.8,27),new THREE.Vector3(0,0,-1),0,8);
        assert.equal(ray.intersectObjects(level.artColliders,false).length,0);
      });
      check(`${name} lawn difference handles overlapping concave park footprints without stray triangles`,()=>{
        const lawn=art.dressing.getObjectByName('Perinton mown natural lawn'),p=lawn.geometry.attributes.position;
        const exclusions=[level.layout.mainOutline,level.layout.turfOutline,level.pumpOutline,level.bowlDeckOutline];
        let positive=0;
        for(let i=0;i<p.count;i+=3){
          const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
          if(b.clone().sub(a).cross(c.clone().sub(a)).length()<1e-8)continue;
          const x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3;
          assert(!exclusions.some(outline=>inside(outline,x,z)),`Grass triangle inside a riding footprint at ${x},${z}`);positive++;
        }
        assert(positive>100,'Exercise the detailed footprint intersections');
        for(const [x,z]of[[-25,2],[-15,-11],[23,3],[-9,16]])assert(ground([lawn],x,z,.1),'Keep natural grass pockets outside the riding footprint');
      });
      check(`${name} car and picnic grinds contact the actual rendered upper edges`,()=>{
        for(const rail of level.artRails){
          for(const t of[.2,.5,.8]){
            const point=rail.a.clone().lerp(rail.b,t);
            // Exact rim hits are sensitive to Float32 edge rounding; sample a
            // millimetre toward the material while retaining the real height.
            const source=rail.category==='car'?level.artFixtures.cars.find(c=>c.id===rail.feature):level.artFixtures.tables.find(t=>t.id===rail.feature);
            const center=rail.category==='car'?new THREE.Vector3(source.x,point.y,source.z):new THREE.Vector3(...source.parts.find(p=>p.id===rail.environmentPart).position).setY(point.y);
            const sample=point.clone().lerp(center,.001);
            const physical=ground(level.artColliders,sample.x,sample.z,point.y+.08),visible=ground([art.dressing],sample.x,sample.z,point.y+.08);
            assert(physical&&visible,`Missing real surface for ${rail.feature}/${rail.environmentPart}`);
            assert(Math.abs(physical.point.y-visible.point.y)<.004,'Collision must match the visible edge');
            assert(Math.abs(physical.point.y-point.y)<.01,`Grind must follow ${rail.feature}/${rail.environmentPart}: ${physical.point.y} vs ${point.y}`);
          }
        }
      });
      let triangles=0,draws=0;
      art.dressing.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
      // The woodland ring is deliberately fuller than the sparse first pass;
      // its far crowns use reduced geometry and remain a single foliage draw.
      stats.push({lowfx,draws,triangles});assert(draws<=36&&triangles<(lowfx?150000:220000),'Scenery must stay within its mobile/desktop budget');
    }
    check(`${name} ${cycle?'rebuilt':'initial'} art releases only its owned resources exactly once`,()=>{
      const owned=resources(art.dressing);resources(art.lights,owned);for(const mat of art.dressing.userData.materials)owned.add(mat);
      for(const resource of owned)assert(!gameResources.has(resource));
      const disposed=watch(owned);art.dispose();art.dispose();art.update(42);
      for(const [resource,count]of disposed)assert.equal(count,1,`${resource.name||resource.type} leaked or double-disposed`);
      for(const count of gameDisposed.values())assert.equal(count,0,'Scenery does not dispose gameplay resources');
      assert.equal(root.children.length,1);assert.equal(art.dressing.parent,null);assert.deepEqual(gameplay(level),original);
    });
  }
}
check('mobile reduces real foliage work while preserving the complete scenery',()=>{assert(stats[1].triangles<stats[0].triangles*.8);assert.equal(stats[1].draws,stats[0].draws);});
console.log(`${passed}/${passed} Perinton scenery checks passed. ${JSON.stringify(stats)}`);

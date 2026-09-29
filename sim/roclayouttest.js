// Layout correction gate: inspect actual world surfaces and drive real inputs
// at both authored and production scale. No direct rail attachment is used.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';

const dt=1/120,down=new THREE.Vector3(0,-1,0),ray=new THREE.Raycaster();
let passed=0,failed=0;
const checks=[];
function check(name,run){
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
  try{const result=run();passed++;checks.push({name,passed:true,detail:result});console.log(`PASS: ${name}${result?' '+JSON.stringify(result):''}`);}
  catch(error){failed++;checks.push({name,passed:false,error:error.message});console.error(`FAIL: ${name}\n${error.stack}`);}
}
function support(level,point,objects=level.colliders){
  ray.set(point.clone().setY(10),down);ray.far=20;return ray.intersectObjects(objects,false)[0];
}
function rider(level,point,direction,speed=7){
  const hit=support(level,point);assert(hit,'Approach needs physical support: '+point.toArray());
  const skater=new Skater(level,()=>.5);skater.pos.copy(hit.point);
  skater.heading.copy(direction).setY(0).normalize();skater.facing.copy(skater.heading);
  skater.speed=speed;skater.vel.copy(skater.heading).multiplyScalar(speed);return skater;
}
function skateGrind(level,rail,{lead=5,pop=2,speed=7}={}){
  const tangent=rail.dir.clone().setY(0).normalize(),edge=rail.a;
  const skater=rider(level,edge.clone().addScaledVector(tangent,-lead),tangent,speed);
  let previous=false,released=false,longest=0,exited=false;
  const bails=[],captures=[];
  skater.events.bail=reason=>bails.push(reason);
  skater.events.grindStart=()=>captures.push({feature:skater.grind.rail.feature,dir:skater.grind.dir,target:skater.grind.rail===rail});
  skater.events.grindEnd=()=>{if(skater.grind?.rail===rail)exited=true;};
  for(let i=0;i<1200&&!bails.length;i++){
    const input=makeState(),before=edge.clone().sub(skater.pos).dot(tangent);
    input.push=skater.speed<speed?1:0;input.brake=skater.speed>speed+.2?.5:0;
    input.ollie=!released&&before>pop;if(!input.ollie)released=true;input.grind=true;
    input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
    if(skater.state==='grind'){
      if(skater.grind.rail===rail)longest=Math.max(longest,skater.grind.time);
      input.steer=THREE.MathUtils.clamp(-skater.balance.x*3-skater.balance.v,-1,1);
    }
    skater.update(dt,input);
    if(exited&&skater.state==='ride'&&skater.score>0)break;
  }
  return{captures,bails,longest,score:skater.score,position:skater.pos.toArray(),state:skater.state};
}
function rideBetween(level,start,end){
  const skater=rider(level,start,end.clone().sub(start),5),bails=[];
  let minimum=skater.pos.y,maximum=minimum,reached=false;
  skater.events.bail=reason=>bails.push(reason);
  for(let i=0;i<1200&&!bails.length;i++){
    const dx=end.x-skater.pos.x,dz=end.z-skater.pos.z;
    if(Math.hypot(dx,dz)<.35){reached=true;break;}
    const angle=Math.atan2(skater.heading.x*dz-skater.heading.z*dx,skater.heading.x*dx+skater.heading.z*dz),input=makeState();
    input.steer=skater.state==='ride'?THREE.MathUtils.clamp(angle*1.8,-1,1):0;
    input.push=skater.speed<5?1:0;input.brake=skater.speed>5.2?.5:0;
    skater.update(dt,input);minimum=Math.min(minimum,skater.pos.y);maximum=Math.max(maximum,skater.pos.y);
  }
  return{reached,bails,minimum,maximum,position:skater.pos.toArray()};
}

for(const scale of [1,1.25]){
  const level=new RocCityLevel({horizontalScale:scale});
  const stair=level.colliders.find(mesh=>mesh.userData.feature==='G'&&mesh.userData.steps===9);
  const rail=level.rails.find(item=>item.feature==='G'&&item.kind==='rail');
  check(`B/G at ${scale}×: extension foundation meets the deck and hubba sidewalls are solid to ground`,()=>{
    const extension=level.miniExtension;extension.geometry.computeBoundingBox();
    const bounds=extension.geometry.boundingBox,center=bounds.getCenter(new THREE.Vector3());
    const base=new THREE.Box3().setFromObject(extension).min.y,adjacent=[];
    for(const axis of ['x','z'])for(const sign of [-1,1]){
      const edge=center.clone();edge[axis]=bounds[sign===1?'max':'min'][axis]+sign*.025;
      const point=extension.localToWorld(edge),ground=support(level,point,level.colliders.filter(mesh=>mesh!==extension));
      assert(ground,'Extension edge requires underlying deck');adjacent.push(ground.point.y);
      assert(base<=ground.point.y+.002,'The extension base must reach every adjoining deck edge');
      const direction=new THREE.Vector3();direction[axis]=-sign;direction.transformDirection(extension.matrixWorld);
      const origin=point.clone().addScaledVector(direction,-.25*scale).setY(ground.point.y+.025);
      ray.set(origin,direction);ray.far=.6*scale;
      assert(ray.intersectObject(extension,false).length,'Extension side closes the visible gap above adjoining ground');
    }
    const hubbas=level.colliders.filter(mesh=>mesh.userData.feature==='G'&&mesh.userData.part==='hubba');
    assert.equal(hubbas.length,2);
    for(const mesh of hubbas)for(const sign of [-1,1]){
      const halfWidth=mesh.geometry.parameters.options.depth/2;
      const origin=mesh.localToWorld(new THREE.Vector3(level.layout.nineStair.run*.5,.25,sign*(halfWidth+.5)));
      const direction=new THREE.Vector3(0,0,-sign).transformDirection(mesh.matrixWorld);
      ray.set(origin,direction);ray.far=scale;
      assert(ray.intersectObject(mesh,false).length,'Hubba side below the former floating strip must be closed');
    }
    return{extensionBase:base,adjacentDeckHeights:adjacent,solidHubbas:hubbas.length};
  });
  check(`B at ${scale}×: an intentional centre-line ollie captures the extension and lands its grind`,()=>{
    const m=level.layout.mini,skater=rider(level,new THREE.Vector3(m.center[0]*scale,0,m.center[1]*scale),new THREE.Vector3(m.axis[0],0,m.axis[1]));
    const captures=[],bails=[];let previous=false,released=false;
    skater.events.bail=reason=>bails.push(reason);
    skater.events.grindStart=()=>captures.push({feature:skater.grind.rail.feature,kind:skater.grind.rail.kind});
    for(let i=0;i<600&&!bails.length&&!skater.score;i++){
      const along=(skater.pos.x-m.center[0]*scale)*m.axis[0]+(skater.pos.z-m.center[1]*scale)*m.axis[1],input=makeState();
      input.push=1;input.grind=true;input.ollie=!released&&along<2.6*scale;if(!input.ollie)released=true;
      input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
      if(skater.state==='grind')input.steer=THREE.MathUtils.clamp(-skater.balance.x*3-skater.balance.v,-1,1);
      skater.update(dt,input);
    }
    assert(captures.some(capture=>capture.feature==='B'&&capture.kind==='ledge'),'The separate extension is actually captured');
    assert.deepEqual(bails,[]);assert(skater.score>100);return{captures,score:skater.score};
  });
  check(`G at ${scale}×: sits east of the bowl tail and descends east/southeast across the divider`,()=>{
    assert(stair&&rail);
    const direction=rail.dir.clone().setY(0).normalize(),angle=THREE.MathUtils.radToDeg(Math.atan2(direction.z,direction.x));
    assert(angle>=20&&angle<=30,'Reference-supported descent is20–30 degrees south of east');
    const center=rail.a.clone().lerp(rail.b,.5);center.x/=scale;center.z/=scale;
    assert(center.x>=2&&center.x<=4&&center.z>=6&&center.z<=9,'G belongs at the eastern end of the lower bowl terrace');
    const tailEast=Math.max(...level.bowlOutline.filter(p=>p[1]>-5).map(p=>p[0]));
    assert(center.x>tailEast+1,'The stair must be east of the shallow bowl tail');
    assert(rail.a.y>rail.b.y+1.5,'The bowl terrace is the upper side');
    const {steps,tread,rise}=stair.userData,width=stair.geometry.parameters.options.depth;
    for(const lateral of [-.3,0,.3]){
      for(const [along,height]of [[-.15,steps*rise],[-1,steps*rise],[steps*tread+.15,0],[steps*tread+2,0]]){
        const point=stair.localToWorld(new THREE.Vector3(along,0,lateral*width)),hit=support(level,point);
        assert(hit&&Math.abs(hit.point.y-height)<.025,'Upper approach/lower runout is unsupported or incorrectly covered at '+point.toArray());
      }
    }
    return{direction:direction.toArray(),descentDegrees:angle,center: center.toArray()};
  });
  check(`B/C at ${scale}×: rotated mini faces the flower deck and the G connector remains traversable both ways`,()=>{
    const mini=level.layout.mini;
    assert(mini.axis[0]>.7&&mini.axis[1]>.7,'The opposing mini transitions align northwest/southeast');
    assert.deepEqual(mini.center,[1.5,-35],'Rotate within the established north footprint');
    const g=level.layout.nineStair,results=[];
    for(const t of [.25,.7]){
      const high=new THREE.Vector3(3,1.62,2).lerp(new THREE.Vector3().fromArray(g.upperNorth),t);
      const low=new THREE.Vector3(5.4,0,2).lerp(new THREE.Vector3().fromArray(g.lowerNorth),t);
      const direction=low.clone().sub(high).setY(0).normalize();
      const from=high.clone().addScaledVector(direction,-.8),to=low.clone().addScaledVector(direction,.8);
      for(const p of [from,to]){p.x*=scale;p.z*=scale;}
      for(const [start,end]of [[from,to],[to,from]]){
        const result=rideBetween(level,start,end);assert(result.reached,JSON.stringify(result));
        assert.deepEqual(result.bails,[]);assert(result.maximum-result.minimum>1.5,'Cross the full terrace/plaza grade');results.push(result);
      }
    }
    return results;
  });
  check(`G at ${scale}×: all nine treads are visible, supported, and free of hidden deck planes`,()=>{
    assert(stair&&rail);const {rise,tread,steps}=stair.userData;
    const width=stair.geometry.parameters.options.depth,visible=[];
    level.group.traverse(mesh=>{if(mesh.isMesh&&mesh.visible)visible.push(mesh);});
    for(let i=0;i<steps;i++)for(const lateral of [-.28,.28]){
      const point=stair.localToWorld(new THREE.Vector3((i+.5)*tread,0,width*lateral));
      const physical=support(level,point),rendered=support(level,point,visible);
      const expected=stair.localToWorld(new THREE.Vector3((i+.5)*tread,(steps-i-1)*rise,width*lateral));
      assert(physical&&(physical.object===stair||i===steps-1&&Math.abs(physical.point.y)<1e-6),`Tread ${i+1} is covered by another collider: ${physical?.object.name}`);
      assert(Math.abs(physical.point.y-expected.y)<1e-5,`Tread ${i+1} height disagrees`);
      assert(rendered&&Math.abs(rendered.point.y-physical.point.y)<.006,`Tread ${i+1} is visually obstructed`);
    }
    assert.equal(steps,9);assert.equal(rise,.18);
    const descent=stair.localToWorld(new THREE.Vector3(1,0,0)).sub(stair.localToWorld(new THREE.Vector3())).setY(0).normalize();
    assert(descent.dot(rail.dir.clone().setY(0).normalize())>.9999);
    return{direction:descent.toArray(),railStart:rail.a.toArray(),railEnd:rail.b.toArray()};
  });
  check(`G at ${scale}×: held grind from a real approach follows the rail and banks on its supported runout`,()=>{
    const result=skateGrind(level,rail,{lead:scale===1?4.5:5.5,pop:2});
    assert(result.captures.some(capture=>capture.target&&capture.dir===1),JSON.stringify(result));
    assert.deepEqual(result.bails,[]);assert(result.longest>.1&&result.score>100,JSON.stringify(result));
    assert.equal(result.state,'ride');return result;
  });
}
console.log(`${passed} ROC corrected-layout checks passed${failed?', '+failed+' failed':''}.`);
if(process.env.ROC_LAYOUT_REPORT){
  const path=resolve(process.env.ROC_LAYOUT_REPORT);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify({recordedAt:new Date().toISOString(),scales:[1,1.25],method:'Actual collision raycasts and Skater.update inputs; no direct grind attachment',checks,passed:failed===0},null,2)+'\n');
}
if(failed)process.exitCode=1;

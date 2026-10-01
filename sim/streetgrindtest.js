// Street-object integration: real skating inputs, built collision meshes and
// actual rendered surfaces. No direct startGrind/pop/land calls are used.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import * as THREE from 'three';
import {RocCityLevel} from '../src/roc-city-level.js';
import {createRocCityArt} from '../src/roc-city-art.js';
import {Skater} from '../src/skater.js';
import {makeState} from '../src/input.js';

const dt=1/120,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),down=V(0,-1,0),ray=new THREE.Raycaster();
const report={passed:false,method:'Real Skater.update inputs from supported approaches; no direct attachment to rails',checks:[]};
function check(name,run){
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
  try{const detail=run();report.checks.push({name,passed:true,detail});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,error:error.message});console.error('FAIL '+name+'\n'+error.stack);}
}
function controls(values={}){return Object.assign(makeState(),{autoPush:false},values);}
function support(level,point,objects=level.colliders){ray.set(point.clone().setY(15),down);ray.far=35;return ray.intersectObjects(objects,false)[0];}
function rider(level,point,direction,{speed=6,stance=1}={}){
  const hit=support(level,point);assert.ok(hit,`supported approach at ${point.toArray()}`);
  const sk=new Skater(level,()=>.5);sk.pos.copy(hit.point);
  const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
  sk.normal.copy(normal);sk.heading.copy(direction).setY(0).normalize();sk.facing.copy(sk.heading).multiplyScalar(stance);sk.stance=stance;
  sk.modelQuat.setFromAxisAngle(V(0,1,0),Math.atan2(sk.facing.x,sk.facing.z));sk.speed=speed;sk.vel.copy(sk.heading).multiplyScalar(speed);return sk;
}
function linked(first){const rails=[],seen=new Set();for(let r=first;r&&!seen.has(r);r=r.bLink?.rail){rails.push(r);seen.add(r);}return rails;}
function runGrind(level,rails,{dir=1,stance=1,speed=6,lead=5,pop=3,entryT=null,offset=0,seconds=16,exitAfter=null,exitSteer=0,holdGrindOnExit=false,rearmAfter=null,stopOnRecapture=false}={}){
  assert.ok(rails.length,'target rail exists');
  const entry=dir===1?rails[0]:rails.at(-1),t=entryT??(dir===1?0:1);
  const target=entry.a.clone().lerp(entry.b,t),heading=entry.dir.clone().setY(0).normalize().multiplyScalar(dir);
  const start=target.clone().addScaledVector(heading,-lead).addScaledVector(V(-heading.z,0,heading.x),offset);
  const direction=target.clone().sub(start).setY(0).normalize();
  const sk=rider(level,start,direction,{speed,stance}),wanted=new Set(rails),visited=new Set();
  const bails=[],captures=[],banked=[];let released=false,previous=false,previousGrind=false,longest=0,exited=false,exitAge=null,airAfterExit=false;
  sk.events.bail=reason=>bails.push(reason);
  sk.events.grindStart=name=>captures.push({name,target:wanted.has(sk.grind.rail),feature:sk.grind.rail.feature,dir:sk.grind.dir,stance:sk.stance});
  sk.events.grindEnd=()=>{if(wanted.has(sk.grind?.rail))exited=true;};
  sk.events.land=(points,text)=>{if(points>0)banked.push({points,text});};
  let step=0;
  for(;step<seconds/dt&&!bails.length;step++){
    const before=target.clone().sub(sk.pos).dot(heading);
    const inp=controls({push:sk.speed<speed?1:0,brake:sk.speed>speed+.2?.5:0,grind:true});
    inp.ollie=!released&&before>pop;if(!inp.ollie)released=true;
    if(sk.state==='grind'){
      if(wanted.has(sk.grind.rail)){longest=Math.max(longest,sk.grind.time);visited.add(sk.grind.rail);}
      inp.steer=THREE.MathUtils.clamp(-sk.balance.x*3-sk.balance.v,-1,1);
      if(exitAfter!==null&&exitAge===null&&longest>=exitAfter)exitAge=0;
    }
    if(exitAge!==null){inp.ollie=exitAge<.56;inp.grind=holdGrindOnExit||(rearmAfter!==null&&exitAge>=.56+rearmAfter);exitAge+=dt;if(sk.state==='air')inp.steer=exitSteer;}
    inp.olliePressed=inp.ollie&&!previous;inp.ollieReleased=!inp.ollie&&previous;previous=inp.ollie;
    inp.grindPressed=inp.grind&&!previousGrind;previousGrind=inp.grind;
    sk.update(dt,inp);
    assert.ok(sk.pos.toArray().every(Number.isFinite),'route coordinates remain finite');
    if(exited&&sk.state==='air')airAfterExit=true;
    if(stopOnRecapture&&captures.filter(c=>c.target).length>=2&&sk.state==='grind'&&sk.grind.time>.2)break;
    if(exited&&sk.state==='ride'&&sk.score>0)break;
  }
  const availableAfterLanding=sk.state==='ride'?sk.findRail(sk.T.grindSnapAssist,dt,true)?.rail.feature??null:null;
  return{captures,bails,visited:visited.size,longest,banked,score:sk.score,state:sk.state,position:sk.pos.toArray(),seconds:(step+1)*dt,airAfterExit,availableAfterLanding};
}
function success(result,{segments=1,sustain=.12}={}){
  assert.deepEqual(result.bails,[],JSON.stringify(result));
  assert.ok(result.captures.some(c=>c.target),'actual approach captures its intended street object: '+JSON.stringify(result));
  assert.ok(result.longest>=sustain,'grind persists beyond a single snap frame: '+JSON.stringify(result));
  assert.ok(result.visited>=segments,'linked path crosses the required real corner: '+JSON.stringify(result));
  assert.ok(result.airAfterExit,'rider exits through ordinary physics');
  assert.equal(result.state,'ride','rider rolls away: '+JSON.stringify(result));
  assert.ok(result.score>0&&result.banked.length===1,'grind banks exactly once after landing: '+JSON.stringify(result));
}
function geometryState(level){return JSON.stringify({colliders:level.colliders.map(m=>({id:m.uuid,matrix:m.matrixWorld.toArray(),geometry:m.geometry.uuid})),rails:level.rails.map(r=>({a:r.a.toArray(),b:r.b.toArray(),radius:r.radius,feature:r.feature,category:r.category,aLink:r.aLink?level.rails.indexOf(r.aLink.rail):null,bLink:r.bLink?level.rails.indexOf(r.bLink.rail):null}))});}
function disposeLevel(level){const resources=new Set();level.group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});for(const resource of resources)resource.dispose();}

for(const scale of [1,1.25]){
  const level=new RocCityLevel({horizontalScale:scale}),root=new THREE.Group();root.add(level.group);root.updateMatrixWorld(true);
  const world=p=>V(p[0]*scale,p[1],p[2]*scale);
  check(`${scale}x: street targets remain finite, supported and identical with desktop or low-effects dressing`,()=>{
    const rails=level.environmentRails;assert.ok(rails?.length,'street rails are created by the level, independently of decorative loading');
    assert.deepEqual([...new Set(rails.map(r=>r.category))].sort(),['bench','car','curb','fence']);
    const signature=geometryState(level),samples=[];
    for(const rail of rails){
      assert.ok(rail.a.toArray().concat(rail.b.toArray()).every(Number.isFinite)&&rail.len>.02);
      assert.ok(rail.dir.length()>.99999&&Math.abs(rail.a.distanceTo(rail.b)-rail.len)<1e-6);
      for(const end of [rail.a,rail.b])assert.ok(support(level,end),`${rail.feature} endpoint has physical support`);
      if(rail.bLink){assert.ok(rail.b.distanceTo(rail.bLink.dir===1?rail.bLink.rail.a:rail.bLink.rail.b)<1e-6,'linked corners share actual endpoints');}
    }
    for(const lowfx of [false,true]){
      const art=createRocCityArt(root,level,{lowfx});root.updateMatrixWorld(true);
      const dressing=level.group.getObjectByName('ROC City / Riverway landscape and I-490');assert.ok(dressing);
      try{
        const visible=[];level.group.traverseVisible(node=>{if(node.isMesh)visible.push(node);});
        assert.equal(geometryState(level),signature,'decorative loading cannot add, move or remove gameplay targets');
        for(const rail of rails)for(const t of [.2,.5,.8]){
          const point=rail.a.clone().lerp(rail.b,t);point.y+=(rail.radius||0)+(rail.surfaceLift||0);
          // Exact outer box edges can round a few microns outside their Float32
          // render triangles. A 2mm cross probe tolerates that, not a missing
          // or displaced surface (the allowed vertical gap remains 25mm).
          const hits=[];
          for(const [dx,dz]of [[0,0],[.002,0],[-.002,0],[0,.002],[0,-.002]]){
            ray.set(point.clone().add(V(dx,.12,dz)),down);ray.far=.24;hits.push(...ray.intersectObjects(visible,false));
          }
          assert.ok(hits.length,`${rail.feature}/${rail.environmentPart} is an invisible rail at ${point.toArray()}`);
          const gap=Math.min(...hits.map(h=>Math.abs(h.point.y-point.y)));
          assert.ok(gap<.025,`${rail.feature}/${rail.environmentPart} misses visible contact edge by ${gap.toFixed(4)}m`);
          samples.push(gap);
        }
      }finally{art.dispose();}
    }
    return{rails:rails.length,visibleSurfaceSamples:samples.length,maxGap:Math.max(...samples)};
  });
  for(const category of ['car','fence','bench','curb'])check(`${scale}x: ${category} approach, sustained grind and bank in both directions and stances`,()=>{
    const candidates=level.environmentRails||[];
    const wanted={car:'south-avenue-car-1',fence:'west-deck-railing',bench:'south-entry-bench',curb:'south-avenue-west-curb'}[category];
    const part={car:'trunk-edge',fence:'top',bench:'back-top',curb:'west-edge'}[category];
    const available=candidates.filter(r=>r.category===category&&r.feature===wanted&&r.environmentPart===part);
    assert.ok(available.length,`${wanted}/${part} exists`);
    const first=available.find(r=>!r.aLink)||available[0];
    const targets=category==='fence'||category==='car'?linked(first):category==='curb'?candidates.filter(r=>r.feature===wanted):[first],results=[];
    for(const dir of [1,-1])for(const stance of [1,-1]){
      const options={dir,stance};
      if(category==='car')Object.assign(options,{speed:6,lead:5.5,pop:3.1});
      if(category==='bench')Object.assign(options,{speed:5.5,lead:5,pop:2.8});
      if(category==='fence')Object.assign(options,{speed:6,lead:4.5,pop:2.8,entryT:.35,offset:-.4*dir,seconds:22});
      if(category==='curb')Object.assign(options,{speed:6,lead:5,pop:3,entryT:.5,offset:.5,exitAfter:1.2,seconds:8});
      const result=runGrind(level,targets,options);success(result,{segments:category==='fence'?2:category==='car'?5:1,sustain:category==='fence'||category==='curb'?1:category==='car'?.6:.12});
      assert.ok(result.captures.some(c=>c.target&&c.dir===dir&&c.stance===stance),'the actual capture retains requested travel and stance');
      results.push({dir,stance,...result});
    }
    return results;
  });
  check(`${scale}x: a curb Ollie dismount ignores held grind, permits a fresh press and becomes available after landing`,()=>{
    const rails=level.environmentRails?.filter(r=>r.feature==='south-avenue-west-curb');assert.ok(rails?.length);const rail=rails[0];
    const results=[];
    for(const dir of [1,-1]){
      // Keep this eligibility test away from the park's other fences: holding
      // grind is intentionally still allowed to transfer to a different object.
      const common={dir,entryT:dir===1?.15:.85,offset:.5,exitAfter:1.2,seconds:8};
      const held=runGrind(level,rails,{...common,holdGrindOnExit:true});success(held,{sustain:1});
      assert.equal(held.captures.filter(c=>c.target).length,1,'continuing to hold grind must not undo a deliberate dismount');
      assert.equal(held.availableAfterLanding,rail.feature,'landing restores automatic eligibility for this object: '+JSON.stringify(held));
      const deliberate=runGrind(level,rails,{...common,rearmAfter:.16,stopOnRecapture:true});
      assert.deepEqual(deliberate.bails,[]);assert.equal(deliberate.captures.filter(c=>c.target).length,2,'a fresh grind press deliberately catches the curb again');
      assert.equal(deliberate.state,'grind');assert.equal(deliberate.banked.length,0,'regrind continues its current combo rather than banking early');
      results.push({dir,held,deliberate});
    }
    return results;
  });
  check(`${scale}x: parked cars remain solid, support landings and retain human-sized dimensions`,()=>{
    const results=[];
    for(const car of level.environment.cars){
      const meshes=level.environmentColliders.filter(m=>m.userData.feature===car.id&&m.userData.category==='car');
      assert.equal(meshes.length,2,'body and tapered cabin supply physical support');
      const body=meshes.find(m=>m.userData.part==='body'),box=new THREE.Box3().setFromObject(body),size=box.getSize(V());
      assert.ok(Math.abs(size.x-1.66)<.003&&Math.abs(size.z-4.06)<.003,'park horizontal scale must not stretch the cars');
      const cx=car.x*scale,cz=car.z*scale,approaches=[];
      for(const side of [-1,1]){
        const sk=rider(level,V(cx+side*2.5,0,cz),V(-side,0,0),{speed:5});let closest=Infinity;
        for(let step=0;step<240;step++){
          sk.update(dt,controls({push:1}));closest=Math.min(closest,(sk.pos.x-cx)*side);
          if(sk.state==='bail')break;
        }
        assert.ok(closest>.80,`${car.id} body permits riding through its ${side<0?'west':'east'} side`);
        approaches.push({side,closest,state:sk.state});
      }
      const sk=new Skater(level,()=>.5);sk.state='air';sk.popped=true;sk.pos.set(cx,4,cz);sk.vel.set(0,0,.1);sk.speed=.1;
      for(let step=0;step<240&&sk.state==='air';step++)sk.update(dt,controls());
      assert.equal(sk.state,'ride','an unarmed drop lands on solid roof');assert.ok(sk.pos.y>1.30,'rider does not fall through the roof');
      results.push({id:car.id,bodySize:size.toArray(),approaches,roofLanding:sk.pos.toArray()});
    }
    return results;
  });
  check(`${scale}x: new street fences block riders from both sides and their posts stay below the grinding surface`,()=>{
    const fixtures=level.fixtures.railings,fixture=fixtures.find(item=>item.id==='east-street-railing');assert.ok(fixture);
    const center=world([fixture.points[0][0],fixture.baseY,12]);
    const results=[];
    for(const side of [-1,1]){
      const sk=rider(level,center.clone().add(V(side*1.2,0,0)),V(-side,0,0),{speed:5});let closest=Infinity;
      assert.ok(sk.pos.y<fixture.baseY+.1,'approach starts beside the fence at ground grade');
      for(let step=0;step<240;step++){
        sk.update(dt,controls({push:1}));closest=Math.min(closest,(sk.pos.x-center.x)*side);
        if(sk.state==='bail')break;
      }
      assert.ok(closest>.01,`unarmed rider passes through the street fence from side ${side}: ${closest}`);
      results.push({side,closest,state:sk.state});
    }
    let posts=0;
    for(const fixture of fixtures){
      const top=fixture.rails.filter(segment=>Math.abs(segment.a[1]-fixture.baseY-fixture.height)<1e-6);
      assert.ok(top.length);
      const surface=fixture.baseY+fixture.height+Math.min(...top.map(segment=>segment.radius));
      for(const post of fixture.posts){
        assert.ok(post.position[1]+post.height<=surface-.01,'a post cap must not protrude into the truck across a fence grind');posts++;
      }
    }
    return{approaches:results,postsBelowRailSurface:posts};
  });
  check(`${scale}x: street grinds require intentional input and do not steal ordinary bridge-quarter airs`,()=>{
    assert.ok(level.environmentRails.every(r=>r.requiresIntent),'all new street objects require the grind control');
    for(const feature of ['south-avenue-car-1','south-entry-bench','south-avenue-west-curb']){
      const rail=level.environmentRails.find(r=>r.feature===feature&&(!r.bLink||r.environmentPart==='roof-edge'));
      const sk=new Skater(level,()=>.5);sk.state='air';sk.popped=true;sk.pos.copy(rail.a).lerp(rail.b,.5).add(V(0,.3,0));
      sk.vel.copy(rail.dir).multiplyScalar(4);sk.vel.y=-1;sk.speed=4;sk.heading.copy(rail.dir);sk.facing.copy(rail.dir).setY(0).normalize();
      sk.update(dt,controls());assert.equal(sk.state,'air',`${feature} may not catch an ordinary unarmed pass`);
    }
    const sk=rider(level,world([7.5,-.9,43]),V(0,0,1),{speed:8}),bails=[];let popped=false,previous=false,landing=null;
    sk.events.ollie=()=>{popped=true;};sk.events.bail=reason=>bails.push(reason);
    for(let step=0;step<900&&!landing&&!bails.length;step++){
      const before=sk.state,inp=controls({ollie:!popped});inp.olliePressed=inp.ollie&&!previous;inp.ollieReleased=!inp.ollie&&previous;previous=inp.ollie;
      sk.update(dt,inp);assert.ok(!(sk.state==='grind'&&sk.grind.rail.environment),'new guardrail steals the normal quarter-pipe return');
      if(popped&&before==='air'&&sk.state==='ride')landing=sk.pos.toArray();
    }
    assert.ok(popped&&landing,'ordinary held-to-lip air launches and returns');assert.deepEqual(bails,[]);
    return{ordinaryStreetPasses:3,quarterLanding:landing};
  });
  disposeLevel(level);
}

report.passed=report.checks.length>0&&report.checks.every(c=>c.passed);
if(process.env.STREET_GRIND_REPORT){mkdirSync(dirname(process.env.STREET_GRIND_REPORT),{recursive:true});writeFileSync(process.env.STREET_GRIND_REPORT,JSON.stringify(report,null,2)+'\n');}
console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} street grind checks passed`);
if(!report.passed)process.exitCode=1;

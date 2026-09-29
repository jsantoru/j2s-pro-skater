// Actual fixed-step controls exercise pop timing, curved transitions and landing.
// Initial fixtures sit on real surfaces; no direct pop/startAir/grind calls.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import * as THREE from 'three';
import {Level} from '../src/level.js';
import {RocCityLevel} from '../src/roc-city-level.js';
import {Skater} from '../src/skater.js';
import {makeState} from '../src/input.js';

const dt=1/120,up=new THREE.Vector3(0,1,0),checks=[];
let passed=0,failed=0;
const vector=values=>new THREE.Vector3(...values);
const rounded=values=>values.map(value=>+value.toFixed(5));
function check(name,run){
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
  try{const detail=run();checks.push({name,passed:true,detail});passed++;console.log('PASS: '+name);}
  catch(error){checks.push({name,passed:false,error:error.message});failed++;console.error('FAIL: '+name+'\n'+error.stack);}
}
function rider(level,position,direction,speed=8){
  const skater=new Skater(level,()=>.5),hit=skater.raycast(vector(position).setY(10),up.clone().negate(),20);
  assert(hit,'Approach must begin on a real surface');skater.pos.copy(hit.point);skater.normal.copy(hit.normal);
  skater.heading.copy(direction).projectOnPlane(hit.normal).normalize();skater.facing.copy(skater.heading).setY(0).normalize();
  skater.speed=speed;skater.vel.copy(skater.heading).multiplyScalar(speed);return skater;
}
function transition(config,{mode='hold',angle=0,releaseNormalY,fakie=false}={}){
  const along=vector(config.direction),coping=new THREE.Vector3(-along.z,0,along.x);
  const direction=along.clone().multiplyScalar(Math.cos(angle)).addScaledVector(coping,Math.sin(angle));
  const skater=rider(config.level,config.start,direction,config.speed??8),bails=[];
  let previous=false,released=false,releaseFrame=null,launch=null,landing=null,frame=0;
  let before=null,peak=-Infinity,minAcross=Infinity,maxAcross=-Infinity;
  skater.events.bail=reason=>bails.push(reason);
  skater.events.ollie=charge=>{
    if(launch)return;
    launch={frame,position:skater.pos.clone(),velocity:skater.vel.clone(),normal:skater.launchNormal.clone(),charge,
      incomingVelocity:before.heading.clone().multiplyScalar(before.speed),vertAir:skater.vertAir,stance:skater.stance};
  };
  const threshold=releaseNormalY??{early:.95,mid:.65,lip:.3,hold:-1}[mode];
  for(frame=0;frame<900;frame++){
    if(skater.state==='ride'&&skater.normal.y<threshold&&!released){released=true;releaseFrame=frame;}
    const input=makeState();input.ollie=!released&&!launch;input.push=config.push??0;input.autoPush=config.autoPush;
    input.revertRightPressed=fakie&&frame===0;
    input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
    before={state:skater.state,heading:skater.heading.clone(),speed:skater.speed};
    skater.update(dt,input);
    assert(skater.pos.toArray().every(Number.isFinite)&&skater.vel.toArray().every(Number.isFinite),'Trajectory stays finite');
    if(launch){
      peak=Math.max(peak,skater.pos.y);
      const across=skater.pos.clone().sub(launch.position).dot(along);
      minAcross=Math.min(minAcross,across);maxAcross=Math.max(maxAcross,across);
      if(before.state==='air'&&skater.state==='ride')landing={position:skater.pos.clone(),normal:skater.normal.clone(),frame};
    }
    if(landing||bails.length)break;
  }
  assert(launch,`${config.name}/${mode} never popped`);
  const detail={mode,angleDegrees:THREE.MathUtils.radToDeg(angle),releaseFrame,launchFrame:launch.frame,
    launchPosition:rounded(launch.position.toArray()),launchVelocity:rounded(launch.velocity.toArray()),
    normalY:+launch.normal.y.toFixed(5),charge:+launch.charge.toFixed(5),vertAir:launch.vertAir,
    wallSpeed:+launch.velocity.dot(along).toFixed(5),copingSpeed:+launch.velocity.dot(coping).toFixed(5),
    incomingCopingSpeed:+launch.incomingVelocity.dot(coping).toFixed(5),rise:+(peak-launch.position.y).toFixed(5),
    wallDisplacement:[+minAcross.toFixed(5),+maxAcross.toFixed(5)],bails,
    landing:landing&&{position:rounded(landing.position.toArray()),normal:rounded(landing.normal.toArray()),airSeconds:+((landing.frame-launch.frame)*dt).toFixed(5)}};
  return{skater,launch,landing,releaseFrame,detail,along,coping,bails};
}
function verticalReturn(result,normalLimit=.45){
  const {detail,launch,landing,bails}=result;
  assert(launch.normal.y<normalLimit,'The trial reaches its intended transition steepness');
  assert(launch.velocity.y>8,'The pop preserves upward approach momentum');
  assert(Math.abs(detail.wallSpeed)<2.2,'A steep pop stays near vertical instead of shoving the rider across the ramp: '+JSON.stringify(detail));
  assert(launch.velocity.y>Math.abs(detail.wallSpeed)*4,'Upward motion dominates cross-wall motion');
  assert(detail.rise>1.5,'The rider gets useful air above the launch point');
  assert.deepEqual(bails,[],'A normal steep approach returns without a bail: '+JSON.stringify(detail));
  assert(landing,'The rider lands the air on a real surface');
  assert(Math.max(...detail.wallDisplacement.map(Math.abs))<3,'Return remains close to the transition: '+JSON.stringify(detail));
}

const warehouse=new Level(),configs=[
  {name:'Warehouse west quarter',level:warehouse,start:[-27,0,6],direction:[-1,0,0]},
  {name:'Warehouse north half-pipe',level:warehouse,start:[-4,0,-14],direction:[0,0,-1]},
];
for(const scale of [1,1.25]){
  const level=new RocCityLevel({horizontalScale:scale}),mini=level.layout.mini;
  for(const sign of [1,-1])configs.push({name:`ROC ${scale}× mini ${sign>0?'flower':'north'} lip`,level,
    start:[(mini.center[0]+mini.axis[1])*scale,0,(mini.center[1]-mini.axis[0])*scale],direction:[mini.axis[0]*sign,0,mini.axis[1]*sign]});
  for(const x of [7.5,13])configs.push({name:`ROC ${scale}× bridge ${x<11?'lower':'extension'} quarter`,level,
    start:[x*scale,-.9,43*scale],direction:[0,0,1]});
}
for(const config of configs){
  check(`${config.name}: early and mid-slope release responds immediately`,()=>{
    return ['early','mid'].map(mode=>{
      const result=transition(config,{mode});
      assert.equal(result.launch.frame,result.releaseFrame,'Release is not deferred until the lip');
      assert(result.launch.velocity.y>5,'The release produces an upward ollie');
      if(mode==='early')assert(result.detail.wallSpeed>2,'A shallow release retains forward travel');
      // Early jumps can meet the rising face. These timing checks do not declare
      // that every release point is a safe line; the steep-return tests do.
      return result.detail;
    });
  });
  check(`${config.name}: lip release and held-to-lip pop vertically and return close to the face`,()=>{
    return ['lip','hold'].map(mode=>{const result=transition(config,{mode});verticalReturn(result);return result.detail;});
  });
  check(`${config.name}: an angled lip approach retains travel along the coping`,()=>{
    const result=transition(config,{mode:'hold',angle:THREE.MathUtils.degToRad(10)});verticalReturn(result);
    assert(Math.abs(result.detail.incomingCopingSpeed)>1,'Trial has meaningful sideways momentum');
    assert(Math.abs(result.detail.copingSpeed-result.detail.incomingCopingSpeed)<.15,'Pop preserves the along-coping component');
    return result.detail;
  });
}

const angledWarehouse={name:'Warehouse diagonal',level:warehouse,start:[-29,0,0],direction:[-1,0,0],speed:10,push:1,autoPush:false};
check('Warehouse diagonal 25–35 degree approaches land both steep and blended transition returns',()=>{
  return [{angle:25,releaseNormalY:.2},{angle:30,releaseNormalY:.2},{angle:35,releaseNormalY:.5}].map(test=>{
    const result=transition(angledWarehouse,{mode:'lip',angle:THREE.MathUtils.degToRad(-test.angle),releaseNormalY:test.releaseNormalY});
    verticalReturn(result,test.releaseNormalY);assert(Math.abs(result.detail.copingSpeed-result.detail.incomingCopingSpeed)<.15);
    return result.detail;
  });
});
check('A mild diagonal shoulder release can still transfer forward onto the deck',()=>{
  const result=transition(angledWarehouse,{mode:'mid',angle:THREE.MathUtils.degToRad(-15)});
  assert(result.launch.normal.y>.45&&result.launch.normal.y<.65,'Trial exercises the blended shoulder');
  assert(result.detail.wallSpeed>0,'This timing remains a transfer toward the deck');
  assert.deepEqual(result.bails,[]);assert(result.landing,'Deck transfer lands');
  assert(result.landing.position.y>2.8,'Transfer reaches the raised quarter-pipe deck');
  return result.detail;
});

check('A ground revert into fakie retains switch stance through an untouched transition air',()=>{
  return [configs[0],configs.find(config=>config.name==='ROC 1.25× mini north lip')].map(config=>{
    const result=transition(config,{mode:'hold',fakie:true});verticalReturn(result);
    assert.equal(result.launch.stance,-1,'The actual revert input makes this a fakie approach');
    assert.equal(result.skater.stance,-1,'Automatic return facing must not silently change stance');
    return{name:config.name,launchStance:result.launch.stance,landingStance:result.skater.stance,...result.detail};
  });
});
check('Neutral automatic return turns do not earn spin tricks or score',()=>{
  const result=transition(configs[0],{mode:'hold'});verticalReturn(result);
  assert.equal(result.skater.spinDeg,0,'Automatic orientation is not a player spin');
  for(let i=0;i<30;i++)result.skater.update(dt,{...makeState(),brake:1});
  assert.equal(result.skater.score,0);assert.equal(result.skater.combo.tricks.length,0);
  return{score:result.skater.score,spinDegrees:result.skater.spinDeg};
});
function heldLaunch(){
  const skater=rider(warehouse,[-27,0,6],vector([-1,0,0]));let launched=false;
  skater.events.ollie=()=>{launched=true;};
  for(let i=0;i<400&&!launched;i++)skater.update(dt,{...makeState(),ollie:true,olliePressed:i===0});
  assert(launched&&skater.state==='air','Real held input reaches a transition launch');return skater;
}
check('Intentional steering or bumper spin cancels automatic facing and stays canceled through the apex',()=>{
  return ['steer','spinRight'].map(control=>{
    const skater=heldLaunch();
    for(let i=0;i<12;i++)skater.update(dt,makeState());
    for(let i=0;i<18;i++)skater.update(dt,{...makeState(),[control]:control==='steer'?1:true});
    const facing=skater.facing.clone(),spin=skater.spinDeg;
    assert(spin>60&&spin<100,'The requested partial spin actually turns the rider');
    assert.equal(skater.transitionReturn,null,'Manual input cancels the return forecast');
    let steps=0;
    while(skater.state==='air'&&skater.vel.y>-2&&steps++<180)skater.update(dt,makeState());
    assert(skater.state==='air'&&skater.vel.y<=-2,'Neutral observation crosses the apex');
    assert(skater.facing.angleTo(facing)<1e-5,'Releasing the spin must not silently resume automatic turning');
    assert.equal(skater.transitionReturn,null,'Cancellation remains active after crossing the apex');
    assert.equal(skater.spinDeg,spin);
    return{control,manualSpin:spin,neutralFrames:steps,facingChange:skater.facing.angleTo(facing)};
  });
});
check('Reset abandons an assisted air before a new flat-ground jump',()=>{
  const skater=heldLaunch();assert(skater.autoTurn>0&&skater.transitionReturn,'The outgoing run has an automatic return in progress');
  skater.reset();assert.equal(skater.autoTurn,0);assert.equal(skater.transitionReturn,null);assert.equal(skater.state,'ride');
  skater.pos.set(-12,0,14);skater.heading.set(1,0,0);skater.facing.copy(skater.heading);skater.speed=8;skater.vel.set(8,0,0);
  for(let frame=0;frame<73;frame++)skater.update(dt,{...makeState(),ollie:frame<72,olliePressed:frame===0,ollieReleased:frame===72});
  assert.equal(skater.state,'air');const facing=skater.facing.clone();
  for(let i=0;i<60;i++)skater.update(dt,makeState());
  assert(skater.facing.angleTo(facing)<1e-5,'A new flat jump must not inherit a previous ramp return');
  return{state:skater.state,facingChange:skater.facing.angleTo(facing)};
});

function timedPop(level,start,direction,chargeSeconds){
  const skater=rider(level,start,vector(direction)),bails=[];let previous=false,launch=null,landing=null;
  skater.events.bail=reason=>bails.push(reason);
  skater.events.ollie=charge=>{launch={position:skater.pos.clone(),velocity:skater.vel.clone(),normal:skater.launchNormal.clone(),charge};};
  for(let frame=0;frame<600;frame++){
    const input=makeState();input.ollie=!launch&&frame*dt<chargeSeconds;
    input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
    const wasAir=skater.state==='air';skater.update(dt,input);
    if(wasAir&&skater.state==='ride'){landing=skater.pos.clone();break;}if(bails.length)break;
  }
  assert(launch);return{skater,launch,landing,bails};
}
check('Flat ground and ordinary banks preserve their established input-driven launch trajectories',()=>{
  // Baseline launch samples, not the implementation's impulse expression. These
  // routes include uphill and downhill bank normals well outside steep vert.
  const cases=[
    {name:'flat',start:[-12,0,14],direction:[1,0,0],charge:.6,velocity:[10.79295933,8.8,0],landing:[2.58934649,0,14]},
    {name:'uphill bank',start:[18,0,16],direction:[1,0,0],charge:.12,velocity:[6.71015135,9.28064645,0],landing:[23.74660703,1.6,16]},
    {name:'downhill bank',start:[21,0,16],direction:[-1,0,0],charge:.12,velocity:[-10.99231818,3.61585611,0],landing:[14.51967789,0,16]},
  ];
  return cases.map(test=>{
    const result=timedPop(warehouse,test.start,test.direction,test.charge);
    assert(result.launch.normal.y>.85,'Compatibility case remains a shallow surface');
    assert(result.landing&&result.bails.length===0,'An ordinary bank or flat ollie still lands');
    assert(result.launch.velocity.distanceTo(vector(test.velocity))<1e-4,'Existing launch velocity stays unchanged');
    assert(result.landing.distanceTo(vector(test.landing))<1e-4,'Existing grounded landing stays unchanged');
    return{name:test.name,launchPosition:rounded(result.launch.position.toArray()),launchVelocity:rounded(result.launch.velocity.toArray()),landing:rounded(result.landing.toArray())};
  });
});

check('An actual flat-rail capture still permits a charged ollie along the rail and a banked landing',()=>{
  const skater=rider(warehouse,[-12,0,10],vector([1,0,0]),7),bails=[];let previous=false,captured=false,popped=false,phase='approach',grindAge=0,launch=null;
  skater.events.bail=reason=>bails.push(reason);skater.events.grindStart=()=>{captured=true;phase='grind';};
  skater.events.ollie=()=>{if(captured){popped=true;launch=skater.vel.clone();phase='exit';}};
  for(let frame=0;frame<720;frame++){
    const input=makeState();input.grind=phase!=='exit';
    input.ollie=phase==='approach'?skater.pos.x< -10.2:phase==='grind'&&grindAge<.22;
    if(phase==='grind'){grindAge+=dt;input.steer=THREE.MathUtils.clamp(-skater.balance.x*3-skater.balance.v,-1,1);}
    input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
    skater.update(dt,input);if(bails.length||(popped&&skater.state==='ride'&&skater.score>0))break;
  }
  assert(captured&&popped,'Inputs capture the rail and perform a second ollie');assert.deepEqual(bails,[]);
  assert(launch.x>6&&launch.y>6&&Math.abs(launch.z)<.1,'Grind pop retains rail direction and upward impulse');
  assert(skater.score>0&&skater.state==='ride','Grind points bank after the exit');
  return{launchVelocity:rounded(launch.toArray()),score:skater.score,landing:rounded(skater.pos.toArray())};
});

if(process.env.TRANSITION_REPORT){
  const path=resolve(process.env.TRANSITION_REPORT);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify({recordedAt:new Date().toISOString(),method:'Actual 120Hz input steps on unchanged level colliders',checks,passed:failed===0},null,2)+'\n');
}
console.log(`${passed} transition checks passed${failed?', '+failed+' failed':''}.`);
if(failed)process.exitCode=1;

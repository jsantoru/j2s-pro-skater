// Actual street-object views and native-input routes in a disposable browser.
// QA_BASELINE=1 records decorative-only behavior before street grind targets.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserQA} from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4176';
const output=resolve(process.argv[3]||'screenshots/street-grinds/after');
const baseline=process.env.QA_BASELINE==='1';
const qa=await browserQA({url,output,name:'street-grinds'});
const views=[
  ['parked-car-player',[28.4,1.65,-11.7],[31.7,.8,-8]],
  ['parked-car-side',[28.3,1.6,-7.5],[31.7,.85,-8]],
  ['east-fence-player',[13.7,1.7,-9],[15.6,.9,-3]],
  ['flower-fence-player',[11.6,2.9,-26],[14.88,1.85,-23]],
  ['north-bench-player',[6.5,1.6,-41],[7.9,.6,-44.3]],
  ['south-bench-player',[-4.8,1.6,15.8],[-7,.6,13.7]],
  ['sidewalk-curb-player',[18.7,1.6,-16],[21.7,.12,-9]],
];
qa.report.method='Shared named views use the actual built scene. Native gamepad routes start from explicitly recorded ground approaches and advance the real application; no direct grind attachment.';
qa.report.views=views;
try{
  await qa.evaluate("__game.selectLevel('roc-city-skatepark');__game.startRun('free')");await qa.step(3);
  await qa.evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
  qa.report.entryAssets=await qa.evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\/(?:index|main)-[^/]+\\.js(?:\\?|$)/.test(n))");
  const environmentRails=await qa.evaluate('__game.level.environmentRails?.length||0');
  assert.equal(environmentRails,baseline?0:51,'the selected build must match the requested before/after evidence');
  await qa.check('player-height street objects have fixed comparison views',async()=>{
    await qa.evaluate("for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='none';__game.character.root.visible=false;__game.fx.shadow.visible=false;");
    const records=[];
    for(const[name,position,target]of views){
      const data=await qa.evaluate(`(()=>{const g=__game,s=g.level.horizontalScale,p=${JSON.stringify(position)},t=${JSON.stringify(target)};
        g.camera.up.set(0,1,0);g.camera.position.set(p[0]*s,p[1],p[2]*s);g.camera.lookAt(t[0]*s,t[1],t[2]*s);g.camera.fov=56;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
        return {calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,rails:g.level.rails.length,environmentRails:g.level.environmentRails?.length||0,webgl:g.renderer.getContext().getError()};})()`);
      assert.equal(data.webgl,0);records.push({name,...data});await qa.shot(name);
    }return records;
  });
  if(baseline)await qa.check('baseline car approach shows the former decorative-only behavior',async()=>{
    await qa.evaluate(`(()=>{const g=__game,s=g.skater;for(const e of document.body.children)e.style.removeProperty('display');g.character.root.visible=true;g.fx.shadow.visible=true;g.startRun('free');
      s.pos.set(39.625,-.018,-19);s.heading.set(0,0,1);s.facing.copy(s.heading);s.speed=6;s.vel.copy(s.heading).multiplyScalar(6);s.updateModelQuat(1);g.followCam.snap(s);
      __qa.connectPad();__qa.button(0,true);__qa.button(3,true);__qa.route={captures:[],bails:[],frames:[]};__qa.saved={...s.events};
      for(const[event,key]of[['grindStart','captures'],['bail','bails']]){const old=s.events[event];s.events[event]=(...args)=>{__qa.route[key].push(args);old?.(...args);};}})()`);
    await qa.step(24);await qa.evaluate('__qa.button(0,false)');
    for(let frame=0;frame<130;frame++){
      await qa.step();await qa.evaluate(`__qa.route.frames.push({state:__game.skater.state,pos:__game.skater.pos.toArray()})`);
      if([18,40,90].includes(frame))await qa.shot(`car-before-input-${frame}`);
    }
    const record=await qa.evaluate('({...__qa.route,score:__game.skater.score,state:__game.skater.state})');
    await qa.evaluate('__game.skater.events=__qa.saved;__qa.pad=null');assert.deepEqual(record.captures,[]);return record;
  });
  if(!baseline){
    await qa.evaluate(`window.__streetPrepare=(category)=>{const g=__game,s=g.skater;
      if(__qa.saved)s.events=__qa.saved;__qa.pad=null;for(const e of document.body.children)e.style.removeProperty('display');
      g.character.root.visible=true;g.fx.shadow.visible=true;g.startRun('free');
      const feature={car:'south-avenue-car-1',fence:'west-deck-railing',bench:'south-entry-bench',curb:'south-avenue-west-curb'}[category];
      const part={car:'trunk-edge',fence:'top',bench:'back-top',curb:'west-edge'}[category];
      const options={car:{speed:6,lead:5.5,pop:3.1},fence:{speed:6,lead:4.5,pop:2.8,t:.35,offset:-.4},bench:{speed:5.5,lead:5,pop:2.8},curb:{speed:6,lead:5,pop:3,t:.5,offset:.5,exitAfter:1.2}}[category];
      const found=g.level.environmentRails.filter(r=>r.feature===feature&&r.environmentPart===part),first=found.find(r=>!r.aLink)||found[0];
      const target=first.a.clone().lerp(first.b,options.t??0),heading=first.dir.clone().setY(0).normalize();
      const start=target.clone().addScaledVector(heading,-options.lead).addScaledVector(heading.clone().set(-heading.z,0,heading.x),options.offset||0);
      const hit=s.raycast(start.clone().setY(15),start.clone().set(0,-1,0),35);if(!hit)throw Error('Unsupported route');
      s.pos.copy(hit.point);s.normal.copy(hit.normal);s.heading.copy(target).sub(start).setY(0).normalize();s.facing.copy(s.heading);s.speed=options.speed;s.vel.copy(s.heading).multiplyScalar(s.speed);s.updateModelQuat(1);g.followCam.snap(s);
      __qa.connectPad();__qa.route={category,feature,options,target,heading,start:s.pos.toArray(),captures:[],bails:[],banks:[],frames:[],visited:new Set(),released:false,exitAge:null,longest:0,exited:false,airAfterExit:false,maxContactError:0,bodyTiltByPart:{}};
      __qa.saved={...s.events};for(const [event,key]of[['grindStart','captures'],['bail','bails'],['land','banks']]){const old=s.events[event];s.events[event]=(...args)=>{if(event!=='land'||args[0]>0)__qa.route[key].push({args,pos:s.pos.toArray(),feature:s.grind?.rail.feature,part:s.grind?.rail.environmentPart});old?.(...args);};}
      const end=s.events.grindEnd;s.events.grindEnd=(...args)=>{__qa.route.exited=true;end?.(...args);};
      return {category,feature,options,start:__qa.route.start,target:target.toArray()};};
    window.__streetInput=()=>{const s=__game.skater,r=__qa.route,o=r.options;
      const before=r.target.clone().sub(s.pos).dot(r.heading);let ollie=!r.released&&before>o.pop;if(!ollie)r.released=true;
      // Brake-only approach regulation never performs the game's down/up
      // manual flick. Release to neutral for the jump and its normal runout.
      let steer=0,vertical=s.state==='ride'&&!r.released&&s.speed>o.speed+.2?-.65:0,grind=true;
      if(s.state==='grind'){steer=Math.max(-1,Math.min(1,-s.balance.x*3-s.balance.v));vertical=0;if(o.exitAfter!==undefined&&r.exitAge===null&&r.longest>=o.exitAfter)r.exitAge=0;}
      if(r.exitAge!==null){ollie=r.exitAge<.56;grind=true;r.exitAge+=1/60;}
      const m=Math.hypot(steer,vertical),factor=m>0?(.14+.86*Math.min(1,m))/m:0;
      __qa.pad.axes[0]=steer*factor;__qa.pad.axes[1]=-vertical*factor;__qa.button(0,ollie);__qa.button(3,grind);
    };
    window.__streetRecord=()=>{const g=__game,s=g.skater,r=__qa.route,c=g.character.grindAnimation.contact;
      if(s.state==='grind'&&s.grind.rail.feature===r.feature){r.longest=Math.max(r.longest,s.grind.time);r.visited.add(g.level.environmentRails.indexOf(s.grind.rail));
        const up=s.pos.clone().set(0,1,0).applyQuaternion(g.character.body.getWorldQuaternion(s.modelQuat.clone())),part=s.grind.rail.environmentPart;
        r.bodyTiltByPart[part]=Math.max(r.bodyTiltByPart[part]||0,Math.acos(Math.max(-1,Math.min(1,up.y)))*180/Math.PI);
        if(g.character.grindAnimation.weight>.999){g.character.root.updateMatrixWorld(true);const actual=g.character.board.localToWorld(c.local.clone());r.maxContactError=Math.max(r.maxContactError,actual.distanceTo(c.world));}}
      if(r.exited&&s.state==='air')r.airAfterExit=true;
      const frame={state:s.state,pos:s.pos.toArray(),score:s.score,part:s.grind?.rail.environmentPart,visited:r.visited.size,time:s.grind?.time||0};r.frames.push(frame);return frame;};
    window.__streetResult=()=>{const r=__qa.route,s=__game.skater;return{category:r.category,start:r.start,target:r.target.toArray(),captures:r.captures,bails:r.bails,banks:r.banks,frames:r.frames,visited:r.visited.size,longest:r.longest,airAfterExit:r.airAfterExit,maxContactError:r.maxContactError,bodyTiltByPart:r.bodyTiltByPart,score:s.score,state:s.state,pos:s.pos.toArray()};};`);
    for(const category of ['car','fence','bench','curb'])await qa.check(`native controller ${category}: approach, linked grind and bank`,async()=>{
      await qa.evaluate(`__streetPrepare('${category}')`);await qa.shot(`${category}-approach`);
      let caught=false,detail=false,air=false,pillar=false;
      for(let frame=0;frame<(category==='fence'?1500:900);frame++){
        await qa.evaluate('__streetInput()');await qa.step();const state=await qa.evaluate('__streetRecord()');
        if(state.state==='grind'&&!caught){caught=true;await qa.shot(`${category}-capture`);}
        const pillarShot=category==='car'&&state.part==='rear-pillar'&&state.time>.17&&!pillar;
        const detailShot=!detail&&((category==='car'&&state.part==='roof-edge')||(category==='fence'&&state.visited>=2)||(['bench','curb'].includes(category)&&state.time>.13));
        if(state.state==='grind'&&(pillarShot||detailShot)){
          const label=pillarShot?'car-pillar':category;if(pillarShot)pillar=true;else detail=true;await qa.shot(`${label}-gameplay`);
          await qa.evaluate(`(()=>{const g=__game,s=g.skater;__qa.view={pos:g.camera.position.clone(),quat:g.camera.quaternion.clone(),fov:g.camera.fov};const p=s.pos,h=s.heading;
            const side=${category==='curb'?-1:1};g.camera.position.set(p.x-h.z*3.4*side-h.x*1.2,p.y+1.45,p.z+h.x*3.4*side-h.z*1.2);g.camera.lookAt(p.x,p.y+.62,p.z);g.camera.fov=48;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);})()`);
          await qa.shot(`${label}-contact`);await qa.evaluate('(()=>{const g=__game,v=__qa.view;g.camera.position.copy(v.pos);g.camera.quaternion.copy(v.quat);g.camera.fov=v.fov;g.camera.updateProjectionMatrix();})()');
        }
        if(caught&&state.state==='air'&&!air){air=true;await qa.shot(`${category}-exit`);}
        if(state.state==='bail'||(caught&&state.state==='ride'&&state.score>0))break;
      }
      await qa.shot(`${category}-rollaway`);const record=await qa.evaluate('__streetResult()');
      await qa.evaluate('__game.skater.events=__qa.saved;__qa.saved=null;__qa.pad=null');
      await writeFile(resolve(output,`${category}-route.json`),JSON.stringify(record,null,2));
      assert.deepEqual(record.bails,[],JSON.stringify(record.bails));assert.ok(record.captures.some(c=>c.feature===({car:'south-avenue-car-1',fence:'west-deck-railing',bench:'south-entry-bench',curb:'south-avenue-west-curb'}[category])),'native input caught the intended object');
      assert.ok(record.visited>=(category==='car'?5:category==='fence'?2:1));assert.ok(record.longest>=(category==='car'?.6:['fence','curb'].includes(category)?1:.12));
      assert.ok(record.airAfterExit&&record.score>0&&record.banks.length===1&&record.state==='ride','ordinary exit lands and banks exactly once');
      assert.ok(record.maxContactError<.025,'visible board support stays on the target');assert.ok(detail,'sustained contact shot exists');
      const {frames,...summary}=record;return{...summary,frames:frames.length};
    });
    await qa.check('supplemental paced controller footage shows the car capture and landing at normal speed',async()=>{
      const clip=await qa.evaluate(`(async()=>{__streetPrepare('car');const g=__game,stream=g.renderer.domElement.captureStream(60),parts=[];
        const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000});const stopped=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};rec.start();
        const started=Date.now();for(let frame=0;frame<240;frame++){__streetInput();await __qa.step();__streetRecord();await new Promise(r=>setTimeout(r,Math.max(0,started+(frame+1)*1000/60-Date.now())));}
        const elapsed=Date.now()-started;rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const reader=new FileReader(),encoded=new Promise(r=>reader.onloadend=()=>r(reader.result.split(',')[1]));reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));
        const result=__streetResult();delete result.frames;const info={...g.renderer.info.render,...g.renderer.info.memory};g.skater.events=__qa.saved;__qa.saved=null;__qa.pad=null;return{...result,elapsed,simulationSeconds:4,base64:await encoded,info};})()`);
      await writeFile(resolve(output,'paced-car.webm'),Buffer.from(clip.base64,'base64'));delete clip.base64;
      assert.equal(clip.bails.length,0);assert.ok(clip.score>0&&clip.visited===5);assert.ok(clip.elapsed>=3900&&clip.elapsed<6500);return clip;
    });
    await qa.check('supplemental touch: low-effects car grind and bank with native simultaneous controls',async()=>{
      const helpers=await qa.evaluate('[__streetPrepare,__streetRecord,__streetResult].map(f=>f.toString())');
      await qa.resize(844,390,true);await qa.navigate(url+'?touch');
      await qa.evaluate(`window.__streetPrepare=${helpers[0]};window.__streetRecord=${helpers[1]};window.__streetResult=${helpers[2]};__game.selectLevel('roc-city-skatepark');`);
      await qa.evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready])');
      await qa.evaluate("__streetPrepare('car');__qa.pad=null");
      const stick=await qa.evaluate("(()=>{const r=document.querySelector('#touch-stick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,radius:Math.min(r.width,r.height)*.34};})()");
      await qa.down(61,'#touch-stick');await qa.down(62,'#touch-ollie');await qa.down(63,'#touch-grind');let released=false,shot=false;
      for(let frame=0;frame<250;frame++){
        const control=await qa.evaluate("(()=>{const s=__game.skater,r=__qa.route;return{distance:r.target.clone().sub(s.pos).dot(r.heading),speed:s.speed,state:s.state};})()");
        if(!released&&control.distance<=3.1){await qa.up(62);released=true;}
        const raw=!released&&control.speed>6.2?.14+.86*.65:0;
        await qa.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:61,x:stick.x,y:stick.y+stick.radius*raw,radiusX:4,radiusY:4,force:1}]});
        await qa.step();const state=await qa.evaluate('__streetRecord()');
        if(state.state==='grind'&&state.part==='roof-edge'&&!shot){shot=true;await qa.shot('touch-car-grind');}
        if(state.state==='bail'||(state.state==='ride'&&state.score>0))break;
      }
      await qa.up(61);await qa.up(63);if(!released)await qa.up(62);await qa.step();await qa.shot('touch-car-rollaway');
      const record=await qa.evaluate(`(()=>{const r=__streetResult(),g=__game;delete r.frames;return{...r,lowfx:!g.renderer.shadowMap.enabled,webgl:g.renderer.getContext().getError(),controls:[...document.querySelectorAll('#touch-controls button')].map(el=>{const r=el.getBoundingClientRect();return{action:el.dataset.touchAction,w:r.width,h:r.height,x:r.x,y:r.y};}),owners:g.touchControls.owners.size,pointers:g.touchControls.pointers.size,render:{...g.renderer.info.render,...g.renderer.info.memory}};})()`);
      assert.ok(shot&&record.visited===5&&record.score>0);assert.equal(record.bails.length,0);assert.equal(record.lowfx,true);assert.equal(record.webgl,0);assert.equal(record.owners+record.pointers,0);
      for(const c of record.controls)assert.ok(c.w>=44&&c.h>=44&&c.x>=0&&c.x+c.w<=844&&c.y>=0&&c.y+c.h<=390);
      return record;
    });
  }
}finally{await qa.close();}

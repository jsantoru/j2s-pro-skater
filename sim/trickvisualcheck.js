// Fixed actual-model contact views plus native-controller observation.
// QA_BASELINE=1 records the old poses without enforcing the new contact contract.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserQA } from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4176';
const output=resolve(process.argv[3]||'screenshots/trick-visuals/before');
const baseline=process.env.QA_BASELINE==='1';
const qa=await browserQA({url,output,name:'trick-visuals'});
qa.report.fixtureMethod='Static close views use real Character.update and real Skater.startGrind on actual rails, with simulation stopped. Static grabs represent rising air (+3 m/s vertical velocity) so landing anticipation is not falsely triggered by a frozen falling pose. Native-controller cases advance the real application separately.';
const grinds=[['C','50-50'],['N','Nosegrind'],['S','5-0'],['W','Boardslide'],['E','Lipslide'],['NW','Crooked Grind'],['NE','Overcrook'],['SW',baseline?'Smith Grind':'Feeble Grind'],['SE',baseline?'Feeble Grind':'Smith Grind']];
const grabs=[['C','Indy'],['W','Melon'],['N','Nosegrab'],['S','Tailgrab'],['NW','Method'],['NE','Stalefish'],['SW','Judo'],['SE','Airwalk']];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-');
try {
  qa.report.entryAssets=await qa.evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\/(?:index|main)-[^/]+\\.js(?:\\?|$)/.test(n))");
  await qa.evaluate(`(() => {
    const g=__game;g.startRun('free');
    for(const el of document.body.children)if(el.id!=='game'&&el.tagName!=='SCRIPT')el.style.display='none';
    __qa.visual={
      pose(kind,dir,character='joe',stance=1,railIndex=13,frames=60){
        const s=g.skater,c=g.character;c.setCharacter(character);s.reset();
        c.grabAnimation?.reset();c.grindAnimation?.reset();for(let i=0;i<30;i++)c.update(s,1/60,i/60);
        s.stance=stance;s.speed=7;s.normal.set(0,1,0);s.heading.set(1,0,0);s.facing.copy(s.heading).multiplyScalar(stance);s.vel.copy(s.heading).multiplyScalar(7);
        if(kind==='grind'){
          const r=g.level.rails[railIndex],point=r.a.clone().lerp(r.b,.5);
          s.vel.copy(r.dir).multiplyScalar(7);s.heading.copy(r.dir);s.facing.copy(r.dir).multiplyScalar(stance);
          s.startGrind({rail:r,point,t:.5},{dir8:dir});
        } else {s.pos.set(-4.5,1.4,10);s.state='air';s.vel.y=3;s.startTrick('grab',dir);s.trick.t=.65;s.trick.held=true;}
        s.updateModelQuat(1);c.root.position.copy(s.pos);c.root.quaternion.copy(s.modelQuat);
        for(let i=0;i<frames;i++)c.update(s,1/60,i/60);
        c.root.updateMatrixWorld(true);return this.measure();
      },
      measure(){
        const s=g.skater,c=g.character,b=c.board;
        const truck=z=>b.localToWorld(s.pos.clone().set(0,.029,z));
        const front=truck(.24),rear=truck(-.24),deck=b.localToWorld(s.pos.clone().set(0,.114,0));
        const r=s.grind?.rail,railY=r?r.a.y+(r.b.y-r.a.y)*s.grind.t:null;
        const grip=b.children.find(o=>o.geometry?.attributes.position?.count===1254);
        const edge=[];if(grip){const a=grip.geometry.attributes.position;for(let i=0;i<57;i++)for(const j of [0,10])edge.push(grip.localToWorld(s.pos.clone().fromBufferAttribute(a,i*11+j)));}
        const hand=(arm)=>{const mesh=arm.hand.children.find(o=>o.geometry),a=mesh.geometry.attributes.position;let best=Infinity;
          for(let i=0;i<a.count;i++){const p=s.pos.clone();mesh.getVertexPosition(i,p);mesh.localToWorld(p);for(const e of edge)best=Math.min(best,p.distanceTo(e));}
          return {origin:arm.hand.getWorldPosition(s.pos.clone()).toArray(),nearestVisibleDeckEdge:best};};
        const feet=[c.lLeg,c.rLeg].map(leg=>{
          const sole=leg.an.localToWorld(s.pos.clone().set(0,-.0405,0));
          const ankle=leg.ankle.getWorldPosition(s.pos.clone()),hip=leg.hp.getWorldPosition(s.pos.clone());
          return {soleWorld:sole.toArray(),boardLocal:b.worldToLocal(sole.clone()).toArray(),hipAnkle:hip.distanceTo(ankle)};
        });
        const gc=c.grindAnimation?.contact,ac=c.grabAnimation?.contact;
        const grind=gc?.kind?{kind:gc.kind,weight:c.grindAnimation.weight,local:gc.local.toArray(),world:gc.world.toArray(),actual:b.localToWorld(gc.local.clone()).toArray(),error:b.localToWorld(gc.local.clone()).distanceTo(gc.world),normal:gc.normal.toArray(),radius:gc.radius}:null;
        const grab=ac?.name?{name:ac.name,hand:ac.hand,site:ac.site,weight:ac.weight,error:ac.error,attached:ac.attached,target:ac.targetWorld.toArray(),palm:ac.palmWorld.toArray(),boardLocal:ac.boardLocal.toArray()}:null;
        return {state:s.state,name:s.grind?.name||s.trick?.name,character:c.characterId,stance:s.stance,boardPosition:b.position.toArray(),boardRotation:b.rotation.toArray(),frontTruck:front.toArray(),rearTruck:rear.toArray(),deck:deck.toArray(),railY,frontHeight:railY===null?null:front.y-railY,rearHeight:railY===null?null:rear.y-railY,deckHeight:railY===null?null:deck.y-railY,leftHand:hand(c.lArm),rightHand:hand(c.rArm),feet,grind,grab,webglError:g.renderer.getContext().getError()};
      },
      advance(frames=1){const s=g.skater;for(let i=0;i<frames;i++){if(s.trick)s.trick.t+=1/60;if(s.grind)s.grind.time+=1/60;g.character.update(s,1/60,i/60);}g.character.root.updateMatrixWorld(true);return this.measure();},
      physical(){const s=g.skater;return JSON.stringify({state:s.state,pos:s.pos,vel:s.vel,heading:s.heading,facing:s.facing,normal:s.normal,modelQuat:s.modelQuat,stance:s.stance,score:s.score});},
      view(angle='full'){
        const p=g.skater.pos,cam=g.camera;
        const views={full:[[.2,1.3,3.4],[0,.72,0],40],contact:[[.85,.48,1.3],[0,.2,0],38],hands:[[.3,1.3,2.5],[0,.58,0],38],reverse:[[-.4,1.3,-3.1],[0,.7,0],40]};
        const [offset,target,fov]=views[angle];cam.up.set(0,1,0);cam.position.copy(p).add(p.clone().set(...offset));cam.lookAt(p.x+target[0],p.y+target[1],p.z+target[2]);cam.fov=fov;cam.updateProjectionMatrix();g.renderer.render(g.scene,cam);
      }
    };
  })()`);
  await qa.evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
  for(const character of baseline?['joe']:['joe','aaron']) {
    await qa.check(`${character}: supported grind contact and pose views`,async()=>{
      const records=[];
      for(const [dir,name] of baseline?grinds.slice(0,4):grinds){
        const record=await qa.evaluate(`__qa.visual.pose('grind',${JSON.stringify(dir)},${JSON.stringify(character)})`);
        assert.equal(record.name,name);assert.equal(record.webglError,0);records.push(record);
        for(const angle of ['full','contact']){await qa.evaluate(`__qa.visual.view('${angle}')`);await qa.shot(`${character}-${slug(name)}-${angle}`);}
      }return records;
    });
    await qa.check(`${character}: supported grab hand and board views`,async()=>{
      const records=[];
      for(const [dir,name] of baseline?grabs.filter(([,n])=>['Indy','Melon','Method'].includes(n)):grabs){
        const record=await qa.evaluate(`__qa.visual.pose('grab',${JSON.stringify(dir)},${JSON.stringify(character)})`);
        assert.equal(record.name,name);assert.equal(record.webglError,0);records.push(record);
        for(const angle of ['full','hands','reverse']){await qa.evaluate(`__qa.visual.view('${angle}')`);await qa.shot(`${character}-${slug(name)}-${angle}`);}
      }return records;
    });
  }
  if(!baseline)await qa.check('all trick entry, hold, release, fakie and rotated/sloped support remain finite and render-only',async()=>{
    const records=[];
    for(const character of ['joe','aaron'])for(const kind of ['grind','grab'])for(const [dir,name]of kind==='grind'?grinds:grabs)for(const stance of [1,-1]){
      await qa.evaluate(`__qa.visual.pose('${kind}',${JSON.stringify(dir)},'${character}',${stance},13,0)`);
      const before=await qa.evaluate('__qa.visual.physical()'),samples=[];
      for(const frames of [1,5,6,24]){
        const sample=await qa.evaluate(`__qa.visual.advance(${frames})`);samples.push(sample);
        assert.equal(await qa.evaluate('__qa.visual.physical()'),before,`${character} ${name}: animation changed physics`);
        assert.ok([...sample.boardPosition,...sample.boardRotation.slice(0,3),...sample.feet.flatMap(f=>f.soleWorld)].every(Number.isFinite));
        if(kind==='grind') {assert.ok(sample.grind);assert.ok(sample.grind.error<.004,`${name} contact error ${sample.grind.error}`);}
        if(process.env.QA_PHASE_SHOTS==='1'&&stance===-1&&((character==='joe'&&name==='5-0')||(character==='aaron'&&name==='Method'))){
          await qa.evaluate("__qa.visual.view('full')");await qa.shot(`${character}-${slug(name)}-fakie-phase-${samples.length}`);
        }
      }
      const held=samples.at(-1);
      if(kind==='grab'){
        assert.ok(held.grab?.attached,`${character} ${name} never attached`);
        assert.ok(held.grab.error<.004,`${character} ${name} palm error ${held.grab.error}`);
        const hand=held.grab.hand==='left'?held.leftHand:held.rightHand;
        assert.ok(hand.nearestVisibleDeckEdge<.035,`${character} ${name} visible hand misses edge ${hand.nearestVisibleDeckEdge}`);
      }
      for(let i=0;i<2;i++)if(kind==='grind'||(name!=='Airwalk'&&!(name==='Judo'&&i===0)))assert.ok(Math.abs(held.feet[i].boardLocal[1]-.132)<.014,`${name} sole${i} left deck ${JSON.stringify(held.feet[i])}`);
      await qa.evaluate(`__game.skater.state='air';__game.skater.trick=null;__game.skater.grind=null`);
      const release=await qa.evaluate('__qa.visual.advance(12)');
      if(process.env.QA_PHASE_SHOTS==='1'&&stance===-1&&((character==='joe'&&name==='5-0')||(character==='aaron'&&name==='Method'))){
        await qa.evaluate("__qa.visual.view('full')");await qa.shot(`${character}-${slug(name)}-fakie-release`);
      }
      await qa.evaluate(`__game.skater.state='ride'`);const ride=await qa.evaluate('__qa.visual.advance(36)');
      assert.ok(Math.abs(ride.boardPosition[1])<.003&&Math.max(...ride.boardRotation.slice(0,3).map(Math.abs))<.003,`${name} board did not return to ride`);
      records.push({character,kind,name,stance,entry:samples.map(s=>({board:s.boardPosition,grind:s.grind,grab:s.grab})),heldFeet:held.feet,release:{grind:release.grind,grab:release.grab}});
    }
    // Actual Warehouse rails: X, Z and sloped X; anatomical stance reverses
    // independently from world orientation. Full surface-contact ray coverage
    // for scaled ROC cylinders lives in grindposetest.js.
    for(const character of ['joe','aaron'])for(const [dir,name]of grinds)for(const rail of [14,15])for(const stance of [1,-1]){
      const sample=await qa.evaluate(`__qa.visual.pose('grind',${JSON.stringify(dir)},'${character}',${stance},${rail})`);
      assert.ok(sample.grind.error<.004);records.push({character,name,stance,rail,contact:sample.grind});
      if(process.env.QA_PHASE_SHOTS==='1'&&character==='aaron'&&stance===-1&&rail===15&&['Smith Grind','Boardslide'].includes(name)){
        await qa.evaluate("__qa.visual.view('contact')");await qa.shot(`${character}-${slug(name)}-sloped-fakie`);
      }
    }
    for(const character of ['joe','aaron'])for(const [dir,name]of grabs)for(const yaw of [1.13,-2.1])for(const stance of [1,-1]){
      await qa.evaluate(`__qa.visual.pose('grab',${JSON.stringify(dir)},'${character}',${stance})`);
      const sample=await qa.evaluate(`(() => {const g=__game,s=g.skater;const q=s.modelQuat.clone().setFromAxisAngle(s.pos.clone().set(0,1,0),${yaw});s.modelQuat.premultiply(q);g.character.root.quaternion.copy(s.modelQuat);return __qa.visual.advance(24);})()`);
      assert.ok(sample.grab.attached&&sample.grab.error<.004,`${character} ${name} rotated palm lost contact`);records.push({character,name,stance,yaw,contact:sample.grab});
      if(process.env.QA_PHASE_SHOTS==='1'&&((character==='joe'&&name==='Airwalk'&&stance===-1&&yaw===1.13)||(character==='aaron'&&name==='Melon'&&stance===1&&yaw===-2.1))){
        await qa.evaluate("__qa.visual.view('full')");await qa.shot(`${character}-${slug(name)}-rotated-${stance===-1?'fakie':'regular'}`);
      }
    }
    return {cases:records.length,records};
  });
  await qa.check('native-controller normal-speed ollie, held Indy, rail capture and banked exits',async()=>{
    const results=[];
    for(const kind of ['grab','grind']) {
      await qa.evaluate(`(() => {
        const g=__game;for(const el of document.body.children)el.style.removeProperty('display');g.startRun('free');g.character.setCharacter('joe');const s=g.skater;
        s.pos.set(...${JSON.stringify(kind==='grab'?[-6,0,15]:[-14,0,10])});s.heading.set(1,0,0);s.facing.copy(s.heading);s.vel.set(7,0,0);s.speed=7;s.updateModelQuat(1);g.followCam.snap(s);
        __qa.connectPad();__qa.live={kind:${JSON.stringify(kind)},bails:[],grinds:[],lands:[],grabs:[],states:[]};
        __qa.savedEvents={...s.events};
        for(const [event,key]of[['bail','bails'],['grindStart','grinds'],['land','lands']]){const prev=s.events[event];s.events[event]=(...args)=>{__qa.live[key].push(args);prev?.(...args);};}
        __qa.button(0,true);${kind==='grind'?'__qa.button(3,true);':''}
      })()`);
      await qa.step(kind==='grab'?36:20);
      await qa.evaluate(`__qa.button(0,false);${kind==='grab'?'__qa.button(1,true);':''}`);
      let captured=false;
      for(let i=0;i<160;i++){
        await qa.step();
        const state=await qa.evaluate(`(() => {const s=__game.skater;__qa.live.states.push({state:s.state,pos:s.pos.toArray(),name:s.trick?.name||s.grind?.name});return{state:s.state,grab:s.trick?.kind==='grab',name:s.grind?.name};})()`);
        if(!captured&&((kind==='grab'&&i===18&&state.grab)||(kind==='grind'&&state.state==='grind'))){captured=true;await qa.shot(`native-${kind}-gameplay`);}
        if(kind==='grab'&&i===24)await qa.evaluate('__qa.button(1,false)');
      }
      await qa.evaluate('__qa.button(3,false);__qa.pad=null');await qa.step(20);
      await qa.shot(`native-${kind}-rollaway`);
      const record=await qa.evaluate(`({...__qa.live,score:__game.skater.score,state:__game.skater.state,webglError:__game.renderer.getContext().getError()})`);
      await qa.evaluate('__game.skater.events=__qa.savedEvents');
      assert.ok(captured,`Native ${kind} never reached trick`);assert.deepEqual(record.bails,[]);assert.equal(record.state,'ride');assert.ok(record.score>0);assert.equal(record.webglError,0);results.push(record);
    }return results;
  });
  if(!baseline)await qa.check('native quarter grab release into flip and held-grab landing preserve visual continuity',async()=>{
    const results=[];
    for(const route of ['grab-to-flip','held-landing']){
      await qa.evaluate(`(() => {const g=__game,s=g.skater;g.startRun('free');g.character.setCharacter('joe');
        for(const el of document.body.children)el.style.removeProperty('display');
        s.pos.set(-27,0,6);s.heading.set(-1,0,0);s.facing.copy(s.heading);s.speed=8;s.vel.set(-8,0,0);s.updateModelQuat(1);g.followCam.snap(s);
        __qa.connectPad();__qa.button(0,true);__qa.continuity={bails:[],events:[]};__qa.savedEvents={...s.events};const old=s.events.bail;s.events.bail=reason=>{__qa.continuity.bails.push(reason);old?.(reason);};
      })()`);
      for(let i=0;i<160;i++){await qa.step();if(await qa.evaluate('__game.skater.normal.y<.15||__game.skater.state===\'air\''))break;}
      await qa.evaluate('__qa.button(0,false);__qa.button(1,true)');await qa.step(2);
      assert.equal(await qa.evaluate('__game.skater.state'),'air');
      await qa.step(18);assert.equal(await qa.evaluate('__game.skater.trick?.name'),'Indy');await qa.shot(`${route}-held-gameplay`);
      let flipTransition=null;
      if(route==='grab-to-flip'){
        const held=await qa.evaluate('__game.character.board.position.toArray()');
        await qa.evaluate('__qa.button(1,false)');await qa.step();
        const released=await qa.evaluate('__game.character.board.position.toArray()');
        await qa.evaluate('__qa.button(2,true)');await qa.step();await qa.evaluate('__qa.button(2,false)');
        assert.equal(await qa.evaluate('__game.skater.trick?.name'),'Kickflip');await qa.shot('grab-to-flip-first-frame');
        const flipped=await qa.evaluate('__game.character.board.position.toArray()');
        flipTransition={held,released,flipped,releaseStep:Math.hypot(...released.map((v,i)=>v-held[i])),flipStep:Math.hypot(...flipped.map((v,i)=>v-released[i]))};
        assert.ok(flipTransition.releaseStep<.085&&flipTransition.flipStep<.085,`Grab/flip board step ${JSON.stringify(flipTransition)}`);
      }
      let previous=await qa.evaluate(`({state:__game.skater.state,board:__game.character.board.position.toArray()})`),transition=null;
      for(let i=0;i<180;i++){
        await qa.step();const current=await qa.evaluate(`({state:__game.skater.state,board:__game.character.board.position.toArray(),name:__game.skater.trick?.name})`);
        if(current.state==='ride'&&previous.state==='air'){transition={before:previous,after:current,boardStep:Math.hypot(...current.board.map((v,i)=>v-previous.board[i]))};await qa.shot(`${route}-landing-frame`);break;}
        previous=current;
      }
      await qa.evaluate('__qa.button(1,false);__qa.pad=null');await qa.step(30);await qa.shot(`${route}-rollaway`);
      const result=await qa.evaluate(`({...__qa.continuity,state:__game.skater.state,score:__game.skater.score,webglError:__game.renderer.getContext().getError()})`);
      await qa.evaluate('__game.skater.events=__qa.savedEvents');
      assert.deepEqual(result.bails,[]);assert.equal(result.state,'ride');assert.ok(result.score>0);assert.ok(transition);assert.ok(transition.boardStep<.085,`${route}: landing board step ${transition.boardStep}`);assert.equal(result.webglError,0);
      results.push({route,...result,transition,flipTransition});
    }return results;
  });
  if(process.env.QA_VIDEO==='1')await qa.check('paced native-controller observation records real-time grab and grind clips',async()=>{
    const records=[];
    for(const kind of ['grab','grind','quarter-flip','quarter-held']){
      const quarter=kind.startsWith('quarter-');
      const clip=await qa.evaluate(`(async()=>{
        const g=__game,s=g.skater;g.startRun('free');g.character.setCharacter('joe');s.pos.set(...${JSON.stringify(quarter?[-27,0,6]:kind==='grab'?[-6,0,15]:[-14,0,10])});s.heading.set(${quarter?-1:1},0,0);s.facing.copy(s.heading);s.speed=${quarter?8:7};s.vel.copy(s.heading).multiplyScalar(s.speed);s.updateModelQuat(1);g.followCam.snap(s);
        __qa.connectPad();__qa.button(0,true);${kind==='grind'?'__qa.button(3,true);':''}
        const stream=g.renderer.domElement.captureStream(60),parts=[],mime='video/webm;codecs=vp8';
        const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
        const stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.start();
        const frames=[],started=Date.now();let launchFrame=null,landingFrame=null,previousState=s.state,bailFrames=0;
        for(let frame=0;frame<240;frame++){
          if(!${quarter}&&frame===${kind==='grab'?36:20}){__qa.button(0,false);${kind==='grab'?'__qa.button(1,true);':''}}
          if(frame===61&&${kind==='grab'})__qa.button(1,false);
          if(${quarter}&&launchFrame===null&&(s.normal.y<.15||s.state==='air')){launchFrame=frame;__qa.button(0,false);__qa.button(1,true);}
          if(${kind==='quarter-flip'}&&launchFrame!==null){if(frame===launchFrame+20)__qa.button(1,false);if(frame===launchFrame+21)__qa.button(2,true);if(frame===launchFrame+22)__qa.button(2,false);}
          await __qa.step();
          if(s.state==='bail')bailFrames++;
          if(previousState==='air'&&s.state==='ride'&&landingFrame===null)landingFrame=frame;
          previousState=s.state;
          if([36,54,66,90,150].includes(frame)||(${quarter}&&((launchFrame!==null&&[18,21].includes(frame-launchFrame))||(landingFrame!==null&&[0,12].includes(frame-landingFrame))))){
            // Read the canvas in the same render task, including in browsers
            // which discard a non-preserved backbuffer between RAF callbacks.
            g.renderer.render(g.scene,g.camera);
            frames.push({frame,state:s.state,trick:s.trick?.name||s.grind?.name,position:s.pos.toArray(),boardWorld:g.character.board.getWorldPosition(s.pos.clone()).toArray(),ndc:g.character.root.position.clone().project(g.camera).toArray(),finite:g.character.root.matrixWorld.elements.every(Number.isFinite),png:g.renderer.domElement.toDataURL('image/png').split(',')[1]});
          }
          await new Promise(resolve=>setTimeout(resolve,Math.max(0,started+(frame+1)*1000/60-Date.now())));
        }
        const elapsed=Date.now()-started;recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());__qa.pad=null;
        const blob=new Blob(parts,{type:mime});const reader=new FileReader();const encoded=new Promise(resolve=>reader.onloadend=()=>resolve(reader.result.split(',')[1]));reader.readAsDataURL(blob);
        return {base64:await encoded,frames,elapsed,simulationSeconds:4,score:s.score,state:s.state,launchFrame,landingFrame,bailFrames,webglError:g.renderer.getContext().getError()};
      })()`);
      await writeFile(resolve(output,`paced-${kind}.webm`),Buffer.from(clip.base64,'base64'));
      for(const f of clip.frames){const filename=`paced-${kind}-frame-${f.frame}.png`;await writeFile(resolve(output,filename),Buffer.from(f.png,'base64'));qa.report.screenshots.push(filename);delete f.png;}
      delete clip.base64;assert.ok(clip.elapsed>=3900&&clip.elapsed<6500,JSON.stringify(clip));assert.equal(clip.webglError,0);assert.equal(clip.bailFrames,0);assert.ok(clip.score>0);
      if(quarter){assert.ok(clip.launchFrame!==null&&clip.landingFrame!==null);assert.ok(clip.frames.some(f=>f.trick==='Indy'));if(kind==='quarter-flip')assert.ok(clip.frames.some(f=>f.trick==='Kickflip'));}
      records.push({kind,...clip});
    }return records;
  });
  if(!baseline)await qa.check('touch viewport renders curled grab hands with unobstructed gameplay controls',async()=>{
    await qa.resize(844,390,true);await qa.navigate(url+'?touch');
    await qa.touch('#fe-play');await qa.touch('#fe-level-genesee');await qa.touch('#free-skate');
    await qa.evaluate(`(() => {const g=__game,s=g.skater;s.pos.set(-6,0,15);s.heading.set(1,0,0);s.facing.copy(s.heading);s.vel.set(7,0,0);s.speed=7;s.updateModelQuat(1);g.followCam.snap(s);})();`);
    await qa.down(51,'#touch-ollie');await qa.step(36);await qa.up(51);await qa.down(52,'#touch-grab');await qa.step(18);
    const result=await qa.evaluate(`(() => {const g=__game;return {state:g.skater.state,trick:g.skater.trick?.name,contact:g.character.grabAnimation.contact.error,shadow:g.renderer.shadowMap.enabled,controls:[...document.querySelectorAll('#touch-controls button')].map(el=>{const r=el.getBoundingClientRect();return {action:el.dataset.touchAction,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),webglError:g.renderer.getContext().getError()};})()`);
    assert.equal(result.state,'air');assert.equal(result.trick,'Indy');assert.ok(result.contact<.01);assert.equal(result.shadow,false);assert.equal(result.webglError,0);
    for(const c of result.controls)assert.ok(c.width>=44&&c.height>=44&&c.left>=0&&c.right<=844&&c.top>=0&&c.bottom<=390,JSON.stringify(c));
    await qa.shot('touch-held-indy');await qa.up(52);await qa.step(90);assert.equal(await qa.evaluate('__game.skater.state'),'ride');await qa.shot('touch-indy-rollaway');return result;
  });
} finally {await qa.close();}

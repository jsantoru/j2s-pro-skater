// Travel-relative contact evidence from real gamepad polling and a ground revert.
// QA_BASELINE=1 records the old visuals without requiring the corrected supports.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserQA} from './browser-qa.js';
import {getGrabDefinition} from '../src/grab-animation.js';

const url=process.argv[2]||'http://127.0.0.1:4176';
const output=resolve(process.argv[3]||'screenshots/switch-stance/after');
const baseline=process.env.QA_BASELINE==='1';
const qa=await browserQA({url,output,name:'switch-stance'});
qa.report.baseline=baseline;
qa.report.visualAssertionsActive=!baseline;
qa.report.method='Actual gamepad API input through the normal application: RT ground revert, stick-flick manual or charged ollie and directional grind. Only the initial supported ground approach is seeded. Visible leading/trailing wheels and hangers are independently ordered along physical travel; support is sampled from rendered mesh vertices, not animation contact metadata.';
try{
  await qa.evaluate("__game.selectLevel('genesee-warehouse');__game.startRun('free')");await qa.step(3);
  await qa.evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
  qa.report.entryAssets=await qa.evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\/(?:index|main)-[^/]+\\.js(?:\\?|$)/.test(n))");
  if(baseline)assert.ok(qa.report.entryAssets.some(x=>x.endsWith('/main-DPtAxrCx.js')),'baseline must remain the verified v18 build');
  await qa.evaluate(`window.__switchQA={
    prepare(kind,character,dir){const g=__game,s=g.skater;__qa.pad=null;if(this.events)s.events=this.events;g.startRun('free');g.character.setCharacter(character);
      const rail=g.level.rails.find(r=>Math.abs(r.a.y-.55)<.001&&Math.abs(r.a.z-10)<.001),target=(dir>0?rail.a:rail.b).clone();
      s.pos.copy(kind==='manual'?s.pos.clone().set(-2,0,15):target.clone().add(s.pos.clone().set(-dir*8,-.55,0)));
      s.heading.set(dir,0,0);s.facing.copy(s.heading);s.speed=7;s.vel.copy(s.heading).multiplyScalar(7);s.updateModelQuat(1);g.followCam.snap(s);
      this.target=target;this.dir=dir;this.events={...s.events};this.log={bails:[],grinds:[],manuals:[],reverts:0,banks:[]};
      for(const[event,key]of[['bail','bails'],['grindStart','grinds'],['manualStart','manuals'],['land','banks']]){const old=s.events[event];s.events[event]=(...args)=>{if(event!=='land'||args[0]>0)this.log[key].push(args);old?.(...args);};}
      const old=s.events.revert;s.events.revert=(...a)=>{this.log.reverts++;old?.(...a);};__qa.connectPad();return{pos:s.pos.toArray(),target:target.toArray()};},
    axes(x,y){const m=Math.hypot(x,y),f=m?(.14+.86*Math.min(1,m))/m:0;__qa.pad.axes[0]=x*f;__qa.pad.axes[1]=-y*f;},
    measure(){const g=__game,s=g.skater,b=g.character.board;g.character.root.updateMatrixWorld(true);
      const low=mesh=>{let y=Infinity;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=s.pos.clone();mesh.getVertexPosition(i,p);mesh.localToWorld(p);y=Math.min(y,p.y);}return y;};
      const record=(objects)=>objects.map(o=>{const p=o.getWorldPosition(s.pos.clone());let y=Infinity;o.traverse(m=>{if(m.isMesh)y=Math.min(y,low(m));});return{along:p.clone().sub(s.pos).dot(s.heading),world:p.toArray(),lowestY:y};}).sort((a,b)=>a.along-b.along);
      const trucks=record(b.children.filter(o=>o.geometry?.type==='CylinderGeometry'&&Math.abs(o.geometry.parameters.height-.18)<.001));
      const wheels=record(b.userData.wheels),rearWheels=wheels.slice(0,2),frontWheels=wheels.slice(2),avg=a=>a.reduce((n,o)=>n+o.lowestY,0)/a.length;
      const rail=s.grind?.rail,railY=rail?rail.a.y+(rail.b.y-rail.a.y)*s.grind.t+(rail.radius||0):0;
      const feet=[g.character.lLeg,g.character.rLeg].map((leg,i)=>{const world=leg.an.localToWorld(s.pos.clone().set(0,-.0405,0));return{leg:i,world:world.toArray(),boardLocal:b.worldToLocal(world.clone()).toArray(),along:world.clone().sub(s.pos).dot(s.heading)};}).sort((a,b)=>a.along-b.along);
      const grab=g.character.grabAnimation.contact;
      return{character:g.character.characterId,state:s.state,stance:s.stance,kind:s.manual?.kind||s.grind?.name||s.trick?.name,label:s.combo.text,hud:document.querySelector('#trick-text').textContent,travel:s.heading.toArray(),facing:s.facing.toArray(),position:s.pos.toArray(),leadingTruck:trucks.at(-1),trailingTruck:trucks[0],leadingWheelY:avg(frontWheels),trailingWheelY:avg(rearWheels),railY,feet,pushPhase:g.character.pushPhase,pushContact:g.character.pushContact,grab:grab?.name?{name:grab.name,hand:grab.hand,error:grab.error,boardLocal:grab.boardLocal.toArray()}:null,webgl:g.renderer.getContext().getError()};},
    view(){const g=__game,p=g.skater.pos,h=g.skater.heading;this.camera={position:g.camera.position.clone(),quaternion:g.camera.quaternion.clone(),fov:g.camera.fov};
      g.camera.position.set(p.x-h.z*3.2-h.x*.5,p.y+1.1,p.z+h.x*3.2-h.z*.5);g.camera.up.set(0,1,0);g.camera.lookAt(p.x,p.y+.7,p.z);g.camera.fov=46;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);},
    restore(){const g=__game,c=this.camera;g.camera.position.copy(c.position);g.camera.quaternion.copy(c.quaternion);g.camera.fov=c.fov;g.camera.updateProjectionMatrix();},
    finish(){const s=__game.skater,out={...this.log,state:s.state,score:s.score};s.events=this.events;this.events=null;__qa.pad=null;return out;}
  };`);

  async function prepare(kind,character,dir,stance){
    const start=await qa.evaluate(`__switchQA.prepare('${kind}','${character}',${dir})`);
    if(stance<0){await qa.pad(7);await qa.step(24);}else await qa.step(2);
    assert.equal(await qa.evaluate('__game.skater.stance'),stance,'switch comes from actual RT revert');return start;
  }
  async function snapshot(name){
    const sample=await qa.evaluate('__switchQA.measure()');await qa.shot(name+'-gameplay');
    await qa.evaluate('__switchQA.view()');await qa.shot(name+'-side');await qa.evaluate('__switchQA.restore()');return sample;
  }
  async function catchGrind(input='S'){
    await qa.evaluate('__qa.button(0,true)');
    for(let f=0;f<140;f++){const d=await qa.evaluate('(__switchQA.target.x-__game.skater.pos.x)*__switchQA.dir');if(d<=3.1)break;
      await qa.evaluate('__switchQA.axes(0,__game.skater.speed>6.2?-.65:0)');await qa.step();}
    const x=input==='SW'?-.65:input==='SE'?.65:0;
    await qa.evaluate(`__qa.button(0,false);__qa.button(3,true);__switchQA.axes(${x},${input==='N'?.9:-.9})`);await qa.step();
    for(let f=0;f<150;f++){await qa.evaluate('(()=>{const s=__game.skater;__switchQA.axes(s.state===\'grind\'?Math.max(-1,Math.min(1,-s.balance.x*3-s.balance.v)):0,0);})()');await qa.step();
      const time=await qa.evaluate('__game.skater.state===\'grind\'?__game.skater.grind.time:0');if(time>.25)return;}
    throw Error('Ground approach did not catch a sustained grind');
  }
  for(const character of ['joe','aaron'])for(const dir of [1,-1])for(const stance of [1,-1]){
    const id=`${character}-${dir>0?'east':'west'}-${stance>0?'regular':'switch'}`;
    await qa.check(`${id}: native manual label matches supporting wheels`,async()=>{
      const start=await prepare('manual',character,dir,stance),first=-stance;
      await qa.evaluate(`__switchQA.axes(0,${first*.9})`);await qa.step(3);
      await qa.evaluate(`__switchQA.axes(0,${-first*.9})`);await qa.step();
      for(let f=0;f<32;f++){await qa.evaluate('(()=>{const b=__game.skater.manualBalance;__switchQA.axes(0,Math.max(-1,Math.min(1,-b.x*3-b.v)));})()');await qa.step();}
      const held=await snapshot(id+'-manual');assert.equal(held.kind,'Manual');assert.equal(held.stance,stance);assert.equal(held.webgl,0);
      if(!baseline){assert.ok(held.leadingWheelY-held.trailingWheelY>.10,JSON.stringify(held));assert.ok(Math.abs(held.trailingWheelY)<.012,'travel-trailing wheels meet floor');}
      await qa.evaluate('__switchQA.axes(0,0);__qa.button(0,true)');await qa.step(12);await qa.evaluate('__qa.button(0,false)');await qa.step(100);
      const finish=await qa.evaluate('__switchQA.finish()');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);assert.equal(finish.reverts,stance<0?1:0);return{start,held,finish};
    });
    await qa.check(`${id}: native 5-0 label matches the travel-trailing truck`,async()=>{
      const start=await prepare('grind',character,dir,stance);await catchGrind();
      const held=await snapshot(id+'-5-0');assert.equal(held.kind,'5-0');assert.equal(held.stance,stance);assert.equal(held.webgl,0);
      if(!baseline){assert.ok(held.leadingTruck.lowestY-held.trailingTruck.lowestY>.10,JSON.stringify(held));assert.ok(Math.abs(held.trailingTruck.lowestY-held.railY)<.006,'travel-trailing hanger meets bar');}
      await qa.evaluate('__switchQA.axes(0,0);__qa.button(3,false)');await qa.step(100);
      const finish=await qa.evaluate('__switchQA.finish()');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);assert.equal(finish.reverts,stance<0?1:0);return{start,held,finish};
    });
  }
  if(!baseline){
    for(const [input,expected]of[['SW','Feeble Grind'],['SE','Smith Grind']])await qa.check(`${input}: native diagonal input selects ${expected} in both stances`,async()=>{
      const records=[];for(const stance of[1,-1]){await prepare('grind','joe',1,stance);await catchGrind(input);
        const held=await snapshot(`joe-${stance<0?'switch':'regular'}-${input.toLowerCase()}`);assert.equal(held.kind,expected);assert.equal(held.stance,stance);
        assert.ok(Math.abs(held.trailingTruck.lowestY-held.railY)<.01,'loaded rear hanger stays on rail');
        await qa.evaluate('__switchQA.axes(0,0);__qa.button(3,false)');await qa.step(100);const finish=await qa.evaluate('__switchQA.finish()');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);records.push({held,finish});}
      return records;
    });
    for(const character of['joe','aaron'])await qa.check(`${character}: switch push and Indy retain planted feet and the mirrored grab hand`,async()=>{
      await prepare('manual',character,1,-1);await qa.evaluate('__switchQA.axes(0,.9)');await qa.step(14);
      const push=await snapshot(`${character}-switch-push`);assert.equal(push.stance,-1);assert.ok(push.pushContact>.85);assert.ok(Math.abs(push.feet.at(-1).boardLocal[1]-.132)<.015,'leading sole remains planted while the trailing foot pushes');
      await qa.evaluate('__switchQA.finish()');await prepare('manual',character,1,-1);
      await qa.evaluate('__qa.button(0,true)');await qa.step(24);await qa.evaluate('__qa.button(0,false);__qa.button(1,true)');await qa.step(20);
      const grab=await snapshot(`${character}-switch-indy`),expected=getGrabDefinition('Indy',-1);
      assert.equal(grab.kind,'Indy');assert.equal(grab.stance,-1);assert.equal(grab.grab.hand,expected.hand);assert.ok(grab.grab.error<.004);
      await qa.evaluate('__qa.button(1,false)');await qa.step(90);const finish=await qa.evaluate('__switchQA.finish()');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);return{push,grab,finish};
    });
    await qa.check('switch Nose Manual and Nosegrind load the travel-leading wheels and hanger',async()=>{
      await prepare('manual','aaron',-1,-1);await qa.evaluate('__switchQA.axes(0,-.9)');await qa.step(3);await qa.evaluate('__switchQA.axes(0,.9)');await qa.step();
      for(let f=0;f<32;f++){await qa.evaluate('(()=>{const b=__game.skater.manualBalance;__switchQA.axes(0,Math.max(-1,Math.min(1,-b.x*3-b.v)));})()');await qa.step();}
      const manual=await snapshot('aaron-west-switch-nose-manual');assert.equal(manual.kind,'Nose Manual');assert.ok(manual.trailingWheelY-manual.leadingWheelY>.1);assert.ok(Math.abs(manual.leadingWheelY)<.012);
      await qa.evaluate('__switchQA.finish()');await prepare('grind','aaron',-1,-1);await catchGrind('N');
      const grind=await snapshot('aaron-west-switch-nosegrind');assert.equal(grind.kind,'Nosegrind');assert.ok(grind.trailingTruck.lowestY-grind.leadingTruck.lowestY>.1);assert.ok(Math.abs(grind.leadingTruck.lowestY-grind.railY)<.006);
      await qa.evaluate('__switchQA.axes(0,0);__qa.button(3,false)');await qa.step(100);const finish=await qa.evaluate('__switchQA.finish()');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);return{manual,grind,finish};
    });
    await qa.check('paced switch manual and live revert remain continuous at normal speed',async()=>{
      const clip=await qa.evaluate(`(async()=>{__switchQA.prepare('manual','joe',1);const g=__game,s=g.skater,stream=g.renderer.domElement.captureStream(60),parts=[];
        const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000}),done=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};rec.start();const start=Date.now(),samples=[];
        for(let f=0;f<240;f++){
          __qa.button(7,f===0||f===65);
          let y=f>=28&&f<31?.9:f===31?-.9:s.manual?Math.max(-1,Math.min(1,-s.manualBalance.x*3-s.manualBalance.v)):0;__switchQA.axes(0,y);
          __qa.button(0,f>=105&&f<117);await __qa.step();
          if([28,32,60,65,68,72,79,100,140,180].includes(f)){g.renderer.render(g.scene,g.camera);samples.push({frame:f,...__switchQA.measure(),png:g.renderer.domElement.toDataURL('image/png').split(',')[1]});}
          await new Promise(r=>setTimeout(r,Math.max(0,start+(f+1)*1000/60-Date.now())));
        }
        const elapsed=Date.now()-start;rec.stop();await done;stream.getTracks().forEach(t=>t.stop());const reader=new FileReader(),encoded=new Promise(r=>reader.onloadend=()=>r(reader.result.split(',')[1]));reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));return{elapsed,seconds:4,samples,finish:__switchQA.finish(),base64:await encoded};})()`);
      await writeFile(resolve(output,'paced-switch-manual.webm'),Buffer.from(clip.base64,'base64'));delete clip.base64;
      for(const sample of clip.samples){const name=`paced-manual-${sample.frame}.png`;await writeFile(resolve(output,name),Buffer.from(sample.png,'base64'));qa.report.screenshots.push(name);delete sample.png;}
      assert.equal(clip.finish.reverts,2);assert.deepEqual(clip.finish.bails,[]);assert.ok(clip.finish.score>0);assert.ok(clip.elapsed>=3900&&clip.elapsed<6500);assert.ok(clip.samples.some(s=>s.stance===-1&&s.kind==='Manual'));return clip;
    });
    await qa.check('touch switch manual renders correctly with native revert and joystick flick',async()=>{
      const helper=await qa.evaluate("Object.values(__switchQA).filter(v=>typeof v==='function').map(f=>f.toString()).join(',')");
      await qa.resize(844,390,true);await qa.navigate(url+'?touch');
      await qa.evaluate(`window.__switchQA={${helper}};__game.selectLevel('genesee-warehouse');__switchQA.prepare('manual','joe',1);__qa.pad=null;`);
      await qa.evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready])');await qa.touch('#touch-revert');await qa.step(24);
      const stick=await qa.evaluate("(()=>{const r=document.querySelector('#touch-stick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,r:Math.min(r.width,r.height)*.34};})()");
      await qa.down(201,'#touch-stick');
      async function move(y){const raw=y?Math.sign(y)*(.14+.86*Math.abs(y)):0;await qa.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:201,x:stick.x,y:stick.y-stick.r*raw,radiusX:4,radiusY:4,force:1}]});}
      await move(.9);await qa.step(3);await move(-.9);await qa.step();
      for(let f=0;f<32;f++){await move(await qa.evaluate('Math.max(-1,Math.min(1,-__game.skater.manualBalance.x*3-__game.skater.manualBalance.v))'));await qa.step();}
      const held=await qa.evaluate('__switchQA.measure()');await qa.shot('touch-switch-manual');assert.equal(held.kind,'Manual');assert.equal(held.stance,-1);assert.ok(held.leadingWheelY-held.trailingWheelY>.1);
      await qa.up(201);await qa.down(202,'#touch-ollie');await qa.step(12);await qa.up(202);await qa.step(100);
      const finish=await qa.evaluate('({...__switchQA.finish(),lowfx:!__game.renderer.shadowMap.enabled,pointers:__game.touchControls.pointers.size})');assert.deepEqual(finish.bails,[]);assert.ok(finish.score>0);assert.equal(finish.lowfx,true);assert.equal(finish.pointers,0);await qa.shot('touch-switch-rollaway');return{held,finish};
    });
  }
}finally{await qa.close();}

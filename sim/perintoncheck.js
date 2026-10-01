// Actual three-level application QA and repeatable as-built reference views.
// node sim/perintoncheck.js URL OUTPUT_DIRECTORY
// QA_CAPTURE_ONLY=1: quick visual checkpoint. QA_THUMBNAIL=1: export game canvas.
// QA_REVIEW_ONLY=1: rerun cameras, thumbnail menus and paced motion after polish.
// QA_BASELINE_REPORT=.../report.json preserves the preceding pass's cameras.
// Browser is a disposable, unsigned-in Edge process; saves stay in its profile.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserQA } from './browser-qa.js';
import { PERINTON_LAYOUT } from '../src/perinton-layout.js';

const url = process.argv[2] || 'http://127.0.0.1:4176';
const output = resolve(process.argv[3] || 'screenshots/perinton/final');
const baseline = process.env.QA_BASELINE_REPORT ? JSON.parse(await readFile(process.env.QA_BASELINE_REPORT, 'utf8')) : null;
const views = baseline?.audit.views || [
  { name: 'aerial-photo33', position: [0, 38, 37], target: [0, 0, -1], fov: 57 },
  { name: 'plan-overhead', position: [0, 68, -1], target: [0, 0, -1], up: [0, 0, -1], fov: 47 },
  { name: 'plaza-from-entry', position: [-5, 1.7, 13], target: [-1, .9, -2], fov: 68 },
  { name: 'central-transition', position: [-14, 2.7, 9], target: [-3, .5, 0], fov: 65 },
  { name: 'bowl-overview', position: [1, 5.8, -4], target: [9, -.8, -11], fov: 64 },
  { name: 'bowl-interior', position: [5, -.4, -10], target: [12, -.2, -11], fov: 70 },
  { name: 'pump-west', position: [-20.5, 2.4, -7.5], target: [-11, .5, -14], fov: 66 },
  { name: 'pump-rear-straight', position: [-18, 2.2, -19], target: [18, .4, -19], fov: 63 },
  { name: 'stairs-and-bank', position: [15.5, 2.2, 4.5], target: [7, .55, -.8], fov: 66 },
  { name: 'east-quarter-extensions', position: [13, 2, 7], target: [20, 1, 0], fov: 65 },
  { name: 'shade-parking', position: [1, 1.65, 12.5], target: [0, 2, 30], fov: 66 },
];
const ids = ['genesee-warehouse', 'roc-city-skatepark', 'perinton-skatepark'];
const qa = await browserQA({ url, output, name: 'perinton' });
const { evaluate, step, check: runCheck, report, shot, click, tap, pad } = qa;
const check=(name,fn)=>process.env.QA_REVIEW_ONLY==='1'&&!/native level catalog|fixed aerial|paced native|touch portrait/.test(name)?Promise.resolve():runCheck(name,fn);
report.audit = { views, baseline: process.env.QA_BASELINE_REPORT || null,
  sourceLayout: PERINTON_LAYOUT, coordinateSpace: 'Unscaled authored metres; +X photo33 right, +Z toward entry',
  limitations: 'Estimated photo-derived dimensions, not a surveyed twin. Deterministic application frames and emulated gamepad/touch are not a physical-device performance test.' };
const mode = async expected => assert.equal(await evaluate('__game.session.mode'), expected);
async function ready() { await evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])'); }
async function openPark() { await evaluate('__game.selectLevel("perinton-skatepark");__game.startRun("free")'); await ready(); await step(2); }
async function showHud(show) {
  await evaluate(`for(const el of document.body.children)if(el.id!=='game'&&el.tagName!=='SCRIPT'){
    if(${show}){if(el.dataset.qaDisplay!==undefined){el.style.display=el.dataset.qaDisplay;delete el.dataset.qaDisplay;}}
    else{el.dataset.qaDisplay=el.style.display;el.style.display='none';}}
    __game.character.root.visible=${show};`);
}
async function renderView(view) {
  return evaluate(`(()=>{const g=__game,v=${JSON.stringify(view)};
    g.camera.up.set(...(v.up||[0,1,0]));g.camera.position.set(...v.position);g.camera.lookAt(...v.target);
    g.camera.fov=v.fov;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
    return{name:v.name,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,
      memory:{...g.renderer.info.memory},programs:g.renderer.info.programs.length,webglError:g.renderer.getContext().getError()};})()`);
}
async function cardLayout() {
  const result=await evaluate(`(()=>{const e=document.getElementById('front-end');return{viewport:[innerWidth,innerHeight],scroll:e.scrollWidth,client:e.clientWidth,page:document.documentElement.scrollWidth,cards:[]};})()`);
  assert(result.scroll<=result.client+1&&result.page<=result.viewport[0]+1,'Menu horizontal overflow');
  for(const id of ids) {
    const card=await evaluate(`(()=>{const e=document.querySelector('[data-level="${id}"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),img=e.querySelector('img');return{id:e.dataset.level,x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e,image:img.complete&&img.naturalWidth===1000&&img.naturalHeight===560};})()`);
    assert(card.width>=44&&card.height>=44&&card.x>=-.5&&card.right<=result.viewport[0]+.5&&card.hit,'Unreachable card: '+JSON.stringify(card));
    assert(card.image,'Missing actual-game 1000×560 thumbnail: '+id);result.cards.push(card);
  }return result;
}

try {
  report.assets = await evaluate('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/")&&n.endsWith(".js"))');
  await check('native level catalog contains three playable spots and launches Perinton', async () => {
    await mode('home'); await click('#fe-play'); await mode('levels');
    const cards = await evaluate('[...document.querySelectorAll(".fe-level-card")].map(e=>({id:e.dataset.level,label:e.textContent,disabled:e.disabled}))');
    assert.deepEqual(cards.map(c=>c.id), ids); assert(cards.every(c=>!c.disabled));
    await shot('level-select-desktop'); await click('#fe-level-perinton-skatepark'); await mode('title');
    const board = await evaluate('({title:document.getElementById("level-title").textContent,id:__game.session.levelId,goals:__game.levelConfig.goals.map(g=>({id:g.id,target:g.target}))})');
    assert.match(board.title,/PERINTON/);assert.equal(board.id,'perinton-skatepark');assert.equal(board.goals.length,7);
    await shot('goal-board-desktop'); await click('#free-skate'); await mode('playing'); await ready();
    assert.equal(await evaluate('__game.session.runMode'),'free'); return {cards,board};
  });
  await check('fixed aerial and ground reference views render the actual completed level', async () => {
    await openPark(); await showHud(false); const rendering = [];
    for(const view of views) {
      if(process.env.QA_VIEWS&&!process.env.QA_VIEWS.split(',').includes(view.name))continue;
      const metrics=await renderView(view);assert.equal(metrics.webglError,0);rendering.push(metrics);await shot(view.name);
    }
    report.audit.rendering=rendering;
    if(process.env.QA_THUMBNAIL==='1') {
      const thumb={...views.find(v=>v.name==='aerial-photo33'),position:[-23,28,31],target:[0,-.1,-2],fov:59};
      // WebGL's default framebuffer is cleared after compositing. Encode in the
      // same synchronous call as render, not a later CDP evaluation.
      const encoded=await evaluate(`(()=>{const g=__game,v=${JSON.stringify(thumb)};g.renderer.setSize(1000,560);g.camera.aspect=1000/560;g.camera.up.set(0,1,0);g.camera.position.set(...v.position);g.camera.lookAt(...v.target);g.camera.fov=v.fov;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
        const canvas=document.createElement('canvas');canvas.width=100;canvas.height=56;const ctx=canvas.getContext('2d');ctx.drawImage(g.renderer.domElement,0,0,100,56);const pixels=ctx.getImageData(0,0,100,56).data,colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
        return{data:g.renderer.domElement.toDataURL('image/webp',.92).split(',')[1],colors:colors.size};})()`);
      assert(encoded.colors>64,'Thumbnail framebuffer is blank');
      const destination=resolve('public/textures/levels/perinton-skatepark.webp');await mkdir(resolve('public/textures/levels'),{recursive:true});await writeFile(destination,Buffer.from(encoded.data,'base64'));
      report.audit.thumbnail={path:destination,view:thumb,width:1000,height:560,colors:encoded.colors};
      await qa.resize(1440,900);
    }
    await showHud(true);return {views:rendering.length,rendering};
  });
  if(process.env.QA_CAPTURE_ONLY!=='1') {
    await check('all three level cards are reachable with keyboard and controller without double activation',async()=>{
      await evaluate('__game.showHome();__game.selectLevel("genesee-warehouse");__game.showLevelSelect()');await step(2);
      const layout=await cardLayout();await evaluate('document.getElementById("fe-level-genesee").focus()');
      await tap('ArrowRight');assert.equal(await evaluate('document.activeElement.dataset.level'),ids[1]);await tap('ArrowRight');assert.equal(await evaluate('document.activeElement.dataset.level'),ids[2]);
      await qa.key('Enter',true);await step(2);await qa.key('Enter',true,true);await step(2);await qa.key('Enter',false);await mode('title');assert.equal(await evaluate('__game.session.levelId'),ids[2]);
      await tap('Escape');await mode('levels');await evaluate('__qa.connectPad()');await step(2);await pad(14);assert.equal(await evaluate('document.activeElement.dataset.level'),ids[1]);await pad(0);await mode('title');assert.equal(await evaluate('__game.session.levelId'),ids[1]);
      await pad(1);await mode('levels');await pad(15);await pad(0);await mode('title');assert.equal(await evaluate('__game.session.levelId'),ids[2]);await evaluate('__qa.pad=null');return layout;
    });
    await check('both skaters land native gamepad ollies in the Perinton entry plaza', async()=>{
      const observations=[];
      for(const id of ['joe','aaron']) {
        await evaluate('__game.showHome()');await click('#fe-skater');await click('#fe-character-'+id);await click('#fe-character-confirm');
        await openPark();await evaluate(`(()=>{__qa.connectPad();__qa.events={bail:0,ollie:0,land:0};for(const key of Object.keys(__qa.events)){__qa.originalEvents??={};__qa.originalEvents[key]??=__game.skater.events[key];const old=__qa.originalEvents[key];__game.skater.events[key]=(...args)=>{__qa.events[key]++;old?.(...args);};}
          const s=__game.skater;s.pos.set(-12,0,11);s.heading.set(1,0,0);s.facing.copy(s.heading);s.speed=0;s.vel.set(0,0,0);__game.followCam.snap(s);})()`);
        // A real held A pushes, crouches and releases through Input and Skater.
        await evaluate('__qa.button(0,true)');await step(36);await evaluate('__qa.button(0,false)');await step(12);await shot(id+'-gamepad-air');await step(100);await shot(id+'-gamepad-land');
        const observation=await evaluate('({id:__game.character.characterId,events:{...__qa.events},state:__game.skater.state,position:__game.skater.pos.toArray(),time:__game.session.timeLeft})');
        assert.equal(observation.id,id);assert.equal(observation.events.bail,0);assert(observation.events.ollie>0&&observation.events.land>0);assert.equal(observation.state,'ride');observations.push(observation);await evaluate('__qa.pad=null');
      }return observations;
    });
    await check('Perinton career records and retired pickups stay isolated across three levels and reload',async()=>{
      await evaluate('__game.showHome()');const before=await evaluate('__game.careers');
      // This is a save-isolation fixture, not evidence of earning score on a route.
      await evaluate(`__game.selectLevel('perinton-skatepark');__game.progress.record({completed:['skate','high-score'],score:5678,bestCombo:2345});__game.startRun('goals');`);await step(2);
      const active=await evaluate('({careers:__game.careers,available:[...__game.goals.availableGoals],items:__game.collectibles.items.filter(i=>i.definition.goalId==="skate").map(i=>({visible:i.root.visible,ring:i.ring.visible}))})');
      for(const id of ids.slice(0,2))assert.deepEqual(active.careers[id],before[id]);assert(!active.available.includes('skate'));assert(active.items.every(i=>!i.visible&&!i.ring));
      const saved=active.careers['perinton-skatepark'];await qa.reload();assert.deepEqual((await evaluate('__game.careers'))['perinton-skatepark'],saved);
      await openPark();await evaluate('__game.showHome()');await click('#fe-play');await shot('level-select-isolated-careers');return{before,after:active.careers,retired:active.items};
    });
    await check('bounded cached switches retain three independent worlds and stable resources',async()=>{
      const samples=await evaluate(`(async()=>{const g=__game,known=new Map(),samples=[];
        for(let cycle=0;cycle<6;cycle++)for(const id of ${JSON.stringify(ids)}){
          g.showHome();g.selectLevel(id);g.startRun('free');await Promise.all([g.atmosphere.ready,g.floorSurface.ready,g.collectibles.ready]);await __qa.step(2);
          if(known.has(id)&&known.get(id)!==g.level)throw Error('Level rebuilt: '+id);known.set(id,g.level);
          if(g.skater.level!==g.level||g.followCam.level!==g.level||g.fx.level!==g.level)throw Error('Stale level binding');
          const roots=g.scene.children.filter(o=>o.name.startsWith('Level: '));if(roots.length!==1||roots[0].name!=='Level: '+id)throw Error('Inactive world remains attached');
          g.renderer.render(g.scene,g.camera);if(cycle>=2&&id==='perinton-skatepark'){let objects=0;g.scene.traverse(()=>objects++);samples.push({cycle,objects,geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,programs:g.renderer.info.programs.length,error:g.renderer.getContext().getError()});}
        }return{samples,loaded:g.loadedLevels};})()`);
      assert.deepEqual([...samples.loaded].sort(),[...ids].sort());const initial=samples.samples[0];
      for(const sample of samples.samples){assert.equal(sample.objects,initial.objects);assert.equal(sample.geometries,initial.geometries);assert.equal(sample.textures,initial.textures);assert.equal(sample.programs,initial.programs);assert.equal(sample.error,0);}return{...samples,switches:18};
    });
    for(const route of ['bowl','pump']) await check(`paced native controller ${route} traversal uses the real follow camera`,async()=>{
      await qa.resize(1280,720);await openPark();
      const clip=await evaluate(`(async()=>{
        const g=__game,s=g.skater,route=${JSON.stringify(route)};__qa.connectPad();
        const path=g.level.pumpPoints.filter((_,i)=>i%6===0||i===g.level.pumpPoints.length-1);let index=0;
        if(route==='bowl'){s.pos.set(6,-1.8,-11);s.heading.set(0,0,-1);s.speed=7;}
        else {index=path.findIndex(p=>p[0]>-15&&p[0]<-10&&p[2]<-18);if(index<0)throw Error('Missing rear pump straight');s.pos.set(...path[index]);s.heading.set(path[index+1][0]-path[index][0],0,path[index+1][2]-path[index][2]).normalize();s.speed=4.5;index++;}
        const hit=s.raycast(s.pos.clone().add(s.pos.clone().set(0,3,0)),s.pos.clone().set(0,-1,0),8);if(!hit)throw Error('Unsupported fixture');s.pos.copy(hit.point);s.normal.copy(hit.normal);s.facing.copy(s.heading);s.vel.copy(s.heading).multiplyScalar(s.speed);g.followCam.snap(s);
        const events={bails:[],lands:0,airFrames:0};const bail=s.events.bail,land=s.events.land;s.events.bail=reason=>{events.bails.push(reason);bail?.(reason);};s.events.land=(...args)=>{events.lands++;land?.(...args);};
        const stream=g.renderer.domElement.captureStream(60),parts=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2200000}),done=new Promise(r=>rec.onstop=r);rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
        const frames=route==='bowl'?150:300,startPosition=s.pos.toArray(),samples=[],frameWall=[];let minY=s.pos.y,maxY=s.pos.y;
        rec.start();const began=Date.now();
        for(let f=0;f<frames;f++){
          let x=0,y=1;
          if(route==='pump'){
            const p=path[Math.min(index,path.length-1)],dx=p[0]-s.pos.x,dz=p[2]-s.pos.z,angle=Math.atan2(s.heading.x*dz-s.heading.z*dx,s.heading.x*dx+s.heading.z*dz);
            x=s.state==='ride'?Math.max(-.85,Math.min(.85,angle*2)):0;
            const desired=Math.abs(angle)>.6?3.1:5;y=s.speed<desired?.495:s.speed>desired+.25?-.495:0;
            if(Math.hypot(dx,dz)<.55)index++;
          }
          const m=Math.hypot(x,y),factor=m?(.14+.86*Math.min(1,m))/m:0;__qa.pad.axes[0]=x*factor;__qa.pad.axes[1]=-y*factor;
          const frameStart=Date.now();await __qa.step();frameWall.push(Date.now()-frameStart);minY=Math.min(minY,s.pos.y);maxY=Math.max(maxY,s.pos.y);if(s.state==='air')events.airFrames++;
          if([0,30,60,90,120,149,180,240,299].includes(f)){g.renderer.render(g.scene,g.camera);samples.push({frame:f,position:s.pos.toArray(),state:s.state,normal:s.normal.toArray(),png:g.renderer.domElement.toDataURL('image/png').split(',')[1]});}
          await new Promise(r=>setTimeout(r,Math.max(0,began+(f+1)*1000/60-Date.now())));
        }
        const elapsed=Date.now()-began;rec.stop();await done;stream.getTracks().forEach(t=>t.stop());__qa.pad=null;s.events.bail=bail;s.events.land=land;
        const reader=new FileReader(),encoded=new Promise(r=>reader.onloadend=()=>r(reader.result.split(',')[1]));reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));
        return{route,frames,elapsed,simulatedSeconds:frames/60,frameWall,events,startPosition,end:s.pos.toArray(),minY,maxY,samples,base64:await encoded};})()`);
      await writeFile(resolve(output,`paced-${route}.webm`),Buffer.from(clip.base64,'base64'));delete clip.base64;
      for(const sample of clip.samples){const name=`paced-${route}-${sample.frame}.png`;await writeFile(resolve(output,name),Buffer.from(sample.png,'base64'));report.screenshots.push(name);delete sample.png;}
      assert.deepEqual(clip.events.bails,[],'Actual native traversal bailed');assert(clip.maxY-clip.minY>.25,'Did not traverse vertical geometry');
      if(route==='bowl'){assert(clip.events.airFrames>10&&clip.events.lands>0,'Bowl route did not air and land');clip.routeDescription='Deep pocket approach, air over the coping, and land on the adjacent rear pump lane. This is an exit, not a return into the bowl.';}
      else assert(clip.end[0]-clip.startPosition[0]>15,'Pump route did not cover multiple rollers');
      const sorted=[...clip.frameWall].sort((a,b)=>a-b);clip.timing={medianSubmissionMs:sorted[Math.floor(sorted.length*.5)],p90SubmissionMs:sorted[Math.floor(sorted.length*.9)],note:'Date.now wall time around deterministic application frame submission; not GPU FPS or a physical-device benchmark.'};delete clip.frameWall;return clip;
    });
    await check('touch portrait and landscape expose all three cards and their real thumbnails',async()=>{
      const profiles=[];
      for(const [width,height] of [[390,844],[844,390]]){
        await qa.resize(width,height,true);const address=new URL(url);address.searchParams.set('touch','');await qa.navigate(address.href);await qa.touch('#fe-play');const layout=await cardLayout();await shot(`level-select-touch-${width}x${height}`);
        await qa.touch('#fe-level-perinton-skatepark');await mode('title');await shot(`goal-board-touch-${width}x${height}`);profiles.push(layout);
      }return profiles;
    });
    await check('native touch launch, push, ollie, landing and paused exit work in low-effects landscape',async()=>{
      await qa.resize(844,390,true);const address=new URL(url);address.searchParams.set('touch','');await qa.navigate(address.href);
      await qa.touch('#fe-play');await qa.touch('#fe-level-perinton-skatepark');await qa.touch('#free-skate');await ready();
      await evaluate(`(()=>{__qa.events={bail:0,ollie:0,land:0};for(const key of Object.keys(__qa.events)){const old=__game.skater.events[key];__game.skater.events[key]=(...args)=>{__qa.events[key]++;old?.(...args);};}const s=__game.skater;s.pos.set(-12,0,11);s.heading.set(1,0,0);s.facing.copy(s.heading);s.speed=0;s.vel.set(0,0,0);__game.followCam.snap(s);})()`);await step(2);
      const stick=await evaluate('(()=>{const r=document.getElementById("touch-stick").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,radius:r.width/2};})()');
      await qa.down(41,'#touch-stick');await qa.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:41,x:stick.x,y:stick.y-stick.radius*.9,radiusX:4,radiusY:4,force:1}]});await step(18);
      await qa.down(42,'#touch-ollie');await step(32);await qa.up(42);await step(12);await shot('touch-air');await qa.up(41);await step(100);await shot('touch-land');
      const result=await evaluate('({events:{...__qa.events},state:__game.skater.state,pos:__game.skater.pos.toArray(),shadows:__game.renderer.shadowMap.enabled,pointers:__game.touchControls.pointers.size,held:__game.touchControls.source.held.size,viewport:[innerWidth,innerHeight]})');
      assert.equal(result.events.bail,0);assert(result.events.ollie>0&&result.events.land>0);assert.equal(result.state,'ride');assert.equal(result.shadows,false);assert.equal(result.pointers,0);assert.equal(result.held,0);
      await qa.touch('#start-btn');assert.equal(await evaluate('__game.session.paused'),true);await qa.touch('#settings-home');await mode('home');assert.equal(await evaluate('__game.sessionClock.active'),false);return result;
    });
  }
  await writeFile(resolve(output,'view-definitions.json'),JSON.stringify({coordinateSpace:report.audit.coordinateSpace,views},null,2)+'\n');
} finally {await qa.close();}

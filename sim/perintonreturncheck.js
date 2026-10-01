// Native gamepad shallow-pocket air/inside-return evidence using the real camera.
// node sim/perintonreturncheck.js [url] [output-directory]
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserQA } from './browser-qa.js';

const qa = await browserQA({ url: process.argv[2] || 'http://127.0.0.1:4176/', output: process.argv[3] || 'screenshots/perinton-scale/after/motion', name: 'perinton-return' });
const output = resolve(process.argv[3] || 'screenshots/perinton-scale/after/motion');
try {
  await qa.resize(960,540);
  await qa.evaluate(`__game.showHome();__game.showCharacterSelect();__game.selectCharacter('joe');__game.selectLevel('perinton-skatepark');__game.startRun('free');`);
  await qa.evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready,__game.atmosphere.ready])');
  await qa.check('Native gamepad shallow air lands and settles inside the actual bowl', async () => {
    const result = await qa.evaluate(`(async()=>{
      const g=__game,s=g.skater,ray=g.fx.ray;__qa.connectPad();
      s.pos.set(13.2,-1.25,-11);const hit=s.raycast(s.pos.clone().setY(8),s.normal.clone().set(0,-1,0),16);s.pos.copy(hit.point);s.normal.copy(hit.normal);s.heading.set(1,0,0);s.facing.copy(s.heading);s.speed=7;s.vel.copy(s.heading).multiplyScalar(7);g.followCam.snap(s);
      const support=()=>{ray.set(s.pos.clone().add(s.normal.clone().set(0,.5,0)),s.normal.clone().set(0,-1,0));ray.near=0;ray.far=3;const h=ray.intersectObjects(g.level.colliders,false)[0];return{inside:h?.object===g.level.bowl,surface:h?.object?.name};};
      const events={bails:[],landings:[],airFrames:0},samples=[],trace=[];let frame=0,peak=-Infinity;
      const originalBail=s.events.bail,originalLand=s.events.land;s.events.bail=reason=>{events.bails.push(reason);originalBail?.(reason);};s.events.land=(...args)=>{events.landings.push({frame,position:s.pos.toArray(),...support()});originalLand?.(...args);};
      const stream=g.renderer.domElement.captureStream(60),parts=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000}),stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
      const snap=phase=>{g.renderer.render(g.scene,g.camera);samples.push({phase,frame,position:s.pos.toArray(),state:s.state,png:g.renderer.domElement.toDataURL('image/png').split(',')[1]});};
      recorder.start();const began=Date.now();snap('approach');let firstAir=false,afterLand=false,oldState=s.state;
      for(frame=0;frame<240;frame++){
        const push=events.landings.length?-.65:1;__qa.pad.axes[0]=0;__qa.pad.axes[1]=-Math.sign(push)*(.14+.86*Math.abs(push));
        await __qa.step();peak=Math.max(peak,s.pos.y);if(s.state==='air')events.airFrames++;
        trace.push({frame,state:s.state,position:s.pos.toArray(),velocity:s.vel.toArray(),normal:s.normal.toArray(),input:{push:s._inp?.push,brake:s._inp?.brake}});
        if(!firstAir&&s.state==='air'){firstAir=true;snap('takeoff');}
        if(s.state==='air'&&s.vel.y<=0&&trace.at(-2)?.velocity[1]>0)snap('apex');
        if(!afterLand&&oldState==='air'&&s.state==='ride'){afterLand=true;snap('inside-landing');}oldState=s.state;
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,began+(frame+1)*1000/60-Date.now())));
      }
      snap('settled');const elapsed=Date.now()-began;recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());__qa.pad=null;s.events.bail=originalBail;s.events.land=originalLand;
      const reader=new FileReader(),encoded=new Promise(resolve=>reader.onloadend=()=>resolve(reader.result.split(',')[1]));reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));
      return{events,trace,samples,peak,end:{position:s.pos.toArray(),state:s.state,...support()},simulatedSeconds:4,wallElapsedMs:elapsed,base64:await encoded};
    })()`);
    await writeFile(resolve(output,'shallow-inside-return.webm'),Buffer.from(result.base64,'base64'));
    const encoded = result.base64; delete result.base64;
    for (const sample of result.samples) {
      const name = 'shallow-' + sample.phase + '.png';
      await writeFile(resolve(output,name),Buffer.from(sample.png,'base64')); delete sample.png;
      qa.report.screenshots.push(name);
    }
    // Decode the saved movie and seek it independently: these PNGs come from
    // video playback, not the live canvas used to generate it.
    const replay = await qa.evaluate(`(async()=>{const video=document.createElement('video');video.muted=true;video.src='data:video/webm;base64,${encoded}';await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Recorded WebM could not decode'));});if(!Number.isFinite(video.duration)){video.currentTime=1e10;await new Promise(resolve=>video.onseeked=resolve);}const duration=video.duration,samples=[];for(const fraction of [.12,.38,.68,.93]){video.currentTime=duration*fraction;await new Promise(resolve=>video.onseeked=resolve);const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);samples.push({fraction,time:video.currentTime,png:canvas.toDataURL('image/png').split(',')[1]});}return{duration,width:video.videoWidth,height:video.videoHeight,samples};})()`);
    for (const [index,sample] of replay.samples.entries()) {
      const name='replay-'+index+'.png'; await writeFile(resolve(output,name),Buffer.from(sample.png,'base64'));delete sample.png;qa.report.screenshots.push(name);
    }
    result.replay=replay;result.clip='shallow-inside-return.webm';
    result.timingNote='Real gamepad polling, physics, rendering and follow camera. Wall pacing is recorded; headless encoding/rendering is not a physical-device FPS benchmark.';
    assert.deepEqual(result.events.bails,[]);
    assert(result.events.airFrames>30,'Rider must actually air');
    assert(result.events.landings.length>0&&result.events.landings[0].inside&&result.events.landings[0].position[1]<-.1,'First natural landing must be inside the bowl');
    assert.equal(result.end.state,'ride');assert(result.end.inside,'Braking must settle inside the bowl');
    assert(replay.duration>1&&replay.width===960&&replay.height===540,'Saved movie must decode at the expected resolution');
    qa.report.assets=await qa.evaluate(`performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/assets/')&&n.endsWith('.js'))`);
    if(process.env.QA_EXPECT_ASSET)assert(qa.report.assets.some(asset=>asset.includes(process.env.QA_EXPECT_ASSET)));
    return result;
  });
} finally { await qa.close(); }

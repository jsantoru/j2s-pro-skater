// Repeatable, rider-relative ROC scale evidence. Coordinates are authored once;
// after conversion they follow level.worldScale, while Joe and camera offsets
// retain their actual metre dimensions. No app source imports are required.
// node sim/rocscalecheck.js [url] [output-directory]
// QA_VIEWS_ONLY=1 captures an explicit baseline; QA_THUMBNAIL=1 also exports
// the level-card image. The default output preserves the archived baseline.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { browserQA } from './browser-qa.js';

const url = process.argv[2] || 'http://127.0.0.1:4175/';
const output = process.argv[3] || 'screenshots/roc-scale/after';
const qa = await browserQA({ url, output, name: 'roc-scale' });
const { evaluate, step, check, shot, report, resize, navigate, reload, down, up, touch } = qa;

try {
  await evaluate(`__game.showHome();__game.showCharacterSelect();__game.selectCharacter('joe');
    window.__scaleQA={
      scale(){const g=__game;if(g.session.levelId!=='roc-city-skatepark')return[1,1,1];const s=g.level.worldScale??1;return typeof s==='number'?[s,s,s]:[s.x,s.y,s.z];},
      point(p){const s=this.scale();return p.map((v,i)=>v*s[i]);},
      ground(p){const s=__game.skater,v=s.pos.clone().set(...this.point(p));v.y=30;return s.raycast(v,s.normal.clone().set(0,-1,0),80);},
      bounds(object){let seed;object.traverse(o=>{if(!seed&&o.geometry){o.geometry.computeBoundingBox();seed=o.geometry.boundingBox;}});object.updateWorldMatrix(true,true);const b=seed.clone().makeEmpty().setFromObject(object,true);return{min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(__game.skater.pos.clone()).toArray()};},
      place(p,heading=[0,0,1]){const g=__game,s=g.skater;g.startRun('free');s.pos.set(...this.point(p));const hit=this.ground(p);if(!hit)throw new Error('No ground at '+p);s.pos.y=hit.point.y;
        s.speed=0;s.vel.set(0,0,0);s.heading.set(...heading).normalize();s.facing.copy(s.heading);s.normal.set(0,1,0);s.modelQuat.setFromUnitVectors(s.normal.clone().set(0,0,1),s.heading);
        g.character.root.position.copy(s.pos);g.character.root.quaternion.copy(s.modelQuat);for(let i=0;i<90;i++)g.character.update(s,1/60,0);g.character.root.updateMatrixWorld(true);
        g.fx.update(0,s);g.collectibles.group.visible=false;return{position:s.pos.toArray(),rider:this.bounds(g.character.root)};},
      fixed(offset,targetOffset=[0,.85,0]){const g=__game;g.camera.up.set(0,1,0);g.camera.position.copy(g.skater.pos).add(g.skater.pos.clone().set(...offset));g.camera.lookAt(g.skater.pos.clone().add(g.skater.pos.clone().set(...targetOffset)));g.camera.fov=52;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);},
      follow(){const g=__game;g.followCam.dirAngle=Math.atan2(g.skater.heading.x,g.skater.heading.z);g.followCam.snap(g.skater);g.renderer.render(g.scene,g.camera);},
    };`);
  await check('Repeatable Joe-to-feature scale views and measured dimensions', async () => {
    await evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free')`); await step(2);
    await evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready])');
    const measurements = await evaluate(`(()=>{const g=__game,l=g.level,q=__scaleQA;
      const rail=l.rails.find(r=>r.feature==='E'&&r.kind==='rail');
      const groundAt=p=>q.ground(p)?.point.y;
      const support=groundAt([10,0,-20.3]);
      return{worldScale:q.scale(),characterId:g.character.characterId,rail:{start:rail.a.toArray(),end:rail.b.toArray(),length:rail.len,heightAboveStart:rail.a.y-support},
        sevenStairs:{top:groundAt([10,0,-20.4]),landing:groundAt([10,0,-16.4])},manualPad:q.bounds(l.manualPad),
        mini:{rim:groundAt([2,0,-44]),bottom:groundAt([1.5,0,-35])},bowl:{deck:groundAt([-17.5,0,-15]),deepFloor:groundAt([-8,0,-15])}};})()`);
    const views = [
      { name: 'seven-stairs-follow', point: [10,1.26,-23.8], follow: true },
      { name: 'seven-stairs-side', point: [7.35,0,-16.8], offset: [-3.8,1.8,5.2], target: [2.3,1,-2] },
      { name: 'bridge-manual-pad', point: [10.5,-.9,35], offset: [-4.1,1.5,-5.2], target: [1.5,.85,0] },
      { name: 'bowl-deck', point: [-17.5,1.62,-15], offset: [3.8,2.1,5.2], target: [1.2,.5,-1] },
      { name: 'mini-ramp', point: [1.5,0,-35], offset: [-4.8,4,-4.8], target: [0,.85,0] },
      { name: 'warehouse-control', park: 'genesee-warehouse', point: [5.8,0,7], offset: [-4.1,1.5,-5.2], target: [1.5,.85,0] },
    ];
    report.views = [];
    for (const view of views) {
      if(view.park){await evaluate(`__game.selectLevel(${JSON.stringify(view.park)});__game.startRun('free')`);await step(2);await evaluate('__game.floorSurface.ready');}
      const placement = await evaluate(`__scaleQA.place(${JSON.stringify(view.point)})`);
      assert(placement.rider.size.every(Number.isFinite));
      await evaluate(`for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='none';`);
      await evaluate(view.follow ? '__scaleQA.follow()' : `__scaleQA.fixed(${JSON.stringify(view.offset)},${JSON.stringify(view.target)})`);
      await shot(view.name);
      report.views.push({ ...view, ...placement, camera: await evaluate('({position:__game.camera.position.toArray(),fov:__game.camera.fov})') });
    }
    report.measurements = measurements;
    if(process.env.QA_THUMBNAIL==='1'){
      const data=await evaluate(`(()=>{const g=__game;g.selectLevel('roc-city-skatepark');g.startRun('free');g.character.root.visible=false;g.collectibles.group.visible=false;const scale=g.level.horizontalScale||1;
        g.renderer.setSize(1000,560);g.camera.aspect=1000/560;g.camera.position.set(-30*scale,24*scale,-37*scale);g.camera.lookAt(0,0,-scale);g.camera.fov=62;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
        const data=g.renderer.domElement.toDataURL('image/webp',.9).split(',')[1];g.character.root.visible=true;window.dispatchEvent(new Event('resize'));return data;})()`);
      await mkdir(resolve('public/textures/levels'),{recursive:true});await writeFile(resolve('public/textures/levels/roc-city-skatepark.webp'),Buffer.from(data,'base64'));report.thumbnail='public/textures/levels/roc-city-skatepark.webp';
    }
    assert.equal(await evaluate('__game.renderer.getContext().getError()'), 0);
    return measurements;
  });
  if(process.env.QA_VIEWS_ONLY!=='1'){
    await check('Broader world preserves measured human heights and the Warehouse control',async()=>{
      const baseline=JSON.parse(await readFile(new URL('../screenshots/roc-scale/before/report.json',import.meta.url),'utf8'));
      const current=report.measurements;
      assert(current,'Capture check must run before the dimensional comparison');
      assert.deepEqual(current.worldScale,[1.25,1,1.25]);
      for(const field of ['top','landing'])assert(Math.abs(current.sevenStairs[field]-baseline.measurements.sevenStairs[field])<1e-5);
      for(const field of ['rim','bottom'])assert(Math.abs(current.mini[field]-baseline.measurements.mini[field])<1e-5);
      for(const field of ['deck','deepFloor'])assert(Math.abs(current.bowl[field]-baseline.measurements.bowl[field])<1e-5);
      for(let axis=0;axis<3;axis++)assert(Math.abs(current.manualPad.size[axis]-baseline.measurements.manualPad.size[axis]*(axis===1?1:1.25))<1e-5);
      for(const view of report.views){const old=baseline.views.find(v=>v.name===view.name);assert(Math.abs(view.rider.size[1]-old.rider.size[1])<.001);assert.equal(view.camera.fov,old.camera.fov);}
      const warehouse=report.views.find(v=>v.name==='warehouse-control'),oldWarehouse=baseline.views.find(v=>v.name===warehouse.name);
      assert.deepEqual(warehouse.position,oldWarehouse.position);assert.deepEqual(warehouse.camera,oldWarehouse.camera);
      const beforeHash=createHash('sha256').update(await readFile(new URL('../screenshots/roc-scale/before/warehouse-control.png',import.meta.url))).digest('hex');
      const afterHash=createHash('sha256').update(await readFile(resolve(output,'warehouse-control.png'))).digest('hex');
      assert.equal(afterHash,beforeHash,'Warehouse control image must remain pixel-identical');
      return{riderHeight:report.views[0].rider.size[1],padSize:current.manualPad.size,railHeight:current.rail.heightAboveStart,warehouseSHA256:{before:beforeHash,after:afterHash}};
    });
    await check('Contact shadows follow actual world-space slope triangles without shader errors',async()=>{
      await evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free')`);await step(2);await evaluate('__game.floorSurface.ready');
      const samples=await evaluate(`(()=>{const g=__game,q=__scaleQA,results=[];
        for(const [feature,p]of [['I',[8,0,21.5]],['H',[10.4,0,.7]],['B',[3.55,0,-37.05]],['D',[-15,0,-15]]]){
          const hit=q.ground(p);if(!hit)throw new Error('Missing '+feature+' slope');g.skater.pos.copy(hit.point);g.fx.update(0,g.skater);
          const raw=g.fx.ray.intersectObjects(g.level.colliders,false)[0],position=raw.object.geometry.attributes.position;
          const points=[raw.face.a,raw.face.b,raw.face.c].map(i=>g.skater.pos.clone().fromBufferAttribute(position,i).applyMatrix4(raw.object.matrixWorld));
          const expected=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
          const rendered=g.skater.pos.clone().set(0,0,1).applyQuaternion(g.fx.shadow.quaternion);
          const old=raw.face.normal.clone().transformDirection(raw.object.matrixWorld);
          results.push({feature,normal:expected.toArray(),visible:g.fx.shadow.visible,alignmentError:rendered.distanceTo(expected),oldError:old.distanceTo(expected),positionError:g.fx.shadow.position.distanceTo(raw.point.clone().addScaledVector(expected,.008))});
        }g.renderer.render(g.scene,g.camera);return results;})()`);
      for(const sample of samples){assert(sample.visible);assert(sample.normal[1]>.1&&sample.normal[1]<.995,'Sample must be a slope: '+sample.feature);assert(sample.alignmentError<1e-6&&sample.positionError<1e-6,JSON.stringify(sample));}
      assert(Math.max(...samples.map(s=>s.oldError))>.05,'Samples must expose incorrect scaling of normals');assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);return samples;
    });
    await check('Scaled level switching keeps saved careers isolated and GPU resources stable',async()=>{
      await evaluate(`for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='';
        for(const id of ['genesee-warehouse','roc-city-skatepark']){__game.selectLevel(id);__game.startRun('goals');__game.skater.combo.add('Scale QA saved fixture',7000);__game.skater.bankCombo(false);__game.endRun();}__game.showHome();`);await step(2);
      const before=await evaluate('({careers:__game.careers,storage:Object.fromEntries(Object.entries(localStorage)),memory:{...__game.renderer.info.memory}})');
      for(let i=0;i<8;i++){await evaluate(`__game.selectLevel(${JSON.stringify('roc-city-skatepark')});__game.showHome();__game.selectLevel('genesee-warehouse');__game.showHome()`);await step(2);}
      const after=await evaluate('({careers:__game.careers,storage:Object.fromEntries(Object.entries(localStorage)),memory:{...__game.renderer.info.memory}})');
      assert.deepEqual(after,before);await reload();assert.deepEqual(await evaluate('__game.careers'),before.careers);
      await evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free')`);await step(2);
      assert.equal(await evaluate('__game.level.horizontalScale'),1.25);assert.equal(await evaluate('__game.scene.children.filter(c=>c.name.startsWith("Level:")).length'),1);
      return{careers:before.careers,before:before.memory,after:after.memory};
    });
    await check('Phone touch skating lands an ollie and pause freezes the scaled world',async()=>{
      const mobile=new URL(url);mobile.searchParams.set('touch','');await navigate(mobile.href);await resize(390,844,true);
      await evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free');const s=__game.skater;s.pos.set(...__game.level.toWorldPoint([8,-.9,40]));s.heading.set(0,0,1);s.facing.copy(s.heading);s.speed=0;s.vel.set(0,0,0);__game.followCam.snap(s)`);await step(2);
      assert.equal(await evaluate('document.getElementById("touch-controls").hidden'),false);assert.equal(await evaluate('__game.renderer.shadowMap.enabled'),false);
      await down(1,'#touch-ollie');await step(22);await up(1);await step(3);assert.equal(await evaluate('__game.skater.state'),'air');
      const landed=await evaluate(`(async()=>{const s=__game.skater;for(let i=0;i<90;i++){await __qa.step();if(s.state==='bail'||s.state==='ride')return{state:s.state,pos:s.pos.toArray()};}return{state:s.state};})()`);
      assert.equal(landed.state,'ride',JSON.stringify(landed));await touch('#start-btn');
      const paused=await evaluate('({position:__game.skater.pos.toArray(),time:__game.session.timeLeft,paused:__game.session.paused})');assert(paused.paused);await step(30);
      assert.deepEqual(await evaluate('({position:__game.skater.pos.toArray(),time:__game.session.timeLeft,paused:__game.session.paused})'),paused);
      assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);return{viewport:[390,844],landed,paused};
    });
  }
} finally { await qa.close(); }

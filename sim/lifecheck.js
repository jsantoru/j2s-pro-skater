// Focused real-render review of ROC's ambient life. Fixed cameras permit visual
// comparisons; two deterministic environment times test motion and its opt-out.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserQA } from './browser-qa.js';

const url = process.argv[2] || 'http://127.0.0.1:4176';
const output = resolve(process.argv[3] || 'screenshots/environment/life-pass-1');
const baselinePath = process.env.QA_BASELINE_REPORT || 'screenshots/environment/final/report.json';
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const matching = baseline.audit.views.filter(v => ['north-entry-to-bowl', 'street-east-buildings', 'bowl-to-trail-trees', 'landscape-sidewalk-edge', 'wide-establishing'].includes(v.name));
const details = [
  { name: 'east-fence-people-natural', position: [13.3,1.65,-4.6], target: [16.2,.95,-6], fov: 62 },
  { name: 'east-fence-people-detail', position: [14.9,1.25,-8], target: [16.2,.90,-6.1], fov: 48 },
  { name: 'north-entry-friends', position: [7,2,-43], target: [9,.85,-46], fov: 55 },
  { name: 'cafe-patron-detail', position: [35.8,1.45,-17], target: [37.65,.90,-15], fov: 55 },
  { name: 'parked-bike-detail', position: [15,1.25,-17], target: [16.18,.55,-15], fov: 55 },
  { name: 'community-board', position: [13.7,1.65,-11.7], target: [16.72,1.25,-13.1], fov: 55 },
];
const windView = { name: 'wind-detail', position: [14,2.2,-11], target: [16.7,3.4,-10], fov: 55 };
const walkView = { name: 'walker-detail', position: [31.2,1.5,-4.5], target: [34.6,.9,-7], fov: 65 };
const qa = await browserQA({ url, output, name: 'ambient-life' });
qa.report.baselineReport = baselinePath;
qa.report.views = [...matching, ...details, windView, walkView];
const digest = text => createHash('sha256').update(text).digest('hex');

async function render(view, time = 2) {
  return qa.evaluate(`(() => {
    const g = __game, v = ${JSON.stringify(view)}, scale = g.level.horizontalScale;
    g.atmosphere.update(${time});
    g.camera.up.set(0,1,0);g.camera.position.set(v.position[0]*scale,v.position[1],v.position[2]*scale);
    g.camera.lookAt(v.target[0]*scale,v.target[1],v.target[2]*scale);g.camera.fov=v.fov;g.camera.updateProjectionMatrix();
    g.renderer.render(g.scene,g.camera);
    return { name:v.name,time:${time},position:g.camera.position.toArray(),
      calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,
      geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,
      webglError:g.renderer.getContext().getError() };
  })()`);
}
async function snapshot() {
  const data = await qa.evaluate(`(() => {
    const g=__game, wind=[],people=[],water=[];let skyTime=null,expectedBatches=null;
    // Read pixels in the same task as the render: the normal game renderer
    // does not preserve its WebGL drawing buffer between browser tasks.
    g.renderer.render(g.scene,g.camera);
    g.scene.traverse(o => {
      if(o.userData.ambientPeople)expectedBatches=o.userData.ambientPeople.drawCalls;
      if(o.userData.water)water.push(o.userData.water.offset.toArray());
      if(o.isInstancedMesh&&o.name.startsWith('Riverway people —'))people.push({name:o.name,matrices:Array.from(o.instanceMatrix.array)});
      for(const m of [o.material,o.customDepthMaterial,o.customDistanceMaterial].flat().filter(Boolean)) {
        const uniform=g.renderer.properties.get(m)?.uniforms?.riverwayWindTime;
        if(uniform&&!wind.some(u=>u.name===m.name))wind.push({name:m.name,time:uniform.value});
      }
      if(o.material?.uniforms?.breezeTime)skyTime=o.material.uniforms.breezeTime.value;
    });
    const gl=g.renderer.getContext(),width=g.renderer.domElement.width,height=g.renderer.domElement.height;
    const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const previous=__qa.lifePixels;let pixelDifference=null;
    if(previous?.length===pixels.length){
      let changedPixels=0,pixelsOver2=0,maxChannelDelta=0,totalDelta=0;
      for(let p=0;p<pixels.length;p+=4){let pixelMax=0;for(let c=0;c<3;c++){const d=Math.abs(pixels[p+c]-previous[p+c]);pixelMax=Math.max(pixelMax,d);totalDelta+=d;}if(pixelMax)changedPixels++;if(pixelMax>2)pixelsOver2++;maxChannelDelta=Math.max(maxChannelDelta,pixelMax);}
      pixelDifference={totalPixels:width*height,changedPixels,pixelsOver2,maxChannelDelta,meanChannelDelta:totalDelta/(width*height*3)};
    }
    __qa.lifePixels=pixels;
    return {wind,people,water,skyTime,expectedBatches,pixelDifference,png:g.renderer.domElement.toDataURL('image/png')};
  })()`);
  return { wind: data.wind, water: data.water, skyTime: data.skyTime, peopleBatches: data.people.length, expectedBatches:data.expectedBatches, peopleHash: digest(JSON.stringify(data.people)), imageHash: digest(data.png),pixelDifference:data.pixelDifference };
}

try {
  for (const profile of [
    { name: 'desktop', width:1440,height:900,touch:false },
    { name: 'touch', width:844,height:390,touch:true },
  ]) {
    await qa.resize(profile.width,profile.height,profile.touch);
    await qa.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    const address=new URL(url);if(profile.touch)address.searchParams.set('touch','');
    await qa.navigate(address.href);
    await qa.evaluate("__game.selectLevel('roc-city-skatepark');__game.startRun('free')");await qa.step(2);
    await qa.evaluate(`Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])`);
    await qa.evaluate(`for(const el of document.body.children)if(el.id!=='game'&&el.tagName!=='SCRIPT')el.style.display='none';__game.character.root.visible=false;`);
    await qa.check(`${profile.name}: matching environment and close-up life views render cleanly`, async () => {
      const selection = profile.touch
        ? [matching.find(v=>v.name==='street-east-buildings'),matching.find(v=>v.name==='wide-establishing'),details[0],details[3]]
        : [...matching,...details];
      const records=[];
      for(const view of selection){const record=await render(view);assert.equal(record.webglError,0);records.push(record);await qa.shot(profile.name+'-'+view.name);}
      const state=await qa.evaluate(`(() => {const g=__game;let metadata=null;g.scene.traverse(o=>{if(o.userData.ambientPeople)metadata=o.userData.ambientPeople;});return{people:metadata?.people,colliders:g.level.colliders.length,rails:g.level.rails.length,shadows:g.renderer.shadowMap.enabled};})()`);
      assert.equal(state.people?.length,8);assert.equal(state.colliders,207);assert.equal(state.rails,248);assert.equal(state.shadows,!profile.touch);
      return {records,...state};
    });
    await qa.check(`${profile.name}: walkers, foliage and matching shadows animate at two times`, async () => {
      const frames=[];
      for(const view of [windView,walkView]) {
        const times=[];
        for(const t of [2,10]){await render(view,t);times.push(await snapshot());await qa.shot(`${profile.name}-${view.name}-t${t}`);}
        (qa.report.animationSamples??=[]).push({profile:profile.name,view:view.name,times});
        assert.ok(times[0].expectedBatches>0,'People batch metadata is missing');
        assert.equal(times[0].peopleBatches,times[0].expectedBatches,'Not all instanced people batches were inspected');
        assert.notEqual(times[0].peopleHash,times[1].peopleHash,'People instance matrices did not animate');
        assert.notEqual(times[0].imageHash,times[1].imageHash,view.name+': rendered animation did not change');
        for(let i=0;i<times.length;i++){
          const expected=i?10:2;assert.equal(times[i].skyTime,expected);
          assert.ok(times[i].wind.some(u=>u.name==='Riverway cutout broadleaf foliage'),'Visible wind shader missing');
          for(const u of times[i].wind)assert.equal(u.time,expected,u.name+': wind clock disagrees');
          if(!profile.touch)assert.ok(times[i].wind.some(u=>u.name==='Riverway moving foliage depth'),'Matching shadow wind shader missing');
        }
        frames.push({view:view.name,times});
      }
      return frames;
    });
    await qa.check(`${profile.name}: reduced motion freezes people, wind, water and sky`, async () => {
      await qa.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      assert.equal(await qa.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
      const samples=[];
      for(const time of [2,10]){await render(matching.find(v=>v.name==='street-east-buildings'),time);samples.push(await snapshot());}
      (qa.report.reducedMotionSamples??=[]).push({profile:profile.name,samples});
      assert.equal(samples[0].peopleHash,samples[1].peopleHash,'Reduced-motion people moved');
      // Pixel values can differ by one or two quantization levels on a GPU
      // shadow edge. Exact scene transforms and animation clocks remain strict;
      // any larger raster change is a failure and its measured size is reported.
      assert.ok(samples[1].pixelDifference.maxChannelDelta<=2,'Reduced-motion rendered environment moved: '+JSON.stringify(samples[1].pixelDifference));
      for(const sample of samples){assert.equal(sample.skyTime,0);for(const u of sample.wind)assert.equal(u.time,0);assert.ok(sample.water.length);for(const offset of sample.water)assert.deepEqual(offset,[0,0]);}
      await qa.shot(profile.name+'-reduced-motion');
      await qa.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      return samples;
    });
  }
} finally { await qa.close(); }

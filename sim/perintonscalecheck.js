// Production-safe, repeatable bowl/character comparison (no application imports).
// node sim/perintonscalecheck.js [url] [output-directory]
// QA_BOWL_X_SCALE / QA_BOWL_X_PIVOT map only Perinton's authored rider fixtures
// with a planned bowl-local widening; camera offsets and Joe stay world-sized.
// QA_EXPECT_ASSET optionally verifies the frozen bundle used for the evidence.
import assert from 'node:assert/strict';
import { browserQA } from './browser-qa.js';

const url = process.argv[2] || 'http://127.0.0.1:4176/';
const output = process.argv[3] || 'screenshots/perinton-scale/after';
const fixtureTransform = { scaleX: Number(process.env.QA_BOWL_X_SCALE || 1), pivotX: Number(process.env.QA_BOWL_X_PIVOT || 9) };
assert(Number.isFinite(fixtureTransform.scaleX) && fixtureTransform.scaleX > 0);
assert(Number.isFinite(fixtureTransform.pivotX));
const qa = await browserQA({ url, output, name: 'perinton-scale' });
const { evaluate, step, check, shot, report } = qa;

try {
  await evaluate(`__game.showHome();__game.showCharacterSelect();__game.selectCharacter('joe');
    window.__bowlScale={
      point(p){const s=__game.level.worldScale??{x:1,y:1,z:1};return typeof s==='number'?p.map(v=>v*s):p.map((v,i)=>v*([s.x,s.y,s.z][i]??1));},
      bounds(object){let seed;object.traverse(o=>{if(!seed&&o.geometry){o.geometry.computeBoundingBox();seed=o.geometry.boundingBox;}});object.updateWorldMatrix(true,true);const b=seed.clone().makeEmpty().setFromObject(object,true);return{min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(__game.skater.pos.clone()).toArray()};},
      place(p){const g=__game,s=g.skater;g.startRun('free');s.pos.fromArray(this.point(p));const hit=s.raycast(s.pos.clone().setY(20),s.normal.clone().set(0,-1,0),50);if(!hit)throw Error('Unsupported fixture '+p);s.pos.copy(hit.point);s.normal.copy(hit.normal);s.speed=0;s.vel.set(0,0,0);s.heading.set(1,0,0);s.facing.copy(s.heading);s.modelQuat.setFromUnitVectors(s.normal.clone().set(0,0,1),s.heading);g.character.root.position.copy(s.pos);g.character.root.quaternion.copy(s.modelQuat);for(let i=0;i<90;i++)g.character.update(s,1/60,0);g.character.root.updateMatrixWorld(true);g.fx.update(0,s);g.collectibles.group.visible=false;return{authored:p,position:s.pos.toArray(),supportNormal:hit.normal.toArray(),rider:this.bounds(g.character.root)};},
      render(offset,target){const g=__game;g.camera.up.set(0,1,0);g.camera.position.copy(g.skater.pos).add(g.skater.pos.clone().set(...offset));g.camera.lookAt(g.skater.pos.clone().add(g.skater.pos.clone().set(...target)));g.camera.fov=52;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);return{position:g.camera.position.toArray(),offset,targetOffset:target,fov:g.camera.fov};},
      measure(){const g=__game,l=g.level,b=this.bounds(l.bowl),o=l.bowlOutline.map(p=>this.point([p[0],0,p[1]]));let area=0;for(let i=0;i<o.length;i++){const a=o[i],c=o[(i+1)%o.length];area+=a[0]*c[2]-c[0]*a[2];}
        const geometry=l.bowl.geometry,positions=geometry.attributes.position,index=geometry.index,vector=()=>g.skater.pos.clone();
        const categories={all:{projectedArea:0,surfaceArea:0,triangles:0},gentle:{projectedArea:0,surfaceArea:0,triangles:0},flat:{projectedArea:0,surfaceArea:0,triangles:0},deepFlat:{projectedArea:0,surfaceArea:0,triangles:0}};
        const count=index?index.count:positions.count;for(let i=0;i<count;i+=3){const p=[0,1,2].map(j=>vector().fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(l.bowl.matrixWorld));const cross=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));const magnitude=cross.length();if(magnitude<1e-12)continue;const ny=Math.abs(cross.y)/magnitude,y=(p[0].y+p[1].y+p[2].y)/3;const selected=['all'];if(ny>=.95)selected.push('gentle');if(ny>=.9999)selected.push('flat');if(ny>=.9999&&y<=b.min[1]+.03)selected.push('deepFlat');for(const key of selected){const category=categories[key];category.projectedArea+=Math.abs(cross.y)/2;category.surfaceArea+=magnitude/2;category.triangles++;}}
        return{horizontalScale:l.horizontalScale??1,worldScale:l.worldScale,bowlBounds:b,rimY:l.layout.bowl?.rimY??l.layout.westDeckY,outlineAreaSquareMeters:Math.abs(area)/2,floorAreasSquareMeters:categories,floorAreaDefinitions:{gentle:'Actual world triangles within 18.2 degrees of horizontal (normal.y >= 0.95).',flat:'Actual world triangles within 0.81 degrees of horizontal (normal.y >= 0.9999).',deepFlat:'Flat category within 3 cm of the deepest world vertex.'},authoredBowl:l.layout.bowl??null,floorSurfaceStatus:g.floorSurface.status,characterId:g.character.characterId};},
      crossSection(x){const g=__game,l=g.level,b=this.bounds(l.bowl),points=[],v=g.skater.pos.clone(),down=v.clone().set(0,-1,0),ray=g.fx.ray;ray.near=0;ray.far=50;for(let z=b.min[2]+.025;z<b.max[2];z+=.05){ray.set(v.set(x,20,z),down);const hit=ray.intersectObjects(l.colliders,false)[0];if(hit?.object===l.bowl){const pos=l.bowl.geometry.attributes.position,p=[hit.face.a,hit.face.b,hit.face.c].map(i=>v.clone().fromBufferAttribute(pos,i).applyMatrix4(l.bowl.matrixWorld));const normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();points.push({z,y:hit.point.y,normalY:normal.y});}}const spans=[];let current=null;for(const p of points){if(p.normalY>=.95){if(!current||p.z-current.end>.075){current={start:p.z-.025,end:p.z+.025};spans.push(current);}else current.end=p.z+.025;}else current=null;}return{x,sampleSpacing:.05,openingSampledWidth:points.length*.05,gentleFloorSpans:spans.map(s=>({...s,width:s.end-s.start})),points};}
    };`);
  report.fixtureTransform = fixtureTransform;
  report.measurements = {};
  report.views = [];
  const parks = [
    { id: 'perinton-skatepark', short: 'perinton', rim: [2.5,0,-10.5], inside: [6,-1.8,-11], sections: [6,12] },
    { id: 'roc-city-skatepark', short: 'roc', rim: [-17.2,1.62,-16], inside: [-11.5,-1.03,-16], sections: [-11.5,-4.5] },
  ];
  for (const park of parks) await check(park.short + ' rendered bowl and Joe scale comparison', async () => {
    await evaluate(`__game.selectLevel('${park.id}');__game.startRun('free');`); await step(2);
    await evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready])');
    const transformX = x => park.short === 'perinton' ? fixtureTransform.pivotX + (x - fixtureTransform.pivotX) * fixtureTransform.scaleX : x;
    const measurements = await evaluate('__bowlScale.measure()');
    measurements.crossSections = [];
    for (const authoredX of park.sections) measurements.crossSections.push(await evaluate(`__bowlScale.crossSection(__bowlScale.point([${transformX(authoredX)},0,0])[0])`));
    assert(Math.abs(measurements.floorAreasSquareMeters.all.projectedArea - measurements.outlineAreaSquareMeters) < .1, 'Actual floor coverage must match the opening');
    assert(measurements.floorAreasSquareMeters.deepFlat.projectedArea > 0, 'Measure an actual deep floor');
    for (const section of measurements.crossSections) assert(section.points.length > 10 && section.gentleFloorSpans.length > 0, 'Cross-section must reach the actual bowl floor');
    report.measurements[park.id] = measurements;
    for (const [phase, point, offset, target] of [
      ['rim',park.rim,[-4.2,2.3,4.2],[2,.7,0]],
      ['inside',park.inside,[-2.6,2.4,2.6],[.7,.8,0]],
    ]) {
      const authored = [transformX(point[0]), point[1], point[2]];
      const placement = await evaluate(`__bowlScale.place(${JSON.stringify(authored)})`);
      assert(placement.supportNormal[1] > .96, 'Use flat support for an honest character-height comparison');
      assert(Math.abs(placement.rider.size[1] - 1.756) < .01, 'Joe remains world-sized');
      await evaluate(`for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='none';`);
      const camera = await evaluate(`__bowlScale.render(${JSON.stringify(offset)},${JSON.stringify(target)})`);
      await shot(park.short + '-' + phase + '-joe');
      report.views.push({ level: park.id, phase, baselineAuthored: point, ...placement, camera });
    }
    if (park.short === 'perinton') {
      report.fixedFrame = await evaluate(`(()=>{const g=__game;g.character.root.visible=false;g.fx.shadow.visible=false;g.camera.position.set(-1.7,2.3,-6.3);g.camera.lookAt(4.5,.7,-10.5);g.camera.fov=52;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);return{position:g.camera.position.toArray(),target:[4.5,.7,-10.5],fov:52,riderVisible:false};})()`);
      await shot('perinton-rim-fixed-camera');
      await evaluate('__game.character.root.visible=true');
    }
    assert.equal(await evaluate('__game.renderer.getContext().getError()'), 0);
    return { bowlBounds: measurements.bowlBounds, openingArea: measurements.outlineAreaSquareMeters, floorAreas: measurements.floorAreasSquareMeters };
  });
  await check('Frozen bundle and matched camera evidence', async () => {
    report.assets = await evaluate(`performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/assets/')&&n.endsWith('.js'))`);
    if (process.env.QA_EXPECT_ASSET) assert(report.assets.some(n => n.includes(process.env.QA_EXPECT_ASSET)));
    assert.equal(report.views.length, 4);
    for (const phase of ['rim','inside']) {
      const pair = report.views.filter(v => v.phase === phase);
      assert.deepEqual(pair[0].camera.offset, pair[1].camera.offset);
      assert.equal(pair[0].camera.fov, pair[1].camera.fov);
      assert(Math.abs(pair[0].rider.size[1] - pair[1].rider.size[1]) < .001);
    }
    return { assets: report.assets, fov: 52 };
  });
  report.notes = [
    'Character height is actual world-space rendered geometry including board/cap, on flat support in a settled standing pose.',
    'Each rim/inside pair uses identical world-space camera offsets and FOV52. Inside cameras remain above the rim to avoid near-wall clipping.',
    'The ROC bowl is a longer three-part feature; its overall area alone does not establish the correct surveyed size for Perinton.',
    'Floor areas come from actual mesh triangles. Cross-sections raycast the actual gameplay collider at 5 cm world spacing; floor categories describe slope, not an authored paint boundary.',
  ];
} finally { await qa.close(); }

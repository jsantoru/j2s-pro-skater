// Ground-level evidence for the reported open ramp, detached railing and bench.
// Captures the real production scene, not a reconstructed test mesh.
import assert from 'node:assert/strict';
import { browserQA } from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4175/';
const output=process.argv[3]||'screenshots/roc-fixtures/after';
const qa=await browserQA({url,output,name:'roc-fixtures'});
try {
  await qa.evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free')`);
  await qa.step(2);
  await qa.evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
  await qa.check('Ground-level views expose ramp ends, railing footings and both benches',async()=>{
    await qa.evaluate(`for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='none';
      __game.character.root.visible=false;__game.collectibles.group.visible=false;__game.fx.shadow.visible=false;`);
    for(const [name,position,target]of [
      ['ramp-underside',[7,.65,8],[3.6,.7,4.1]],
      ['ramp-from-south',[5.5,1.25,11],[3,.8,3]],
      ['ramp-east-side',[8,.6,-13],[3.6,.6,-13]],
      ['flower-deck-side',[19,.7,-25],[12,.7,-25]],
      ['outer-railing',[-20,1.5,7],[-18,2,-10]],
      ['outer-railing-deck',[-15.5,2.8,4],[-17,2,-13]],
      ['southwest-bench',[-9.5,2.2,15.5],[-13,.55,12]],
      ['south-bench-apron',[-3.7,2.2,17.2],[-7,.55,13.7]],
      ['north-bench',[11.5,2.2,-40],[7.9,.55,-44.3]],
    ]) {
      await qa.evaluate(`(()=>{const g=__game,s=g.level.horizontalScale;g.camera.up.set(0,1,0);
        const p=${JSON.stringify(position)},t=${JSON.stringify(target)};g.camera.position.set(p[0]*s,p[1],p[2]*s);
        g.camera.lookAt(t[0]*s,t[1],t[2]*s);g.camera.fov=52;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);})()`);
      await qa.shot(name);
    }
    assert.equal(await qa.evaluate('__game.renderer.getContext().getError()'),0);
    return{views:9,scale:await qa.evaluate('__game.level.horizontalScale')};
  });
} finally {await qa.close();}

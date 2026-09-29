// True orthographic, north-up view of the loaded ROC geometry, with its actual
// A–L feature anchors. No app/source imports; works with a production bundle.
// node sim/roclayoutcheck.js [url] [output-directory]
import assert from 'node:assert/strict';
import { browserQA } from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4175/';
const output=process.argv[3]||'screenshots/roc-layout/after/orthographic';
const qa=await browserQA({url,output,name:'roc-layout'});
const {evaluate,step,resize,check,shot,report}=qa;
try{
  await evaluate(`__game.selectLevel('roc-city-skatepark');__game.startRun('free')`);
  await step(2);await evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
  await check('Controller ollie captures the relocated G handrail and banks its landing',async()=>{
    await evaluate(`__game.showGoalBoard();__qa.connectPad();__qa.pad.id='Gamepad'`);await step(180);
    await evaluate(`(()=>{const g=__game,s=g.skater,rail=g.level.rails.find(r=>r.feature==='G'&&r.kind==='rail');
      g.startRun('free');const direction=rail.dir.clone().setY(0).normalize();
      const start=rail.a.clone().addScaledVector(direction,-6.5);start.y=10;
      const ground=s.raycast(start,direction.clone().set(0,-1,0),20);if(!ground)throw new Error('G approach has no support');
      s.pos.copy(ground.point);s.heading.copy(direction);s.facing.copy(direction);s.normal.copy(ground.normal);s.speed=7;s.vel.copy(direction).multiplyScalar(7);
      g.followCam.dirAngle=Math.atan2(direction.x,direction.z);g.followCam.snap(s);
      __qa.layoutRail=rail;__qa.layoutDirection=direction;})()`);await step();
    const capture=await evaluate(`(async()=>{const s=__game.skater,rail=__qa.layoutRail,dir=__qa.layoutDirection;__qa.button(0,true);__qa.button(3,true);
      let released=false;const trace=[];
      for(let frame=0;frame<180;frame++){
        const distance=rail.a.clone().sub(s.pos).dot(dir);if(!released&&distance<=4.1){__qa.button(0,false);released=true;}
        await __qa.step();if(frame%6===0)trace.push({frame,state:s.state,distance:+distance.toFixed(2),height:+s.pos.y.toFixed(2),speed:+s.speed.toFixed(2)});
        if(s.state==='bail')return{state:s.state,reason:s.bailReason,trace};
        if(s.state==='grind')return{state:s.state,feature:s.grind.rail.feature,target:s.grind.rail===rail,dir:s.grind.dir,position:s.pos.toArray(),trick:s.grind.name};
      }return{state:s.state,position:s.pos.toArray(),trace};})()`);
    assert.equal(capture.state,'grind',JSON.stringify(capture));assert(capture.target&&capture.dir===1,JSON.stringify(capture));
    await shot('nine-stair-controller-grind');
    const landing=await evaluate(`(async()=>{__qa.button(0,false);__qa.button(3,false);
      for(let frame=0;frame<180;frame++){await __qa.step();const s=__game.skater;if(s.state==='bail'||s.state==='ride'&&s.score>0)return{state:s.state,score:s.score,position:s.pos.toArray()};}
      return{state:__game.skater.state,score:__game.skater.score};})()`);
    assert.equal(landing.state,'ride',JSON.stringify(landing));assert(landing.score>0);
    await evaluate(`__qa.pad=null;__game.startRun('free')`);await step();return{capture,landing};
  });
  await resize(1040,1500);
  await check('True orthographic north-up plan exposes the actual A–L skate geometry',async()=>{
    const detail=await evaluate(`(()=>{
      const g=__game,l=g.level;
      for(const e of document.body.children)if(e.id!=='game'&&e.tagName!=='SCRIPT')e.style.display='none';
      g.character.root.visible=false;g.collectibles.group.visible=false;g.fx.shadow.visible=false;
      // The artwork is batched by material, so hide the decorative group for
      // this explicitly labelled cutaway: the bridge roof must not hide J–L.
      const art=l.group.getObjectByName('ROC City / Riverway landscape and I-490');
      if(art)art.visible=false;
      g.scene.fog=null;
      const sky=g.scene.getObjectByName('Open Riverway sky');if(sky)sky.visible=false;
      const b=l.bounds,padding=6,spanZ=b.maxZ-b.minZ+padding*2;
      const spanX=spanZ*innerWidth/innerHeight;
      const centerX=(b.minX+b.maxX)/2,centerZ=(b.minZ+b.maxZ)/2;
      // Clone shared Camera state, then replace the projection with the exact
      // orthographic matrix and renderer flags. No small-FOV approximation.
      const camera=g.camera.clone();camera.type='OrthographicCamera';
      camera.isPerspectiveCamera=false;camera.isOrthographicCamera=true;
      camera.left=-spanX/2;camera.right=spanX/2;camera.top=spanZ/2;camera.bottom=-spanZ/2;
      camera.near=.1;camera.far=400;camera.zoom=1;
      camera.up.set(0,0,-1);camera.position.set(centerX,180,centerZ);camera.lookAt(centerX,0,centerZ);
      camera.projectionMatrix.makeOrthographic(camera.left,camera.right,camera.top,camera.bottom,camera.near,camera.far);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);
      g.renderer.render(g.scene,camera);
      const overlay=document.createElement('div');overlay.id='layout-qa-overlay';
      overlay.style.cssText='position:fixed;inset:0;pointer-events:none;color:#fff;font:600 17px system-ui;z-index:9999';
      const project=p=>{const v=g.skater.pos.clone().set(...p).project(camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
      const labels=[];
      for(const[id,f]of Object.entries(l.features)){
        for(const [suffix,p]of [['',f.position],...(f.secondEntry?[['2',f.secondEntry]]:[])]){
          const point=project(p),label=document.createElement('span');
          label.textContent=id;label.style.cssText='position:absolute;display:grid;place-items:center;width:29px;height:29px;border:2px solid white;border-radius:50%;background:#173d78;box-shadow:0 1px 5px #0008;transform:translate(-50%,-50%);left:'+point.x+'px;top:'+point.y+'px';
          overlay.append(label);labels.push({id:id+suffix,name:f.name,position:p,pixel:point});
        }
      }
      const heading=document.createElement('div');heading.style.cssText='position:absolute;left:22px;top:18px;padding:12px 16px;background:#102439e8;border-radius:4px;max-width:480px;font-size:19px;line-height:1.5';
      heading.innerHTML='ROC CITY · ACTUAL GAME GEOMETRY<br><span style="font-size:14px;font-weight:400">True orthographic · north ↑ · bridge/scenery cutaway</span>';overlay.append(heading);
      const note=document.createElement('div');note.style.cssText='position:absolute;left:22px;bottom:18px;padding:9px 13px;background:#102439e8;border-radius:4px;font-size:13px;line-height:1.5';
      note.textContent='A–L anchors come from the loaded level. Dimensions are estimates, not surveyed measurements.';overlay.append(note);
      const bar=document.createElement('div');bar.style.cssText='position:absolute;right:24px;bottom:28px;width:'+(10/spanX*innerWidth)+'px;border-bottom:4px solid white;text-align:center;text-shadow:0 1px 3px #000;padding-bottom:5px;font-size:15px';bar.textContent='10 m';overlay.append(bar);
      document.body.append(overlay);
      const probe=[centerX,0,centerZ],higher=[centerX,20,centerZ];
      return{scale:l.worldScale,bounds:b,projection:camera.projectionMatrix.toArray(),camera:{position:camera.position.toArray(),up:camera.up.toArray(),left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom},labels,heightInvariant:{floor:project(probe),raised:project(higher)},renderer:g.renderer.getContext().getError()};
    })()`);
    assert.equal(detail.projection[11],0);assert.equal(detail.projection[15],1);
    assert.deepEqual(detail.camera.up,[0,0,-1]);
    for(const axis of ['x','y'])assert(Math.abs(detail.heightInvariant.floor[axis]-detail.heightInvariant.raised[axis])<1e-8,'Orthographic screen coordinates must be independent of height');
    assert.equal(new Set(detail.labels.map(l=>l.id[0])).size,12);
    for(const label of detail.labels)assert(label.pixel.x>=0&&label.pixel.x<=1040&&label.pixel.y>=0&&label.pixel.y<=1500);
    assert.equal(detail.renderer,0);report.plan=detail;
    await shot('north-up-plan');return{labels:detail.labels.length,scale:detail.scale,bounds:detail.bounds};
  });
}finally{await qa.close();}

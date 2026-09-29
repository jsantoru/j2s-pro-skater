// Actual controller/native-touch quarter-pipe evidence. Only the initial flat
// approach fixture is placed; the real application loop handles every motion.
// QA_BASELINE=1 records the existing defect without asserting fixed behavior.
// QA_BASELINE_REPORT=... compares a later run against that preserved recording.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browserQA} from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4176/';
const output=process.argv[3]||'screenshots/transitions/after';
const baseline=process.env.QA_BASELINE==='1';
const previous=process.env.QA_BASELINE_REPORT?JSON.parse(await readFile(process.env.QA_BASELINE_REPORT,'utf8')):null;
const qa=await browserQA({url,output,name:'transition'});
const routes=[
  {id:'warehouse-west',level:'genesee-warehouse',point:[-27,0,6],heading:[-1,0,0],speed:8,
    camera:[-29,3.5,21],target:[-29,3.5,6]},
  {id:'roc-bridge',level:'roc-city-skatepark',point:[9.375,-.9,53.75],heading:[0,0,1],speed:8,
    camera:[22,3.1,58],target:[9.375,3,58]},
];

async function install(){
  await qa.evaluate(`window.__transitionQA={
    samples:[],events:[],route:null,firstAir:null,landing:null,seenAir:false,handlers:new WeakMap(),
    setup(route){
      this.route=route;this.samples=[];this.events=[];this.firstAir=null;this.landing=null;this.seenAir=false;
      const g=__game;g.selectLevel(route.level);g.startRun('free');const s=g.skater;
      s.pos.set(...route.point);const hit=s.raycast(s.pos.clone().setY(12),s.normal.clone().set(0,-1,0),30);if(!hit)throw Error('No approach ground');
      s.pos.copy(hit.point);s.normal.copy(hit.normal);s.heading.set(...route.heading).normalize();s.facing.copy(s.heading);
      s.speed=route.speed;s.vel.copy(s.heading).multiplyScalar(route.speed);s.groundTime=1;
      s.modelQuat.setFromUnitVectors(s.normal.clone().set(0,0,1),s.heading);
      g.character.root.position.copy(s.pos);g.character.root.quaternion.copy(s.modelQuat);
      for(let i=0;i<40;i++)g.character.update(s,1/60,0);
      if(!this.handlers.has(s))this.handlers.set(s,{...s.events});
      for(const name of ['ollie','land','bail']){const original=this.handlers.get(s)[name];s.events[name]=(...args)=>{this.events.push({name,args,time:this.samples.length/60});original?.(...args);};}
      g.collectibles.group.visible=false;
      this.sample();
    },
    sample(){const s=__game.skater;const item={frame:this.samples.length,time:this.samples.length/60,state:s.state,pos:s.pos.toArray(),vel:s.vel.toArray(),normal:s.normal.toArray(),crouching:s.crouching,charge:s.crouchTime,ollie:__game.input.state.ollie};
      this.samples.push(item);if(s.state==='air'&&!this.firstAir){this.firstAir=item;this.seenAir=true;}
      if(this.seenAir&&s.state==='ride'&&!this.landing)this.landing=item;return item;
    },
    async until(kind,limit=360){for(let i=0;i<limit;i++){
      await __qa.step();const item=this.sample();
      if(item.state==='bail')return{reason:'bail',sample:item};
      if(kind==='release'&&((item.state==='ride'&&item.normal[1]<.15)||item.state==='air'))return{reason:item.state==='air'?'auto-air':'release',sample:item};
      if(kind==='air'&&item.state==='air')return{reason:'air',sample:item};
      if(kind==='apex'&&this.firstAir&&item.state==='air'&&item.vel[1]<=0)return{reason:'apex',sample:item};
      if(this.landing)return{reason:'land',sample:item};
    }return{reason:'timeout',sample:this.samples.at(-1)};},
    view(){const g=__game;g.camera.up.set(0,1,0);g.camera.position.set(...this.route.camera);g.camera.lookAt(...this.route.target);g.camera.fov=55;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);},
    result(){const h=this.route.heading,a=this.firstAir,l=this.landing;return{route:this.route,firstAir:a,landing:l,
      outwardDisplacement:a&&l?-l.pos.reduce((sum,v,i)=>sum+(v-a.pos[i])*h[i],0):null,
      peakY:Math.max(...this.samples.map(p=>p.pos[1])),events:this.events,samples:this.samples};}
  };`);
}

try{
  qa.report.baseline=baseline;qa.report.trajectories=[];
  for(const input of ['controller','touch']){
    const target=new URL(url);if(input==='touch')target.searchParams.set('touch','');
    await qa.navigate(target.href);await qa.resize(input==='touch'?844:1440,input==='touch'?390:900,input==='touch');await install();
    if(input==='controller')await qa.evaluate('__qa.connectPad()');
    for(const route of routes)await qa.check(`${route.id}: ${input} lip-release ollie retains a readable quarter-pipe arc`,async()=>{
      await qa.evaluate(`__transitionQA.setup(${JSON.stringify(route)})`);
      await qa.evaluate('Promise.all([__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
      await qa.evaluate(`document.querySelectorAll('#hud,#run-panel,#combo,#trick-toast,#venue-title,#goal-notice,#toast').forEach(el=>el.style.display='none');__transitionQA.view()`);
      const prefix=route.id+'-'+input;
      await qa.shot(prefix+'-approach');
      if(input==='controller')await qa.evaluate('__qa.button(0,true)');else await qa.down(11,'#touch-ollie');
      const release=await qa.evaluate(`__transitionQA.until('release')`);
      assert(['release','auto-air'].includes(release.reason),JSON.stringify(release));
      assert(release.sample.ollie,'Input channel must really hold Ollie');
      if(input==='controller')await qa.evaluate('__qa.button(0,false)');else await qa.up(11);
      const launched=await qa.evaluate(`__transitionQA.firstAir?({reason:'air',sample:__transitionQA.firstAir}):__transitionQA.until('air',12)`);
      assert.equal(launched.reason,'air',JSON.stringify(launched));
      await qa.evaluate('__transitionQA.view()');await qa.shot(prefix+'-takeoff');
      const apex=await qa.evaluate(`__transitionQA.until('apex')`);
      assert.equal(apex.reason,'apex',JSON.stringify(apex));
      await qa.evaluate('__transitionQA.view()');await qa.shot(prefix+'-apex');
      const landing=await qa.evaluate(`__transitionQA.until('land')`);
      assert.equal(landing.reason,'land',JSON.stringify(landing));
      await qa.evaluate('__transitionQA.view()');await qa.shot(prefix+'-landing');
      const result=await qa.evaluate('__transitionQA.result()');result.input=input;result.release=release;
      qa.report.trajectories.push(result);
      assert.equal(result.events.filter(e=>e.name==='bail').length,0);
      assert(result.events.some(e=>e.name==='ollie'),'Real pop event should fire');
      if(!baseline){
        assert(result.outwardDisplacement<4,`Quarter air travels ${result.outwardDisplacement.toFixed(2)}m away from its transition`);
        const old=previous?.trajectories?.find(t=>t.route.id===route.id&&t.input===input);
        if(old){
          assert(result.outwardDisplacement<old.outwardDisplacement*.6,'Fix should substantially reduce outward travel');
          assert(result.peakY>=old.peakY-.25,'Fix should preserve useful airtime/height');
        }
      }
      assert.equal(await qa.evaluate('__game.renderer.getContext().getError()'),0);
      return{releaseFrame:release.sample.frame,takeoff:result.firstAir,landing:result.landing,outwardDisplacement:result.outwardDisplacement,peakY:result.peakY};
    });
  }
}finally{await qa.close();}

// New brewery routes through the live game loop and standard follow camera.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const qa=await context.newPage(), errors=[], routes=[];
  const root='C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/brewery-detail-after/';
  qa.on('pageerror',e=>errors.push(e.message));
  qa.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await qa.addInitScript(()=>{navigator.getGamepads=()=>[];});
    await qa.goto('http://127.0.0.1:5173');await qa.waitForFunction(()=>!!window.__game);
    await qa.evaluate(()=>__game.floorSurface.ready);
    await qa.evaluate(()=>new Promise(resolve=>{let n=0;function tick(){if(++n===20)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
    for(const [name,position,heading,duration] of [
      ['live-keg-returns',[-28.4,0,-16.8],[0,0,-1],320],
      ['live-tank-bay',[-30.8,0,-10.5],[0,0,-1],850],
      ['live-beer-dispatch',[26.2,0,-18.4],[1,0,0],650],
      ['live-loading-area',[-24,0,17],[0,0,1],420],
      ['live-platform-kegs',[32.1,1.6,15],[0,0,1],500],
    ]){
      await qa.evaluate(({position,heading})=>{
        const g=__game;g.startRun();g.skater.pos.set(...position);g.skater.heading.set(...heading);g.skater.facing.copy(g.skater.heading);
        g.skater.speed=4;g.skater.vel.copy(g.skater.heading).multiplyScalar(4);g.skater.updateModelQuat(1);g.followCam.snap(g.skater);
      },{position,heading});
      await qa.keyboard.down('w');
      await qa.evaluate(duration=>new Promise(resolve=>{let n=0;function tick(){if(++n>=Math.round(duration*.06))resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);}),duration);
      await qa.keyboard.up('w');
      const state=await qa.evaluate(()=>({state:__game.skater.state,pos:__game.skater.pos.toArray(),speed:__game.skater.speed,gl:__game.renderer.getContext().getError()}));
      const moved=Math.hypot(state.pos[0]-position[0],state.pos[2]-position[2]);
      if(state.state!=='ride'||state.speed<3||moved<.8||state.gl!==0||!state.pos.every(Number.isFinite))throw new Error(name+': '+JSON.stringify(state));
      routes.push({name,...state});await qa.screenshot({path:root+name+'.png'});
    }
    // Static follow-camera view of the dense returns bay, with normal rendering/effects.
    await qa.evaluate(()=>{
      const g=__game;g.startRun();g.skater.pos.set(-28.5,0,-16.5);g.skater.heading.set(0,0,-1);g.skater.facing.copy(g.skater.heading);
      g.skater.updateModelQuat(1);g.followCam.snap(g.skater);
    });
    await qa.keyboard.down('s');await qa.waitForTimeout(200);
    const denseTiming=await qa.evaluate(()=>new Promise(resolve=>{
      const samples=[];let last=performance.now();function tick(t){samples.push(t-last);last=t;if(samples.length<240)requestAnimationFrame(tick);else{samples.sort((a,b)=>a-b);resolve({medianMs:samples[120],p95Ms:samples[228],frames:240,calls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,textures:__game.renderer.info.memory.textures});}}requestAnimationFrame(tick);
    }));await qa.keyboard.up('s');
    if(errors.length)throw new Error(errors.join('\n'));
    return {routes,denseTiming,errors};
  }finally{await context.close();}
}

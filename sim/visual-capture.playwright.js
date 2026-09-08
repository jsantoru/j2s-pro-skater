// Run this file with Playwright's browser_run_code tool (filename argument).
async (page) => {
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/';
  const results = {};
  for (const [name,port] of [['warehouse-before',5174],['warehouse-after',5173]]) {
    const qa = await page.context().newPage(); const errors = [];
    qa.on('pageerror', error => errors.push(error.message));
    qa.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    await qa.addInitScript(()=>{navigator.getGamepads=()=>[];});
    await qa.setViewportSize({width:1440,height:900});
    await qa.goto(`http://127.0.0.1:${port}/`);
    await qa.waitForFunction(()=>!!window.__game);
    await qa.evaluate(()=>__game.floorSurface.ready);
    await qa.screenshot({path:root+name+'/title.png'});
    const timing=await qa.evaluate(()=>new Promise(resolve=>{
      const samples=[];let last=performance.now();
      const tick=now=>{samples.push(now-last);last=now;if(samples.length<120)requestAnimationFrame(tick);else{samples.sort((a,b)=>a-b);resolve({medianMs:samples[60],p95Ms:samples[114]});}};requestAnimationFrame(tick);
    }));
    await qa.evaluate(()=>{ window.requestAnimationFrame=()=>0; });
    await qa.waitForTimeout(100);
    await qa.evaluate(()=>{
      const g=__game;g.startRun();document.querySelector('#hud').style.display='none';
      g.character.root.position.set(-4,0,14);g.character.root.quaternion.identity();
      window.qaPose=(extra={})=>{const s=Object.assign({state:'ride',crouch:0,landSquash:0,pushing:0,stance:1,lean:0,speed:0,bailT:0,trick:null,grind:null},extra);for(let i=0;i<180;i++)g.character.update(s,1/60,0);g.scene.updateMatrixWorld(true);};
      window.qaView=(pos,target)=>{g.camera.position.set(...pos);g.camera.fov=45;g.camera.lookAt(...target);g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);};
      qaPose();
      if(g.fx?.shadow)g.fx.update(1/60,g.skater);
    });
    for(const [shot,pos,target,pose] of [
      ['warehouse',[-19,5.8,20],[0,1,-5],{}],
      ['floor-gameplay',[-10,1.15,16],[-1,.1,10],{}],
      ['transitions',[-17,3.5,9],[-32,1.3,1],{}],
      ['concrete-banks',[14,3.2,7],[25,.8,13],{}],
      ['skater',[-7.2,1.7,17.4],[-4,.88,14],{}],
      ['skater-back',[-1.7,1.5,13.1],[-4,.9,14],{}],
      ['kickflip',[-6.3,1.4,16.5],[-4,1.05,14],{state:'air',trick:{name:'Kickflip',kind:'flip',t:.22,dur:.5}}]
    ]) {
      await qa.evaluate(({pos,target,pose})=>{qaPose(pose);qaView(pos,target);},{pos,target,pose});
      await qa.screenshot({path:root+name+'/'+shot+'.png'});
    }
    await qa.evaluate(()=>{
      const g=__game;qaPose();
      const s={state:'ride',pos:g.character.root.position,heading:{x:0,z:1},facing:{x:0,z:1},vel:{x:0,z:8},speed:8,steer:0,spinVelocity:0};
      g.followCam.snap(s);for(let i=0;i<240;i++)g.followCam.update(1/60,s,0);
      document.querySelector('#hud').style.display='block';
      g.renderer.render(g.scene,g.camera);
    });
    await qa.screenshot({path:root+name+'/camera-ride.png'});
    await qa.evaluate(()=>{const g=__game;document.querySelector('#hud').style.display='none';qaPose();g.character.body.visible=false;qaView([-4.65,.37,14.73],[-4,.13,14]);});
    await qa.screenshot({path:root+name+'/board.png'});
    await qa.evaluate(()=>{const g=__game;g.character.board.rotation.z=Math.PI;g.character.board.position.y=.3;qaView([-4.5,.6,14.65],[-4,.18,14]);});
    await qa.screenshot({path:root+name+'/board-underside.png'});
    results[name]={timing,errors,renderer:await qa.evaluate(()=>({calls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,textures:__game.renderer.info.memory.textures,gl:__game.renderer.getContext().getError(),dpr:__game.renderer.getPixelRatio(),renderer:__game.renderer.getContext().getParameter(__game.renderer.getContext().RENDERER)}))};
    await qa.close();
  }
  return results;
}

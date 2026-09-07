// Isolated local Edge smoke test. No extensions, signed-in profile, or extra npm dependencies.
// node sim/graphicscheck.js [url] [output-directory]
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/visual-upgrade');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-graphics-'));
const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, id = 0, testingMissingAssets = false;
const pending = new Map(), errors = [];
function send(method, params = {}) {
  const callId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`Timed out: ${method}`)); }, 30000);
    pending.set(callId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function shot(name) {
  await sleep(250);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64'));
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Headless Edge did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const entry = message.params.entry;
      if (!(testingMissingAssets && entry.source === 'network' && entry.url?.includes('/textures/concrete/'))) errors.push(entry);
    }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(window.__game)')) break; await sleep(100); }
  if (!await evaluate('Boolean(window.__game)')) throw new Error('Game did not initialize');
  if (await evaluate('Boolean(__game.floorSurface)')) {
    if (!await evaluate('__game.floorSurface.ready')) throw new Error('Concrete textures failed to load');
  }
  await mkdir(output, { recursive: true });
  await shot('title');
  console.log('Headless normal frame timing (not a hardware benchmark):', JSON.stringify(await evaluate(`new Promise(resolve => {const times=[]; let prev=performance.now(); const tick=now=>{times.push(now-prev);prev=now;if(times.length<90)requestAnimationFrame(tick);else{times.sort((a,b)=>a-b);resolve({medianMs:times[45],p95Ms:times[85]});}};requestAnimationFrame(tick);})`)));
  console.log('Initial renderer:', JSON.stringify(await evaluate(`({ calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures, shadow: __game.renderer.shadowMap.enabled, colliders: __game.level.colliders.length, rails: __game.level.rails.length })`)));
  // Freeze only this disposable QA page so views and rig poses are reproducible.
  await evaluate(`window.requestAnimationFrame = () => 0;`); await sleep(100);
  await evaluate(`__game.startRun(); document.querySelectorAll('#hud, #overlay, #controls').forEach(e => e.style.display = 'none');`);
  await evaluate(`window.qaPose = (state, extra = {}) => { const g = __game; g.character.root.position.set(-4,0,14); g.character.root.quaternion.identity(); const sk = Object.assign({state, crouch:0, landSquash:0, pushing:0, stance:1, lean:0, speed:0, bailT:0, trick:null, grind:null}, extra); for(let i=0;i<180;i++) g.character.update(sk,1/60,0); g.scene.updateMatrixWorld(true); }; window.qaView = (pos, target) => { const g = __game; g.camera.position.set(...pos); g.camera.fov=45; g.camera.lookAt(...target); g.camera.updateProjectionMatrix(); g.renderer.render(g.scene,g.camera); }; qaPose('ride'); qaView([-7.2,1.7,17.4],[-4,0.88,14]);`);
  // Actual follow camera and projected HUD, including a phone-sized viewport.
  await evaluate(`(async()=>{window.qaHud = new (await import('/src/hud.js')).HUD();
    window.qaFollow = (state, manual=false, value=0) => {
      const g=__game; qaPose(state, {manualLean:manual?-1:0});
      const s={state,pos:g.character.root.position,heading:{x:0,z:1},facing:{x:0,z:1},vel:{x:0,z:8},speed:8,steer:0,spinVelocity:0};
      g.followCam.snap(s); for(let i=0;i<240;i++)g.followCam.update(1/60,s,0);
      qaHud.balance(state==='grind'||manual,value,manual,g.character,g.camera);
      g.renderer.render(g.scene,g.camera);
    }; document.getElementById('hud').style.display='block';})()`);
  await evaluate(`qaFollow('ride');`); await shot('camera-ride');
  await evaluate(`qaFollow('grind',false,0.34);`); await shot('hud-grind');
  await evaluate(`qaFollow('ride',true,-0.30);`); await shot('hud-manual');
  for (const [width,height,label] of [[1440,900,'desktop'],[390,844,'phone'],[844,390,'landscape']]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false});
    await evaluate(`__game.renderer.setSize(${width},${height}); __game.camera.aspect=${width}/${height}; __game.camera.updateProjectionMatrix();`);
    for (const vertical of [false,true]) {
      const results = await evaluate(`(()=>{
        qaFollow(${vertical ? "'ride',true" : "'grind',false"},0);
        const el=document.getElementById('balance'),needle=document.getElementById('balance-needle');
        const track=document.getElementById('balance-track'); const points=[];
        for(const x of [-1,0,1]){
          qaHud.balance(true,x,${vertical},__game.character,__game.camera);
          const pt=track.createSVGPoint();pt.x=0;pt.y=0; const screen=pt.matrixTransform(needle.getScreenCTM());points.push([screen.x,screen.y]);
        }
        const box=el.getBoundingClientRect();
        return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,points,label:el.getAttribute('aria-label')};
      })()`);
      if (results.left < 0 || results.right > width || results.top < 0 || results.bottom > height) throw new Error(`Meter leaves ${label} viewport: ${JSON.stringify(results)}`);
      const [negative,center,positive]=results.points;
      if (vertical ? !(negative[1]>center[1] && center[1]>positive[1]) : !(negative[0]<center[0] && center[0]<positive[0])) throw new Error('Balance pointer moves on the wrong axis');
      await evaluate(`qaHud.balance(true,0.72,${vertical},__game.character,__game.camera);`);
      if (label !== 'desktop') await shot(`hud-${vertical?'manual':'grind'}-${label}`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`__game.renderer.setSize(1440,900); __game.camera.aspect=1440/900; __game.camera.updateProjectionMatrix(); qaHud.balance(false,0,false); document.getElementById('hud').style.display='none'; qaPose('ride'); qaView([-7.2,1.7,17.4],[-4,0.88,14]);`);
  console.log('PASS: curved grind/manual HUD remains in desktop, portrait and landscape viewports; pointer axes agree with controls.');
  await shot('skater');
  await evaluate(`qaView([-5.9,1.25,16.0],[-4,0.93,14]);`); await shot('skater-close');
  // Capture the complete slide with the actual controller and rig, not a posed stand-in.
  await evaluate(`(async()=>{
    const {Skater}=await import('/src/skater.js'); const {makeState}=await import('/src/input.js');
    window.qaRevert=new Skater(__game.level); const s=qaRevert;
    s.state='air'; s.vertAir=true; s.airTime=0.5; s.popped=true;
    s.pos.set(-4,0.04,14); s.vel.set(0,-2,8); s.heading.set(0,0,1); s.facing.set(0,0,1);
    s.combo.add('Kickflip',100); s.updateModelQuat(1); s.land(s.pos.clone().setY(0),s.normal);
    s.update(1/120,Object.assign(makeState(),{revertRightPressed:true,autoPush:false}));
    window.qaRevertFrame=(frames)=>{for(let i=0;i<frames;i++)s.update(1/120,Object.assign(makeState(),{autoPush:false}));
      __game.character.root.position.copy(s.pos);__game.character.root.quaternion.copy(s.modelQuat);
      __game.character.update(s,1/60,0);__game.scene.updateMatrixWorld(true);
      qaView([s.pos.x-2.3,1.45,s.pos.z+2.3],[s.pos.x,0.85,s.pos.z]);};
    qaRevertFrame(0);
  })()`);
  await shot('revert-start');
  await evaluate('qaRevertFrame(15)'); await shot('revert-middle');
  await evaluate('qaRevertFrame(40)'); await shot('revert-finish');
  if (!await evaluate('qaRevert.stance === -1 && qaRevert.combo.text.includes("Revert") && qaRevert.score === 0')) throw new Error('Revert animation lost its combo or stance');
  await evaluate(`qaPose('ride');`);
  await evaluate(`qaView([-4.7,0.55,15.0],[-4,0.16,14]);`); await shot('feet-ride');
  for (const [name, state, extra] of [
    ['manual','ride',{manualLean:1}], ['nose-manual','ride',{manualLean:-1}],
    ['carve','ride',{lean:0.5}], ['push','ride',{pushing:1}],
    ['air','air',{}], ['indy','air',{trick:{name:'Indy',kind:'grab'}}],
    ['nosegrab','air',{trick:{name:'Nosegrab',kind:'grab'}}],
  ]) {
    await evaluate(`qaPose(${JSON.stringify(state)},${JSON.stringify(extra)}); qaView([-6.2,1.35,16.2],[-4,0.86,14]);`);
    await shot(name);
  }
  await evaluate(`qaPose('ride');`);
  for (const [name, state, extra] of [['rear-grind','grind',{}], ['rear-crouch','ride',{crouch:1}], ['rear-ride','ride',{}]]) {
    await evaluate(`qaPose(${JSON.stringify(state)},${JSON.stringify(extra)}); qaView([-1.7,1.5,13.1],[-4,0.90,14]);`);
    await shot(name);
  }
  await evaluate(`qaPose('ride');`);
  // Head-local cameras inspect the neck join, temple hair and cap from all sides.
  for (const [name, offset] of [['head-front',[0.28,0.17,0.72]], ['head-side',[0.72,0.15,0.10]], ['head-back',[-0.28,0.17,-0.72]]]) {
    await evaluate(`{const h=__game.character.head; const pos=h.localToWorld(h.position.clone().set(...${JSON.stringify(offset)})); const target=h.localToWorld(h.position.clone().set(0,0.105,0)); qaView(pos.toArray(),target.toArray());}`);
    await shot(name);
  }
  // Tight, rig-local views make cuff openings and shoe shading reproducible.
  for (const [name, part, offset, aim] of [
    ['cuff-palm','lArm.el',[0.24,-0.43,0.36],[0,-0.27,0]],
    ['cuff-back','lArm.el',[-0.24,-0.36,-0.36],[0,-0.27,0]],
    ['cuff-right','rArm.el',[-0.24,-0.43,0.36],[0,-0.27,0]],
    ['shoe-side','lLeg.an',[0.38,0.12,0.20],[0,0,0]],
    ['temple','head',[0.40,0.16,0.32],[0,0.16,0]],
  ]) {
    await evaluate(`{const h=__game.character.${part}; const pos=h.localToWorld(h.position.clone().set(...${JSON.stringify(offset)})); const target=h.localToWorld(h.position.clone().set(...${JSON.stringify(aim)})); qaView(pos.toArray(),target.toArray());}`);
    await shot(name);
  }
  await evaluate(`qaPose('ride',{crouch:1}); qaView([-6.2,1.15,16.2],[-4,0.65,14]);`); await shot('crouch');
  await evaluate(`qaPose('ride'); qaView([-10,1.15,16],[-1,0.1,10]);`); await shot('floor-gameplay');
  await evaluate(`qaView([-7,0.38,13.5],[-4,0.05,11]);`); await shot('floor-detail');
  if (await evaluate('Boolean(__game.floorSurface)')) {
    const surface = await evaluate(`({status:__game.floorSurface.status,passes:__game.floorSurface.reflectionPasses,width:__game.level.floor.material.map.image.width,normalWidth:__game.level.floor.material.normalMap.image.width})`);
    console.log('Concrete material:',JSON.stringify(surface));
    if(surface.status !== 'ready' || surface.passes === 0) throw new Error('Concrete reflection did not render');
  }
  await evaluate(`qaPose('air',{trick:{name:'Kickflip',kind:'flip',t:0.22,dur:0.5}}); qaView([-6.3,1.4,16.5],[-4,1.05,14]);`);
  await shot('kickflip');
  await evaluate(`qaPose('ride'); qaView([-19,5.8,20],[0,1,-5]);`); await shot('warehouse');
  await evaluate(`qaView([14,3.2,7],[25,0.8,13]);`); await shot('concrete-banks');
  if (await evaluate('__game.level.mats.concrete.name === "Worn cast concrete"')) {
    if (!await evaluate(`['map','normalMap','roughnessMap'].every(k=>__game.level.mats.concrete[k]===__game.level.floor.material[k])`)) throw new Error('Concrete surfaces must share the loaded floor textures');
  }
  await evaluate(`qaView([-17,3.5,9],[-32,1.3,1]);`); await shot('transitions');
  await evaluate(`qaPose('ride'); __game.character.body.visible=false; qaView([-4.65,0.37,14.73],[-4,0.13,14]);`); await shot('board');
  await evaluate(`__game.character.board.rotation.z=Math.PI; __game.character.board.position.y=0.3; qaView([-4.5,0.6,14.65],[-4,0.18,14]);`); await shot('board-underside');
  console.log('Render check:', JSON.stringify(await evaluate(`({ glError: __game.renderer.getContext().getError(), calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles })`)));
  // Check lowfx as a fresh load, including the true frame loop and keyboard controls.
  await send('Page.navigate', { url: `${url}${url.includes('?') ? '&' : '?'}lowfx` }); await sleep(200);
  for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(window.__game)')) break; await sleep(100); }
  if (await evaluate('Boolean(__game.floorSurface)')) {
    if (!await evaluate('__game.floorSurface.ready')) throw new Error('Lowfx concrete textures failed to load');
    if (await evaluate('__game.floorSurface.reflectionPasses !== 0')) throw new Error('Lowfx must not render reflections');
  }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(650);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(140);
  const live = await evaluate(`({state:__game.skater.state, speed:__game.skater.speed, shadows:__game.renderer.shadowMap.enabled, pixelRatio:__game.renderer.getPixelRatio(), glError:__game.renderer.getContext().getError()})`);
  console.log('Live keyboard ollie / lowfx:', JSON.stringify(live));
  if (live.shadows || live.pixelRatio !== 1 || live.glError || live.state !== 'air') throw new Error('Live lowfx/ollie check failed');
  await shot('lowfx-playing');
  for (const [code, dir] of [['KeyZ', -1], ['KeyC', 1]]) {
    const revert = await evaluate(`(async()=>{
      __game.startRun(); const s=__game.skater;
      s.state='air';s.vertAir=true;s.airTime=0.5;s.popped=true;
      s.pos.set(-4,0,14);s.vel.set(0,-2,8);s.heading.set(0,0,1);s.facing.set(0,0,1);
      s.combo.add('Kickflip',100);s.land(s.pos.clone(),s.normal);
      window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)}}));
      window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)}}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {dir:s.revertDir,stance:s.stance,count:s.combo.tricks.filter(t=>t.name==='Revert').length};
    })()`);
    if (revert.dir !== dir || revert.stance !== -1 || revert.count !== 1) throw new Error(`Live keyboard revert failed: ${JSON.stringify(revert)}`);
  }
  console.log('PASS: live keyboard Z/C taps survive polling and fixed substeps and revert exactly once.');
  const groundReverts = await evaluate(`(async()=>{
    __game.startRun(); const s=__game.skater;
    s.pos.set(-4,0,14);s.speed=8;s.heading.set(0,0,1);s.facing.set(0,0,1);
    const results=[];
    for(const code of ['KeyZ','KeyC']) {
      window.dispatchEvent(new KeyboardEvent('keydown',{code}));
      window.dispatchEvent(new KeyboardEvent('keyup',{code}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      results.push({stance:s.stance,mult:s.combo.multiplier,score:s.score});
      await new Promise(resolve=>setTimeout(resolve,400));
    }
    return results;
  })()`);
  if (groundReverts[0].stance !== -1 || groundReverts[1].stance !== 1 || groundReverts.some(r=>r.mult || r.score)) throw new Error(`Ground stance toggles failed: ${JSON.stringify(groundReverts)}`);
  console.log('PASS: live ground reverts toggle regular -> switch -> regular without scoring.');
  const timing = await evaluate(`new Promise(resolve => { const times=[]; let prev=performance.now(); const tick=now=>{times.push(now-prev);prev=now;if(times.length<90) requestAnimationFrame(tick);else {times.sort((a,b)=>a-b);resolve({medianMs:times[45],p95Ms:times[85]});}}; requestAnimationFrame(tick); })`);
  console.log('Headless lowfx frame timing (not a hardware benchmark):', JSON.stringify(timing));
  if (await evaluate('Boolean(__game.floorSurface)')) {
    testingMissingAssets = true;
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.setBlockedURLs', { urls: ['*/textures/concrete/*'] });
    await send('Page.navigate', { url: `${url}${url.includes('?') ? '&' : '?'}lowfx&asset-fallback-check` });
    await sleep(200);
    for (let i=0;i<100;i++) { if(await evaluate('Boolean(window.__game?.floorSurface)')) break; await sleep(100); }
    const ready = await evaluate('__game.floorSurface.ready');
    if (ready || await evaluate('__game.floorSurface.status !== "fallback"')) throw new Error('Missing assets must use the procedural floor');
    await evaluate('__game.startRun()'); await sleep(200);
    if (!await evaluate('Number.isFinite(__game.skater.pos.x) && __game.level.floor.visible')) throw new Error('Fallback interrupted skating');
    console.log('PASS: missing texture assets fall back to a playable procedural floor.');
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(`PASS: no browser/GL errors. Screenshots: ${output}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  edge.kill();
  // Delete only the exact disposable profile created above, after validating its parent and name.
  const rel = relative(resolve(tmpdir()), resolve(profile));
  if (!isAbsolute(rel) && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith('j2s-graphics-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}

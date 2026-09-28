// Actual rendered bottle caps, their gameplay lifecycle, and mobile presentation.
// node sim/bottlecapcheck.js [url] [output-directory]
// Uses a disposable, unsigned-in Edge profile; no existing browser is controlled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/bottlecaps');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-bottlecap-'));
const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), browserErrors = [], report = {
  url,
  environment: { browser: 'Microsoft Edge (isolated headless)', platform: process.platform, animation: 'Deterministic real application RAF', mobile: 'Touch emulation; no physical device test' },
  checks: [], screenshots: [],
};
let socket, id = 0, browserFailure = null, browserLog = '', closing = false;
edge.stderr.on('data', data => { browserLog = (browserLog + data).slice(-5000); });
function failed(message) {
  if (closing) return;
  browserFailure = new Error(`${message}\n${browserLog}`);
  for (const waiter of pending.values()) waiter.reject(browserFailure);
  pending.clear();
}
edge.on('error', error => failed(`Cannot launch Edge: ${error.message}`));
edge.on('exit', code => failed(`Edge exited (${code}) before checks completed`));
function send(method, params = {}) {
  if (browserFailure) return Promise.reject(browserFailure);
  const callId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`Timed out: ${method}`)); }, 60000);
    pending.set(callId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function check(name, test) {
  try { const detail = await test(); report.checks.push({ name, passed: true, detail }); console.log('PASS: ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error('FAIL: ' + name + '\n' + error.stack); }
}
async function step(frames = 1) { return evaluate(`__qa.step(${frames})`); }
async function resize(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(100);
  await evaluate('window.dispatchEvent(new Event("resize"))');
  await step();
}
async function shot(name) {
  await sleep(200);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
  report.screenshots.push(name + '.png');
}
async function boot() {
  for (let i = 0; i < 150; i++) {
    if (await evaluate('Boolean(window.__game?.collectibles)')) {
      await evaluate(`Promise.all(__game.collectibles.items.filter(i=>i.definition.type==='cap').map(i=>i.ready))`);
      await step(2); return;
    }
    await sleep(100);
  }
  throw new Error('The level did not initialize');
}
async function click(selector) {
  const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
const driver = `(()=>{const q=window.__qa={now:1000,next:1,frames:new Map()};
  Object.defineProperty(performance,'now',{value:()=>q.now,configurable:true});
  window.requestAnimationFrame=cb=>{const id=q.next++;q.frames.set(id,cb);return id;};
  window.cancelAnimationFrame=id=>q.frames.delete(id);
  q.step=async(count=1)=>{for(let i=0;i<count;i++){q.now+=1000/60;const callbacks=[...q.frames.values()];q.frames.clear();for(const cb of callbacks)cb(q.now);if(i%12===11)await new Promise(r=>setTimeout(r,0));}};
})();`;

try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (browserFailure) throw browserFailure;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Headless Edge did not start\n' + browserLog);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: driver });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await mkdir(output, { recursive: true });
  await send('Page.navigate', { url }); await boot();

  await check('all five bottle caps load their own printed face on physical mesh geometry', async () => {
    const caps = await evaluate(`__game.collectibles.items.filter(i=>i.definition.type==='cap').map(i=>{
      const mapped=[];let sprites=0; i.face.traverse(o=>{if(o.isSprite)sprites++;if(o.isMesh&&o.material.map)mapped.push({name:o.name,uuid:o.material.map.uuid,width:o.material.map.image?.width,height:o.material.map.image?.height,repeat:o.material.map.repeat.toArray(),offset:o.material.map.offset.toArray(),labelReady:o.material.map.userData.labelReady,linerReady:o.material.map.userData.linerReady,flipY:o.material.map.flipY,colorSpace:o.material.map.colorSpace});});
      return {id:i.definition.id,metadata:i.face.userData.bottlecap,sprites,mapped};})`);
    assert.equal(caps.length, 5);
    for (const cap of caps) {
      assert.ok(cap.metadata, cap.id + ' uses the physical cap model');
      assert.equal(cap.sprites, 0, cap.id + ' label is part of the turning mesh');
      assert.ok(cap.mapped.some(map => map.name === 'cap-face' && map.width === 512 && map.height === 512 && map.labelReady === true && map.flipY && map.colorSpace === 'srgb'), cap.id + ' has loaded correctly oriented face artwork');
      assert.ok(cap.mapped.some(map => map.name === 'cap-liner' && map.width === 256 && map.height === 256 && map.linerReady === true && map.flipY && map.colorSpace === 'srgb'), cap.id + ' uses the detailed cork artwork');
    }
    assert.equal(new Set(caps.flatMap(cap=>cap.mapped.map(map=>map.uuid))).size,10,'each face and liner owns its disposable texture');
    return caps;
  });

  await check('five cap designs read from the front, at an angle, and from the back', async () => {
    await evaluate(`(()=>{const g=__game; window.qaCaps=g.collectibles.items.filter(i=>i.definition.type==='cap');
      document.querySelectorAll('#hud,#overlay,#front-end,#controls,#touch-controls,#start-btn').forEach(el=>el.style.display='none');
      window.qaScene=new g.scene.constructor();qaScene.background=g.scene.background.clone().set('#242b31');qaScene.environment=g.scene.environment;qaScene.environmentIntensity=g.scene.environmentIntensity;
      g.scene.traverse(o=>{if(o.isLight){const light=o.clone();light.castShadow=false;qaScene.add(light);}});
      window.qaCamera=new g.camera.constructor(40,innerWidth/innerHeight,.01,50);qaCamera.position.set(0,0,5.5);qaCamera.lookAt(0,0,0);
      window.qaModels=qaCaps.map((item,i)=>{const m=item.face.clone(true);m.position.set((i-2)*1.32,0,0);m.quaternion.identity();qaScene.add(m);return m;});
      window.qaShow=(yaw=0,pitch=0)=>{qaModels.forEach(m=>{m.rotation.set(pitch,yaw,0);});g.renderer.render(qaScene,qaCamera);};qaShow();})()`);
    await shot('caps-five-front');
    await evaluate('qaShow(.60,.15)'); await shot('caps-five-oblique');
    await evaluate('qaShow(Math.PI+.35,.12)'); await shot('caps-five-back');
    await evaluate(`(()=>{qaModels.forEach(m=>qaScene.remove(m));window.qaRows=[];
      for(let row=0;row<3;row++)qaCaps.forEach((item,i)=>{const m=item.face.clone(true);m.position.set((i-2)*1.32,(1-row)*1.4,0);m.rotation.set(row===1?.15:row===2?.12:0,row===1?.60:row===2?Math.PI+.35:0,0);qaScene.add(m);qaRows.push(m);});
      qaCamera.position.set(0,0,7.3);qaCamera.lookAt(0,0,0);__game.renderer.render(qaScene,qaCamera);})()`);
    await shot('caps-showcase');
    await evaluate('qaRows.forEach(m=>qaScene.remove(m));qaModels.forEach(m=>qaScene.add(m));');
    await evaluate(`qaModels.forEach((m,i)=>{m.visible=i===0;m.position.set(0,0,0);});qaCamera.position.set(0,0,2.2);qaCamera.lookAt(0,0,0);qaShow(.52,.18);`);
    await shot('cap-detail-oblique');
    await evaluate('qaShow(Math.PI+.45,-.18)'); await shot('cap-detail-back');
  });

  await check('slow rotation advances in the real loop and freezes exactly while paused', async () => {
    await evaluate(`document.querySelectorAll('#hud,#overlay,#front-end,#controls,#touch-controls,#start-btn').forEach(el=>el.style.removeProperty('display'));__game.startRun('goals','caps');`);
    await step(2);
    const before = await evaluate(`__game.collectibles.items.find(i=>i.definition.type==='cap').face.quaternion.toArray()`);
    await step(120);
    const after = await evaluate(`__game.collectibles.items.find(i=>i.definition.type==='cap').face.quaternion.toArray()`);
    const dot = Math.abs(before.reduce((sum, value, i) => sum + value * after[i], 0));
    const angle = 2 * Math.acos(Math.min(1, dot));
    assert.ok(angle > .15 && angle < .9, 'Two seconds visibly turns a cap slowly: ' + angle);
    await click('#start-btn'); await step();
    assert.equal(await evaluate('__game.session.paused'), true);
    const paused = await evaluate(`({elapsed:__game.collectibles.elapsed,transforms:__game.collectibles.items.filter(i=>i.definition.type==='cap').map(i=>[i.root.position.toArray(),i.face.quaternion.toArray()])})`);
    await step(90);
    assert.deepEqual(await evaluate(`({elapsed:__game.collectibles.elapsed,transforms:__game.collectibles.items.filter(i=>i.definition.type==='cap').map(i=>[i.root.position.toArray(),i.face.quaternion.toArray()])})`), paused);
    await click('#resume-run'); await step();
    return { angleRadiansOverTwoSeconds: angle };
  });

  await check('warehouse and phone views preserve the physical cap and its collection effects', async () => {
    await resize(1440, 900);
    await evaluate(`(()=>{const g=__game;g.skater.reset();g.skater.pos.set(-13.85,0,18.4);g.skater.heading.set(0,0,-1);g.skater.facing.copy(g.skater.heading);g.skater.updateModelQuat(1);g.character.root.position.copy(g.skater.pos);g.character.root.quaternion.copy(g.skater.modelQuat);g.followCam.dirAngle=Math.PI;g.followCam.snap(g.skater);})()`);await step();
    await shot('warehouse-caps-desktop');
    const mobile = new URL(url); mobile.searchParams.set('touch', '1');
    await send('Page.navigate', { url: mobile.href }); await sleep(200); await boot(); await resize(390,844);
    await evaluate(`__game.startRun('goals','caps');__game.skater.pos.set(-13.85,0,18.4);__game.skater.heading.set(0,0,-1);__game.skater.facing.copy(__game.skater.heading);__game.skater.updateModelQuat(1);__game.followCam.dirAngle=Math.PI;__game.followCam.snap(__game.skater);`); await step();
    assert.equal(await evaluate('document.body.classList.contains("touch-enabled") && !document.getElementById("touch-controls").hidden'),true);
    await shot('warehouse-caps-phone');
    await resize(844,390);await step();await shot('warehouse-caps-landscape');
    await evaluate(`(()=>{const g=__game,p=g.goals.pickups.find(p=>p.id==='cap-1');g.skater.pos.set(p.position[0],p.position[1]-.85,p.position[2]);g.skater.state='air';g.goals.previousPosition=null;})()`);await step(2);
    assert.equal(await evaluate('__game.goals.collected.has("cap-1")'),true);
    const burst=await evaluate(`(()=>{const c=__game.collectibles.items.find(i=>i.definition.id==='cap-1');return{visible:c.root.visible,ring:c.ring.visible,fading:c.materials.every(m=>m.opacity<=m.userData.restOpacity),burst:c.burst};})()`);
    assert.ok(burst.visible && !burst.ring && burst.fading && burst.burst>0);
    await step(24);
    assert.equal(await evaluate('__game.collectibles.items.find(i=>i.definition.id==="cap-1").root.visible'),false);
    await evaluate('__game.startRun("goals","caps")');await step();
    assert.equal(await evaluate('__game.collectibles.items.filter(i=>i.definition.type==="cap").every(i=>i.root.visible&&i.ring.visible&&i.materials.every(m=>m.opacity===m.userData.restOpacity))'),true);
    await evaluate('__game.progress.record({completed:["caps"]});__game.startRun("goals","skate")');await step();
    assert.equal(await evaluate('__game.collectibles.items.filter(i=>i.definition.type==="cap").every(i=>!i.root.visible&&!i.ring.visible)'),true);
    assert.equal(await evaluate('__game.renderer.shadowMap.enabled'),false);
  });

  await check('rendered cap materials produce no JavaScript, network, console or WebGL errors', async () => {
    assert.deepEqual(browserErrors, []);
    assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
    return evaluate('({calls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,textures:__game.renderer.info.memory.textures})');
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(c=>c.passed)&&browserErrors.length===0;report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(c=>c.passed).length}/${report.checks.length} bottle-cap browser checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-bottlecap-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

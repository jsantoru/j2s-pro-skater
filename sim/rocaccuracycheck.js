// Repeatable reference-comparison viewpoints of the actual rendered ROC level.
// node sim/rocaccuracycheck.js [url] [output-directory]
// Uses a disposable, unsigned-in Edge profile; no existing browser is controlled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/roc-accuracy');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-rocaccuracy-'));
const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-features=SyntheticPointerActions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
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
  if(process.env.QA_CHECK&&!name.includes(process.env.QA_CHECK))return;
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
const keys={Enter:['Enter',13],Escape:['Escape',27],Space:[' ',32],Tab:['Tab',9],ArrowDown:['ArrowDown',40],ArrowUp:['ArrowUp',38]};
async function key(code,down,repeat=false) {
  const [key,windowsVirtualKeyCode]=keys[code],text=code==='Enter'?'\r':code==='Space'?' ':'';
  await send('Input.dispatchKeyEvent',{type:down?(text?'keyDown':'rawKeyDown'):'keyUp',code,key,windowsVirtualKeyCode,autoRepeat:repeat,...(down&&text?{text,unmodifiedText:text}:{})});
}
async function tap(code){await key(code,true);await key(code,false);await step(2);}
const contacts=new Map();
async function down(id,selector){
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  contacts.set(id,{id,...point,radiusX:4,radiusY:4,force:1});
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[contacts.get(id)]});
}
async function up(id){const p=contacts.get(id);contacts.delete(id);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[p]});}
async function touch(selector,id=20){await down(id,selector);await up(id);await step(2);}
async function pad(index){await evaluate(`__qa.button(${index},true)`);await step();await evaluate(`__qa.button(${index},false)`);await step();}
async function mode(expected){assert.equal(await evaluate('__game.session.mode'),expected);}
async function menuState(){return evaluate(`({mode:__game.session.mode,time:__game.session.timeLeft,pos:__game.skater.pos.toArray(),active:__game.sessionClock.active,goalActive:__game.goals.active,audioPaused:__game.audio.paused,touchHidden:document.getElementById('touch-controls').hidden,pickups:__game.collectibles.group.visible,menuOpen:__game.input.menuOpen})`);}
async function enterBoard(){await click('#fe-play');await step();await mode('levels');await click('#fe-level-genesee');await step();await mode('title');}
async function layout(){
  const dimensions=await evaluate(`(()=>{const r=document.getElementById('front-end'),s=r.querySelector('.fe-shell');return{width:innerWidth,height:innerHeight,rootWidth:r.clientWidth,rootScroll:r.scrollWidth,shellWidth:s.getBoundingClientRect().width,bodyWidth:document.documentElement.scrollWidth};})()`);
  assert.ok(dimensions.rootScroll<=dimensions.rootWidth+1,'front end has horizontal overflow: '+JSON.stringify(dimensions));assert.ok(dimensions.bodyWidth<=dimensions.width+1,'page has horizontal overflow: '+JSON.stringify(dimensions));
  const selectors=await evaluate(`__game.frontEnd.buttons().map(e=>'#'+e.id)`);
  const targets=[];
  for(const selector of selectors){
    const target=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{selector:${JSON.stringify(selector)},left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(${JSON.stringify(selector)})===e};})()`);
    assert.ok(target.width>=44&&target.height>=44,'menu target under44px:'+JSON.stringify(target));
    assert.ok(target.left>=-.5&&target.right<=dimensions.width+.5,'button horizontally clipped:'+selector);
    assert.ok(target.hit,'menu target obscured:'+selector);targets.push(target);
  }
  await evaluate('document.getElementById("front-end").scrollTop=0');
  return{...dimensions,targets};
}
async function career(completed=[]){await evaluate(`__game.progress.completed=new Set(${JSON.stringify(completed)});__game.progress.bestScore=0;__game.progress.bestCombo=0;localStorage.setItem('j2s-pro-skater.genesee.goals.v1',JSON.stringify(__game.progress.snapshot()));__game.showHome();`);await step();}
const driver = `(()=>{const q=window.__qa={now:1000,next:1,frames:new Map(),pad:null};
  Object.defineProperty(performance,'now',{value:()=>q.now,configurable:true});
  window.requestAnimationFrame=cb=>{const id=q.next++;q.frames.set(id,cb);return id;};
  window.cancelAnimationFrame=id=>q.frames.delete(id);
  q.step=async(count=1)=>{for(let i=0;i<count;i++){q.now+=1000/60;const callbacks=[...q.frames.values()];q.frames.clear();for(const cb of callbacks)cb(q.now);if(i%12===11)await new Promise(r=>setTimeout(r,0));}};
  Object.defineProperty(navigator,'getGamepads',{value:()=>q.pad?[q.pad]:[],configurable:true});
  q.connectPad=()=>{q.pad={id:'Navigation QA Gamepad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};};
  q.button=(index,on)=>{q.pad.buttons[index]={pressed:on,touched:on,value:on?1:0};};
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await mkdir(output, { recursive: true });
  await send('Page.navigate', { url }); await boot();



  await evaluate('__game.selectLevel("roc-city-skatepark");__game.startRun("free")');await step(2);
  await evaluate('Promise.all([__game.floorSurface?.ready,__game.collectibles.ready,document.fonts.ready])');
  await check('reference comparison viewpoints render the actual loaded park without errors',async()=>{
    await evaluate('for(const e of document.body.children){if(e.id!=="game"&&e.tagName!=="SCRIPT")e.style.display="none";} __game.character.root.visible=false;__game.collectibles.group.visible=false;');
    for(const [name,pos,target,up] of [
      ['mini-north',[2,5,-43],[1,.5,-34]],
      ['mini-side',[8,4,-36],[-4,.6,-34]],
      ['layout-overhead',[-2,96,3],[-2,0,3],[0,0,-1]],
      ['park-overview',[-33,28,-40],[1,0,0]],
      ['bowl',[-20,12,-29],[-7,0,-13]],
      ['bowl-interior',[-7,.8,-17],[-1,1.7,-23]],
      ['seven-stairs',[4,4,-12],[10,.8,-23]],
      ['nine-stairs',[-9,4,18],[-5,1,7]],
      ['aframe-hip',[5,3,7],[11,.7,0]],
      ['mellow-bank',[7,2,28],[10,.1,19]],
      ['under-bridge',[7,2,25],[11,.3,48]],
    ]){
      if(process.env.QA_VIEWS&&!process.env.QA_VIEWS.split(',').includes(name))continue;
      await evaluate('(()=>{const g=__game,s=g.level.horizontalScale??1;g.camera.up.set('+(up||[0,1,0])+');g.camera.position.set('+pos+').multiplyScalar(s);const target=['+target+'];g.camera.lookAt(target[0]*s,target[1],target[2]*s);g.camera.fov=60;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);})()');await shot(name);
    }
    report.features=await evaluate('__game.level.features');
    report.rendering=await evaluate('({calls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,memory:{...__game.renderer.info.memory},concrete:__game.floorSurface.status})');
    if(process.env.QA_THUMBNAIL==='1'){
      const data=await evaluate('(()=>{const g=__game,s=g.level.horizontalScale??1;g.camera.up.set(0,1,0);g.renderer.setSize(1000,560);g.camera.aspect=1000/560;g.camera.position.set(-30*s,24*s,-37*s);g.camera.lookAt(0,0,-s);g.camera.fov=62;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);return g.renderer.domElement.toDataURL("image/webp",.9).split(",")[1];})()');
      await mkdir(resolve('public/textures/levels'),{recursive:true});await writeFile(resolve('public/textures/levels/roc-city-skatepark.webp'),Buffer.from(data,'base64'));
    }
    assert.deepEqual(browserErrors,[]);assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(c=>c.passed)&&browserErrors.length===0;report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(c=>c.passed).length}/${report.checks.length} ROC accuracy view checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-rocaccuracy-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

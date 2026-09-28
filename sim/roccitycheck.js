// Two-level integration, isolation, touch controls and rendered ROC City evidence.
// node sim/roccitycheck.js [url] [output-directory]
// Uses a disposable, unsigned-in Edge profile; no existing browser is controlled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/roc-city-level');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-roccity-'));
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


  await check('both real levels have independent cards and ROC opens its own goal board',async()=>{
    await click('#fe-play');await step();
    assert.equal(await evaluate('document.querySelectorAll(".fe-level-card").length'),2);
    const images=await evaluate('[...document.querySelectorAll(".fe-card-image img")].map(i=>({ready:i.complete,width:i.naturalWidth,height:i.naturalHeight}))');
    for(const image of images)assert.ok(image.ready&&image.width===1000&&image.height===560,'actual level thumbnails are loaded');
    await shot('level-select-desktop');
    await click('#fe-level-roc-city-skatepark');await step();await mode('title');
    assert.equal(await evaluate('__game.session.levelId'),'roc-city-skatepark');
    assert.equal(await evaluate('__game.levelConfig.title'),'ROC City Skatepark');
    assert.match(await evaluate('document.getElementById("overlay").textContent'),/ROC CITY/);
    assert.match(await evaluate('document.getElementById("overlay").textContent'),/35,000/);
    await evaluate('Promise.all(__game.collectibles.items.filter(i=>i.definition.type==="cap").map(i=>i.ready))');await step(2);
    await shot('roc-goal-board');
  });

  await check('controller Start launches the focused second card and selection stays visible when returning',async()=>{
    await evaluate('__game.selectLevel("genesee-warehouse");__game.showLevelSelect();__qa.connectPad()');await step();
    await pad(15);assert.equal(await evaluate('document.activeElement.id'),'fe-level-roc-city-skatepark');
    await pad(9);await mode('title');assert.equal(await evaluate('__game.session.levelId'),'roc-city-skatepark');
    await evaluate('__qa.pad=null');await resize(390,568);await evaluate('__game.showLevelSelect()');await step();
    const visible=await evaluate('(()=>{const r=document.activeElement.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;})()');assert.equal(visible,true);
    await resize(1440,900);await evaluate('__game.selectLevel("roc-city-skatepark")');await step();
  });

  await check('ROC starts on its actual north entry, exposes every map feature and binds all systems',async()=>{
    await evaluate('__qa.pad=null;__game.selectLevel("roc-city-skatepark")');await step();
    await click('#overlay-msg');await step(2);await mode('playing');
    const result=await evaluate('({position:__game.skater.pos.toArray(),features:Object.keys(__game.level.features),camera:__game.followCam.level===__game.level,effects:__game.fx.level===__game.level,skater:__game.skater.level===__game.level,pickups:__game.collectibles.items.length,activeRoots:__game.scene.children.filter(o=>o.name.startsWith("Level:")).length})');
    assert.ok(Math.abs(result.position[0]-2)<.1&&Math.abs(result.position[2]+44)<.1&&Math.abs(result.position[1]-1.62)<.1);
    assert.equal(result.features.join(''),'ABCDEFGHIJKL');assert.ok(result.camera&&result.effects&&result.skater);assert.equal(result.pickups,11);assert.equal(result.activeRoots,1);
    await step(25);await shot('roc-gameplay-entry');return result;
  });

  await check('rendered park reference views show connected bowl, street and bridge geometry',async()=>{
    assert.equal(await evaluate('__game.session.levelId'),'roc-city-skatepark');
    await evaluate('window.__qaHidden=[]; for(const e of document.body.children){if(e.id!=="game"&&e.tagName!=="SCRIPT"){__qaHidden.push([e,e.style.display]);e.style.display="none";}} __game.character.root.visible=false;__game.collectibles.group.visible=false;');
    for(const [name,pos,target] of [
      ['roc-overview',[-33,28,-40],[1,0,0]],
      ['roc-bowl',[-20,12,-29],[-7,0,-13]],
      ['roc-street',[1,5,-8],[11,.8,-26]],
      ['roc-under-bridge',[7,2,25],[11,.3,48]],
    ]){
      await evaluate('(()=>{const g=__game;g.camera.position.set('+pos+');g.camera.lookAt('+target+');g.camera.fov=60;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);})()');await shot(name);
    }
    if(process.env.QA_THUMBNAIL==='1'){
      const data=await evaluate('(()=>{const g=__game;g.renderer.setSize(1000,560);g.camera.aspect=1000/560;g.camera.position.set(-30,24,-37);g.camera.lookAt(0,0,-1);g.camera.fov=62;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);return g.renderer.domElement.toDataURL("image/webp",.9).split(",")[1];})()');
      await mkdir(resolve('public/textures/levels'),{recursive:true});await writeFile(resolve('public/textures/levels/roc-city-skatepark.webp'),Buffer.from(data,'base64'));
    }
    await evaluate('for(const [e,d]of __qaHidden)e.style.display=d;__game.character.root.visible=true;window.dispatchEvent(new Event("resize"));');await step();
  });

  await check('earning a ROC collection retires it on later runs without affecting Warehouse',async()=>{
    await evaluate('__game.startRun("goals"); for(const p of __game.goals.pickups.filter(p=>p.type==="cap")){__game.goals.previousPosition=null;__game.skater.pos.set(p.position[0],p.position[1]-.85,p.position[2]);__game.goals.update(__game.skater);} __game.startRun("goals");');await step();
    assert.equal(await evaluate('__game.progress.has("caps")'),true);
    assert.equal(await evaluate('__game.collectibles.items.filter(i=>i.definition.type==="cap"&&i.root.visible).length'),0);
    await evaluate('__game.selectLevel("genesee-warehouse");__game.startRun("goals")');await step();
    assert.equal(await evaluate('__game.progress.has("caps")'),false);
    assert.equal(await evaluate('__game.goals.availableGoals.has("caps")'),true);
    assert.equal(await evaluate('__game.collectibles.items.filter(i=>i.definition.type==="cap"&&i.root.visible).length'),5);
    await evaluate('__game.selectLevel("roc-city-skatepark");__game.startRun("goals");__game.skater.combo.add("QA landed line",5000);__game.skater.bankCombo(false)');await step();
    assert.ok(await evaluate('__game.progress.has("high-score")&&__game.progress.has("combo")'));
    await evaluate('__game.endRun();__game.showLevelSelect()');await step();
    const counts=await evaluate('[...document.querySelectorAll(".fe-level-progress")].map(e=>e.textContent)');assert.deepEqual(counts,['0 / 7','3 / 7']);
    await shot('separate-level-careers');
  });

  await check('level switching is bounded and never retains old lights, collision targets or held inputs',async()=>{
    async function metrics(){return evaluate('({memory:{...__game.renderer.info.memory},roots:__game.scene.children.filter(o=>o.name.startsWith("Level:")).length,loaded:__game.loadedLevels.length,shadows:__game.renderer.shadowMap.enabled})');}
    for(let i=0;i<4;i++){await evaluate('__game.selectLevel('+JSON.stringify(i%2?'roc-city-skatepark':'genesee-warehouse')+')');await step(2);}
    const before=await metrics();
    for(let i=0;i<12;i++){
      await evaluate('__game.skater.crouching=true;__game.skater.bufferedOllie=true;__game.selectLevel('+JSON.stringify(i%2?'roc-city-skatepark':'genesee-warehouse')+')');await step(2);
      assert.equal(await evaluate('__game.skater.crouching||__game.skater.bufferedOllie'),false);
      assert.equal(await evaluate('__game.skater.level===__game.level&&__game.followCam.level===__game.level&&__game.fx.level===__game.level'),true);
      assert.equal(await evaluate('__game.input.menuOpen&&__game.audio.paused'),true);
    }
    const after=await metrics();assert.equal(after.roots,1);assert.equal(after.loaded,2);assert.deepEqual(after.memory,before.memory);
    return{before,after};
  });

  await check('ROC and warehouse careers persist independently after page reload',async()=>{
    await send('Page.reload');await boot();
    assert.equal(await evaluate('__game.progress.has("caps")'),false);
    await evaluate('__game.selectLevel("roc-city-skatepark")');await step();
    assert.equal(await evaluate('__game.progress.has("caps")'),true);
    assert.equal(await evaluate('__game.progress.bestScore'),5000);
    assert.equal(await evaluate('__game.highScores.best'),5000);
    await evaluate('__game.showHome()');await step();assert.match(await evaluate('document.getElementById("fe-career-name").textContent'),/ROC CITY/);
  });

  await check('phone layouts fit both level cards and ROC touch skating remains usable',async()=>{
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const target=new URL(url);target.searchParams.set('touch','1');await send('Page.navigate',{url:target.href});await sleep(200);await boot();
    const sizes=[];
    for(const[width,height,label]of[[390,844,'portrait'],[844,390,'landscape'],[320,568,'small-portrait']]){
      await resize(width,height);await evaluate('__game.showLevelSelect()');await step();sizes.push(await layout());await shot('level-select-'+label);
    }
    await resize(844,390);await touch('#fe-level-roc-city-skatepark');await touch('#overlay-msg');await mode('playing');
    assert.equal(await evaluate('__game.renderer.shadowMap.enabled'),false);
    assert.equal(await evaluate('document.getElementById("touch-controls").hidden'),false);
    await down(1,'#touch-ollie');await step(25);assert.equal(await evaluate('__game.skater.crouching'),true);await up(1);await step(3);
    assert.equal(await evaluate('__game.skater.state'),'air');await step(70);assert.equal(await evaluate('__game.skater.state'),'ride');
    await shot('roc-mobile-gameplay');
    await touch('#start-btn');await touch('#settings-levels');await mode('levels');
    await touch('#fe-level-genesee');await touch('#overlay-msg');await mode('playing');assert.equal(await evaluate('__game.skater.crouching||__game.skater.bufferedOllie'),false);
    return sizes;
  });

  await check('no JavaScript, console, network or WebGL errors',async()=>{
    report.rendering=await evaluate('({mode:__game.session.levelId,lowfx:!__game.renderer.shadowMap.enabled,drawCalls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,memory:{...__game.renderer.info.memory}})');
    assert.deepEqual(browserErrors,[]);assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(c=>c.passed)&&browserErrors.length===0;report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(c=>c.passed).length}/${report.checks.length} ROC City browser checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-roccity-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

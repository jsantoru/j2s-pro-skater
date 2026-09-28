// Home, level selection and session navigation through real browser input.
// node sim/navigationcheck.js [url] [output-directory]
// Uses a disposable, unsigned-in Edge profile; no existing browser is controlled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/navigation');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-navigation-'));
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

  await check('home boots with PLAY focused and a completely idle session',async()=>{
    await mode('home');assert.equal(await evaluate('document.activeElement.id'),'fe-play');
    assert.equal(await evaluate('document.getElementById("overlay").classList.contains("hidden")'),true);
    const before=await menuState();assert.ok(!before.active&&!before.goalActive&&before.audioPaused&&before.touchHidden&&!before.pickups&&before.menuOpen);
    await step(90);assert.deepEqual(await menuState(),before,'the idle home screen cannot consume a run or move the skater');
    const bounds=await layout();await shot('home-desktop');return bounds;
  });

  await check('home keyboard controls stay in the visible screen and held Enter or Space never skips a screen',async()=>{
    await evaluate('document.getElementById("fe-play").focus()');
    await tap('Tab');assert.equal(await evaluate('document.activeElement.id'),'fe-controls');
    await tap('ArrowDown');assert.equal(await evaluate('document.activeElement.id'),'fe-settings');
    await tap('ArrowDown');assert.equal(await evaluate('document.activeElement.id'),'fe-play');
    await key('Enter',true);await step();await mode('levels');
    for(let i=0;i<3;i++){await key('Enter',true,true);await step(5);}
    await mode('levels');await key('Enter',false);await step();
    assert.equal(await evaluate('document.activeElement.id'),'fe-level-genesee');
    await tap('Enter');await mode('title');
    await tap('Escape');await mode('levels');await tap('Escape');await mode('home');
    await key('Space',true);await step();await mode('home');
    for(let i=0;i<3;i++){await key('Space',true,true);await step(5);}
    await mode('home');await key('Space',false);await step(2);await mode('levels');
    await tap('Space');await mode('title');
    await tap('Escape');await mode('levels');await tap('Escape');await mode('home');
  });

  await check('controls and settings make menus inert, keep focus in the modal and restore it on close',async()=>{
    await click('#fe-controls');await step();
    assert.equal(await evaluate('document.getElementById("controls-panel").classList.contains("hidden")'),false);
    assert.equal(await evaluate('document.getElementById("front-end").inert'),true);
    assert.equal(await evaluate('document.activeElement.id'),'controls-close');
    await evaluate('document.getElementById("fe-play").focus()');assert.equal(await evaluate('document.activeElement.id'),'controls-close');
    await tap('Escape');await mode('home');assert.equal(await evaluate('document.activeElement.id'),'fe-controls');
    await click('#fe-settings');await step();
    assert.equal(await evaluate('document.getElementById("front-end").inert'),true);
    for(let i=0;i<5;i++){await tap('Tab');assert.equal(await evaluate('document.getElementById("settings-panel").contains(document.activeElement)'),true);}
    await evaluate('document.getElementById("fe-play").focus()');assert.equal(await evaluate('document.getElementById("settings-panel").contains(document.activeElement)'),true);
    await tap('Escape');await mode('home');assert.equal(await evaluate('document.activeElement.id'),'fe-settings');
    assert.equal(await evaluate('document.getElementById("front-end").inert'),false);
    await tap('Escape');assert.equal(await evaluate('__game.session.paused'),true);await tap('Escape');await mode('home');
  });

  await check('level selection is explicit, future levels cannot launch, and board navigation works both ways',async()=>{
    await click('#fe-play');await step();await mode('levels');
    assert.equal(await evaluate('document.getElementById("fe-level-genesee").dataset.level'),'genesee-warehouse');
    const image=await evaluate('(()=>{const i=document.querySelector(".fe-card-image img");return{ready:i.complete,width:i.naturalWidth,height:i.naturalHeight};})()');
    assert.ok(image.ready&&image.width===1000&&image.height===560,'actual warehouse preview loaded');
    assert.equal(await evaluate('document.getElementById("fe-future-level").matches("button,a,[tabindex]")'),false);
    await click('#fe-future-level');await step();await mode('levels');
    const bounds=await layout();await shot('levels-desktop');
    await click('#fe-level-genesee');await step();await mode('title');
    await click('#level-select-nav');await step();await mode('levels');
    await click('#fe-level-genesee');await step();await click('#home-nav');await step();await mode('home');
    return bounds;
  });

  await check('gamepad Start, A, B and D-pad navigate without carrying held skating inputs',async()=>{
    await evaluate('__qa.connectPad();__game.showHome()');await step();
    await pad(13);assert.equal(await evaluate('document.activeElement.id'),'fe-controls');
    await pad(9);await mode('levels');await pad(1);await mode('home');
    await pad(0);await mode('levels');
    await evaluate('__qa.button(0,true)');await step();await mode('title');await step(15);await mode('title');
    await evaluate('__qa.button(0,false)');await step();
    await pad(9);await mode('playing');
    assert.equal(await evaluate('__game.skater.crouching||__game.input.state.ollie'),false);
    await pad(9);assert.equal(await evaluate('__game.session.paused'),true);
    await pad(1);assert.equal(await evaluate('__game.session.paused'),false);
    await evaluate('__qa.pad=null;__game.showHome()');await step();
  });

  await check('returning home abandons only the current run and retains earned career progress',async()=>{
    await career();await enterBoard();await click('#overlay-msg');await step();
    await evaluate(`(()=>{const s=__game.skater;s.combo.add('Kickflip',3000);s.bankCombo(false);const p=__game.goals.pickups.find(p=>p.id==='cap-1');s.pos.set(p.position[0],p.position[1]-.85,p.position[2]);s.vel.set(0,0,0);s.state='air';__game.goals.previousPosition=null;})()`);await step(2);
    assert.equal(await evaluate('__game.goals.count("caps")'),1);
    const saved=await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")');
    await click('#start-btn');await step();await click('#settings-home');await step();await mode('home');
    const stopped=await menuState();assert.ok(!stopped.active&&!stopped.goalActive&&stopped.audioPaused&&stopped.touchHidden&&!stopped.pickups&&stopped.menuOpen);
    await step(60);assert.deepEqual(await menuState(),stopped);
    assert.equal(await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")'),saved);
    assert.match(await evaluate('document.getElementById("fe-career-goals").textContent'),/2\s*\/\s*7/);
    assert.equal(await evaluate('document.getElementById("fe-best-score").textContent'),'3,000');
    await enterBoard();assert.match(await evaluate('document.getElementById("board-completed").textContent'),/2\s*\/\s*7/);
    await click('#overlay-msg');await step();
    assert.equal(await evaluate('__game.goals.count("caps")'),0);assert.equal(await evaluate('__game.skater.score'),0);
    assert.deepEqual(await evaluate('[...__game.goals.availableGoals]'),['pro-score','sick-score','skate','caps','tape']);
    await evaluate('__game.endRun()');await step();await mode('over');
    await click('#home-nav');await step();await mode('home');
    await send('Page.reload',{ignoreCache:true});await sleep(200);await boot();await mode('home');
    assert.match(await evaluate('document.getElementById("fe-career-goals").textContent'),/2\s*\/\s*7/);
  });

  await check('touch home and level screens fit portrait, landscape and a compact phone',async()=>{
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const target=new URL(url);target.searchParams.set('touch','1');await send('Page.navigate',{url:target.href});await sleep(200);await boot();
    const dimensions=[],issues=[];
    for(const[width,height,name]of[[390,844,'portrait'],[844,390,'landscape'],[568,320,'compact-landscape'],[320,568,'compact-portrait']]){
      await resize(width,height);await evaluate('__game.showHome()');await step();
      await shot('home-'+name);try{dimensions.push({screen:'home',...(await layout())});}catch(error){issues.push(`${width}x${height} home: ${error.message}`);}
      await touch('#fe-play');await mode('levels');await shot('levels-'+name);try{dimensions.push({screen:'levels',...(await layout())});}catch(error){issues.push(`${width}x${height} levels: ${error.message}`);}
      await touch('#fe-back');await mode('home');
    }
    assert.deepEqual(issues,[]);return dimensions;
  });

  await check('a held touch is cleared when pausing to home and cannot pop on the next run',async()=>{
    await resize(844,390);await career();await touch('#fe-play');await touch('#fe-level-genesee');await touch('#overlay-msg');await mode('playing');
    await down(1,'#touch-ollie');await step(25);assert.equal(await evaluate('__game.skater.crouching'),true);
    await touch('#start-btn',2);await touch('#settings-home',2);await mode('home');
    assert.equal(await evaluate('__game.audio.paused'),true);
    assert.equal(await evaluate('document.getElementById("touch-controls").hidden'),true);
    await up(1);await step(2);
    const cleaned=await evaluate('(()=>{const t=__game.touchControls,s=t.source;return{pointers:t.pointers.size,held:s.held.size,pressed:s.pressed.size,released:s.released.size,stick:s.stick.active};})()');
    assert.deepEqual(cleaned,{pointers:0,held:0,pressed:0,released:0,stick:false});
    await touch('#fe-play');await touch('#fe-level-genesee');await touch('#overlay-msg');await step(5);
    assert.equal(await evaluate('__game.skater.state'),'ride');assert.equal(await evaluate('__game.skater.crouching||__game.input.state.ollie'),false);
    assert.ok(await evaluate('__game.session.timeLeft>119.7'));
    await touch('#start-btn');await touch('#settings-levels');await mode('levels');
  });

  await check('cleared careers remain visible in level selection and enter untimed Free Skate',async()=>{
    await career(['high-score','pro-score','sick-score','combo','skate','caps','tape']);
    await touch('#fe-play');assert.match(await evaluate('document.querySelector(".fe-card-status").textContent'),/CLEARED/);
    assert.match(await evaluate('document.getElementById("fe-level-progress").textContent'),/7\s*\/\s*7/);
    await touch('#fe-level-genesee');await mode('title');assert.match(await evaluate('document.getElementById("overlay-msg").textContent'),/FREE SKATE/);
    await touch('#overlay-msg');await mode('playing');assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('__game.session.timeLeft===Infinity'),true);assert.equal(await evaluate('__game.collectibles.group.visible'),false);
  });

  await check('all navigation completes without JavaScript, console, network or WebGL errors',async()=>{
    assert.deepEqual(browserErrors,[]);assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(c=>c.passed)&&browserErrors.length===0;report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(c=>c.passed).length}/${report.checks.length} navigation browser checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-navigation-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

// Native multi-touch regression in an isolated headless Edge profile.
// node sim/mobilecheck.js http://127.0.0.1:5173/
// CDP emulates mobile browser touch delivery, not a physical iOS/Android device.
// Deterministic RAF drives the real frame/input/skater code, including landings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/', output = resolve('screenshots/mobile-controls');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-mobilecheck-'));
// Pin CDP's established WebTouch injection path: it supports releasing one named
// contact while retaining others. The newer experimental synthetic path uses a
// different point-set convention despite exposing the same protocol method.
const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-features=SyntheticPointerActions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), contacts = new Map(), browserErrors = [];
const report = { environment: 'Headless Edge CDP mobile/touch emulation; no physical-device validation', checks: [], screenshots: [] };
let socket, callId = 0, browserFailure, browserLog = '', closing = false;
edge.stderr.on('data', data => { browserLog = (browserLog + data).slice(-5000); });
function failBrowser(message) {
  if (closing) return;
  browserFailure = new Error(`${message}\n${browserLog}`);
  for (const waiter of pending.values()) waiter.reject(browserFailure);
  pending.clear();
}
edge.on('error', error => failBrowser('Cannot launch Edge: ' + error.message));
edge.on('exit', code => failBrowser(`Edge exited (${code}) before checks completed`));
function send(method, params = {}) {
  if (browserFailure) return Promise.reject(browserFailure);
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 60000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function check(name, test) {
  try { const detail = await test(); report.checks.push({ name, passed: true, detail }); console.log('PASS: ' + name); }
  catch (error) {
    report.checks.push({ name, passed: false, error: error.stack }); console.error('FAIL: ' + name + '\n  ' + error.stack);
    try { await cancelTouches(); } catch { /* preserve the original failure */ }
  }
}
async function step(frames = 1) { return evaluate(`__mobileQA.step(${frames})`); }
async function rect(selector, scroll = false) {
  return evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Missing '+${JSON.stringify(selector)}); ${scroll ? "e.scrollIntoView({block:'center'});" : ''} const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; })()`);
}
async function down(id, point) {
  contacts.set(id, { id, x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1 });
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contacts.get(id)] });
}
async function move(id, point) {
  if (!contacts.has(id)) throw Error('No active contact ' + id);
  Object.assign(contacts.get(id), { x: point.x, y: point.y });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [contacts.get(id)] });
}
async function up(id) {
  const ended = contacts.get(id);
  if (!ended) throw Error('No active contact ' + id);
  contacts.delete(id);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [ended] });
}
async function cancelTouches() {
  contacts.clear();
  await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}
async function touchTap(selector, id = 20) {
  const point = await rect(selector, true);
  await down(id, point); await up(id); await step(2);
}
async function mouseClick(selector) {
  const { x, y } = await rect(selector, true);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
  await step(2);
}
async function size(width, height, mobile = true) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height, screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } });
  await sleep(100);
  if (await evaluate('Boolean(window.__game)')) { await evaluate("window.dispatchEvent(new Event('resize'))"); await step(2); }
}
async function shot(name) {
  await sleep(500);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
  report.screenshots.push(name + '.png');
}
async function boot() {
  for (let i = 0; i < 150; i++) {
    if (await evaluate('Boolean(window.__game?.goals)')) { await step(2); return; }
    await sleep(100);
  }
  throw Error('The mobile game did not initialize');
}
async function reset() {
  if (contacts.size) await cancelTouches();
  await evaluate("__game.startRun('goals','skate')"); await step(2);
}
async function inputState() {
  return evaluate(`({state:__game.skater.state,crouching:__game.skater.crouching,steer:__game.input.state.steer,push:__game.input.state.push,ollie:__game.input.state.ollie,grab:__game.input.state.grab,grind:__game.input.state.grind,trick:__game.skater.trick?.name||null,score:__game.skater.score,pos:__game.skater.pos.toArray()})`);
}
async function assertTouchClean() {
  const state=await evaluate(`(() => {const t=__game.touchControls,s=t.source;return {pointers:t.pointers.size,owners:t.owners.size,held:s.held.size,pressed:s.pressed.size,released:s.released.size,stick:s.stick.active};})()`);
  assert.deepEqual(state,{pointers:0,owners:0,held:0,pressed:0,released:0,stick:false});
}
async function controlsVisible() {
  return evaluate(`(() => {const e=document.getElementById('touch-controls');const r=e?.getBoundingClientRect();return !!(e&&!e.hidden&&!e.inert&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&r.width&&r.height);})()`);
}
async function controlBounds() {
  const result = await evaluate(`(() => {
    const selectors=['#touch-stick','#touch-ollie','#touch-flip','#touch-grab','#touch-grind','#touch-revert','#start-btn'];
    return {width:innerWidth,height:innerHeight,controls:selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(selector)===e};})};
  })()`);
  for (const r of result.controls) {
    assert.ok(r.width >= 44 && r.height >= 44, 'Touch target under 44px: ' + JSON.stringify(r));
    assert.ok(r.left >= 0 && r.right <= result.width && r.top >= 0 && r.bottom <= result.height, 'Control outside viewport: ' + JSON.stringify(r));
    assert.ok(r.hit, 'Control centre obscured: ' + r.selector);
  }
  for (let i = 0; i < result.controls.length; i++) for (let j = i + 1; j < result.controls.length; j++) {
    const a = result.controls[i], b = result.controls[j];
    assert.ok(Math.min(a.right,b.right) <= Math.max(a.left,b.left) || Math.min(a.bottom,b.bottom) <= Math.max(a.top,b.top), `Overlapping touch targets: ${a.selector}, ${b.selector}`);
  }
  return result;
}

const driver = `(() => {
  const q=window.__mobileQA={now:1000,next:1,frames:new Map(),events:[]};
  Object.defineProperty(performance,'now',{value:()=>q.now,configurable:true});
  window.requestAnimationFrame=callback=>{const id=q.next++;q.frames.set(id,callback);return id;};
  window.cancelAnimationFrame=id=>q.frames.delete(id);
  q.step=async(count=1)=>{for(let i=0;i<count;i++){q.now+=1000/60;const callbacks=[...q.frames.values()];q.frames.clear();for(const cb of callbacks)cb(q.now);if(i%12===11)await new Promise(r=>setTimeout(r,0));}return {frames:count,time:q.now};};
  for(const type of ['pointerdown','pointerup','pointercancel','click'])window.addEventListener(type,event=>q.events.push({type,pointerType:event.pointerType,id:event.pointerId,primary:event.isPrimary,target:event.target.id}),true);
})();`;

try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (browserFailure) throw browserFailure;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  if (!port) throw Error('Headless Edge did not start\n' + browserLog);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: driver });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await size(844,390);
  await mkdir(output, { recursive: true });
  await send('Page.navigate', { url }); await boot();

  await check('mobile browser advertises touch/coarse input and uses lighter rendering', async () => {
    const data = await evaluate(`({maxTouchPoints:navigator.maxTouchPoints,coarse:matchMedia('(pointer: coarse)').matches,touch:document.body.classList.contains('touch-enabled'),shadows:__game.renderer.shadowMap.enabled,pixelRatio:__game.renderer.getPixelRatio(),mode:__game.session.mode})`);
    assert.ok(data.maxTouchPoints >= 3 && data.coarse, JSON.stringify(data));
    assert.ok(data.touch, JSON.stringify(data));
    assert.equal(data.shadows,false);
    assert.equal(data.pixelRatio,1);
    assert.equal(await controlsVisible(),false);
    await shot('board-landscape');
    return data;
  });

  await check('touch selects a goal without launching and starts the chosen run', async () => {
    await touchTap('[data-goal="skate"]');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'skate');
    assert.equal(await evaluate('__game.session.mode'),'title');
    await touchTap('#overlay-msg');
    assert.equal(await evaluate('__game.session.mode'),'playing');
    assert.equal(await evaluate('__game.session.focusGoal'),'skate');
    assert.equal(await controlsVisible(),true);
    await shot('playing-landscape');
    return controlBounds();
  });

  await check('native touch joystick steers the actual skater and returns to neutral', async () => {
    await reset();
    const stick = await rect('#touch-stick');
    const before = await evaluate('__game.skater.heading.toArray()');
    await down(1,stick); await move(1,{x:stick.x+stick.width*.35,y:stick.y}); await step(10);
    const held = await inputState();
    assert.ok(held.steer > .5,JSON.stringify(held));
    assert.notDeepEqual(await evaluate('__game.skater.heading.toArray()'),before);
    await up(1); await step(3);
    assert.equal((await inputState()).steer,0);
    await assertTouchClean();
    return held;
  });

  await check('three-finger stick/ollie/flip releases into a real airborne trick and banked landing', async () => {
    await reset();
    await down(1,await rect('#touch-stick'));
    await down(2,await rect('#touch-ollie')); await step(30);
    assert.equal((await inputState()).crouching,true);
    await down(3,await rect('#touch-flip')); await step();
    await up(2); await step(2);
    const airborne = await inputState();
    assert.equal(airborne.state,'air',JSON.stringify(airborne));
    assert.equal(airborne.trick,'Kickflip',JSON.stringify(airborne));
    await shot('touch-kickflip');
    await up(3); await up(1); await step(54);
    const landed = await inputState();
    assert.equal(landed.state,'ride',JSON.stringify(landed));
    assert.ok(landed.score >= 100,JSON.stringify(landed));
    assert.equal(await evaluate('__game.goals.score'),landed.score);
    await assertTouchClean();
    assert.ok(await evaluate('__mobileQA.events.filter(e=>e.pointerType==="touch"&&e.type==="pointerdown").length>=3'));
    return {airborne,landed};
  });

  await check('grab can remain held as ollie is released and banks after a clean landing', async () => {
    await reset();
    await down(1,await rect('#touch-ollie')); await step(30);
    await down(2,await rect('#touch-grab')); await step();
    await up(1); await step(18);
    const held = await inputState();
    assert.equal(held.state,'air',JSON.stringify(held));
    assert.equal(held.grab,true);
    assert.equal(held.trick,'Indy');
    await up(2); await step(42);
    const landed = await inputState();
    assert.equal(landed.state,'ride',JSON.stringify(landed));
    assert.ok(landed.score >= 300,JSON.stringify(landed));
    await assertTouchClean();
    return {held,landed};
  });

  await check('grind touch arms assistance and release leaves no held button', async () => {
    await reset();
    await down(1,await rect('#touch-grind')); await step(2);
    assert.equal((await inputState()).grind,true);
    assert.ok(await evaluate('__game.skater.grindIntent > .3'));
    await up(1); await step(2);
    assert.equal((await inputState()).grind,false);
  });

  await check('revert touch toggles ground stance exactly once while held', async () => {
    await reset(); await evaluate('__game.skater.speed=8');
    await down(1,await rect('#touch-revert')); await step(2);
    assert.equal(await evaluate('__game.skater.stance'),-1);
    await step(24);
    assert.equal(await evaluate('__game.skater.stance'),-1);
    await up(1); await step(2);
    assert.equal(await evaluate('__game.skater.score'),0);
  });

  await check('native touch cancellation clears all controls without a phantom ollie', async () => {
    await reset();
    const stick=await rect('#touch-stick');
    await down(1,stick); await move(1,{x:stick.x+stick.width*.3,y:stick.y});
    await down(2,await rect('#touch-ollie')); await down(3,await rect('#touch-grind')); await step(20);
    assert.equal((await inputState()).crouching,true);
    await cancelTouches(); await step(3);
    const state=await inputState();
    assert.equal(state.crouching,false,JSON.stringify(state));
    assert.equal(state.state,'ride',JSON.stringify(state));
    assert.equal(state.steer,0);assert.equal(state.ollie,false);assert.equal(state.grind,false);
    assert.equal(await evaluate('document.querySelectorAll("#touch-controls .pressed").length'),0);
    assert.ok(await evaluate('__mobileQA.events.some(e=>e.type==="pointercancel")'));
    await assertTouchClean();
    return state;
  });

  await check('single-finger menus activate once and dragging a secondary menu touch cancels it', async () => {
    await reset();
    await touchTap('#start-btn'); await step(4);
    assert.equal(await evaluate('__game.session.paused'),true);
    await touchTap('#resume-run'); await step(4);
    assert.equal(await evaluate('__game.session.paused'),false);
    await down(1,await rect('#touch-ollie')); await step(10);
    const pause=await rect('#start-btn');
    await down(2,pause); await move(2,{x:pause.x-120,y:pause.y+90}); await up(2); await step(3);
    assert.equal(await evaluate('__game.session.paused'),false);
    await cancelTouches(); await step(3); await assertTouchClean();
  });

  await check('held finger through touch pause/resume stays canceled and paused simulation freezes', async () => {
    await reset();
    await down(1,await rect('#touch-ollie')); await step(20);
    await touchTap('#start-btn',2);
    assert.equal(await evaluate('__game.session.paused'),true,JSON.stringify(await evaluate('__mobileQA.events.slice(-8)')));
    assert.equal(await controlsVisible(),false);
    const before=await evaluate('({time:__game.session.timeLeft,pos:__game.skater.pos.toArray()})');
    await step(30);
    assert.deepEqual(await evaluate('({time:__game.session.timeLeft,pos:__game.skater.pos.toArray()})'),before);
    await shot('touch-paused');
    await touchTap('#resume-run',2);
    assert.equal(await evaluate('__game.session.paused'),false);
    await step(3);
    assert.equal((await inputState()).crouching,false);
    await up(1); await step(3);
    const state=await inputState();
    assert.equal(state.state,'ride',JSON.stringify(state));
    assert.equal(state.ollie,false);
    await assertTouchClean();
    return state;
  });

  await check('touch restart restores a clean run and resets held touch state', async () => {
    await reset(); await step(30);
    await down(1,await rect('#touch-ollie')); await step(10);
    await touchTap('#start-btn',2); await touchTap('#restart-run',2);
    await up(1); await step(2);
    assert.equal(await evaluate('__game.session.paused'),false);
    assert.ok(await evaluate('__game.session.timeLeft > 119.8'));
    const state=await inputState();
    assert.equal(state.state,'ride');assert.equal(state.crouching,false);assert.equal(state.ollie,false);assert.equal(state.score,0);
  });

  await check('orientation change cancels the gesture and portrait controls fit without overlap', async () => {
    await reset();
    await down(1,await rect('#touch-ollie')); await step(15);
    await size(390,844); await up(1); await step(2);
    const state=await inputState();
    assert.equal(state.state,'ride',JSON.stringify(state));
    assert.equal(state.crouching,false);assert.equal(state.ollie,false);
    const bounds=await controlBounds();
    await shot('playing-portrait');
    await touchTap('#start-btn'); await touchTap('#goals-menu');
    assert.equal(await evaluate('__game.session.mode'),'title');
    assert.equal(await controlsVisible(),false);
    await evaluate('document.getElementById("overlay").scrollTop=0');
    await shot('board-portrait');
    return bounds;
  });

  await check('portrait board starts via touch and free skate retains the touch controls', async () => {
    await touchTap('#free-skate');
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('__game.session.timeLeft === Infinity'),true);
    assert.equal(await controlsVisible(),true);
    await shot('free-skate-portrait');
    return controlBounds();
  });

  await check('desktop input keeps the touch overlay hidden by default', async () => {
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await size(1440,900,false);
    await send('Page.navigate',{url}); await boot();
    assert.equal(await evaluate('document.body.classList.contains("touch-enabled")'),false);
    await mouseClick('#overlay-msg');
    assert.equal(await controlsVisible(),false);
    assert.equal(await evaluate('__game.session.mode'),'playing');
    await shot('desktop-default');
  });

  await check('explicit touch override displays the controls on desktop', async () => {
    const target=new URL(url);target.searchParams.set('touch','1');
    await send('Page.navigate',{url:target.href}); await boot();
    await mouseClick('#overlay-msg');
    assert.equal(await evaluate('document.body.classList.contains("touch-enabled")'),true);
    assert.equal(await controlsVisible(),true);
    return controlBounds();
  });

  await check('touch flows complete without JavaScript, console, network or GL errors',async()=>{
    assert.deepEqual(browserErrors,[]);
    assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
  });
} catch(error) {
  report.checks.push({name:'browser harness initialization',passed:false,error:error.stack});
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(check=>check.passed);
  report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(check=>check.passed).length}/${report.checks.length} mobile browser checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}
  edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-mobilecheck-')) {
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  }
}

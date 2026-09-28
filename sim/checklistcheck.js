// Every active goal in the real run HUD: progress, completion, retirement and mobile layout.
// node sim/checklistcheck.js [url] [output-directory]
// Uses a disposable, unsigned-in Edge profile; no existing browser is controlled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] || 'screenshots/run-checklist');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-checklist-'));
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
const goalIds=['high-score','pro-score','sick-score','combo','skate','caps','tape'];
async function rows() {
  return evaluate(`Array.from(document.querySelectorAll('[data-run-goal]')).filter(r=>!r.hidden&&!r.classList.contains('hidden')).map(r=>({id:r.dataset.runGoal,count:r.querySelector('.run-goal-count').textContent.replace(/\\s+/g,''),complete:r.classList.contains('complete'),focused:r.classList.contains('focused'),check:r.querySelector('.run-goal-check').textContent,accessible:r.getAttribute('aria-label')}))`);
}
async function bank(points) {
  await evaluate(`(()=>{const s=__game.skater;s.combo.reset();s.combo.add('Checklist QA bank',${points});s.bankCombo(false);})()`);await step();
}
async function pickup(id) {
  await evaluate(`(()=>{const p=__game.goals.pickups.find(p=>p.id===${JSON.stringify(id)}),s=__game.skater;s.pos.set(p.position[0],p.position[1]-.85,p.position[2]);s.vel.set(0,0,0);s.speed=0;s.state='air';__game.goals.previousPosition=null;})()`);await step(2);
}
async function career(completed=[],focus='skate') {
  await evaluate(`__game.progress.completed=new Set(${JSON.stringify(completed)});__game.progress.bestScore=0;__game.progress.bestCombo=0;localStorage.setItem('j2s-pro-skater.genesee.goals.v1',JSON.stringify(__game.progress.snapshot()));__game.levelUI.selectedGoal=${JSON.stringify(focus)};__game.showGoalBoard();`);await step();
}
async function pose() {
  await evaluate(`(()=>{const g=__game,s=g.skater;s.pos.set(-4,0,14);s.vel.set(0,0,0);s.speed=0;s.state='ride';s.heading.set(1,0,0);s.facing.copy(s.heading);s.normal.set(0,1,0);s.updateModelQuat(1);g.goals.previousPosition=null;g.followCam.dirAngle=Math.PI/2;g.followCam.snap(s);})()`);await step();
}
async function layout() {
  const result=await evaluate(`(()=>{
    const bounds=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const panel=document.getElementById('goal-tracker');
    const obstacles=['top-left','top-center','start-btn','touch-stick','touch-actions','goal-notification'].map(id=>document.getElementById(id)).filter(e=>e&&e.getClientRects().length&&!e.hidden&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none').map(e=>({id:e.id,...bounds(e)}));
    const parts=Array.from(panel.querySelectorAll('.run-goal-row:not([hidden]),.run-goal-name,.run-goal-progress,.run-goal-count')).filter(e=>e.getClientRects().length).map(e=>({kind:e.className,text:e.textContent,...bounds(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
    return{width:innerWidth,height:innerHeight,panel:bounds(panel),obstacles,parts};
  })()`);
  const p=result.panel;
  assert.ok(p.left>=0&&p.right<=result.width+.5&&p.top>=0&&p.bottom<=result.height+.5,'checklist remains inside viewport');
  for(const obstacle of result.obstacles){
    const overlapX=Math.min(p.right,obstacle.right)-Math.max(p.left,obstacle.left);
    const overlapY=Math.min(p.bottom,obstacle.bottom)-Math.max(p.top,obstacle.top);
    assert.ok(overlapX<=0||overlapY<=0,`checklist overlaps ${obstacle.id}: ${JSON.stringify({panel:p,obstacle})}`);
  }
  for(const part of result.parts){
    assert.ok(part.left>=p.left-.5&&part.right<=p.right+.5,`${part.kind} escapes panel: ${part.text}`);
    assert.ok(part.clientWidth===0||part.scrollWidth<=part.clientWidth+1,`${part.kind} clips text: ${part.text}`);
  }
  return result;
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await mkdir(output, { recursive: true });
  await send('Page.navigate', { url }); await boot();

  await check('fresh goal run shows all seven active goals with zero progress and selected focus',async()=>{
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
    await career();await click('#overlay-msg');await step();
    const all=await rows();assert.deepEqual(all.map(r=>r.id),goalIds);
    assert.deepEqual(all.map(r=>r.count),['0/2,500','0/10,000','0/25,000','0/3,000','0/5','0/5','0/1']);
    assert.deepEqual(all.filter(r=>r.focused).map(r=>r.id),['skate']);
    assert.ok(all.every(r=>!r.complete&&r.accessible));
    assert.match(await evaluate('document.getElementById("tracker-completed").textContent'),/0\s*\/\s*7/);
    await shot('fresh-desktop');await layout();
    await evaluate('__game.startRun("free")');await step();
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
    await evaluate('__game.startRun("goals","skate")');await step();
    assert.deepEqual(await rows(),all,'an identical untouched run must restore the checklist after Free Skate');
    return all;
  });

  await check('every nonfocused counter updates from banked score, best combo and real pickup collisions',async()=>{
    await bank(1000);await pickup('letter-s');await pickup('cap-1');
    let all=await rows();
    assert.deepEqual(all.map(r=>r.count),['1,000/2,500','1,000/10,000','1,000/25,000','1,000/3,000','1/5','1/5','0/1']);
    const letters=await evaluate(`Array.from(document.querySelectorAll('[data-run-goal="skate"] .run-goal-letter')).map(e=>({letter:e.textContent,collected:e.classList.contains('collected'),accessible:e.getAttribute('aria-label')}))`);
    assert.deepEqual(letters.filter(l=>l.collected).map(l=>l.letter),['S']);
    assert.match(all.find(row=>row.id==='skate').accessible,/Collected letters:\s*S(?:\.|,|$)/i,'the row announces which SKATE letters are collected');
    await evaluate('__game.skater.combo.add("Unbanked fixture",9000)');await step();
    assert.deepEqual(await rows(),all,'live trick points do not count before landing');
    await evaluate('__game.skater.combo.reset()');
    await bank(3000);await pickup('secret-tape');await pose();
    all=await rows();
    assert.deepEqual(all.map(r=>r.count),['2,500/2,500','4,000/10,000','4,000/25,000','3,000/3,000','1/5','1/5','1/1']);
    assert.deepEqual(all.filter(r=>r.complete).map(r=>r.id),['high-score','combo','tape']);
    assert.ok(all.filter(r=>r.complete).every(r=>r.check.includes('✓')));
    assert.deepEqual(all.map(r=>r.id),goalIds,'newly completed rows remain visible in the current run');
    assert.match(await evaluate('document.getElementById("tracker-completed").textContent'),/3\s*\/\s*7/);
    // Let the existing score count-up and landed-trick caption settle before the
    // screenshot, using real frames rather than changing any HUD state.
    await step(144);await pose();assert.deepEqual(await rows(),all);
    await shot('partial-checked-desktop');await layout();return all;
  });

  await check('pause freezes checklist values and restart retires only full career goals',async()=>{
    await click('#start-btn');await step();assert.equal(await evaluate('__game.session.paused'),true);
    const before={rows:await rows(),time:await evaluate('__game.session.timeLeft')};await step(90);
    assert.deepEqual({rows:await rows(),time:await evaluate('__game.session.timeLeft')},before);
    await click('#restart-run');await step();
    const all=await rows();assert.deepEqual(all.map(r=>r.id),['pro-score','sick-score','skate','caps']);
    assert.deepEqual(all.map(r=>r.count),['0/10,000','0/25,000','0/5','0/5']);
    assert.ok(all.every(r=>!r.complete),'partial sets reset and retired rows cannot carry checks into the new run');
    assert.equal(await evaluate('document.querySelectorAll("[data-run-goal=skate] .run-goal-letter.collected").length'),0);
    await shot('returning-career');return all;
  });

  await check('overtime keeps score checklist legible, then results, board and Free Skate hide it',async()=>{
    await evaluate('__game.sessionClock.remaining=1/120;__game.skater.combo.add("Last combo",500)');await step();
    assert.equal(await evaluate('__game.session.overtime'),true);
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),false);
    assert.equal(await evaluate('document.getElementById("tracker-overtime").hidden||document.getElementById("tracker-overtime").classList.contains("hidden")'),false);
    const all=await rows();await pickup('cap-1');assert.deepEqual(await rows(),all,'overtime pickup attempts cannot change checklist counters');
    await evaluate('__game.skater.bankCombo(false)');await step();
    assert.equal(await evaluate('__game.session.mode'),'over');
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
    await click('#results-board');await step();
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
    await click('#free-skate');await step();
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
  });

  await check('all seven rows fit actual touch mode across portrait and short landscape sizes',async()=>{
    const mobile=new URL(url);mobile.searchParams.set('touch','1');
    await send('Page.navigate',{url:mobile.href});await sleep(200);await boot();
    await career();await resize(390,844);await click('#overlay-msg');await step();
    assert.equal(await evaluate('document.body.classList.contains("touch-enabled")&&!document.getElementById("touch-controls").hidden'),true);
    await bank(4000);await pickup('letter-s');await pickup('cap-1');await pose();
    await step(144);await pose();
    assert.deepEqual((await rows()).map(r=>r.id),goalIds);
    const sizes=[];
    for(const [width,height,name]of[[390,844,'phone-portrait'],[844,390,'phone-landscape'],[667,375,'phone-landscape-small'],[320,568,'phone-portrait-compact'],[568,320,'phone-landscape-compact']]){
      await resize(width,height);await pose();
      // A visible completion notice is intentional: it must not cover the checklist.
      await evaluate('__game.levelUI.clearNotifications();__game.levelUI.notifyGoal("high-score")');
      await shot(name);sizes.push(await layout());
    }
    return sizes;
  });

  await check('maximum useful counters and all seven completed rows remain readable on a small phone',async()=>{
    await resize(390,844);
    await bank(20999); // 24,999 total: widest useful Sick Score counter.
    await pose();await layout();
    assert.equal((await rows()).find(r=>r.id==='sick-score').count,'24,999/25,000');
    await bank(1);
    for(const id of ['letter-k','letter-a','letter-t','letter-e','cap-2','cap-3','cap-4','cap-5','secret-tape'])await pickup(id);
    await pose();
    const all=await rows();assert.equal(all.length,7);assert.ok(all.every(r=>r.complete&&r.check.includes('✓')));
    assert.match(await evaluate('document.getElementById("tracker-completed").textContent'),/7\s*\/\s*7/);
    await step(144);await pose();await shot('all-complete-phone');await layout();
    await click('#start-btn');await click('#restart-run');await step();
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'),true);
  });

  await check('checklist renders with no JavaScript, console, network or WebGL errors',async()=>{
    assert.deepEqual(browserErrors,[]);assert.equal(await evaluate('__game.renderer.getContext().getError()'),0);
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed=report.checks.every(c=>c.passed)&&browserErrors.length===0;report.browserErrors=browserErrors;
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`\n${report.checks.filter(c=>c.passed).length}/${report.checks.length} checklist browser checks passed. Artifacts: ${output}`);
  if(!report.passed)process.exitCode=1;
  closing=true;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}socket.close();}edge.kill();
  const rel=relative(resolve(tmpdir()),resolve(profile));
  if(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\')&&rel.startsWith('j2s-checklist-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}

// Full game-loop/DOM regression in an isolated, unsigned-in headless Edge profile.
// Run: node sim/levelcheck.js [http://127.0.0.1:5173/]
// A deterministic RAF driver advances the real application loop; scoring fixtures
// use Skater.bankCombo, and the opening S is collected by normal keyboard skating.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const output = resolve('screenshots/level-goals');
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'j2s-levelcheck-'));
const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), browserErrors = [], report = { checks: [], screenshots: [] };
let socket, id = 0, browserFailure = null, browserLog = '', closing = false;
edge.stderr.on('data', data => { browserLog = (browserLog + data).slice(-5000); });
function failed(message) {
  if (closing) return;
  browserFailure = new Error(`${message}\n${browserLog}`);
  for (const waiter of pending.values()) waiter.reject(browserFailure);
  pending.clear();
}
edge.on('error', error => failed(`Cannot launch Edge: ${error.message}`));
edge.on('exit', code => failed(`Edge exited (${code}) before the check completed`));
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
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error('FAIL: ' + name + '\n  ' + error.stack); }
}
async function step(frames = 1) { return evaluate(`__qa.step(${frames})`); }
async function click(selector) {
  const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw Error('Missing target'); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
const keys = { KeyW: ['w', 87], Enter: ['Enter', 13], Escape: ['Escape', 27], ArrowDown: ['ArrowDown', 40], Space: [' ', 32], Tab: ['Tab', 9] };
async function key(code, down) {
  const [key, windowsVirtualKeyCode] = keys[code];
  // Match native keyboard translation: Enter/Space need a character event for
  // browser-owned button/summary activation, alongside their keydown handlers.
  const text = code === 'Enter' ? '\r' : code === 'Space' ? ' ' : '';
  await send('Input.dispatchKeyEvent', { type: down ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp', code, key, windowsVirtualKeyCode, ...(down && text ? { text, unmodifiedText: text } : {}) });
}
async function tap(code) { await key(code, true); await key(code, false); await step(); }
async function resize(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(100);
  await evaluate(`window.dispatchEvent(new Event('resize'))`);
  await step();
}
async function shot(name) {
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
  report.screenshots.push(name + '.png');
}
async function boot() {
  for (let i = 0; i < 150; i++) {
    if (await evaluate('Boolean(window.__game?.goals)')) { await step(2); return; }
    await sleep(100);
  }
  throw new Error('The level did not initialize');
}
async function board() { await evaluate('__game.showGoalBoard()'); await step(); }
async function fixtureCombo(points = 3000) {
  return evaluate(`(() => { const s=__game.skater; s.combo.reset(); s.combo.add('QA banked combo',${points}); return s.bankCombo(false); })()`);
}
async function fixtureCareer(completed, selected = 'high-score') {
  // Each focus scenario starts from a specified saved career, independently of
  // earlier browser checks. Real board buttons and run-end paths exercise policy.
  await evaluate(`(() => {
    __qa.pad=null;
    __game.progress.completed=new Set(${JSON.stringify(completed)});
    __game.progress.bestScore=${completed.includes('sick-score') ? 25000 : completed.length ? 3000 : 0};
    __game.progress.bestCombo=${completed.length ? 3000 : 0};
    localStorage.setItem('j2s-pro-skater.genesee.goals.v1',JSON.stringify(__game.progress.snapshot()));
    __game.levelUI.selectGoal(${JSON.stringify(selected)});
    __game.showGoalBoard();
  })()`);
  await step();
}
async function finishTimedRun() {
  await evaluate('__game.sessionClock.remaining=1/120'); await step(2);
  assert.equal(await evaluate('__game.session.mode'),'over');
}

const driver = `(() => {
  const q=window.__qa={now:1000,next:1,frames:new Map(),pad:null};
  Object.defineProperty(performance,'now',{value:()=>q.now,configurable:true});
  window.requestAnimationFrame=callback=>{const id=q.next++;q.frames.set(id,callback);return id;};
  window.cancelAnimationFrame=id=>q.frames.delete(id);
  q.step=async(count=1)=>{for(let i=0;i<count;i++){q.now+=1000/60;const callbacks=[...q.frames.values()];q.frames.clear();for(const callback of callbacks)callback(q.now);if(i%12===11)await new Promise(r=>setTimeout(r,0));}return {frames:count,time:q.now};};
  Object.defineProperty(navigator,'getGamepads',{value:()=>q.pad?[q.pad]:[],configurable:true});
  q.connectPad=()=>{q.pad={id:'QA Standard Gamepad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};};
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
  await send('Page.navigate', { url });
  await boot();

  await check('board renders seven goals and fits desktop, portrait and landscape', async () => {
    assert.equal(await evaluate('document.querySelectorAll(".goal-row").length'), 7);
    const sizes = [];
    for (const [width, height, name] of [[1440, 900, 'desktop'], [390, 844, 'phone'], [844, 390, 'landscape']]) {
      await resize(width, height);
      await evaluate('document.getElementById("overlay").scrollTop=0');
      const bounds = await evaluate(`(() => {const r=document.querySelector('.level-shell').getBoundingClientRect();const o=document.getElementById('overlay');return {left:r.left,right:r.right,scrollWidth:o.scrollWidth,width:o.clientWidth,scrollHeight:o.scrollHeight,height:o.clientHeight};})()`);
      await shot('board-' + name);
      assert.ok(bounds.left >= -1 && bounds.right <= width + 1, JSON.stringify(bounds));
      assert.ok(bounds.scrollWidth <= bounds.width + 1, 'horizontal overflow: ' + name);
      sizes.push({ width, height, bounds });
    }
    await resize(1440, 900);
    return sizes;
  });

  await check('mouse/keyboard goal selection changes focus without launching a run', async () => {
    await click('[data-goal="combo"]'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'title');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'), 'combo');
    await tap('ArrowDown');
    assert.equal(await evaluate('document.activeElement.dataset.goal'), 'skate');
    await tap('Enter');
    assert.equal(await evaluate('__game.session.mode'), 'title');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'), 'skate');
  });

  await check('starting the focused SKATE run collects S through actual keyboard skating', async () => {
    await click('#overlay-msg'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'playing');
    assert.equal(await evaluate('__game.session.focusGoal'), 'skate');
    assert.equal(await evaluate('document.getElementById("tracker-name").textContent'), 'Collect S-K-A-T-E');
    await shot('playing-start');
    await key('KeyW', true); await step(75); await key('KeyW', false); await step();
    const result = await evaluate(`({position:__game.skater.pos.toArray(),state:__game.skater.state,collected:[...__game.goals.collected],visible:__game.collectibles.group.visible,tracker:document.getElementById('tracker-count').textContent})`);
    assert.ok(result.collected.includes('letter-s'), JSON.stringify(result));
    assert.notEqual(result.state, 'bail');
    assert.equal(result.visible, true);
    assert.equal(result.tracker, '1 / 5');
    await shot('playing-letter-collected');
    for (const [width,height,name] of [[390,844,'phone'],[844,390,'landscape']]) {
      await resize(width,height); await shot('playing-' + name);
      assert.ok(await evaluate(`(() => {const r=document.getElementById('goal-tracker').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()`), 'tracker leaves ' + name);
    }
    await resize(1440,900);
    return result;
  });

  await check('controls pause the run and Escape closes them without losing position', async () => {
    await tap('Tab');
    assert.equal(await evaluate('__game.session.paused'), true);
    const before = await evaluate('({time:__game.session.timeLeft,pos:__game.skater.pos.toArray()})');
    await step(90);
    assert.deepEqual(await evaluate('({time:__game.session.timeLeft,pos:__game.skater.pos.toArray()})'), before);
    await tap('Escape');
    assert.equal(await evaluate('__game.session.paused'), false);
    assert.equal(await evaluate('document.getElementById("controls-panel").classList.contains("hidden")'), true);
  });

  await check('a real bank event awards both 3,000-point goals and saves immediately', async () => {
    assert.equal(await fixtureCombo(3000), 3000);
    await step();
    const result = await evaluate(`({score:__game.skater.score,run:__game.goals.snapshot(),career:__game.progress.snapshot(),saved:JSON.parse(localStorage.getItem('j2s-pro-skater.genesee.goals.v1'))})`);
    assert.equal(result.score, 3000);
    assert.equal(result.run.bestCombo, 3000);
    assert.deepEqual(result.career.completed, ['high-score', 'combo']);
    assert.deepEqual(result.saved, result.career);
    assert.equal(result.career.bestScore, 3000);
    return result.career;
  });

  await check('pause freezes clock, skater and goal notification exactly', async () => {
    await tap('Escape');
    assert.equal(await evaluate('__game.session.paused'), true);
    const before = await evaluate(`({time:__game.session.timeLeft,pos:__game.skater.pos.toArray(),notice:__game.levelUI.noticeRemaining,queue:__game.levelUI.noticeQueue.length})`);
    assert.ok(before.notice > 0);
    await step(45);
    assert.deepEqual(await evaluate(`({time:__game.session.timeLeft,pos:__game.skater.pos.toArray(),notice:__game.levelUI.noticeRemaining,queue:__game.levelUI.noticeQueue.length})`), before);
    await shot('paused');
    return before;
  });

  await check('restart resets partial collections and score while career completion remains', async () => {
    await click('#restart-run'); await step();
    assert.equal(await evaluate('__game.session.paused'), false);
    assert.equal(await evaluate('__game.goals.collected.size'), 0);
    assert.equal(await evaluate('__game.skater.score'), 0);
    assert.ok(await evaluate('__game.session.timeLeft > 119.9'));
    assert.deepEqual(await evaluate('__game.progress.snapshot().completed'), ['high-score', 'combo']);
    assert.equal(await evaluate('__game.levelUI.noticeRemaining'), 0);
    assert.equal(await evaluate('__game.collectibles.items.find(p=>p.definition.id==="letter-s").root.visible'), true);
    await tap('Escape'); await click('#goals-menu'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'title');
    assert.equal(await evaluate('document.getElementById("board-best-score").textContent'), '3,000');
    await shot('board-progress');
  });

  await check('saved goal completion and records survive a full reload', async () => {
    await send('Page.reload', { ignoreCache: true }); await sleep(200); await boot();
    assert.deepEqual(await evaluate('__game.progress.snapshot()'), { completed: ['high-score', 'combo'], bestScore: 3000, bestCombo: 3000 });
    assert.equal(await evaluate('document.querySelectorAll(".goal-row.complete").length'), 2);
    assert.equal(await evaluate('__game.levelUI.selectedGoal'), 'pro-score', 'saved completion should skip the finished High Score goal');
    assert.equal(await evaluate('document.querySelector(".goal-row.selected").dataset.goal'), 'pro-score');
    assert.equal(await evaluate('document.getElementById("mission-title").textContent'), 'Pro Score');
  });

  await check('free skate is untimed with no pickups, tracker or career writes', async () => {
    const saved = await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")');
    await click('#free-skate'); await step(30);
    await fixtureCombo(25000); await step();
    assert.equal(await evaluate('__game.session.timeLeft === Infinity'), true);
    assert.equal(await evaluate('__game.session.mode'), 'playing');
    assert.equal(await evaluate('__game.collectibles.group.visible'), false);
    assert.equal(await evaluate('document.getElementById("goal-tracker").classList.contains("hidden")'), true);
    assert.equal(await evaluate('__game.goals.collected.size'), 0);
    assert.equal(await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")'), saved);
    assert.equal(await evaluate('__game.skater.score'), 25000);
    await shot('free-skate');
  });

  await check('overtime hides pickups, banks the final combo and records results exactly once', async () => {
    await board(); await click('#overlay-msg');
    await evaluate(`__game.sessionClock.remaining=1/120; __game.skater.combo.add('QA final combo',3000);`);
    await step();
    assert.equal(await evaluate('__game.session.overtime'), true);
    assert.equal(await evaluate('document.getElementById("timer").textContent'), 'LAND IT!');
    assert.equal(await evaluate('__game.collectibles.group.visible'), false);
    const scoresBefore = await evaluate('__game.highScores.list.length');
    await evaluate('__game.skater.bankCombo(false)'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'over');
    assert.equal(await evaluate('document.getElementById("results-score").textContent'), '3,000');
    assert.equal(await evaluate('__game.highScores.list.length'), scoresBefore + 1);
    await shot('results-desktop');
    const before = await evaluate(`({pos:__game.skater.pos.toArray(),score:__game.skater.score,goals:__game.goals.snapshot(),scores:__game.highScores.list})`);
    await step(30);
    assert.deepEqual(await evaluate(`({pos:__game.skater.pos.toArray(),score:__game.skater.score,goals:__game.goals.snapshot(),scores:__game.highScores.list})`), before);
    for (const [width,height,name] of [[390,844,'phone'],[844,390,'landscape']]) { await resize(width,height); await evaluate('document.getElementById("overlay").scrollTop=0'); await shot('results-' + name); }
    await resize(1440,900);
    return { finalScore: before.score, recordsAdded: 1 };
  });

  await check('BEST RUNS keyboard disclosure does not restart the finished session', async () => {
    await click('#best-runs-details > summary');
    const before = await evaluate('document.getElementById("best-runs-details").open');
    await tap('Enter');
    assert.equal(await evaluate('__game.session.mode'), 'over');
    assert.equal(await evaluate('document.getElementById("best-runs-details").open'), !before);
  });

  await check('bailing the last combo ends overtime without awarding its score', async () => {
    await click('#retry-run');
    await evaluate(`__game.sessionClock.remaining=1/120; __game.skater.combo.add('QA lost combo',12000);`);
    await step();
    assert.equal(await evaluate('__game.session.overtime'), true);
    await evaluate('__game.skater.bail("trick")'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'over');
    assert.equal(await evaluate('__game.goals.score'), 0);
    assert.equal(await evaluate('document.getElementById("results-score").textContent'), '0');
    assert.equal(await evaluate('__game.progress.has("pro-score")'), false);
  });

  await check('gamepad D-pad/A selects and Start launches without carrying held skating inputs', async () => {
    await board();
    await evaluate('__qa.connectPad()'); await step();
    await evaluate('__qa.button(12,true)'); await step();
    await evaluate('__qa.button(12,false)'); await step();
    assert.equal(await evaluate('document.activeElement.dataset.goal'), 'tape');
    await evaluate('__qa.button(0,true)'); await step();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'), 'tape');
    assert.equal(await evaluate('__game.session.mode'), 'title');
    await evaluate('__qa.pad.axes[1]=-1; __qa.button(9,true)'); await step();
    assert.equal(await evaluate('__game.session.mode'), 'playing');
    assert.equal(await evaluate('__game.session.focusGoal'), 'tape');
    await evaluate('__qa.button(9,false)'); await step(12);
    assert.equal(await evaluate('__game.skater.crouching'), false);
    assert.equal(await evaluate('__game.input.state.push'), 0);
    assert.equal(await evaluate('__game.input.state.ollie'), false);
    await evaluate('__qa.pad.axes[1]=0; __qa.button(0,false)'); await step(2);
    await evaluate('__qa.button(0,true)'); await step(2);
    assert.equal(await evaluate('__game.skater.crouching'), true);
    await evaluate('__qa.button(0,false)'); await step(2);
    assert.equal(await evaluate('__game.skater.state'), 'air');
    await evaluate('__qa.pad=null'); await step();
  });

  await check('manual completed-goal replay is respected, then results advance using earlier career completion', async () => {
    await fixtureCareer(['high-score','combo']);
    // Let the preceding controller-connection toast expire on the idle board so
    // the focus screenshots show only the user-facing next-goal state.
    await step(165);
    await click('[data-goal="high-score"]'); await click('#overlay-msg'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'high-score');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'high-score');
    await fixtureCombo(100); await step(3);
    assert.equal(await evaluate('__game.session.focusGoal'),'high-score','focus must not move midrun');
    assert.equal(await evaluate('document.getElementById("tracker-name").textContent'),'High Score');
    assert.deepEqual(await evaluate('__game.goals.snapshot().completed'),[]);
    await finishTimedRun();
    assert.deepEqual(await evaluate('__game.goals.snapshot().newlyCompleted'),[]);
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'pro-score','career completion matters even when no goal was completed this run');
    assert.match(await evaluate('document.querySelector(".results-next .level-eyebrow").textContent'),/UP NEXT/);
    assert.match(await evaluate('document.querySelector(".results-next h2").textContent'),/Pro Score/i);
    assert.match(await evaluate('document.getElementById("retry-run").textContent'),/START NEXT RUN/);
    await shot('focus-next-results');
    await resize(390,844);
    await evaluate('document.querySelector(".results-next").scrollIntoView({block:"center"})');
    assert.ok(await evaluate('(() => {const r=document.querySelector(".results-next").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()'));
    await shot('focus-next-results-phone');
    await resize(1440,900);
    await click('#retry-run'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'pro-score');
    assert.equal(await evaluate('document.getElementById("tracker-name").textContent'),'Pro Score');
    assert.equal(await evaluate('__game.skater.score'),0);
    await tap('Escape'); await click('#goals-menu'); await step();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'pro-score');
    assert.equal(await evaluate('document.getElementById("mission-status").textContent'),'TO DO');
    await shot('focus-next-board');
  });

  await check('an unfinished chosen collectible remains focused through score completion, results and the board', async () => {
    await fixtureCareer(['high-score','combo']);
    await click('[data-goal="caps"]'); await click('#overlay-msg'); await step();
    await fixtureCombo(10000); await step();
    assert.equal(await evaluate('__game.progress.has("pro-score")'),true);
    assert.equal(await evaluate('__game.session.focusGoal'),'caps');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'caps');
    await finishTimedRun();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'caps');
    assert.match(await evaluate('document.getElementById("retry-run").textContent'),/RUN IT BACK/);
    await click('#retry-run'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'caps');
    await finishTimedRun(); await click('#results-board'); await step();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'caps');
    assert.equal(await evaluate('document.getElementById("mission-title").textContent'),'Bottle Cap Hunt');
  });

  await check('pause restart advances a newly completed focus without changing it during the current run', async () => {
    await fixtureCareer([]);
    await click('#overlay-msg'); await step(); await fixtureCombo(2500); await step(3);
    assert.equal(await evaluate('__game.progress.has("high-score")'),true);
    assert.equal(await evaluate('__game.session.focusGoal'),'high-score');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'high-score');
    assert.equal(await evaluate('document.getElementById("tracker-name").textContent'),'High Score');
    await tap('Escape'); await click('#restart-run'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'pro-score');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'pro-score');
    assert.equal(await evaluate('document.getElementById("tracker-name").textContent'),'Pro Score');
    assert.equal(await evaluate('__game.skater.score'),0);
    assert.ok(await evaluate('__game.session.timeLeft > 119.9'));
  });

  await check('finished focus skips multiple completed goals and picks the first unfinished board entry', async () => {
    await fixtureCareer(['high-score','pro-score','sick-score','combo','caps'],'caps');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'skate');
    await click('[data-goal="caps"]'); await click('#overlay-msg'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'caps');
    await finishTimedRun();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'skate');
    await click('#retry-run'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'skate');
  });

  await check('all-complete careers keep a valid chosen focus for results, retry and board', async () => {
    await fixtureCareer(['high-score','pro-score','sick-score','combo','skate','caps','tape'],'tape');
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'tape');
    await click('#overlay-msg'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'tape');
    await finishTimedRun();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'tape');
    assert.match(await evaluate('document.getElementById("retry-run").textContent'),/RUN IT BACK/);
    await click('#retry-run'); await step();
    assert.equal(await evaluate('__game.session.focusGoal'),'tape');
    await finishTimedRun(); await click('#results-board'); await step();
    assert.equal(await evaluate('__game.levelUI.selectedGoal'),'tape');
    assert.equal(await evaluate('document.querySelector(".goal-row.selected").dataset.goal'),'tape');
  });

  await check('next-focus policy leaves free-skate restart and replay untimed without career writes', async () => {
    await fixtureCareer(['high-score','combo']);
    await click('[data-goal="high-score"]');
    const before=await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")');
    await click('#free-skate'); await step(); await fixtureCombo(25000); await step();
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('__game.session.timeLeft === Infinity'),true);
    await tap('Escape'); await click('#restart-run'); await step();
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('__game.session.timeLeft === Infinity'),true);
    await evaluate('__game.endRun()'); await step();
    assert.match(await evaluate('document.getElementById("retry-run").textContent'),/RUN IT BACK/);
    await click('#retry-run'); await step();
    assert.equal(await evaluate('__game.session.runMode'),'free');
    assert.equal(await evaluate('__game.session.timeLeft === Infinity'),true);
    assert.equal(await evaluate('localStorage.getItem("j2s-pro-skater.genesee.goals.v1")'),before);
  });

  await check('normal browser run has no JavaScript, console or network errors', async () => {
    assert.deepEqual(browserErrors, []);
    assert.equal(await evaluate('__game.renderer.getContext().getError()'), 0);
  });

  await check('lowfx mode renders goal runs and pickups without shadows or GL errors', async () => {
    await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'lowfx' });
    await sleep(200); await boot();
    await click('#overlay-msg'); await step(45);
    assert.equal(await evaluate('__game.renderer.shadowMap.enabled'), false);
    assert.equal(await evaluate('__game.collectibles.group.visible'), true);
    assert.equal(await evaluate('__game.renderer.getContext().getError()'), 0);
    return evaluate('({calls:__game.renderer.info.render.calls,triangles:__game.renderer.info.render.triangles,textures:__game.renderer.info.memory.textures})');
  });

  await check('blocked localStorage getter still boots and retains in-memory goals', async () => {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage blocked for QA','SecurityError');}});` });
    await send('Page.reload', { ignoreCache: true }); await sleep(200); await boot();
    await click('#overlay-msg'); await step(); await fixtureCombo(3000); await step();
    assert.deepEqual(await evaluate('__game.progress.snapshot().completed'), ['high-score', 'combo']);
    assert.equal(await evaluate('__game.session.mode'), 'playing');
  });
} catch (error) {
  report.checks.push({ name: 'browser harness initialization', passed: false, error: error.stack });
  console.error(error.stack);
} finally {
  report.passed = report.checks.every(check => check.passed) && browserErrors.length === 0;
  report.browserErrors = browserErrors;
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.checks.filter(check => check.passed).length}/${report.checks.length} level browser checks passed. Artifacts: ${output}`);
  if (!report.passed) process.exitCode = 1;
  closing = true;
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  edge.kill();
  // Delete only this exact disposable profile after validating its absolute parent/name.
  const rel = relative(resolve(tmpdir()), resolve(profile));
  if (!isAbsolute(rel) && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith('j2s-levelcheck-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}

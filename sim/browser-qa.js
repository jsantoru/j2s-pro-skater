// Small shared CDP driver for focused integration checks. It only controls its
// own disposable, unsigned-in Edge process and never a user's open browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const driver = `(()=>{const q=window.__qa={bootId:Math.random().toString(36),now:1000,next:1,frames:new Map(),pad:null};
  Object.defineProperty(performance,'now',{value:()=>q.now,configurable:true});
  window.requestAnimationFrame=cb=>{const id=q.next++;q.frames.set(id,cb);return id;};
  window.cancelAnimationFrame=id=>q.frames.delete(id);
  q.step=async(count=1)=>{for(let i=0;i<count;i++){q.now+=1000/60;const callbacks=[...q.frames.values()];q.frames.clear();for(const cb of callbacks)cb(q.now);if(i%12===11)await new Promise(r=>setTimeout(r,0));}};
  Object.defineProperty(navigator,'getGamepads',{value:()=>q.pad?[q.pad]:[],configurable:true});
  q.connectPad=()=>{q.pad={id:'Character QA Gamepad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};};
  q.button=(index,on)=>{q.pad.buttons[index]={pressed:on,touched:on,value:on?1:0};};
})();`;

export async function browserQA({ url, output, name = 'focused', bootExpression = 'Boolean(window.__game?.collectibles)' }) {
  output = resolve(output);
  const prefix = `j2s-${name}-`, profile = await mkdtemp(join(tmpdir(), prefix));
  const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const edge = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-features=SyntheticPointerActions', '--disable-background-timer-throttling', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const pending = new Map(), errors = [], contacts = new Map();
  const report = { url, recordedAt: new Date().toISOString(), environment: { browser: 'Microsoft Edge (isolated headless)', platform: process.platform, animation: 'Deterministic real application RAF', mobile: 'Touch emulation; no physical device test' }, checks: [], screenshots: [] };
  let socket, id = 0, failure, log = '', closing = false;
  edge.stderr.on('data', data => { log = (log + data).slice(-5000); });
  function fail(message) {
    if (closing) return;
    failure = new Error(`${message}\n${log}`);
    for (const waiter of pending.values()) waiter.reject(failure);
    pending.clear();
  }
  edge.on('error', error => fail(`Cannot launch Edge: ${error.message}`));
  edge.on('exit', code => fail(`Edge exited (${code}) before checks completed`));
  async function send(method, params = {}) {
    if (failure) throw failure;
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
  const step = (count = 1) => evaluate(`__qa.step(${count})`);
  async function boot(previousId = null) {
    for (let i = 0; i < 150; i++) {
      try {
        if (await evaluate(`window.__qa?.bootId!==${JSON.stringify(previousId)} && (${bootExpression})`)) {
          await evaluate('Promise.all([__game.collectibles.ready,document.fonts.ready])');
          await step(2); return;
        }
      } catch (error) {
        if (!/Execution context was destroyed|Cannot find context|__game is not defined/.test(error.message)) throw error;
      }
      await sleep(100);
    }
    throw new Error('Game did not initialize');
  }
  async function navigate(target = url) { const previous = await evaluate('window.__qa?.bootId') ?? null; contacts.clear(); await send('Page.navigate', { url: target }); await boot(previous); }
  async function reload() { const previous = await evaluate('window.__qa?.bootId') ?? null; contacts.clear(); await send('Page.reload'); await boot(previous); }
  async function resize(width, height, touch = false) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
    await sleep(100); await evaluate('window.dispatchEvent(new Event("resize"))'); await step();
  }
  async function shot(name) {
    await sleep(100);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64')); report.screenshots.push(name + '.png');
  }
  async function point(selector) {
    return evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing selector '+${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  }
  async function click(selector) {
    const p = await point(selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p }); await step(2);
  }
  const keys = { Enter: ['Enter', 13], Escape: ['Escape', 27], Space: [' ', 32], Tab: ['Tab', 9], ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowLeft: ['ArrowLeft', 37] };
  async function key(code, down, repeat = false) {
    const [key, windowsVirtualKeyCode] = keys[code], text = code === 'Enter' ? '\r' : code === 'Space' ? ' ' : '';
    await send('Input.dispatchKeyEvent', { type: down ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp', code, key, windowsVirtualKeyCode, autoRepeat: repeat, ...(down && text ? { text, unmodifiedText: text } : {}) });
  }
  async function tap(code) { await key(code, true); await key(code, false); await step(2); }
  async function pad(button) { await evaluate(`__qa.button(${button},true)`); await step(); await evaluate(`__qa.button(${button},false)`); await step(); }
  async function down(contactId, selector) {
    contacts.set(contactId, { id: contactId, ...await point(selector), radiusX: 4, radiusY: 4, force: 1 });
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contacts.get(contactId)] });
  }
  async function up(contactId) { const p = contacts.get(contactId); contacts.delete(contactId); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); }
  async function touch(selector, contactId = 20) { await down(contactId, selector); await up(contactId); await step(2); }
  async function check(label, run) {
    if (process.env.QA_CHECK && !label.includes(process.env.QA_CHECK)) return;
    try { const detail = await run(); report.checks.push({ name: label, passed: true, detail }); console.log('PASS: ' + label); }
    catch (error) { report.checks.push({ name: label, passed: false, error: error.stack }); console.error('FAIL: ' + label + '\n' + error.stack); }
  }
  async function close() {
    report.browserErrors = errors; report.passed = report.checks.length > 0 && report.checks.every(check => check.passed) && errors.length === 0;
    await mkdir(output, { recursive: true }); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.checks.filter(c => c.passed).length}/${report.checks.length} checks passed. Artifacts: ${output}`);
    if (!report.passed) process.exitCode = 1;
    closing = true;
    if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); } edge.kill();
    const rel = relative(resolve(tmpdir()), resolve(profile));
    if (!isAbsolute(rel) && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\') && rel.startsWith(prefix)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      if (failure) throw failure;
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
    }
    assert(port, 'Headless Edge did not start\n' + log);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
    };
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: driver });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await mkdir(output, { recursive: true }); await navigate();
  } catch (error) { report.checks.push({ name: 'Browser initialization', passed: false, error: error.stack }); await close(); throw error; }
  return { report, errors, evaluate, send, step, boot, navigate, reload, resize, shot, click, key, tap, pad, down, up, touch, check, close };
}

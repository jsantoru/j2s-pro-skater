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
let socket, id = 0;
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
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(window.__game)')) break; await sleep(100); }
  if (!await evaluate('Boolean(window.__game)')) throw new Error('Game did not initialize');
  await mkdir(output, { recursive: true });
  await shot('title');
  console.log('Headless normal frame timing (not a hardware benchmark):', JSON.stringify(await evaluate(`new Promise(resolve => {const times=[]; let prev=performance.now(); const tick=now=>{times.push(now-prev);prev=now;if(times.length<90)requestAnimationFrame(tick);else{times.sort((a,b)=>a-b);resolve({medianMs:times[45],p95Ms:times[85]});}};requestAnimationFrame(tick);})`)));
  console.log('Initial renderer:', JSON.stringify(await evaluate(`({ calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures, shadow: __game.renderer.shadowMap.enabled, colliders: __game.level.colliders.length, rails: __game.level.rails.length })`)));
  // Freeze only this disposable QA page so views and rig poses are reproducible.
  await evaluate(`window.requestAnimationFrame = () => 0;`); await sleep(100);
  await evaluate(`__game.startRun(); document.querySelectorAll('#hud, #overlay, #controls').forEach(e => e.style.display = 'none');`);
  await evaluate(`window.qaPose = (state, extra = {}) => { const g = __game; g.character.root.position.set(-4,0,14); g.character.root.quaternion.identity(); const sk = Object.assign({state, crouch:0, landSquash:0, pushing:0, stance:1, lean:0, speed:0, bailT:0, trick:null, grind:null}, extra); for(let i=0;i<180;i++) g.character.update(sk,1/60,0); g.scene.updateMatrixWorld(true); }; window.qaView = (pos, target) => { const g = __game; g.camera.position.set(...pos); g.camera.fov=45; g.camera.lookAt(...target); g.camera.updateProjectionMatrix(); g.renderer.render(g.scene,g.camera); }; qaPose('ride'); qaView([-7.2,1.7,17.4],[-4,0.88,14]);`);
  await shot('skater');
  await evaluate(`qaPose('air',{trick:{name:'Kickflip',kind:'flip',t:0.22,dur:0.5}}); qaView([-6.3,1.4,16.5],[-4,1.05,14]);`);
  await shot('kickflip');
  await evaluate(`qaPose('ride'); qaView([-19,5.8,20],[0,1,-5]);`); await shot('warehouse');
  await evaluate(`qaView([-17,3.5,9],[-32,1.3,1]);`); await shot('transitions');
  await evaluate(`qaPose('ride'); __game.character.body.visible=false; qaView([-4.65,0.37,14.73],[-4,0.13,14]);`); await shot('board');
  await evaluate(`__game.character.board.rotation.z=Math.PI; __game.character.board.position.y=0.3; qaView([-4.5,0.6,14.65],[-4,0.18,14]);`); await shot('board-underside');
  console.log('Render check:', JSON.stringify(await evaluate(`({ glError: __game.renderer.getContext().getError(), calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles })`)));
  // Check lowfx as a fresh load, including the true frame loop and keyboard controls.
  await send('Page.navigate', { url: `${url}${url.includes('?') ? '&' : '?'}lowfx` }); await sleep(200);
  for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(window.__game)')) break; await sleep(100); }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(650);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(140);
  const live = await evaluate(`({state:__game.skater.state, speed:__game.skater.speed, shadows:__game.renderer.shadowMap.enabled, pixelRatio:__game.renderer.getPixelRatio(), glError:__game.renderer.getContext().getError()})`);
  console.log('Live keyboard ollie / lowfx:', JSON.stringify(live));
  if (live.shadows || live.pixelRatio !== 1 || live.glError || live.state !== 'air') throw new Error('Live lowfx/ollie check failed');
  await shot('lowfx-playing');
  const timing = await evaluate(`new Promise(resolve => { const times=[]; let prev=performance.now(); const tick=now=>{times.push(now-prev);prev=now;if(times.length<90) requestAnimationFrame(tick);else {times.sort((a,b)=>a-b);resolve({medianMs:times[45],p95Ms:times[85]});}}; requestAnimationFrame(tick); })`);
  console.log('Headless lowfx frame timing (not a hardware benchmark):', JSON.stringify(timing));
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

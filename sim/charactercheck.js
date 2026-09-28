// Actual menu/controller/touch flows and cosmetic-only character integration.
// node sim/charactercheck.js [url] [output-directory] [--export-portraits]
// The exporter alone uses dev imports; normal QA works on a production bundle.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browserQA } from './browser-qa.js';

const args = process.argv.slice(2), exporting = args.includes('--export-portraits');
const positional = args.filter(arg => !arg.startsWith('--'));
const url = positional[0] || 'http://127.0.0.1:5173/';
const output = resolve(positional[1] || 'screenshots/characters');
const qa = await browserQA({ url, output, name: 'characters', bootExpression: 'Boolean(window.__game?.characterSelection)' });
const { evaluate, send, step, reload, navigate, resize, shot, click, key, tap, pad, touch, check, report } = qa;
const storageKey = 'j2s-pro-skater.character.v1';
const mode = async expected => assert.equal(await evaluate('__game.session.mode'), expected);
const selected = () => evaluate('({model:__game.character.characterId,saved:__game.characterSelection.id,draft:__game.frontEnd.draftCharacterId})');
const saved = () => evaluate(`localStorage.getItem(${JSON.stringify(storageKey)})`);
async function select(id) {
  await evaluate('__game.showHome();__game.showCharacterSelect()'); await step();
  await click('#fe-character-' + id); await click('#fe-character-confirm'); await mode('home');
  assert.equal((await selected()).model, id);
}
async function layout() {
  const state = await evaluate(`(()=>{const r=document.getElementById('front-end');return{width:innerWidth,height:innerHeight,scroll:r.scrollWidth,client:r.clientWidth,page:document.documentElement.scrollWidth};})()`);
  assert(state.scroll <= state.client + 1 && state.page <= state.width + 1, 'Horizontal overflow: ' + JSON.stringify(state));
  const targets = [];
  for (const id of await evaluate('__game.frontEnd.buttons().map(e=>e.id)')) {
    const box = await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const clipped=[...e.querySelectorAll('b,small,.fe-character-card-name,.fe-character-affiliation,.fe-character-wip,.fe-character-homegrown')].filter(t=>{const range=document.createRange();range.selectNodeContents(t);return [...range.getClientRects()].some(b=>b.left<r.left-.5||b.right>r.right+.5||b.top<r.top-.5||b.bottom>r.bottom+.5);}).map(t=>t.textContent);return{id:e.id,w:r.width,h:r.height,left:r.left,right:r.right,clipped,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e};})()`);
    assert(box.w >= 44 && box.h >= 44, 'Small target: ' + JSON.stringify(box));
    assert(box.left >= -.5 && box.right <= state.width + .5 && box.hit, 'Clipped/covered target: ' + JSON.stringify(box)); targets.push(box);
    assert.deepEqual(box.clipped, [], 'Button text exceeds its hit target: ' + box.id);
  }
  await evaluate('document.getElementById("front-end").scrollTop=0'); return { ...state, targets };
}

try {
  if (exporting) {
    await check('actual models export matching transparent portraits and review angles', async () => {
      await evaluate(`(async()=>{
        const [{Character},T]=await Promise.all([import('/src/character.js'),import('/node_modules/three/build/three.module.js')]);
        const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
        renderer.setSize(800,1000);renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);
        renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
        const scene=new T.Scene();scene.environment=__game.scene.environment;scene.environmentIntensity=.5;
        scene.add(new T.HemisphereLight(0xdbeafb,0xb1a08b,2.15));
        const key=new T.DirectionalLight(0xfff2df,3.1);key.position.set(-3,5,4);scene.add(key);
        const fill=new T.DirectionalLight(0xc9dffb,1.8);fill.position.set(3,3,-3);scene.add(fill);
        const camera=new T.PerspectiveCamera(32,.8,.1,50);
        window.__portrait={renderer,scene,camera,Character,model:null,
          render(id,angle){this.model?.dispose();this.model=new Character({characterId:id});scene.add(this.model.root);
            for(let i=0;i<60;i++)this.model.update(__game.skater,1/60,0);
            if(angle==='portrait'){this.model.head.rotation.x=-.30;this.model.head.rotation.y=.72;}
            camera.position.set(...({portrait:[-3.1,1.62,3.1],front:[-4.4,1.25,0],side:[0,1.25,4.4],back:[4.4,1.25,0]}[angle]));camera.lookAt(0,.83,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
            return renderer.domElement.toDataURL(angle==='portrait'?'image/webp':'image/png',.95).split(',')[1];},
          dispose(){this.model?.dispose();renderer.dispose();renderer.forceContextLoss();}};
      })()`);
      const destination = resolve('public/textures/characters'); await mkdir(destination, { recursive: true });
      for (const id of ['joe', 'aaron']) for (const angle of ['portrait', 'front', 'side', 'back']) {
        const data = await evaluate(`__portrait.render(${JSON.stringify(id)},${JSON.stringify(angle)})`);
        const path = angle === 'portrait' ? join(destination, id + '.webp') : join(output, id + '-' + angle + '.png');
        await writeFile(path, Buffer.from(data, 'base64')); report.screenshots.push(path);
      }
      await evaluate('__portrait.dispose();delete window.__portrait');
      // Portraits deliberately do not exist on the exporter's first boot.
      for (let i = qa.errors.length - 1; i >= 0; i--) if (qa.errors[i].url?.includes('/textures/characters/')) qa.errors.splice(i, 1);
      return { dimensions: [800, 1000], transparent: true, destination };
    });
  } else {
    await check('Joe boots by default and mouse previews do not commit until confirmation', async () => {
      assert.equal((await selected()).model, 'joe'); await mode('home');
      await click('#fe-skater'); await mode('characters');
      const images = await evaluate('[...document.querySelectorAll(".fe-character-portrait img")].map(i=>({ready:i.complete,w:i.naturalWidth,h:i.naturalHeight}))');
      for (const img of images) assert(img.ready && img.w === 800 && img.h === 1000, 'Actual model portrait missing');
      const before = await saved(); await shot('selector-joe-desktop');
      await click('#fe-character-aaron');
      assert.deepEqual(await selected(), { model: 'joe', saved: 'joe', draft: 'aaron' }); assert.equal(await saved(), before);
      assert.equal(await evaluate('document.getElementById("fe-character-aaron").getAttribute("aria-pressed")'), 'true');
      await shot('selector-aaron-desktop'); await click('#fe-character-confirm'); await mode('home');
      assert.equal((await selected()).model, 'aaron'); assert.equal(JSON.parse(await saved()).characterId, 'aaron');
      assert.equal(await evaluate('document.querySelector("#fe-skater .fe-selected-character").textContent'), 'AARON');
    });

    await check('keyboard navigation, held Enter, and Escape preserve intentional draft/confirm behavior', async () => {
      await select('joe'); await click('#fe-skater');
      assert.equal(await evaluate('document.activeElement.id'), 'fe-character-joe');
      await tap('ArrowRight'); assert.equal(await evaluate('document.activeElement.id'), 'fe-character-aaron');
      await key('Enter', true); await step(4); for (let i = 0; i < 4; i++) { await key('Enter', true, true); await step(); }
      await key('Enter', false); await mode('characters'); assert.equal((await selected()).saved, 'joe');
      await tap('Escape'); await mode('home'); assert.equal((await selected()).model, 'joe');
      await click('#fe-skater'); assert.equal((await selected()).draft, 'joe');
      await tap('ArrowRight'); await tap('Enter'); await tap('ArrowRight');
      assert.equal(await evaluate('document.activeElement.id'), 'fe-character-confirm');
      await tap('Enter'); await mode('home'); assert.equal((await selected()).saved, 'aaron');
    });

    await check('gamepad drafts, cancels to originating level selection, and Start confirms focused skater', async () => {
      await select('joe'); await click('#fe-play'); await click('#fe-level-skater'); await mode('characters');
      await evaluate('__qa.connectPad()'); await step(); await pad(15); await pad(0);
      assert.equal((await selected()).draft, 'aaron'); assert.equal((await selected()).saved, 'joe');
      await pad(1); await mode('levels'); assert.equal((await selected()).model, 'joe');
      await click('#fe-level-skater'); await pad(15); await pad(9); await mode('levels');
      assert.equal((await selected()).model, 'aaron'); await evaluate('__qa.pad=null');
    });

    await check('settings and controls isolate selector focus and close back to the same draft', async () => {
      await select('joe'); await click('#fe-skater'); await click('#fe-character-aaron'); await click('#fe-settings');
      assert.equal(await evaluate('__game.frontEnd.root.inert'), true);
      const before = await selected(); await tap('ArrowRight'); assert.deepEqual(await selected(), before);
      await tap('Escape'); await mode('characters'); assert.equal(await evaluate('__game.frontEnd.root.inert'), false);
      await click('#fe-controls'); assert.equal(await evaluate('__game.frontEnd.acceptsInput'), false); await tap('Escape');
      await mode('characters'); assert.equal((await selected()).draft, 'aaron'); await click('#fe-character-back'); await mode('home');
    });

    await check('saved character survives reload while both park careers and high scores stay unchanged', async () => {
      await evaluate(`for(const id of ['genesee-warehouse','roc-city-skatepark']){__game.selectLevel(id);__game.startRun('goals');__game.skater.combo.add('Saved career fixture',5000);__game.skater.bankCombo(false);__game.endRun();}__game.showHome();`); await step();
      const snapshot = await evaluate('({careers:__game.careers,storage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=="j2s-pro-skater.character.v1"))})');
      await select('aaron'); await reload(); assert.equal((await selected()).model, 'aaron');
      assert.deepEqual(await evaluate('({careers:__game.careers,storage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=="j2s-pro-skater.character.v1"))})'), snapshot);
      await select('joe'); await select('aaron');
      assert.deepEqual(await evaluate('__game.careers'), snapshot.careers);
      return snapshot.careers;
    });

    await check('both characters use identical real controller physics in both parks', async () => {
      const results = {};
      for (const park of ['genesee-warehouse', 'roc-city-skatepark']) {
        const runs = [];
        for (const id of ['joe', 'aaron']) {
          // Anchor each trial to the same RAF timestamps as well as inputs:
          // accumulated floating-point timestamp error can shift one substep.
          await select(id); await evaluate(`__game.selectLevel(${JSON.stringify(park)});__qa.now=1000;__game.startRun('free');__qa.connectPad()`); await step();
          assert.equal((await selected()).model, id);
          const result = await evaluate(`(async()=>{const s=__game.skater;__qa.button(0,true);await __qa.step(24);__qa.button(0,false);__qa.button(2,true);await __qa.step();__qa.button(2,false);let air=false,bail=false;for(let i=0;i<100;i++){await __qa.step();air ||=s.state==='air';bail ||=s.state==='bail';}return{position:s.pos.toArray(),velocity:s.vel.toArray(),state:s.state,score:s.score,air,bail};})()`);
          assert(result.air && !result.bail && result.score > 0, JSON.stringify(result)); runs.push(result);
          if (id === 'aaron') { await shot(park === 'roc-city-skatepark' ? 'aaron-skating-roc' : 'aaron-skating-warehouse'); }
          await evaluate('__qa.pad=null;__game.showHome()'); await step();
        }
        assert.deepEqual(runs[0], runs[1], 'Cosmetic model changes simulation'); results[park] = runs;
      }
      return results;
    });

    await check('character selection cannot mutate a live run and menus discard held input safely', async () => {
      await select('joe'); await evaluate('__game.startRun("free");__qa.connectPad();__qa.button(0,true)'); await step(15);
      const live = await evaluate('({id:__game.character.characterId,result:__game.selectCharacter("aaron"),time:__game.session.timeLeft})');
      assert.equal(live.result, false); assert.equal((await selected()).model, 'joe');
      await evaluate('__game.showHome();__game.showCharacterSelect()'); await step();
      const state = await evaluate('({crouch:__game.skater.crouching,buffer:__game.skater.bufferedOllie,clock:__game.sessionClock.active,audio:__game.audio.paused,input:__game.input.menuOpen,touch:document.getElementById("touch-controls").hidden})');
      assert.deepEqual(state, { crouch: false, buffer: false, clock: false, audio: true, input: true, touch: true });
      await step(60); assert.equal((await selected()).saved, 'joe'); await evaluate('__qa.button(0,false);__qa.pad=null'); return state;
    });

    await check('repeated model switching keeps one rig and stable GPU allocations', async () => {
      async function switchTo(id) { await evaluate(`__game.showHome();__game.showCharacterSelect();__game.selectCharacter(${JSON.stringify(id)});__game.startRun('free')`); await step(2); }
      for (const id of ['joe', 'aaron', 'joe', 'aaron']) await switchTo(id);
      const before = await evaluate('({...__game.renderer.info.memory})');
      for (let i = 0; i < 16; i++) await switchTo(i % 2 ? 'aaron' : 'joe');
      const after = await evaluate('({...__game.renderer.info.memory})'); assert.deepEqual(after, before);
      assert.equal(await evaluate('__game.character.root.parent===__game.scene'), true);
      assert.equal(await evaluate('__game.renderer.getContext().getError()'), 0);
      await evaluate('__game.showHome()'); return { before, after };
    });

    await check('mobile portrait and short-landscape selectors support touch with visible 44px targets', async () => {
      const target = new URL(url); target.searchParams.set('touch', ''); await navigate(target.href);
      const views = [];
      for (const [width, height] of [[390, 844], [320, 568], [844, 390], [568, 320]]) {
        await resize(width, height, true); await evaluate('__game.showHome()'); await touch('#fe-skater'); await mode('characters');
        await touch('#fe-character-aaron'); assert.equal((await selected()).draft, 'aaron');
        views.push(await layout()); await shot(`selector-touch-${width}x${height}`);
        await touch('#fe-character-confirm'); await mode('home'); assert.equal((await selected()).model, 'aaron');
        await touch('#fe-skater'); await touch('#fe-character-joe'); await touch('#fe-character-back'); assert.equal((await selected()).saved, 'aaron');
      }
      await resize(1440, 900); await navigate(url); return views;
    });

    await check('unknown stored identities safely fall back to Joe without erasing careers', async () => {
      const before = await evaluate('__game.careers');
      await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify({version:1,characterId:'missing-skater'}))`);
      await reload(); assert.equal((await selected()).model, 'joe'); assert.deepEqual(await evaluate('__game.careers'), before);
      await click('#fe-skater'); await click('#fe-character-aaron'); await click('#fe-character-confirm'); assert.equal((await selected()).model, 'aaron');
    });

    await check('denied localStorage still boots and allows selection for the current visit', async () => {
      const blocker = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window,"localStorage",{get(){throw new Error("QA storage denied")},configurable:true})' });
      try {
        await reload(); assert.equal((await selected()).model, 'joe');
        await click('#fe-skater'); await click('#fe-character-aaron'); await click('#fe-character-confirm'); assert.equal((await selected()).model, 'aaron');
        await click('#fe-play'); await click('#fe-level-genesee'); await click('#overlay-msg'); await mode('playing');
      } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blocker.identifier }); }
    });
  }
} finally { await qa.close(); }

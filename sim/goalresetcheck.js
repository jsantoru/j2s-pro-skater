// Real DOM/controller/touch reset flow in a disposable browser profile.
// node sim/goalresetcheck.js [url] [output-directory]
import assert from 'node:assert/strict';
import {browserQA} from './browser-qa.js';

const url=process.argv[2]||'http://127.0.0.1:4175/';
const qa=await browserQA({url,output:process.argv[3]||'screenshots/goal-reset',name:'goal-reset'});
const {evaluate,step,click,tap,pad,touch,resize,shot,check}=qa;
const storage=()=>evaluate('JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort(([a],[b])=>a.localeCompare(b))))');
async function seed(id='genesee-warehouse',completed=null){
  await evaluate(`(()=>{const g=__game;g.selectLevel(${JSON.stringify(id)});g.progress.record({completed:${completed===null?'g.levelConfig.goals.map(goal=>goal.id)':JSON.stringify(completed)},score:42000,bestCombo:14000});g.highScores.submit(42000);g.showGoalBoard();})()`);
  await step(2);
}
async function state(){return evaluate(`({mode:__game.session.mode,level:__game.session.levelId,dialog:__game.levelUI.resetDialogOpen,focus:document.activeElement.id,progress:__game.progress.snapshot(),inert:document.querySelector('#overlay').inert})`);}

try{
  await check('fresh careers have no reset action; completed boards open a scoped confirmation with safe default focus',async()=>{
    await evaluate('__game.selectLevel("genesee-warehouse")');
    assert.equal(await evaluate('document.querySelector("#reset-goals").hidden'),true);
    await seed();await click('#reset-goals');
    const s=await state();assert.equal(s.dialog,true);assert.equal(s.mode,'title');assert.equal(s.focus,'goal-reset-cancel');assert.equal(s.inert,true);
    assert.equal(await evaluate('document.querySelector("#goal-reset-level").textContent'),'Genesee Warehouse');
    await shot('desktop-confirmation');await click('#goal-reset-cancel');
    return s;
  });
  await check('Cancel, Escape and keyboard focus trapping preserve every save and do not leave the board',async()=>{
    await seed();const before=await storage();await click('#reset-goals');
    await tap('Tab');assert.equal((await state()).focus,'goal-reset-confirm');
    await tap('Tab');assert.equal((await state()).focus,'goal-reset-cancel');
    await tap('Enter');assert.equal((await state()).dialog,false);assert.equal((await state()).mode,'title');
    await click('#reset-goals');await tap('Escape');
    const s=await state();assert.equal(s.dialog,false);assert.equal(s.mode,'title');assert.equal(s.focus,'reset-goals');assert.equal(s.inert,false);
    assert.equal(await storage(),before);return{canceled:true,unchangedSaves:true};
  });
  await check('confirm clears only this level, preserves records and preferences, and makes all goals replayable',async()=>{
    await seed('perinton-skatepark',['skate','tape']);
    await seed('roc-city-skatepark',['caps','tape']);
    await evaluate('__game.characterSelection.select("aaron");__game.settings.setMusic(true)');
    await seed();const before=JSON.parse(await storage());await click('#reset-goals');await click('#goal-reset-confirm');
    const s=await state();assert.deepEqual(s.progress,{completed:[],bestScore:42000,bestCombo:14000});assert.equal(s.mode,'title');assert.equal(s.dialog,false);
    const after=JSON.parse(await storage());
    for(const [key,value]of Object.entries(before))if(key!=='j2s-pro-skater.genesee.goals.v1')assert.equal(after[key],value,key);
    assert.equal(await evaluate('document.querySelector("#reset-goals").hidden'),true);
    await shot('desktop-reset-board');await click('#overlay-msg');
    const run=await evaluate(`({mode:__game.session.runMode,available:__game.goals.snapshot().availableGoals,pickups:__game.collectibles.items.filter(item=>item.root.visible).length,focus:__game.session.focusGoal,completed:__game.goals.snapshot().completed})`);
    assert.equal(run.mode,'goals');assert.equal(run.available.length,7);assert.equal(run.pickups,11);assert.deepEqual(run.completed,[]);assert.ok(run.available.includes(run.focus));
    // The first warehouse letter is recovered through actual held skating input.
    await evaluate('__qa.connectPad();__qa.pad.axes[1]=-1');
    for(let frame=0;frame<180&&!await evaluate('__game.goals.collected.has("letter-s")');frame++)await step();
    await evaluate('__qa.pad.axes[1]=0');
    assert.equal(await evaluate('__game.goals.collected.has("letter-s")'),true,'restored pickup is collectible');
    await evaluate('__game.showGoalBoard()');return run;
  });
  await check('controller default A cancels, B and Start cancel, and deliberate selection confirms once',async()=>{
    await seed('roc-city-skatepark');await evaluate('__qa.connectPad()');const before=await storage();
    for(const button of [0,1,9]){await click('#reset-goals');await pad(button);assert.equal((await state()).dialog,false);assert.equal((await state()).mode,'title');assert.equal(await storage(),before);}
    await click('#reset-goals');await pad(13);assert.equal((await state()).focus,'goal-reset-confirm');await pad(0);
    const s=await state();assert.deepEqual(s.progress.completed,[]);assert.equal(s.mode,'title');assert.equal(s.dialog,false);
    await step(10);assert.equal((await state()).mode,'title','held menu input cannot begin a run');return s;
  });
  await check('reset persists after reload and an active run cannot open the reset dialog',async()=>{
    await qa.reload();await evaluate('__game.selectLevel("roc-city-skatepark")');
    assert.deepEqual((await state()).progress.completed,[]);assert.equal((await state()).progress.bestScore,42000);
    await click('#overlay-msg');
    assert.equal(await evaluate('__game.levelUI.openResetDialog()'),false);
    assert.equal((await state()).mode,'playing');assert.equal((await state()).dialog,false);
    await evaluate('__game.showGoalBoard()');return{reloaded:true,activeRunGuard:true};
  });
  await check('changing level closes a pending confirmation without clearing either career',async()=>{
    await seed();const before=await storage();await click('#reset-goals');
    await evaluate('__game.selectLevel("roc-city-skatepark")');await step(2);
    const s=await state();assert.equal(s.level,'roc-city-skatepark');assert.equal(s.dialog,false);assert.equal(s.inert,false);assert.equal(await storage(),before);
    return s;
  });
  await check('Perinton reset restores its eleven pickups and preserves both older careers',async()=>{
    await seed('perinton-skatepark');const before=JSON.parse(await storage());
    await click('#reset-goals');assert.equal(await evaluate('document.querySelector("#goal-reset-level").textContent'),'Perinton Skatepark');
    await click('#goal-reset-confirm');assert.deepEqual((await state()).progress.completed,[]);
    const after=JSON.parse(await storage());
    for(const [key,value]of Object.entries(before))if(key!=='j2s-pro-skater.perinton-skatepark.goals.v1')assert.equal(after[key],value,key);
    await click('#overlay-msg');await step(2);
    assert.equal(await evaluate('__game.collectibles.items.filter(item=>item.root.visible).length'),11);
    assert.equal(await evaluate('__game.goals.availableGoals.size'),7);
    await evaluate('__game.showGoalBoard()');return{restoredPickups:11,otherCareersUnchanged:true};
  });
  await check('native touch confirmation fits portrait and short landscape with accessible targets',async()=>{
    const touchURL=new URL(url);touchURL.searchParams.set('touch','1');await qa.navigate(touchURL.href);
    for(const [width,height]of [[390,844],[320,568],[844,390],[568,320]]){
      await resize(width,height,true);await seed('genesee-warehouse',['caps']);await touch('#reset-goals');
      const layout=await evaluate(`(()=>{const d=document.querySelector('#goal-reset-dialog'),r=d.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,buttons:[...d.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return{height:q.height,width:q.width,top:q.top,bottom:q.bottom};})};})()`);
      assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height);
      assert.ok(layout.scrollWidth<=layout.clientWidth,'no horizontal clipping');
      for(const b of layout.buttons)assert.ok(b.height>=44&&b.width>=44&&b.top>=0&&b.bottom<=height,'confirm/cancel remain visible, usable touch targets');
      await shot(`touch-${width}x${height}`);await touch('#goal-reset-cancel');assert.ok((await state()).progress.completed.includes('caps'));
    }
    await touch('#reset-goals');await touch('#goal-reset-confirm');assert.deepEqual((await state()).progress.completed,[]);
    return{viewports:4,nativeTouchConfirmed:true};
  });
  await check('blocked storage still resets the in-memory career and restores the next run',async()=>{
    await seed('genesee-warehouse',['skate','caps','tape']);
    await evaluate('__qa.savedGoalStorage=__game.progress.storage;__game.progress.storage={getItem(){throw Error("blocked")},setItem(){throw Error("blocked")}}');
    await click('#reset-goals');await click('#goal-reset-confirm');assert.deepEqual((await state()).progress.completed,[]);
    await click('#overlay-msg');assert.equal(await evaluate('__game.goals.availableGoals.size'),7);
    await evaluate('__game.progress.storage=__qa.savedGoalStorage;__game.showGoalBoard()');return{memoryReset:true};
  });
}finally{await qa.close();}

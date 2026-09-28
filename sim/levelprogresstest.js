// Per-level records and goals must never award, retire, or overwrite another park.
import assert from 'node:assert/strict';
import { GOALS, PICKUPS, GOAL_STORAGE_KEY, GoalProgress, GoalRun } from '../src/goals.js';
import { HIGH_SCORE_STORAGE_KEY, HighScores } from '../src/highscores.js';
import { LEVEL_GOAL_CONFIGS, ROC_GOALS } from '../src/level-goals.js';
import { ROC_PICKUPS } from '../src/roc-city-layout.js';

let failures = 0, checks = 0;
function check(name, run) {
  checks++;
  try { run(); console.log('PASS: ' + name); }
  catch (error) { failures++; console.error('FAIL: ' + name + '\n' + error.stack); }
}
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function career(id, store, pickups = id === 'genesee-warehouse' ? PICKUPS : ROC_PICKUPS) {
  const config = LEVEL_GOAL_CONFIGS[id];
  const progress = new GoalProgress(store, { key: config.progressKey, goals: config.goals });
  return { progress, run: new GoalRun(progress, { goals: config.goals, pickups }), scores: new HighScores(store, { key: config.highScoresKey }) };
}
function collect(run, pickup) {
  const [x,y,z] = pickup.position, skater = { pos: {x,y:y-.85,z}, state: 'ride' };
  run.update(skater); run.update(skater);
}

check('warehouse defaults retain the original save keys and goal thresholds', () => {
  const store = storage(), progress = new GoalProgress(store), scores = new HighScores(store);
  new GoalRun(progress).start().bankCombo(3000); scores.submit(3000);
  assert.deepEqual([...store.values.keys()].sort(), [GOAL_STORAGE_KEY,HIGH_SCORE_STORAGE_KEY].sort());
  assert.deepEqual(progress.snapshot().completed,['high-score','combo']);
  assert.equal(LEVEL_GOAL_CONFIGS['genesee-warehouse'].goals,GOALS);
  assert.deepEqual(new GoalProgress(store).snapshot(),progress.snapshot());
});
check('same goal IDs use each park’s own targets and save slots', () => {
  const store=storage(), warehouse=career('genesee-warehouse',store), roc=career('roc-city-skatepark',store);
  warehouse.run.start().bankCombo(3000); roc.run.start().bankCombo(3000);
  assert.deepEqual(warehouse.run.snapshot().completed,['high-score','combo']);
  assert.deepEqual(roc.run.snapshot().completed,[]);
  roc.run.bankCombo(2000);
  assert.deepEqual(roc.run.snapshot().completed,['high-score']);
  roc.run.bankCombo(5000);
  assert.deepEqual(roc.run.snapshot().completed,['high-score','combo']);
  assert.equal(warehouse.progress.bestScore,3000);
  assert.equal(roc.progress.bestScore,10000);
  for(const [id,current] of [['genesee-warehouse',warehouse],['roc-city-skatepark',roc]])
    assert.deepEqual(career(id,store).progress.snapshot(),current.progress.snapshot());
});
check('retired collections in one park remain available in the other', () => {
  const store=storage(), warehouse=career('genesee-warehouse',store), roc=career('roc-city-skatepark',store);
  warehouse.progress.record({completed:['caps','skate','tape']});
  warehouse.run.start(); roc.run.start();
  assert.ok(!warehouse.run.availableGoals.has('caps'));
  assert.ok(['caps','skate','tape'].every(id=>roc.run.availableGoals.has(id)));
  for(const pickup of ROC_PICKUPS.filter(p=>p.goalId==='caps')) collect(roc.run,pickup);
  assert.deepEqual(roc.progress.snapshot().completed,['caps']);
  assert.deepEqual(warehouse.progress.snapshot().completed,['skate','caps','tape']);
});
check('switching parks abandons partial sets and finished runs reject late events', () => {
  const store=storage(), warehouse=career('genesee-warehouse',store), roc=career('roc-city-skatepark',store);
  warehouse.run.start(); collect(warehouse.run,PICKUPS[0]); warehouse.run.finish();
  roc.run.start().bankCombo(15000); roc.run.finish();
  assert.deepEqual(warehouse.run.bankCombo(50000),[]);
  assert.deepEqual(roc.run.bankCombo(50000),[]);
  warehouse.run.start();
  assert.deepEqual(warehouse.run.snapshot().letters,[]);
  assert.ok(warehouse.run.availableGoals.has('skate'));
  assert.equal(warehouse.progress.bestScore,0);
  assert.equal(roc.progress.bestScore,15000);
});
check('run snapshots use the selected park’s custom definitions and whitelist', () => {
  const store=storage(), definitions=[{id:'park-only',title:'Local line',type:'score',target:123,description:'One line.'}];
  store.setItem('custom',JSON.stringify({completed:['caps','park-only'],bestScore:100}));
  const progress=new GoalProgress(store,{key:'custom',goals:definitions});
  assert.deepEqual(progress.snapshot().completed,['park-only']);
  progress.record({completed:['high-score']});
  assert.ok(!progress.has('high-score'));
  const run=new GoalRun(progress,{goals:definitions,pickups:[]}).start();
  assert.deepEqual(run.snapshot().goals.map(g=>g.id),['park-only']);
  assert.deepEqual(run.snapshot().availableGoals,[]);
  assert.equal(new GoalRun(new GoalProgress(null,{goals:ROC_GOALS}),[]).start().snapshot().goals[0].target,5000);
});
check('park pickups use their own coordinates and reset complete sets per career', () => {
  const roc=career('roc-city-skatepark',storage());
  assert.equal(ROC_PICKUPS.length,11);
  assert.equal(new Set(ROC_PICKUPS.map(p=>p.id)).size,11);
  for(const goal of ROC_GOALS.filter(g=>g.type==='collection'))
    assert.equal(ROC_PICKUPS.filter(p=>p.goalId===goal.id).length,goal.target);
  roc.run.start();
  collect(roc.run,PICKUPS.find(p=>p.id==='letter-s'));
  assert.deepEqual(roc.run.snapshot().letters,[],'old warehouse coordinates cannot collect a new park letter');
  for(const pickup of ROC_PICKUPS)collect(roc.run,pickup);
  assert.deepEqual(roc.run.snapshot().letters,['S','K','A','T','E']);
  assert.equal(roc.run.snapshot().caps,5);assert.equal(roc.run.snapshot().tape,true);
  assert.deepEqual(roc.progress.snapshot().completed,['skate','caps','tape']);
  roc.run.start();
  assert.ok(['skate','caps','tape'].every(id=>!roc.run.availableGoals.has(id)));
});
check('high scores load, submit and clear only the selected park', () => {
  const store=storage(), warehouse=career('genesee-warehouse',store), roc=career('roc-city-skatepark',store);
  warehouse.scores.submit(9000); roc.scores.submit(15000); roc.scores.submit(2000);
  assert.equal(new HighScores(store).best,9000);
  assert.equal(career('roc-city-skatepark',store).scores.best,15000);
  roc.scores.clear();
  assert.deepEqual(career('roc-city-skatepark',store).scores.list,[]);
  assert.equal(new HighScores(store).best,9000);
});
check('blocked storage preserves independent in-memory careers', () => {
  const store={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const warehouse=career('genesee-warehouse',store),roc=career('roc-city-skatepark',store);
  warehouse.run.start().bankCombo(3000);roc.run.start().bankCombo(5000);
  assert.equal(warehouse.progress.bestScore,3000);assert.equal(roc.progress.bestScore,5000);
  warehouse.scores.submit(3000);roc.scores.submit(5000);
  assert.equal(warehouse.scores.best,3000);assert.equal(roc.scores.best,5000);
  roc.run.start({mode:'free'}).bankCombo(50000);
  assert.equal(roc.progress.bestScore,5000);
});

console.log(`\n${checks-failures}/${checks} per-level progression checks passed.`);
if(failures)process.exitCode=1;

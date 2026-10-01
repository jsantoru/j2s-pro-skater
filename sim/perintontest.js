// Perinton's tests run the real 120 Hz skating controller over the rendered
// collision surfaces. Initial fixtures choose a line; they never attach grinds.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PerintonLevel } from '../src/perinton-level.js';
import { PERINTON_LAYOUT, PERINTON_PICKUPS } from '../src/perinton-layout.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';
import { GoalProgress, GoalRun } from '../src/goals.js';

const level = new PerintonLevel(), dt = 1 / 120, ray = new THREE.Raycaster();
let passed = 0, failed = 0;
function check(name, run) {
  if (process.env.QA_CHECK && !name.includes(process.env.QA_CHECK)) return;
  try { const result = run(); passed++; console.log(`PASS ${name}${result ? ` ${JSON.stringify(result)}` : ''}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
function support(x, z, from = 8) {
  ray.set(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0)); ray.far = 18;
  return ray.intersectObjects(level.colliders, false)[0];
}
function rider(x, z, dx, dz, speed = 5) {
  const hit = support(x, z); assert(hit, `Unsupported start ${x},${z}`);
  const sk = new Skater(level, () => .5); sk.pos.copy(hit.point); sk.heading.set(dx, 0, dz).normalize(); sk.facing.copy(sk.heading); sk.speed = speed; sk.vel.copy(sk.heading).multiplyScalar(speed);
  return sk;
}
function route(points, { speed = 5, seconds = 60, goals = null } = {}) {
  const sk = rider(...points[0], points[1][0] - points[0][0], points[1][1] - points[0][1], speed);
  if (goals) goals.start({ skater: sk });
  let index = 1, elapsed = 0, low = sk.pos.y, high = sk.pos.y; const bails = [];
  sk.events.bail = reason => bails.push(reason);
  while (elapsed < seconds && index < points.length && !bails.length) {
    const target = points[index], dx = target[0] - sk.pos.x, dz = target[1] - sk.pos.z;
    const angle = Math.atan2(sk.heading.x * dz - sk.heading.z * dx, sk.heading.x * dx + sk.heading.z * dz);
    const input = makeState(), desired = Math.abs(angle) > .6 ? Math.min(speed, 3.1) : speed;
    input.steer = sk.state === 'ride' ? THREE.MathUtils.clamp(angle * 2, -1, 1) : 0;
    input.push = sk.speed < desired ? 1 : 0; input.brake = sk.speed > desired + .25 ? .5 : 0;
    sk.update(dt, input); goals?.update(sk); elapsed += dt; low = Math.min(low, sk.pos.y); high = Math.max(high, sk.pos.y);
    if (target[2] ? goals?.collected.has(target[2]) : Math.hypot(dx, dz) < .55) index++;
  }
  return { reached: index === points.length, index, bails, elapsed: +elapsed.toFixed(2), low, high, position: sk.pos.toArray() };
}

check('unscaled human dimensions, valid indexed surfaces and distinct park identity', () => {
  assert.equal(level.horizontalScale, 1); assert.deepEqual(level.group.scale.toArray(), [1,1,1]);
  assert.equal(PERINTON_LAYOUT.stairs.count, 4); assert.equal(PERINTON_LAYOUT.platform.height, .68);
  assert(PERINTON_LAYOUT.stairs.treads[1] > PERINTON_LAYOUT.stairs.treads[0] * 2);
  for (const mesh of level.colliders) {
    const g = mesh.geometry, p = g.attributes.position, index = g.index;
    for (let i = 0; i < p.count; i++) assert(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${mesh.name} has nonfinite vertices`);
    for (let i = 0; i < (index?.count || p.count); i += 3) {
      const points = [0,1,2].map(n => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i+n) : i+n));
      assert(points[1].sub(points[0]).cross(points[2].sub(points[0])).lengthSq() > 1e-16, `${mesh.name} has a degenerate face`);
    }
  }
  assert(Math.abs(support(...[level.spawn.pos.x, level.spawn.pos.z]).point.y - level.spawn.pos.y) < .001);
  return { colliders: level.colliders.length, railSegments: level.rails.length };
});

check('bowl has two connected depths, open support hole and matching closed coping', () => {
  const deep = support(6, -11), shallow = support(12.5, -11);
  assert.equal(deep.object, level.bowl); assert.equal(shallow.object, level.bowl);
  assert(deep.point.y < -1.72 && shallow.point.y > -1.35 && shallow.point.y < -1.15);
  for (let x = 6; x <= 12.5; x += .25) assert.equal(support(x, -11).object, level.bowl, `Hidden floor crosses bowl at ${x}`);
  for (const rail of level.bowlCoping) {
    assert(rail.a.distanceTo(rail.aLink.rail.b) < 1e-6); assert(rail.b.distanceTo(rail.bLink.rail.a) < 1e-6);
    assert.equal(rail.kind, 'coping'); assert.equal(rail.radius, .038);
  }
  assert.equal(level.bowlCoping[0].visuals[0].count, level.bowlCoping.length);
  return { deep: deep.point.y, shallow: shallow.point.y };
});

check('longer bowl keeps its depths, clear deck and supported outer pickup lane', () => {
  const size = new THREE.Box3().setFromObject(level.bowl).getSize(new THREE.Vector3());
  assert(size.x > 14.1 && size.x < 14.3, 'Only the bowl long axis gains room');
  assert(size.z > 8.15 && size.z < 8.25 && Math.abs(size.y - 1.8) < .001);
  assert.equal(PERINTON_LAYOUT.bowl.shallow, 1.25);
  // Only the coping boundary may be open. In particular, the fine lip strip
  // and coarser interior must share actual indices, not nearly matching edges.
  const positions = level.bowl.geometry.attributes.position, indices = level.bowl.geometry.index, edges = new Map();
  for (let i = 0; i < indices.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = indices.getX(i + j), b = indices.getX(i + (j + 1) % 3), key = a < b ? `${a},${b}` : `${b},${a}`;
    const edge = edges.get(key); if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
  }
  for (const edge of edges.values()) {
    assert(edge.count <= 2, 'Bowl contains an overlapping/nonmanifold edge');
    if (edge.count === 1) assert(Math.abs(positions.getY(edge.a)) < .001 && Math.abs(positions.getY(edge.b)) < .001, 'Open seam inside bowl');
  }
  for (let i = 0; i < positions.count; i++) assert(Math.abs(positions.getY(i) - level.bowlHeightAt(positions.getX(i), positions.getZ(i))) < .003, 'Tessellation changed the analytic bowl profile');
  // These points lie in the newly opened wings, beyond the former bowl rim.
  // Raycast the complete level so a stale slab or landscape plane cannot pass.
  for (const x of [2.3, 3, 5.4, 9, 12.5, 15.5, 16.05]) {
    assert.equal(support(x, -11).object, level.bowl, `Hidden surface across wider bowl at ${x}`);
    ray.set(new THREE.Vector3(x, 2, -11), new THREE.Vector3(0, -1, 0)); ray.far = 5;
    assert.equal(ray.intersectObject(level.turf, false).length, 0, 'Turf cutout follows the wider bowl');
  }
  const segmentDistance = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
  };
  let clearance = Infinity;
  for (const p of level.bowlDeckOutline) for (let i = 0; i < level.pumpOutline.length; i++)
    clearance = Math.min(clearance, segmentDistance(p, level.pumpOutline[i], level.pumpOutline[(i + 1) % level.pumpOutline.length]));
  assert(clearance > .6, `Deck must not intersect the pump ribbon: ${clearance}`);
  const letter = PERINTON_PICKUPS.find(p => p.id === 'letter-t');
  assert(Math.abs(support(letter.position[0], letter.position[2]).point.y) < .001);
  for (const z of [-12, -11, -10, -9]) for (const x of [17.1, 17.3, 17.5, 17.7, 17.9]) {
    ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)); ray.far = 3;
    const hits = ray.intersectObjects([level.floor, level.bowlDeck], false);
    assert.equal(new Set(hits.map(h => h.object)).size, 1, `Deck/plaza seam has a gap or coplanar overlap at ${x},${z}`);
    assert(hits.every(h => Math.abs(h.point.y) < .001));
  }
  const cap = PERINTON_PICKUPS.find(p => p.id === 'cap-3');
  assert.equal(cap.position[0], 5.4); assert(Math.abs(support(cap.position[0], cap.position[2]).point.y + 1.8) < .001);
  return { opening: size.toArray(), deckPumpClearance: clearance };
});

check('pump ribbon is open, supported, has rollers and distinct outer berms', () => {
  const first = level.pumpPoints[0], last = level.pumpPoints.at(-1);
  assert(Math.hypot(first[0]-last[0],first[2]-last[2]) > 30);
  assert(level.pump.userData.pathLength > 70 && level.pump.userData.pathLength < 90);
  let crests = 0;
  for (let i = 2; i < level.pumpPoints.length - 2; i++) {
    const p = level.pumpPoints[i], hit = support(p[0], p[2]);
    assert(hit && Math.abs(hit.point.y - p[1]) < .025, `Ribbon center has incorrect support at ${i}`);
    if (p[1] > .15 && p[1] > level.pumpPoints[i-1][1] && p[1] > level.pumpPoints[i+1][1]) crests++;
  }
  assert(crests >= 10, `Only ${crests} roller crests`);
  const position = level.pump.geometry.attributes.position; let high = 0;
  for (let i=0;i<position.count;i++) high=Math.max(high,position.getY(i));
  assert(high > .9 && high < 1.5); return { crests, berm: high };
});

check('four actual stair risers, long middle landing, solid bank and platform access', () => {
  const s = PERINTON_LAYOUT.stairs, x = s.start[0], z = s.start[2];
  for (const [offset,y] of [[-.2,.68],[.2,.51],[.8,.34],[1.8,.17],[2.3,0]]) assert(Math.abs(support(x+offset,z).point.y-y)<.002, `${offset} did not hit its stair tread`);
  for (const direction of [1,-1]) {
    const points = direction > 0 ? [[13,1.7],[10,1.7],[6,1.7],[3,1.7]] : [[3,1.7],[6,1.7],[10,1.7],[13,1.7]];
    const result = route(points,{speed:4,seconds:12}); assert(result.reached&&!result.bails.length,JSON.stringify(result));
  }
});

check('all eleven collectibles have actual support at their declared heights', () => {
  assert.equal(PERINTON_PICKUPS.length,11);
  for (const pickup of PERINTON_PICKUPS) {
    const hit=support(pickup.position[0],pickup.position[2]);
    assert(hit&&Math.abs(hit.point.y-pickup.surfaceY)<.025,`${pickup.id}: floor ${hit?.point.y}, declared ${pickup.surfaceY}`);
    assert(Math.abs(pickup.position[1]-pickup.surfaceY-.95)<.001);
  }
});

check('SKATE completes from entry with ordinary steering in one timed run', () => {
  const goals=new GoalRun(new GoalProgress(null),PERINTON_PICKUPS);
  const result=route([[-5,13],[-5,12,'letter-s'],[-14,12],[-15,3,'letter-k'],[-15,-4],[-11,-7],[0,-7,'letter-a'],[1.5,-5.4],[17.8,-5.4],[17.8,-10,'letter-t'],[17.8,-5.4],[15,8,'letter-e']],{goals,speed:5.5,seconds:110});
  assert(goals.completed.has('skate')&&!result.bails.length,JSON.stringify(result));return result;
});

check('both quarter walls support repeated real push/air/return cycles', () => {
  for (const [x,z,dx] of [[15,.75,1],[-15,2,-1]]) {
    const sk=rider(x,z,dx,0,7), bails=[];let airtime=0,landings=0,peak=0;
    sk.events.bail=reason=>bails.push(reason);sk.events.land=()=>landings++;
    for(let i=0;i<8/dt;i++){const input=makeState();input.push=1;sk.update(dt,input);if(sk.state==='air')airtime+=dt;peak=Math.max(peak,sk.pos.y);}
    assert(!bails.length&&airtime>.15&&landings>=1,JSON.stringify({x,z,bails,airtime,landings,peak,pos:sk.pos.toArray()}));
  }
});

check('flatbar captures with actual grind input and banks a clean dismount', () => {
  for(const direction of [1,-1]){
    const sk=rider(direction>0?-4:12,10,direction,0,6), bails=[];let previous=false,grinds=0,elapsed=0;
    sk.events.bail=reason=>bails.push(reason);sk.events.grindStart=()=>grinds++;
    for(let i=0;i<7/dt;i++){
      const input=makeState();input.push=1;const ahead=(direction>0?1-sk.pos.x:sk.pos.x-7);
      input.ollie=grinds===0&&ahead>2.8;input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
      input.grind=grinds===0||sk.state==='grind';if(sk.state==='grind')input.steer=THREE.MathUtils.clamp(-sk.balance.x*3-sk.balance.v,-1,1);
      sk.update(dt,input);elapsed+=dt;if(sk.score>0&&sk.state==='ride')break;
    }
    assert(grinds&&sk.score>0&&!bails.length,JSON.stringify({direction,grinds,score:sk.score,bails,elapsed,position:sk.pos.toArray()}));
  }
});

check('pump track traverses both open connections using real push and steering', () => {
  for(const direction of [1,-1]){
    const path=level.pumpPoints.filter((_,i)=>i%6===0||i===level.pumpPoints.length-1).map(p=>[p[0],p[2]]);
    if(direction<0)path.reverse();
    const result=route(path,{speed:3.4,seconds:65});
    assert(result.reached&&!result.bails.length,JSON.stringify({direction,...result}));
    assert(result.high>.28, 'The rider must actually cross the rollers');
  }
});

check('both bowl pockets permit natural transition airs and returns', () => {
  // Start at the same relative points in the two widened pockets.
  for(const [x,z,dx,dz]of [[5.4,-11,0,-1],[13.2,-11,1,0]]){
    const sk=rider(x,z,dx,dz,7),bails=[];let peak=sk.pos.y,air=0,landings=0;
    sk.events.bail=reason=>bails.push(reason);sk.events.land=()=>landings++;
    for(let i=0;i<6/dt;i++){const input=makeState();input.push=1;sk.update(dt,input);peak=Math.max(peak,sk.pos.y);if(sk.state==='air')air+=dt;}
    assert(!bails.length&&air>.2&&landings,JSON.stringify({x,z,bails,peak,air,landings,position:sk.pos.toArray()}));
  }
});

check('nearby shallow approaches return inside the bowl and settle without bails', () => {
  let cases = 0, minimumAir = Infinity;
  for (const z of [-11.2, -11, -10.8]) for (const degrees of [-5, 0, 5]) {
    const angle = degrees * Math.PI / 180, sk = rider(13.2, z, Math.cos(angle), Math.sin(angle), 7), bails = [];
    let elapsed = 0, air = 0, landing = null;
    sk.events.bail = reason => bails.push(reason);
    sk.events.land = () => { landing ??= { elapsed, position: sk.pos.toArray(), inside: support(sk.pos.x, sk.pos.z).object === level.bowl }; };
    while (elapsed < 4 && !bails.length) {
      const input = makeState(); input.push = landing ? 0 : 1; input.brake = landing ? .65 : 0;
      sk.update(dt, input); if (sk.state === 'air') air += dt; elapsed += dt;
      if (landing && elapsed > landing.elapsed + 1.2) break;
    }
    assert(!bails.length && air > .5 && landing?.inside && landing.position[1] < -.1, JSON.stringify({ z, degrees, bails, air, landing }));
    assert.equal(sk.state, 'ride'); assert.equal(support(sk.pos.x, sk.pos.z).object, level.bowl, 'Controlled return must settle inside the bowl, not on the exterior deck');
    cases++; minimumAir = Math.min(minimumAir, air);
  }
  return { cases, minimumAir: +minimumAir.toFixed(3) };
});

check('A-frame joins the street bank and its linked kink rail grinds both ways', () => {
  assert.equal(level.aFrameRails.length,2);assert.equal(level.aFrameRails[0].bLink.rail,level.aFrameRails[1]);
  for(const x of [8.1,9,10,10.8])assert(Math.abs(support(x,2.999).point.y-support(x,3.001).point.y)<.004,'Crack at shared bank edge');
  for(const direction of [1,-1]){
    const sk=rider(direction>0?3:18,5.4,direction,0,6),bails=[],visited=new Set();let previous=false,captured=false;
    sk.events.bail=reason=>bails.push(reason);
    for(let i=0;i<7/dt;i++){
      const input=makeState(),ahead=direction>0?7.5-sk.pos.x:sk.pos.x-13;input.push=1;
      input.ollie=!captured&&ahead>2.8;input.olliePressed=input.ollie&&!previous;input.ollieReleased=!input.ollie&&previous;previous=input.ollie;
      input.grind=!captured||sk.state==='grind';
      if(sk.state==='grind'){
        if(level.aFrameRails.includes(sk.grind.rail)){captured=true;visited.add(sk.grind.rail);}
        input.steer=THREE.MathUtils.clamp(-sk.balance.x*3-sk.balance.v,-1,1);
      }
      sk.update(dt,input);if(captured&&sk.score>0&&sk.state==='ride')break;
    }
    assert(captured&&visited.size===2&&sk.score>0&&!bails.length,JSON.stringify({direction,captured,visited:visited.size,score:sk.score,bails,position:sk.pos.toArray()}));
  }
});

check('five bottle caps form a continuous attainable route including the bowl', () => {
  const goals=new GoalRun(new GoalProgress(null),PERINTON_PICKUPS);
  const cap3=PERINTON_PICKUPS.find(p=>p.id==='cap-3');
  const result=route([[-5,13],[-16,10,'cap-1'],[-16,-7,'cap-2'],[-11,-7],[1,-7],[3.1,-9],[cap3.position[0],cap3.position[2],'cap-3'],[9,-11],[12.5,-11],[17,-11],[17,-5],[15,2,'cap-5'],[13,1.6],[9.5,1.6],[4,-1,'cap-4']],{goals,speed:5.5,seconds:115});
  assert(goals.completed.has('caps')&&!result.bails.length,JSON.stringify(result));return result;
});

check('secret tape is reachable from the street bank onto the raised spine', () => {
  const goals=new GoalRun(new GoalProgress(null),PERINTON_PICKUPS);
  const result=route([[14,1.5],[10,1.5],[6,1.5],[3,1],[1.5,-1],[-.65,-2,'secret-tape']],{goals,speed:4.2,seconds:20});
  assert(goals.completed.has('tape')&&!result.bails.length,JSON.stringify(result));return result;
});

check('real linked bowl grind line reaches Sick Score and the five-thousand combo goal', () => {
  const sk=rider(6,-11,0,-1,7),bails=[];let previousOllie=false,elapsed=0,best=0,captures=0;
  sk.events.bail=reason=>bails.push(reason);sk.events.land=points=>{best=Math.max(best,points);};
  sk.events.grindStart=()=>captures++;
  while(elapsed<110&&sk.score<35000){
    const input=makeState();input.push=1;input.grind=captures<4;
    if(sk.state==='grind'){
      input.steer=THREE.MathUtils.clamp(-sk.balance.x*3-sk.balance.v,-1,1);
      input.ollie=sk.grind.time>11&&sk.grind.time<11.28;
    }
    input.olliePressed=input.ollie&&!previousOllie;input.ollieReleased=!input.ollie&&previousOllie;previousOllie=input.ollie;
    input.flipPressed=sk.state==='air'&&sk.airTime>.025&&sk.airTime<.035;
    sk.update(dt,input);elapsed+=dt;
  }
  assert(sk.score>=35000&&best>=5000,JSON.stringify({score:sk.score,best,captures,elapsed,bails,position:sk.pos.toArray()}));
  return {score:sk.score,best,captures,elapsed:+elapsed.toFixed(2),bails};
});

console.log(`${passed}/${passed+failed} Perinton geometry and riding checks passed`);
if(failed)process.exitCode=1;

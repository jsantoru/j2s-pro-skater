// Production ROC City scale: independent world-space geometry, normal and input
// checks. Historical authored-coordinate fixtures explicitly use scale 1.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RocCityLevel } from '../src/roc-city-level.js';
import { ROC_CITY_LAYOUT, ROC_CITY_HORIZONTAL_SCALE, ROC_PICKUPS, ROC_PICKUPS_AUTHORED, createRocPickups } from '../src/roc-city-layout.js';
import { createRocCityArt } from '../src/roc-city-art.js';
import { trailPoints } from '../src/roc-city-surroundings.js';
import { Level } from '../src/level.js';
import { Skater } from '../src/skater.js';
import { makeState } from '../src/input.js';
import { GoalProgress, GoalRun } from '../src/goals.js';

const authored = new RocCityLevel({ horizontalScale: 1 }), level = new RocCityLevel();
const scale = 1.25, dt = 1 / 120, down = new THREE.Vector3(0, -1, 0), up = down.clone().negate();
const ray = new THREE.Raycaster(), root = new THREE.Group(); root.add(level.group);
const art = createRocCityArt(root, level, { lowfx: true }); root.updateMatrixWorld(true);
const world = point => new THREE.Vector3(point[0] * scale, point[1], point[2] * scale);
// Cars are placed in the enlarged city but retain their physical dimensions.
// Their center translates with the layout; every local body/rail offset stays
// unchanged. All other park geometry still follows the original X/Z scale.
function worldGeometry(point, metadata) {
  if (metadata.category !== 'car') return world(point);
  const car = authored.environment.cars.find(item => item.id === metadata.feature);
  assert(car, `Known parked-car anchor for ${metadata.feature}`);
  return new THREE.Vector3(point[0] + car.x * (scale - 1), point[1], point[2] + car.z * (scale - 1));
}
const close = (a, b, message, tolerance = 1e-6) => assert(Math.abs(a - b) < tolerance, `${message}: ${a} versus ${b}`);
let passed = 0, failed = 0;
function test(name, run) {
  if (process.env.QA_CHECK && !name.includes(process.env.QA_CHECK)) return;
  try { run(); passed++; console.log(`PASS: ${name}`); }
  catch (error) { failed++; console.error(`FAIL: ${name}\n${error.stack}`); }
}
function support(x, z, objects = level.colliders) {
  ray.set(new THREE.Vector3(x, 12, z), down); ray.near = 0; ray.far = 30;
  return ray.intersectObjects(objects, false)[0];
}
function rider(position, direction, speed = 7) {
  const skater = new Skater(level, () => .5); skater.pos.copy(world(position));
  skater.heading.fromArray(direction).normalize(); skater.facing.copy(skater.heading);
  skater.speed = speed; skater.vel.copy(skater.heading).multiplyScalar(speed); return skater;
}
function groundRider(x, z, dx, dz, speed = 7) {
  const hit = support(x, z); assert(hit, `No approach surface at ${x},${z}`);
  const skater = new Skater(level, () => .5); skater.pos.copy(hit.point);
  skater.heading.set(dx, 0, dz).normalize(); skater.facing.copy(skater.heading);
  skater.speed = speed; skater.vel.copy(skater.heading).multiplyScalar(speed); return skater;
}
function route(authoredPoints, speed = 7) {
  const points = authoredPoints.map(([x, z]) => [x * scale, z * scale]);
  const skater = groundRider(...points[0], points[1][0] - points[0][0], points[1][1] - points[0][1], speed);
  const bails = []; skater.events.bail = reason => bails.push(reason); let index = 1, maximum = skater.pos.y, minimum = maximum;
  for (let i = 0; i < 3600 && index < points.length && !bails.length; i++) {
    const [x, z] = points[index], dx = x - skater.pos.x, dz = z - skater.pos.z;
    const angle = Math.atan2(skater.heading.x * dz - skater.heading.z * dx, skater.heading.x * dx + skater.heading.z * dz);
    const input = makeState(), desired = Math.abs(angle) > .65 ? Math.min(speed, 3.5) : speed;
    input.steer = skater.state === 'ride' ? THREE.MathUtils.clamp(angle * 1.8, -1, 1) : 0;
    input.push = skater.speed < desired ? 1 : 0; input.brake = skater.speed > desired + .2 ? .5 : 0;
    skater.update(dt, input); maximum = Math.max(maximum, skater.pos.y); minimum = Math.min(minimum, skater.pos.y);
    if (Math.hypot(dx, dz) < .6) index++;
  }
  return { reached: index === points.length, bails, minimum, maximum, position: skater.pos.toArray() };
}
function grindRoute(rails, { dir = 1, lead = 7, pop = 3.5, exitAfter = null } = {}) {
  const closed = rails.at(-1).bLink?.rail === rails[0], entry = dir === 1 || closed ? rails[0] : rails.at(-1);
  const edge = (dir === 1 ? entry.a : entry.b).clone(), tangent = entry.dir.clone().setY(0).normalize().multiplyScalar(dir);
  const start = edge.clone().addScaledVector(tangent, -lead), skater = groundRider(start.x, start.z, tangent.x, tangent.z);
  const target = new Set(rails), captured = [], bails = [], visited = new Set();
  let previous = false, released = false, longest = 0, exited = false, exitAge = -1;
  skater.events.grindStart = () => captured.push({ target: target.has(skater.grind.rail), dir: skater.grind.dir });
  skater.events.grindEnd = () => { if (target.has(skater.grind?.rail)) exited = true; };
  skater.events.bail = reason => bails.push(reason);
  for (let i = 0; i < 1200 && !bails.length; i++) {
    const input = makeState(), distance = edge.clone().sub(skater.pos).dot(tangent);
    input.push = skater.speed < 7 ? 1 : 0; input.brake = skater.speed > 7.2 ? .5 : 0;
    input.ollie = !released && distance > pop; if (!input.ollie) released = true; input.grind = true;
    if (skater.state === 'grind') {
      if (target.has(skater.grind.rail)) { longest = Math.max(longest, skater.grind.time); visited.add(skater.grind.rail); }
      input.steer = THREE.MathUtils.clamp(-skater.balance.x * 3 - skater.balance.v, -1, 1);
      if (exitAfter !== null && exitAge < 0 && skater.grind.time >= exitAfter) exitAge = 0;
    }
    if (exitAge >= 0) { input.ollie = exitAge < .3; input.grind = false; exitAge += dt; }
    input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous; previous = input.ollie;
    skater.update(dt, input); if (exited && skater.state === 'ride' && skater.score > 0) break;
  }
  return { captured, bails, longest, visited: visited.size, score: skater.score, position: skater.pos.toArray() };
}

test('Default scale expands X/Z once while authoring data and human-sized heights stay intact', () => {
  assert.equal(ROC_CITY_HORIZONTAL_SCALE, scale); assert.equal(level.horizontalScale, scale);
  assert.deepEqual(level.group.scale.toArray(), [scale, 1, scale]);
  assert.deepEqual(authored.group.scale.toArray(), [1, 1, 1]);
  assert.equal(level.layout, ROC_CITY_LAYOUT); assert.equal(level.designLayout, ROC_CITY_LAYOUT);
  assert.deepEqual(level.worldScale, { x: scale, y: 1, z: scale });
  assert.deepEqual(level.toWorldPoint([2, 3, -4]), [2.5, 3, -5]);
  assert.deepEqual(level.toWorldXZ([2, -4]), [2.5, -5]);
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) close(level.bounds[key], authored.bounds[key] * scale, key);
  for (const [id, feature] of Object.entries(authored.features)) {
    assert.deepEqual(level.features[id].position, world(feature.position).toArray(), `${id} world feature position`);
    if (feature.secondEntry) assert.deepEqual(level.features[id].secondEntry, world(feature.secondEntry).toArray());
  }
  assert.equal(level.colliders.length, authored.colliders.length);
  assert.deepEqual(level.environment.cars, authored.environment.cars, 'Car authoring anchors do not change with world scale');
  for (let i = 0; i < level.colliders.length; i++) {
    const before = new THREE.Box3().setFromObject(authored.colliders[i]), after = new THREE.Box3().setFromObject(level.colliders[i]);
    const metadata = authored.colliders[i].userData;
    assert.equal(level.colliders[i].userData.category, metadata.category);
    assert.equal(level.colliders[i].userData.feature, metadata.feature);
    for (const bound of ['min', 'max']) {
      const expected = worldGeometry(before[bound].toArray(), metadata);
      for (const axis of ['x', 'y', 'z']) close(after[bound][axis], expected[axis], `${level.colliders[i].name} ${bound}.${axis}`);
    }
  }
  for (const [feature, count] of [['E', 7], ['G', 9]]) {
    const stair = level.colliders.find(mesh => mesh.userData.feature === feature && mesh.userData.steps);
    assert.equal(stair.userData.steps, count); assert.equal(stair.userData.rise, .18);
    close(new THREE.Box3().setFromObject(stair).getSize(new THREE.Vector3()).y, count * .18, `${feature} total rise`);
  }
  close(new THREE.Box3().setFromObject(level.mini).max.y, 1.62, 'mini height');
  close(new THREE.Box3().setFromObject(level.manualPad).getSize(new THREE.Vector3()).y, .48, 'manual-pad height');
  assert.equal(level.bailFloorY, -3);
});

test('Skater ray normals agree with actual transformed triangle geometry on curved and rotated surfaces', () => {
  let checked = 0, rejectsOldLocalTransform = 0;
  const meshes = [level.mini, level.bowl, level.hip.mesh, ...level.colliders.filter(mesh => mesh.userData.feature === 'I')];
  for (const mesh of meshes) {
    const geometry = mesh.geometry, positions = geometry.attributes.position, indices = geometry.index;
    const isolated = new Skater({ colliders: [mesh], rails: [], spawn: level.spawn }, () => .5);
    let sampled = 0;
    const count = (indices?.count || positions.count) / 3;
    for (let triangle = 0; triangle < count && sampled < 18; triangle++) {
      const vertices = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(triangle * 3 + k) : triangle * 3 + k));
      const localNormal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
      const points = vertices.map(point => mesh.localToWorld(point));
      const expected = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      if (expected.y < .15 || expected.y > .96) continue;
      const center = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
      const hit = isolated.raycast(center.clone().addScaledVector(up, .1), down, .2);
      if (!hit || hit.point.distanceTo(center) > .0001) continue;
      assert(hit.normal.distanceTo(expected) < 1e-6, `${mesh.name}: physics normal differs from visible world surface`);
      if (localNormal.applyQuaternion(mesh.quaternion).distanceTo(expected) > .025) rejectsOldLocalTransform++;
      sampled++; checked++;
    }
  }
  assert(checked >= 45, `Exercise several curved/rotated surface orientations, sampled ${checked}`);
  assert(rejectsOldLocalTransform >= 35, 'The test must reject the previous local-quaternion normal calculation');
});

test('World rails preserve every link and coincide with their scaled rods, bars and painted trim', () => {
  assert.equal(level.rails.length, authored.rails.length);
  let rods = 0;
  for (let i = 0; i < level.rails.length; i++) {
    const rail = level.rails[i], before = authored.rails[i];
    assert.equal(rail.category, before.category); assert.equal(rail.feature, before.feature);
    assert(rail.a.distanceTo(worldGeometry(before.a.toArray(), before)) < 1e-7, `${rail.feature} start follows its world placement`);
    assert(rail.b.distanceTo(worldGeometry(before.b.toArray(), before)) < 1e-7, `${rail.feature} end follows its world placement`);
    close(rail.a.distanceTo(rail.b), rail.len, 'rail length'); close(rail.dir.length(), 1, 'normalized rail tangent');
    assert(rail.a.clone().addScaledVector(rail.dir, rail.len).distanceTo(rail.b) < 1e-7);
    for (const end of ['a', 'b']) {
      const link = rail[`${end}Link`], oldLink = before[`${end}Link`];
      assert.equal(Boolean(link), Boolean(oldLink)); if (!link) continue;
      assert.equal(link.dir, oldLink.dir); assert.equal(level.rails.indexOf(link.rail), authored.rails.indexOf(oldLink.rail));
      const destination = end === 'b' ? (link.dir === 1 ? link.rail.a : link.rail.b) : (link.dir === -1 ? link.rail.b : link.rail.a);
      assert(rail[end].distanceTo(destination) < 1e-7, 'Linked rail endpoints stay coincident');
    }
    for (const mesh of rail.visuals || []) if (mesh.geometry.type === 'CylinderGeometry') {
      const half = mesh.geometry.parameters.height / 2;
      const a = mesh.localToWorld(new THREE.Vector3(0, -half, 0)), b = mesh.localToWorld(new THREE.Vector3(0, half, 0));
      assert(a.distanceTo(rail.a) < 1e-6 && b.distanceTo(rail.b) < 1e-6, 'Visible rod axis matches both world rail endpoints'); rods++;
    }
  }
  assert(rods > 150);
  for (const { rail, mesh } of level.paintedTrim) for (const t of [.1, .5, .9]) {
    const point = rail.a.clone().lerp(rail.b, t), hit = support(point.x, point.z, [mesh]);
    assert(hit); close(hit.point.y, point.y, 'Paint lies on grind surface', .006);
  }
  const flat = level.rails.find(rail => rail.feature === 'J'), midpoint = flat.a.clone().lerp(flat.b, .5);
  close(support(midpoint.x, midpoint.z, flat.visuals).point.y, midpoint.y, 'Flatbar visible top');
});

test('Spawn and every pickup use the enlarged world with their original height and collection radius', () => {
  assert(level.spawn.pos.distanceTo(world(authored.spawn.pos.toArray())) < 1e-8);
  assert(level.spawn.heading.distanceTo(authored.spawn.heading) < 1e-8);
  close(support(level.spawn.pos.x, level.spawn.pos.z).point.y, level.spawn.pos.y, 'Spawn floor');
  assert.deepEqual(createRocPickups(1), ROC_PICKUPS_AUTHORED); assert.deepEqual(createRocPickups(), ROC_PICKUPS);
  const skater = new Skater(level, () => .5), goals = new GoalRun(new GoalProgress(null), ROC_PICKUPS); goals.start({ skater });
  for (let i = 0; i < ROC_PICKUPS.length; i++) {
    const pickup = ROC_PICKUPS[i], before = ROC_PICKUPS_AUTHORED[i], point = world(before.position);
    assert.deepEqual(pickup.position, point.toArray()); assert.equal(pickup.radius, before.radius); assert.equal(pickup.surfaceY, before.surfaceY);
    const hit = support(point.x, point.z); assert(hit, `${pickup.id} has collision support`);
    close(hit.point.y, pickup.surfaceY, `${pickup.id} surface height`, .025);
    // Local placement is a support/collection check, not a traversable route.
    // Clear the prior sweep through the public collection-disable boundary.
    goals.update(skater, { collect: false });
    skater.pos.set(point.x, pickup.surfaceY, point.z); skater.state = 'ride'; goals.update(skater);
    assert(goals.collected.has(pickup.id), `${pickup.id} can collect at its actual world destination`);
  }
  for (const goal of ['skate', 'caps', 'tape']) assert(goals.completed.has(goal));
});

test('Outdoor art, trail support, bridge columns and rail supports share the same world scale', () => {
  const dressing = level.group.getObjectByName('ROC City / Riverway landscape and I-490');
  for (const point of trailPoints(ROC_CITY_LAYOUT).slice(1, -1)) {
    const x = point.x * scale, z = point.z * scale, physical = support(x, z);
    assert(physical); close(physical.point.y, ROC_CITY_LAYOUT.trailY, 'Trail physical height', .002);
    ray.set(new THREE.Vector3(x, 12, z), down); ray.far = 30;
    const visible = ray.intersectObject(dressing, true).find(hit => hit.object.name === 'Riverway asphalt');
    assert(visible); close(visible.point.y, physical.point.y, 'Visible and physical trail', .002);
  }
  const columns = level.colliders.filter(mesh => mesh.name === 'I-490 bridge column');
  assert.equal(columns.length, art.pierBounds.length);
  for (const bounds of art.pierBounds) {
    const physical = columns.find(mesh => {
      const position = mesh.getWorldPosition(new THREE.Vector3()); return Math.hypot(position.x - bounds.x, position.z - bounds.z) < 1e-7;
    });
    assert(physical, 'Visible bridge pier world bounds match a real collider');
    const size = new THREE.Box3().setFromObject(physical).getSize(new THREE.Vector3());
    close(size.x, bounds.width, 'Pier width'); close(size.y, bounds.height, 'Pier height'); close(size.z, bounds.depth, 'Pier depth');
  }
  for (const entry of level.railSupports) for (const local of [entry.bottom, entry.otherBottom].filter(Boolean)) {
    const point = level.group.localToWorld(local.clone()), physical = support(point.x, point.z);
    assert(physical); assert(physical.point.distanceTo(point) < .002, 'Scaled brace foot remains on its physical floor');
  }
  for (const [x, z] of [[-42, -20], [-44, 0], [-47, 20]]) assert.equal(support(x * scale, z * scale), undefined, 'River stays unsupported');
});

test('The wider mini still supports repeated passes in both directions using ordinary push input', () => {
  const mini = ROC_CITY_LAYOUT.mini;
  for (const sign of [-1, 1]) {
    // The unobstructed w=-1 lane avoids the legitimate extension-edge grind
    // assist; dedicated coping/extension cases validate those separate routes.
    const skater = rider([mini.center[0]+mini.axis[1],0,mini.center[1]-mini.axis[0]],[mini.axis[0] * sign,0,mini.axis[1] * sign]);
    let min = Infinity, max = -Infinity, landings = 0; const bails = [];
    skater.events.bail = reason => bails.push(reason); skater.events.land = () => landings++;
    for (let i = 0; i < 1200; i++) {
      skater.update(dt, { ...makeState(), push: 1 });
      const along = (skater.pos.x - mini.center[0] * scale) * mini.axis[0] + (skater.pos.z - mini.center[1] * scale) * mini.axis[1];
      min = Math.min(min, along); max = Math.max(max, along);
    }
    assert.deepEqual(bails, []); assert(landings >= 3, `Repeated transitions return to the flat, ${landings} landings`);
    assert(min < -mini.flatHalf * scale && max > mini.flatHalf * scale, 'Both widened opposing transitions are reached');
  }
});

test('The steep-lip fix preserves slow and sideways deck crossings and launches only upward momentum', () => {
  const mini = ROC_CITY_LAYOUT.mini, axis = new THREE.Vector3(mini.axis[0], 0, mini.axis[1]);
  for (const mode of ['slow', 'sideways', 'fast']) {
    // Start just inside the actual uppermost curved cell. Each case crosses onto
    // the same flat apron in one step; only the fast uphill case exceeds 2.9m/s.
    const along = -(mini.flatHalf + mini.height) * scale + .00015;
    const origin = new THREE.Vector3(mini.center[0] * scale + axis.x * along, 8, mini.center[1] * scale + axis.z * along);
    const skater = new Skater(level, () => .5), hit = skater.raycast(origin, down, 12);
    assert(hit && hit.normal.y < .2); skater.pos.copy(hit.point); skater.normal.copy(hit.normal);
    const uphill = axis.clone().negate().projectOnPlane(skater.normal).normalize();
    const sideways = new THREE.Vector3(-axis.z, 0, axis.x);
    skater.heading.copy(mode === 'sideways' ? sideways.multiplyScalar(.98).addScaledVector(uphill, .18).normalize() : uphill);
    skater.facing.copy(skater.heading).setY(0).normalize(); skater.speed = mode === 'slow' ? 2.5 : 7;
    skater.vel.copy(skater.heading).multiplyScalar(skater.speed);
    skater.update(dt, { ...makeState(), autoPush: false });
    if (mode === 'fast') { assert.equal(skater.state, 'air'); assert(skater.vel.y > 6); }
    else { assert.equal(skater.state, 'ride', `${mode} must not falsely launch`); assert(skater.normal.y > .999, 'The rider really crossed onto flat deck'); }
  }
});

test('Bowl pockets, street connectors and the A-frame remain reachable on scaled collision surfaces', () => {
  for (const points of [
    [[1,-15],[-7,-15]], [[-7,-15],[1,-15]], [[-5,3],[-5,-3]], [[-5,-3],[-5,3]],
    [[1,-10],[7,-10]], [[7,-10],[1,-10]], [[14.2,-6],[14.2,8]],
    [[8,16],[8,28]], [[8,28],[8,16]], [[4.5,16],[4.5,30]],
  ]) {
    const result = route(points, 7); assert(result.reached, `${JSON.stringify(points)}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.bails, []); assert(result.maximum - result.minimum > .8, 'A real grade change is traversed');
  }
  const skater = groundRider(10 * scale, .7 * scale, 1, 0), bails = []; let maximum = 0, landed = false;
  skater.events.bail = reason => bails.push(reason); skater.events.land = () => { landed = true; };
  for (let i = 0; i < 450; i++) { skater.update(dt, { ...makeState(), push: 1 }); maximum = Math.max(maximum, skater.pos.y); }
  assert.deepEqual(bails, []); assert(maximum > 1.5 && landed, 'The continuous quarter hip launches and lands');
});

test('Seven/nine-stair rails, A-frame and hip coping accept real ollie approaches in the enlarged park', () => {
  for (const feature of ['E', 'G']) {
    const rail = level.rails.find(item => item.feature === feature && item.kind === 'rail');
    // Pop distance is a skating timing, not an authored geometric dimension.
    const result = grindRoute([rail], { lead: feature === 'G' ? 5.5 : 7, pop: feature === 'G' ? 2 : 3.5 });
    assert(result.captured.some(capture => capture.target && capture.dir === 1), `${feature}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.bails, [], feature); assert(result.longest > .1 && result.score > 100, `${feature}: ${JSON.stringify(result)}`);
  }
  for (const [name, rails] of [['A-frame', level.hip.backRail], ['hip coping', level.hip.frontCoping]]) for (const dir of [1, -1]) {
    const result = grindRoute(rails, { dir });
    assert(result.captured.some(capture => capture.target && capture.dir === dir), `${name}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.bails, [], name); assert(result.longest > 1 && result.visited >= 3 && result.score > 100, `${name}: ${JSON.stringify(result)}`);
  }
  const pool = level.rails.filter(rail => rail.feature === 'D');
  for (const dir of [1, -1]) {
    const result = grindRoute(pool, { dir, exitAfter: 1.5 });
    assert(result.captured.some(capture => capture.target && capture.dir === dir), JSON.stringify(result));
    assert.deepEqual(result.bails, []); assert(result.longest > 1.7 && result.visited > 8 && result.score > 100, JSON.stringify(result));
  }
});

test('Both bridge quarter heights launch and return to the lower promenade', () => {
  for (const x of [7.5, 13]) {
    const skater = rider([x,-.9,43], [0,0,1], 8), bails = []; let maximum = -.9, landed = false;
    skater.events.bail = reason => bails.push(reason); skater.events.land = () => { landed = true; };
    for (let i = 0; i < 600; i++) { skater.update(dt, { ...makeState(), push: 1 }); maximum = Math.max(maximum, skater.pos.y); }
    assert.deepEqual(bails, []); assert(maximum > (x < 11 ? 1.3 : 1.9) && landed, `Quarter x=${x}: peak ${maximum}, landed ${landed}`);
    assert(skater.pos.y >= -.91, 'Return reaches the supported lower promenade');
  }
});

test('All five SKATE letters remain reachable from the default spawn within 120 seconds', () => {
  const skater = new Skater(level, () => .5), goals = new GoalRun(new GoalProgress(null), ROC_PICKUPS);
  goals.start({ skater }); let index = 0, time = 0; const bails = []; skater.events.bail = reason => bails.push(reason);
  const startLetter=ROC_PICKUPS_AUTHORED.find(pickup=>pickup.id==='letter-s').position;
  const route = [[startLetter[0],startLetter[2],'letter-s'],[6.1,-39.5],[9.5,-36.5],[10,-31],[10,-25,'letter-k'],[9,-15],[9,-10,'letter-a'],[7,0],[4,0],[1,1,'letter-t'],[3,2.5],[7,3],[7,13],[8,27],[8,43,'letter-e']];
  while (time < 120 && !goals.completed.has('skate') && !bails.length) {
    const [x, z, pickup] = route[index], dx = x * scale - skater.pos.x, dz = z * scale - skater.pos.z;
    const angle = Math.atan2(skater.heading.x * dz - skater.heading.z * dx, skater.heading.x * dx + skater.heading.z * dz);
    const desired = index <= 1 ? 3.2 : index >= 8 && index <= 11 ? 3 : Math.abs(angle) > .65 ? 3.5 : 7;
    const input = makeState(); input.steer = skater.state === 'ride' ? THREE.MathUtils.clamp(angle * 1.8, -1, 1) : 0;
    input.push = skater.speed < desired ? 1 : 0; input.brake = skater.speed > desired + .25 ? .5 : 0;
    skater.update(dt, input); goals.update(skater); time += dt;
    if (pickup ? goals.collected.has(pickup) : Math.hypot(dx, dz) < .75) index = Math.min(index + 1, route.length - 1);
  }
  assert.deepEqual(bails, []); assert(goals.completed.has('skate'), `Waypoint ${index} at ${skater.pos.toArray()}`);
  assert(time < 120); console.log(`  Enlarged SKATE route: ${time.toFixed(2)} seconds, no bails.`);
});

test('All five caps can be collected together from spawn within one ordinary run', () => {
  const skater = new Skater(level, () => .5), goals = new GoalRun(new GoalProgress(null), ROC_PICKUPS);
  goals.start({ skater }); let index = 0, time = 0, previous = false, released = false;
  const bails = []; skater.events.bail = reason => bails.push(reason);
  const route = [
    [2,-41],[-4,-40],[-7,-38],[-7,-30,'cap-1'],[-13,-28],[-17,-20],[-17,-14],[-15.3,-11],[-15.6,-7,'cap-2'],
    [-14,-3],[-12,3],[-8,5],[-2,5],[0,2],[4,0],[7,0],[7,6,'cap-3'],[8,16],[13,25],[13,35,'cap-4'],[13,40],[8,43],[8,46,'cap-5'],
  ];
  while (time < 120 && !goals.completed.has('caps') && !bails.length) {
    const [x, z, pickup] = route[index], dx = x * scale - skater.pos.x, dz = z * scale - skater.pos.z;
    const angle = Math.atan2(skater.heading.x * dz - skater.heading.z * dx, skater.heading.x * dx + skater.heading.z * dz);
    const desired = index < 3 ? 3.2 : index < 13 ? 4 : Math.abs(angle) > .65 ? 3.5 : 7;
    const input = makeState(); input.steer = skater.state === 'ride' ? THREE.MathUtils.clamp(angle * 1.8, -1, 1) : 0;
    input.push = skater.speed < desired ? 1 : 0; input.brake = skater.speed > desired + .25 ? .5 : 0;
    input.ollie = pickup === 'cap-4' && skater.pos.z < 28.8 * scale && !released;
    input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous;
    if (input.ollieReleased) released = true; previous = input.ollie;
    skater.update(dt, input); goals.update(skater); time += dt;
    if (pickup ? goals.collected.has(pickup) : Math.hypot(dx, dz) < .7) index = Math.min(index + 1, route.length - 1);
  }
  assert.deepEqual(bails, []); assert(goals.completed.has('caps'), `Waypoint ${index} at ${skater.pos.toArray()}`);
  assert(time < 120); console.log(`  Enlarged cap route: ${time.toFixed(2)} seconds, no bails.`);
});

test('Every cap and the secret tape have real ride or ollie approaches at their scaled destinations', () => {
  for (const [id, from, release, speed] of [
    ['cap-1',[-7,1.62,-38],null,7], ['cap-2',[-15.3,1.62,-11],null,7], ['cap-3',[7,0,0],null,7],
    ['cap-4',[13,-.9,23],28.8,7], ['cap-5',[8,-.9,40],null,7], ['secret-tape',[7.5,-.9,41],48.4,8],
  ]) {
    const skater = rider(from, [0,0,1], speed), goals = new GoalRun(new GoalProgress(null), ROC_PICKUPS);
    goals.start({ skater }); let previous = false, released = false; const bails = []; skater.events.bail = reason => bails.push(reason);
    for (let i = 0; i < 600 && !goals.collected.has(id) && !bails.length; i++) {
      const input = makeState(); input.push = 1; input.ollie = release !== null && skater.pos.z < release * scale && !released;
      input.olliePressed = input.ollie && !previous; input.ollieReleased = !input.ollie && previous;
      if (input.ollieReleased) released = true; previous = input.ollie;
      skater.update(dt, input); goals.update(skater);
    }
    assert.deepEqual(bails, [], id); assert(goals.collected.has(id), `${id}: position ${skater.pos.toArray()}`);
  }
});

test('The unchanged score goals remain attainable with real flips, grabs and linked manuals', () => {
  const skater = rider([7,0,-16], [0,0,1], 5);
  let previousOllie = false, previousGrab = false, jumps = 0, flick = 0, charge = 0;
  let time = 0, mode = 'chain', target = -1, best = 0, bails = 0, grabAllowed = false;
  skater.events.bail = () => bails++;
  skater.events.ollie = () => { jumps++; flick = 0; charge = 0; grabAllowed = false; };
  skater.events.land = points => {
    if (!points) return; best = Math.max(best, points); mode = 'brake';
    target = skater.heading.z > 0 ? -1 : 1; jumps = 0; charge = 0;
  };
  const remainingAir = () => {
    for (let ahead = .05; ahead < 1.5; ahead += .05) {
      const x = skater.pos.x + skater.vel.x * ahead, z = skater.pos.z + skater.vel.z * ahead;
      const y = skater.pos.y + skater.vel.y * ahead - skater.T.gravity * .5 * ahead * ahead;
      const hit = support(x, z); if (hit && y < hit.point.y + .05) return ahead;
    }
    return 1.5;
  };
  while (time < 100 && skater.score < 35000) {
    const input = makeState();
    if (mode === 'chain') {
      input.push = 1;
      if (skater.state === 'ride') {
        charge += dt; input.ollie = charge < .57;
        input.stickY = skater.manual ? THREE.MathUtils.clamp(-skater.manualBalance.x * 3 - skater.manualBalance.v, -1, 1) : 0;
      }
      if (skater.state === 'air') {
        input.flipPressed = skater.airTime > .02 && skater.airTime < .04 && remainingAir() > .48;
        if (skater.airTime > .46 && skater.airTime < .48) grabAllowed = remainingAir() > .31;
        input.grab = grabAllowed && skater.airTime > .46 && skater.airTime < .66;
        if (jumps < 3 && skater.airTime > .35 && flick < 3) input.stickY = [0,-1,1][flick++];
      }
    } else if (mode === 'brake') {
      input.brake = 1; if (skater.speed < 1.8) mode = 'turn';
    } else {
      const angle = Math.atan2(skater.heading.x * target, skater.heading.z * target);
      input.steer = -1; input.push = skater.speed < 2.5 ? 1 : 0; input.brake = skater.speed > 2.8 ? .5 : 0;
      if (Math.abs(angle) < .03) { mode = 'chain'; charge = 0; }
    }
    input.olliePressed = input.ollie && !previousOllie; input.ollieReleased = !input.ollie && previousOllie; previousOllie = input.ollie;
    input.grabPressed = input.grab && !previousGrab; previousGrab = input.grab;
    skater.update(dt, input); time += dt;
  }
  assert(skater.score >= 35000 && time < 100, `Score ${skater.score} in ${time.toFixed(2)}s; ${bails} bails`);
  assert(best >= 5000); assert(bails <= 3, 'The line allows ordinary recovery without demanding a perfect run');
  console.log(`  Enlarged score route: ${skater.score} in ${time.toFixed(2)} seconds; best combo ${best}; ${bails} bails.`);
});

test('The warehouse retains its original layout apart from the intentional 4 cm backstop recess', () => {
  const warehouse = new Level(); warehouse.group.updateMatrixWorld(true);
  const candidates=warehouse.colliders.filter(mesh=>mesh.geometry.type==='BoxGeometry'
    && mesh.position.x===0 && mesh.position.y===1.1 && mesh.position.z>22.5 && mesh.position.z<23);
  assert.equal(candidates.length,1,'Identify only the south-bank backstop');
  const backstop=candidates[0],bounds=new THREE.Box3().setFromObject(backstop);
  close(bounds.min.z,22.5,'The rideable bank-to-backstop join remains unchanged');
  close(bounds.max.z,22.96,'The rear face is recessed 4 cm from the wall columns');
  close(bounds.min.x,-11,'Backstop west edge');close(bounds.max.x,11,'Backstop east edge');
  close(bounds.min.y,0,'Backstop base');close(bounds.max.y,2.2,'Backstop height');
  const colliderData=mesh=>{
    const positions=Array.from(mesh.geometry.attributes.position.array),matrix=mesh.matrixWorld.toArray();
    if(mesh===backstop){
      // Undo only the approved depth/centre change in this serialized copy.
      // Preserve the old golden for every other vertex, transform, rail and
      // spawn; a newly generated whole-warehouse hash would hide regressions.
      for(let i=2;i<positions.length;i+=3){
        close(Math.abs(positions[i]),.23,'Recessed backstop local depth');
        positions[i]=Math.sign(positions[i])*.25;
      }
      matrix[14]=22.75;
    }
    return [mesh.name,positions,mesh.geometry.index?Array.from(mesh.geometry.index.array):null,matrix];
  };
  const data = {
    spawn: { pos: warehouse.spawn.pos.toArray(), heading: warehouse.spawn.heading.toArray() },
    rails: warehouse.rails.map(rail => [rail.kind, rail.a.toArray(), rail.b.toArray(), rail.dir.toArray(), rail.len]),
    colliders: warehouse.colliders.map(colliderData),
  };
  // Captured before the ROC scale change, including all 58 warehouse colliders.
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'), '49511f243d27fe70308a483bdcda0614aadc11e621c6c5df3ceb0fbbdf0f5edf');
});

art.dispose();
console.log(`${passed} ROC world-scale checks passed${failed ? `, ${failed} failed` : ''}.`);
if (failed) process.exitCode = 1;

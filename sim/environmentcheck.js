// Fixed player-height environment comparisons. Run against a built preview or
// public deployment; this never modifies game source, saved progress, or dist.
// node sim/environmentcheck.js URL OUTPUT_DIRECTORY
// QA_BASELINE_REPORT=screenshots/environment/before/report.json adds deltas.
// QA_FINAL=1 also checks native touch traversal and repeated cached level swaps.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserQA } from './browser-qa.js';

const url = process.argv[2] || 'http://127.0.0.1:4176';
const output = resolve(process.argv[3] || 'screenshots/environment/after');
const baseline = process.env.QA_BASELINE_REPORT
  ? JSON.parse(await readFile(process.env.QA_BASELINE_REPORT, 'utf8')) : null;
// These are the public-v14 baseline cameras, in authored coordinates. Loading a
// report preserves that report's exact definitions for subsequent comparisons.
const views = baseline?.audit.views || [
  { name: 'north-entry-to-bowl', level: 'roc-city-skatepark', position: [2, 3.24, -42], target: [-5, 1.8, -23], fov: 62 },
  { name: 'flower-to-city', level: 'roc-city-skatepark', position: [10, 2.9, -22], target: [2, 4, -47], fov: 62 },
  { name: 'bowl-to-trail-trees', level: 'roc-city-skatepark', position: [-15.5, 3.25, -17], target: [-27, 3, -20], fov: 62 },
  { name: 'street-east-buildings', level: 'roc-city-skatepark', position: [13.2, 1.65, -10], target: [43, 4.5, -10], fov: 62 },
  { name: 'south-underpass', level: 'roc-city-skatepark', position: [10, .75, 29], target: [10, 1.7, 49], fov: 62 },
  { name: 'bridge-pier-riprap', level: 'roc-city-skatepark', position: [13, .72, 40], target: [20, 1.5, 43], fov: 62 },
  { name: 'landscape-sidewalk-edge', level: 'roc-city-skatepark', position: [15.6, 1.65, -28], target: [19.8, .2, -20], fov: 62 },
  { name: 'wide-establishing', level: 'roc-city-skatepark', position: [-31, 17, -40], target: [-1, 0, 7], fov: 62 },
  { name: 'warehouse-control', level: 'genesee-warehouse', position: [-7.2, 1.7, 17.4], target: [-4, .88, 14], fov: 45 },
];
const profiles = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'touch-landscape', width: 844, height: 390, touch: true },
];
const qa = await browserQA({ url, output, name: 'environment' });
qa.report.audit = {
  label: process.env.QA_LABEL || 'Fixed environment comparison',
  coordinateSpace: 'Authored X/Z scaled by current level.horizontalScale; Y unchanged',
  timingCaveat: 'Rough elapsed wall time for deterministic headless application frames, including JS, rendering submission and scheduler yields. Not display FPS, GPU timing, a hardware benchmark, or physical-device performance.',
  baselineReport: process.env.QA_BASELINE_REPORT || null,
  views, profiles: [],
};

try {
  for (const profile of profiles) {
    // Coarse-pointer state must be established before the application boots.
    await qa.resize(profile.width, profile.height, profile.touch);
    const address = new URL(url);
    if (profile.touch) address.searchParams.set('touch', '');
    await qa.navigate(address.href);
    const results = { ...profile, views: [] };
    const previousProfile = baseline?.audit.profiles.find(p => p.name === profile.name);
    qa.report.audit.profiles.push(results);
    await qa.check(`${profile.name}: fixed actual environment views and rendering workload`, async () => {
      for (const view of views) {
        await qa.evaluate(`__game.selectLevel(${JSON.stringify(view.level)});__game.startRun('free')`);
        await qa.step(2);
        await qa.evaluate('Promise.all([__game.atmosphere.ready,__game.floorSurface.ready,__game.collectibles.ready,document.fonts.ready])');
        if (view.level === 'genesee-warehouse') {
          await qa.evaluate(`(() => {
            const g = __game, s = g.skater;
            s.pos.set(-4, 0, 14); s.heading.set(0, 0, 1); s.facing.copy(s.heading);
            s.speed = 0; s.vel.set(0, 0, 0); s.modelQuat.identity();
            g.character.root.position.copy(s.pos); g.character.root.quaternion.identity();
            for (let i = 0; i < 90; i++) g.character.update(s, 1/60, 0);
          })()`);
        }
        const record = await qa.evaluate(`(() => {
          const g = __game, v = ${JSON.stringify(view)}, scale = g.level.horizontalScale || 1;
          for (const el of document.body.children) if (el.id !== 'game' && el.tagName !== 'SCRIPT') el.style.display = 'none';
          g.camera.up.set(0, 1, 0);
          g.camera.position.set(v.position[0] * scale, v.position[1], v.position[2] * scale);
          g.camera.lookAt(v.target[0] * scale, v.target[1], v.target[2] * scale);
          g.camera.fov = v.fov; g.camera.updateProjectionMatrix();
          g.renderer.render(g.scene, g.camera);
          return {
            name: v.name, level: v.level, scale,
            positionWorld: g.camera.position.toArray(),
            targetWorld: [v.target[0] * scale, v.target[1], v.target[2] * scale], fov: v.fov,
            renderer: {
              calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles,
              geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures,
              programs: g.renderer.info.programs?.length, pixelRatio: g.renderer.getPixelRatio(),
              shadows: g.renderer.shadowMap.enabled, colliders: g.level.colliders.length, rails: g.level.rails.length,
            },
            webglError: g.renderer.getContext().getError(),
          };
        })()`);
        assert.equal(record.webglError, 0, view.name + ': WebGL error');
        const previous = previousProfile?.views.find(v => v.name === view.name);
        if (previous) {
          assert.deepEqual(record.positionWorld, previous.positionWorld, view.name + ': comparison camera moved');
          assert.deepEqual(record.targetWorld, previous.targetWorld, view.name + ': comparison target moved');
          assert.equal(record.fov, previous.fov);
          assert.equal(record.renderer.colliders, previous.renderer.colliders, view.name + ': collider count changed');
          assert.equal(record.renderer.rails, previous.renderer.rails, view.name + ': rail count changed');
          record.delta = Object.fromEntries(['calls', 'triangles', 'geometries', 'textures', 'programs'].map(key => [key, record.renderer[key] - previous.renderer[key]]));
        }
        results.views.push(record);
        await qa.shot(profile.name + '-' + view.name);
      }
      await qa.evaluate("__game.selectLevel('roc-city-skatepark');__game.startRun('free')");
      await qa.step(24);
      results.timing = await qa.evaluate(`(async () => {
        const batches = [];
        for (let i = 0; i < 10; i++) {
          const start = Date.now(); await __qa.step(12); batches.push((Date.now() - start) / 12);
        }
        const sorted = [...batches].sort((a, b) => a - b);
        return {
          method: 'Date.now wall time around ten batches of twelve real application RAF callbacks', frames: 120,
          batchesMsPerFrame: batches, medianMsPerFrame: sorted[5], p90MsPerFrame: sorted[8],
          minMsPerFrame: sorted[0], maxMsPerFrame: sorted[9], shadows: __game.renderer.shadowMap.enabled,
        };
      })()`);
      if (previousProfile) results.timing.deltaMedianMsPerFrame = results.timing.medianMsPerFrame - previousProfile.timing.medianMsPerFrame;
      return { views: results.views.length, timing: results.timing };
    });
  }
  if (process.env.QA_FINAL === '1') {
    await qa.resize(844, 390, true);
    const address = new URL(url); address.searchParams.set('touch', '');
    await qa.navigate(address.href);
    await qa.check('native touch landscape traversal from street into the underpass', async () => {
      await qa.evaluate(`(() => {
        const g = __game; g.selectLevel('roc-city-skatepark'); g.startRun('free');
        const s = g.skater, scale = g.level.horizontalScale;
        // A flat, unobstructed street approach; all following motion comes from
        // real touch delivery, the input merger, and normal application frames.
        s.pos.set(6.5 * scale, 0, -15 * scale); s.heading.set(0, 0, 1);
        s.facing.copy(s.heading); s.speed = 0; s.vel.set(0, 0, 0);
        g.followCam.snap(s); __qa.traversal = { start: s.pos.toArray(), bails: 0, ollies: 0, lands: 0 };
        for (const [event, key] of [['bail','bails'], ['ollie','ollies'], ['land','lands']]) {
          const original = s.events[event];
          s.events[event] = (...args) => { __qa.traversal[key]++; original?.(...args); };
        }
      })()`);
      await qa.step(2);
      const stick = await qa.evaluate(`(() => {
        const r = document.getElementById('touch-stick').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, radius: r.width / 2 };
      })()`);
      await qa.down(31, '#touch-stick');
      await qa.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 31, x: stick.x, y: stick.y - stick.radius * .85, radiusX: 4, radiusY: 4, force: 1 }] });
      try {
        await qa.step(30);
        assert.ok(await qa.evaluate('__game.input.state.push > .9'), 'Native stick is not pushing');
        await qa.shot('touch-traversal-street');
        await qa.down(32, '#touch-ollie'); await qa.step(36); await qa.up(32);
        await qa.step(12); await qa.shot('touch-traversal-air');
        await qa.step(180); await qa.shot('touch-traversal-bank-approach');
        await qa.step(222); await qa.shot('touch-traversal-underpass');
      } finally {
        await qa.up(31); await qa.step(2);
      }
      const result = await qa.evaluate(`(() => {
        const g = __game, t = g.touchControls, s = t.source;
        return { ...__qa.traversal, end: g.skater.pos.toArray(), state: g.skater.state,
          horizontalScale: g.level.horizontalScale, touch: {
            pointers: t.pointers.size, owners: t.owners.size, held: s.held.size,
            pressed: s.pressed.size, released: s.released.size, stick: s.stick.active,
          }, webglError: g.renderer.getContext().getError() };
      })()`);
      assert.equal(result.bails, 0, 'Touch traversal bailed: ' + JSON.stringify(result));
      assert.ok(result.ollies >= 1 && result.lands >= 1, 'Touch ollie did not land');
      assert.ok(result.end[2] - result.start[2] > 60, 'Touch traversal did not cover the route');
      assert.ok(result.end[2] > 25 * result.horizontalScale && result.end[2] < 49 * result.horizontalScale, 'Traversal missed underpass');
      assert.ok(Math.abs(result.end[1] + .9) < .05 && result.state === 'ride', 'Traversal did not settle on the underpass floor');
      assert.deepEqual(result.touch, { pointers: 0, owners: 0, held: 0, pressed: 0, released: 0, stick: false });
      assert.equal(result.webglError, 0);
      return result;
    });
    await qa.check('bounded repeated level switches retain cached worlds without resource growth', async () => {
      const samples = await qa.evaluate(`(async () => {
        const g = __game, known = new Map(), samples = [];
        for (let cycle = 0; cycle < 8; cycle++) {
          for (const id of ['genesee-warehouse', 'roc-city-skatepark']) {
            g.showHome(); g.selectLevel(id); g.startRun('free');
            await Promise.all([g.atmosphere.ready, g.floorSurface.ready, g.collectibles.ready]);
            await __qa.step(2);
            if (known.has(id) && known.get(id) !== g.level) throw Error('Level cache replaced: ' + id);
            known.set(id, g.level);
            g.renderer.render(g.scene, g.camera);
          }
          if (cycle >= 2) {
            let objects = 0; g.scene.traverse(() => objects++);
            samples.push({ cycle, objects, geometries: g.renderer.info.memory.geometries,
              textures: g.renderer.info.memory.textures, programs: g.renderer.info.programs.length,
              webglError: g.renderer.getContext().getError() });
          }
        }
        return samples;
      })()`);
      const first = samples[0];
      for (const sample of samples) {
        assert.equal(sample.objects, first.objects, 'Scene objects grew after a cached level switch');
        assert.ok(sample.geometries <= first.geometries + 2, 'Geometry count grew after warmup');
        assert.ok(sample.textures <= first.textures + 1, 'Texture count grew after warmup');
        assert.equal(sample.programs, first.programs, 'Shader program count grew after warmup');
        assert.equal(sample.webglError, 0);
      }
      return { cycles: 8, switches: 16, samples };
    });
  }
  await writeFile(resolve(output, 'view-definitions.json'), JSON.stringify({
    coordinateSpace: qa.report.audit.coordinateSpace, views,
    profiles: qa.report.audit.profiles.map(p => ({
      name: p.name, width: p.width, height: p.height, touch: p.touch,
      views: p.views.map(({ name, level, scale, positionWorld, targetWorld, fov }) => ({ name, level, scale, positionWorld, targetWorld, fov })),
    })),
  }, null, 2) + '\n');
} finally {
  await qa.close();
}

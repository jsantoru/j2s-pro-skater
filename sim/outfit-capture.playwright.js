// Matching camera/pose comparisons; switch the output directory to outfit-before for a baseline.
async (page) => {
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/outfit-after/';
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), errors = [];
  qa.on('pageerror', e => errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await qa.addInitScript(() => { navigator.getGamepads = () => []; });
    await qa.goto('http://127.0.0.1:5173/'); await qa.waitForFunction(() => !!window.__game);
    await qa.evaluate(() => __game.floorSurface.ready);
    await qa.evaluate(() => { window.requestAnimationFrame = () => 0; }); await qa.waitForTimeout(100);
    await qa.evaluate(() => {
      const g = __game; g.startRun();
      for (const id of ['hud', 'start-btn', 'toast']) document.getElementById(id).style.display = 'none';
      g.character.root.position.set(-4, 0, 14); g.character.root.quaternion.identity();
      window.outfitPose = extra => {
        const s = { state: 'ride', crouch: 0, landSquash: 0, pushing: 0, stance: 1, lean: 0, speed: 0, bailT: 0, trick: null, grind: null, ...extra };
        g.character.pushPhase = 0; g.character.bobT = 0;
        for (let i = 0; i < 180; i++) g.character.update(s, 1 / 60, 0);
        g.scene.updateMatrixWorld(true);
      };
      window.outfitView = (pos, target, fov = 45) => {
        g.camera.position.set(...pos); g.camera.fov = fov; g.camera.lookAt(...target);
        g.camera.updateProjectionMatrix(); g.renderer.render(g.scene, g.camera);
      };
    });
    for (const [name, pos, target, pose] of [
      ['front', [-6.3, 1.5, 16.1], [-4, .9, 14], {}],
      ['back', [-1.9, 1.5, 12.8], [-4, .9, 14], {}],
      ['crouch', [-2.1, 1.15, 12.8], [-4, .69, 14], { crouch: 1 }],
      ['push', [-1.9, 1.35, 12.8], [-4, .86, 14], { pushing: 1 }],
      ['fakie-push', [-2.1, 1.45, 15.6], [-4, .86, 14], { pushing: 1, stance: -1 }],
      ['kickflip', [-1.9, 1.4, 12.7], [-4, .92, 14], { state: 'air', trick: { name: 'Kickflip', kind: 'flip', t: .22, dur: .5 } }],
      ['grab', [-2, 1.4, 12.5], [-4, .92, 14], { state: 'air', trick: { name: 'Indy', kind: 'grab', t: .2, dur: .5 } }],
      ['grind', [-1.8, 1.4, 12.2], [-4, .95, 14], { state: 'grind' }],
      ['landing', [-2.1, 1.1, 12.7], [-4, .68, 14], { landSquash: 1 }],
    ]) {
      await qa.evaluate(({ pos, target, pose }) => { outfitPose(pose); outfitView(pos, target); }, { pos, target, pose });
      await qa.screenshot({ path: root + name + '.png' });
    }
    for (const [name, bone, offset, target] of [
      ['hoodie-front', 'torso', [.60, .38, 1.02], [0, .24, 0]],
      ['hoodie-back', 'torso', [.44, .40, -1.05], [0, .24, 0]],
      ['cuffs', 'foot', [.56, .30, .25], [0, .17, -.04]],
      ['hair-and-hood', 'head', [.45, .13, -.68], [0, .06, -.02]],
    ]) {
      await qa.evaluate(({bone, offset, target}) => {
        outfitPose({}); const g = __game, b = bone === 'foot' ? g.character.lLeg.an : g.character[bone];
        const p = b.position.clone().set(...offset), t = b.position.clone().set(...target);
        b.localToWorld(p); b.localToWorld(t); outfitView(p.toArray(), t.toArray());
      }, { bone, offset, target });
      await qa.screenshot({ path: root + name + '.png' });
    }
    await qa.evaluate(() => {
      outfitPose({}); const g = __game, s = { state: 'ride', pos: g.character.root.position,
        heading: { x: 0, z: 1 }, facing: { x: 0, z: 1 }, vel: { x: 0, z: 8 }, speed: 8, steer: 0, spinVelocity: 0 };
      g.followCam.snap(s); for (let i = 0; i < 240; i++) g.followCam.update(1 / 60, s, 0);
      g.renderer.render(g.scene, g.camera);
    });
    await qa.screenshot({ path: root + 'gameplay-camera.png' });
    return { errors, metrics: await qa.evaluate(() => ({ calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures, gl: __game.renderer.getContext().getError() })) };
  } finally { await context.close(); }
}

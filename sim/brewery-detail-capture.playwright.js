// Run with Playwright browser_run_code_unsafe's filename argument.
async (page) => {
  const directory = 'brewery-detail-after';
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/' + directory + '/';
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const qa = await context.newPage(), errors = [];
  qa.on('pageerror', e => errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await qa.addInitScript(() => { navigator.getGamepads = () => []; });
    await qa.goto('http://127.0.0.1:5173');
    await qa.waitForFunction(() => !!window.__game);
    await qa.evaluate(() => __game.floorSurface.ready);
    await qa.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await qa.waitForTimeout(100);
    await qa.evaluate(() => {
      const g = __game; g.startRun(); document.querySelector('#hud').style.display = 'none';
      g.character.root.position.set(-4, 0, 14); g.character.root.quaternion.identity();
      window.pose = (extra = {}) => {
        for (let i = 0; i < 180; i++) g.character.update({ state: 'ride', crouch: 0, landSquash: 0, pushing: 0, stance: 1, lean: 0, speed: 0, bailT: 0, trick: null, grind: null, ...extra }, 1 / 60, i / 60);
        g.scene.updateMatrixWorld(true);
      };
      window.view = (pos, target) => {
        g.camera.position.set(...pos); g.camera.fov = 45; g.camera.lookAt(...target);
        g.camera.updateProjectionMatrix(); g.renderer.render(g.scene, g.camera);
      }; pose();
    });
    for (const [name, pos, target] of [
      ['keg-returns', [-23, 3.5, -13], [-29, 1.1, -20]],
      ['tank-bay', [-27, 3.4, -9], [-33, 2.0, -15]],
      ['beer-dispatch', [22, 3.5, -12], [28, 1.25, -20]],
      ['loading-area', [-16, 3, 14], [-24, 1.1, 20]],
      ['kegs-close', [-27, 1.7, -18.3], [-28.5, .8, -20.4]],
      ['cases-close', [27, 2.3, -16.8], [29.1, 1.2, -20]],
    ]) {
      await qa.evaluate(({pos, target}) => view(pos, target), {pos, target});
      await qa.screenshot({ path: root + name + '.png' });
    }
    for (const [name, offset] of [['face', [0, .04, .65]], ['hair-back', [.38, .07, -.58]]]) {
      await qa.evaluate(offset => {
        pose(); const g = __game, head = g.character.head;
        const target = head.position.clone().set(0, .135, 0); head.localToWorld(target);
        const position = head.position.clone().set(offset[0], .135 + offset[1], offset[2]); head.localToWorld(position);
        view(position.toArray(), target.toArray());
      }, offset);
      await qa.screenshot({ path: root + name + '.png' });
    }
    await qa.evaluate(() => {
      pose(); const foot = __game.character.lLeg.an;
      const p = foot.position.clone().set(.48, .16, .03), t = foot.position.clone().set(0, .08, -.025);
      foot.localToWorld(p); foot.localToWorld(t); view(p.toArray(), t.toArray());
    });
    await qa.screenshot({ path: root + 'ankle-shoe.png' });
    return { errors, metrics: await qa.evaluate(() => ({ calls: __game.renderer.info.render.calls, triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures, gl: __game.renderer.getContext().getError() })) };
  } finally { await context.close(); }
}

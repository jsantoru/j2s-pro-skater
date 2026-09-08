// Matching views for the Ruby Red captain; substitute captain-before for the baseline.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), errors = [], root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/captain-after/';
  qa.on('pageerror', e => errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await qa.addInitScript(() => { navigator.getGamepads = () => []; });
    await qa.goto('http://127.0.0.1:5173/'); await qa.waitForFunction(() => !!window.__game);
    await qa.evaluate(() => Promise.all([__game.floorSurface.ready, __game.level.captainReady]));
    await qa.evaluate(() => { window.requestAnimationFrame = () => 0; }); await qa.waitForTimeout(100);
    await qa.evaluate(() => {
      const g = __game; g.startRun(); g.character.root.visible = false;
      for (const id of ['hud','start-btn','toast']) document.getElementById(id).style.display = 'none';
      window.captainView = (p, t, fov = 48) => {
        g.camera.position.set(...p); g.camera.fov = fov; g.camera.lookAt(...t);
        g.camera.updateProjectionMatrix(); g.renderer.render(g.scene, g.camera);
      };
    });
    for (const [name, p, t] of [
      ['wall', [24, 4.5, 1.7], [35.8, 4.2, 1.7]],
      ['approach', [15, 2.9, 12], [35.8, 3.8, 4.5]],
      ['east-bays', [12, 4.2, -8], [35.8, 4, 4]],
    ]) {
      await qa.evaluate(({p,t}) => captainView(p,t), {p,t});
      await qa.screenshot({ path: root + name + '.png' });
    }
    return { errors, metrics: await qa.evaluate(() => ({ calls: __game.renderer.info.render.calls,
      triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures,
      gl: __game.renderer.getContext().getError() })) };
  } finally { await context.close(); }
}

// Comparable warehouse views in an isolated browser; change identity-after to identity-before for baseline.
async (page) => {
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/identity-after/';
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), errors = [];
  qa.on('pageerror', e => errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await qa.addInitScript(() => { navigator.getGamepads = () => []; });
    await qa.goto('http://127.0.0.1:5173/'); await qa.waitForFunction(() => !!window.__game);
    await qa.evaluate(() => __game.floorSurface.ready); await qa.evaluate(() => document.fonts.ready);
    await qa.waitForTimeout(600);
    await qa.evaluate(() => { window.requestAnimationFrame = () => 0; }); await qa.waitForTimeout(100);
    await qa.evaluate(() => {
      const g = __game;
      window.identityView = (p, t) => {
        g.camera.position.set(...p); g.camera.fov = 48; g.camera.lookAt(...t);
        g.camera.updateProjectionMatrix(); g.renderer.render(g.scene, g.camera);
      };
      identityView([-19, 5.8, 20], [0, 1, -5]);
    });
    await qa.screenshot({ path: root + 'title.png' });
    await qa.evaluate(() => {
      const g = __game; g.startRun(); g.character.root.visible = false;
      for (const id of ['hud','start-btn','toast']) document.getElementById(id).style.display = 'none';
    });
    for (const [name, p, t] of [
      ['floor', [-12, 4.8, 15], [-3, 0, 15]],
      ['east-wall', [20, 3.7, 9], [35.8, 3.9, 15]],
      ['brewery-sign', [-4, 5, -9], [0, 5, -22.8]],
      ['rochester-loading', [17, 3.3, -12], [19, 2.7, -22.8]],
      ['warehouse', [-19, 5.8, 20], [0, 1, -5]],
    ]) {
      await qa.evaluate(({p,t}) => identityView(p,t), {p,t});
      await qa.screenshot({ path: root + name + '.png' });
    }
    return { errors, metrics: await qa.evaluate(() => ({ calls: __game.renderer.info.render.calls,
      triangles: __game.renderer.info.render.triangles, textures: __game.renderer.info.memory.textures,
      gl: __game.renderer.getContext().getError() })) };
  } finally { await context.close(); }
}

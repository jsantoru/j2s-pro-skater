// Run via Playwright browser_run_code (filename). Uses an isolated browser context.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), report = { checks: [], errors: [] };
  const check = (ok, label) => { if (!ok) throw new Error(label); report.checks.push(label); };
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/warehouse-after/';
  qa.on('pageerror', e => report.errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await qa.addInitScript(() => { window.qaPad = null; navigator.getGamepads = () => window.qaPad ? [window.qaPad] : []; });
  try {
    await qa.goto('http://127.0.0.1:5173/');
    await qa.waitForFunction(() => !!window.__game); await qa.evaluate(() => __game.floorSurface.ready);
    for (const [width, height, label] of [[390, 844, 'phone'], [844, 390, 'landscape'], [1440, 900, 'desktop']]) {
      await qa.setViewportSize({ width, height }); await qa.screenshot({ path: root + 'title-' + label + '.png' });
      check(await qa.evaluate(() => { const r = document.querySelector('#overlay-msg').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'Drop In remains in ' + label + ' viewport');
    }
    await qa.getByRole('button', { name: /VIEW CONTROLS/ }).click();
    check(await qa.locator('#controls-panel').isVisible(), 'Controls button opens control map');
    await qa.keyboard.press('Tab'); await qa.waitForFunction(() => document.querySelector('#controls-panel').classList.contains('hidden'));
    check(!await qa.locator('#controls-panel').isVisible(), 'Tab closes control map');
    await qa.locator('#settings-btn').click(); check(await qa.locator('#settings-panel').isVisible(), 'Settings opens');
    await qa.locator('#music-toggle').focus(); await qa.keyboard.press('Space');
    check(await qa.evaluate(() => document.body.dataset.mode === 'title' && __game.settings.music), 'Keyboard settings activation does not start skating');
    await qa.keyboard.press('Space'); await qa.keyboard.press('Escape');
    await qa.getByRole('button', { name: /DROP IN/ }).click();
    check(await qa.evaluate(() => document.body.dataset.mode === 'playing'), 'Drop In starts run');
    for (const stance of [1, -1]) {
      await qa.evaluate(stance => { __game.startRun(); __game.skater.stance = stance; __game.skater.facing.copy(__game.skater.heading).multiplyScalar(stance); __game.skater.updateModelQuat(1); }, stance);
      await qa.keyboard.down('w'); await qa.waitForTimeout(650);
      check(await qa.evaluate(stance => {
        const c = __game.character, s = __game.skater;
        return s.pushing > 0 && c.hips.rotation.y * stance > .9 && c.head.getWorldDirection(s.pos.clone()).dot(s.heading) > .92;
      }, stance), 'Live ' + (stance > 0 ? 'regular' : 'fakie') + ' push faces travel');
      await qa.keyboard.up('w');
    }
    await qa.evaluate(() => __game.startRun());
    await qa.keyboard.down('Space'); await qa.waitForTimeout(600); await qa.keyboard.up('Space');
    await qa.waitForFunction(() => __game.skater.state === 'air');
    await qa.keyboard.press('j'); await qa.waitForFunction(() => __game.skater.score > 0);
    check(await qa.evaluate(() => __game.skater.state === 'ride' && __game.skater.score >= 100), 'Live keyboard ollie and kickflip land and score');
    await qa.keyboard.press('z'); await qa.waitForTimeout(50);
    check(await qa.evaluate(() => __game.skater.stance === -1), 'Keyboard revert changes stance');
    await qa.waitForTimeout(400); await qa.keyboard.press('c'); await qa.waitForTimeout(50);
    check(await qa.evaluate(() => __game.skater.stance === 1), 'Opposite revert returns to regular');
    // Set up an approach; the keyboard, rail magnet and effects run normally.
    await qa.evaluate(() => { const s = __game.skater; __game.startRun(); s.pos.set(-10.5, 0, 10); s.heading.set(1, 0, 0); s.facing.set(1, 0, 0); s.speed = 6; s.vel.set(6, 0, 0); s.updateModelQuat(1); __game.followCam.snap(s); });
    await qa.keyboard.down('Space'); await qa.waitForTimeout(220); await qa.keyboard.up('Space'); await qa.keyboard.press('l');
    await qa.waitForFunction(() => __game.skater.state === 'grind'); await qa.waitForTimeout(130);
    check(await qa.evaluate(() => __game.fx.sparks.mesh.visible && __game.fx.sparks.life.some(v => v > 0)), 'Live rail grind emits sparks');
    check(await qa.locator('#balance').isVisible(), 'Live grind shows balance meter');
    await qa.screenshot({ path: root + 'live-grind.png' });
    await qa.evaluate(() => { const s = __game.skater; __game.startRun(); s.pos.set(8, .8, -2); s.state = 'air'; s.vel.set(6, -1, 0); s.heading.set(1, 0, 0); s.facing.set(1, 0, 0); s.speed = 6; s.airTime = .2; s.popped = true; s.updateModelQuat(1); __game.followCam.snap(s); });
    await qa.keyboard.press('l'); await qa.waitForFunction(() => __game.skater.state === 'grind'); await qa.waitForTimeout(130);
    check(await qa.evaluate(() => __game.skater.grind.rail.kind === 'ledge' && __game.fx.dust.mesh.visible && !__game.fx.sparks.mesh.visible), 'Live concrete grind emits dust without sparks');
    await qa.screenshot({ path: root + 'live-ledge.png' });
    // Standard gamepad mapping through poll and fixed simulation steps.
    await qa.evaluate(() => { __game.startRun(); window.qaPad = { id: 'QA Standard Gamepad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; qaPad.buttons[0] = { pressed: true, value: 1 }; });
    await qa.waitForTimeout(550); await qa.evaluate(() => { qaPad.buttons[0] = { pressed: false, value: 0 }; });
    await qa.waitForFunction(() => __game.skater.state === 'air');
    check(await qa.evaluate(() => __game.input.hasGamepad), 'Standard gamepad A hold/release ollies through live polling');
    await qa.evaluate(() => { qaPad.buttons[2] = { pressed: true, value: 1 }; }); await qa.waitForTimeout(40); await qa.evaluate(() => { qaPad.buttons[2] = { pressed: false, value: 0 }; });
    await qa.waitForFunction(() => __game.skater.score > 0);
    check(await qa.evaluate(() => __game.skater.score >= 100), 'Standard gamepad X flip lands and scores');
    await qa.evaluate(() => { window.qaPad = null; __game.input.gamepadIndex = -1; __game.startRun(); __game.endRun(); });
    check(await qa.locator('#overlay').isVisible(), 'End of run shows replay screen');
    await qa.screenshot({ path: root + 'end-run.png' });
    await qa.locator('#overlay-msg').click(); check(await qa.evaluate(() => __game.skater.score === 0), 'Replay button resets score');
    report.playingTiming = await qa.evaluate(() => new Promise(resolve => { const a = []; let last = performance.now(); function tick(t) { a.push(t - last); last = t; if (a.length < 360) requestAnimationFrame(tick); else { a.sort((x, y) => x - y); resolve({ medianMs: a[180], p95Ms: a[342], frames: a.length }); } } requestAnimationFrame(tick); }));
    await qa.goto('http://127.0.0.1:5173/?lowfx'); await qa.waitForFunction(() => !!window.__game); await qa.evaluate(() => __game.floorSurface.ready);
    await qa.locator('#overlay-msg').click(); await qa.keyboard.down('Space'); await qa.waitForTimeout(500); await qa.keyboard.up('Space'); await qa.waitForFunction(() => __game.skater.state === 'air');
    check(await qa.evaluate(() => !__game.renderer.shadowMap.enabled && __game.floorSurface.reflectionPasses === 0 && Math.abs(__game.renderer.getPixelRatio() - 1) < .01), 'Lowfx plays with shadows/reflections disabled');
    await qa.screenshot({ path: root + 'lowfx-playing.png' });
    check(await qa.evaluate(() => __game.renderer.getContext().getError() === 0), 'No WebGL errors');
    check(report.errors.length === 0, 'No browser runtime or shader errors');
    return report;
  } finally { await context.close(); }
}

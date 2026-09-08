// Actual keyboard-driven movement using the normal game loop and follow camera.
// Run through Playwright browser_run_code_unsafe with the filename argument.
async (page) => {
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/outfit-after/live/';
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), report = { captures: [], errors: [] };
  qa.on('pageerror', e => report.errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await qa.addInitScript(() => { navigator.getGamepads = () => []; });
  const capture = async name => {
    report.captures.push(await qa.evaluate(name => {
      const s = __game.skater;
      return { name, state: s.state, speed: s.speed, crouch: s.crouch,
        pushing: s.pushing, stance: s.stance, trick: s.trick?.name, landSquash: s.landSquash, score: s.score };
    }, name));
    await qa.screenshot({ path: root + name + '.png' });
  };
  try {
    await qa.goto('http://127.0.0.1:5173/');
    await qa.waitForFunction(() => !!window.__game); await qa.evaluate(() => __game.floorSurface.ready);
    await qa.getByRole('button', { name: /DROP IN/ }).click();
    await qa.evaluate(() => {
      window.outfitChunks = [];
      window.outfitRecorder = new MediaRecorder(__game.renderer.domElement.captureStream(30), { mimeType: 'video/webm' });
      outfitRecorder.ondataavailable = e => outfitChunks.push(e.data);
      outfitRecorder.start();
    });
    for (const stance of [1, -1]) {
      await qa.evaluate(stance => {
        const s = __game.skater; __game.startRun(); s.stance = stance;
        s.facing.copy(s.heading).multiplyScalar(stance); s.updateModelQuat(1); __game.followCam.snap(s);
      }, stance);
      await qa.keyboard.down('w'); await qa.waitForTimeout(750);
      await capture(stance > 0 ? 'regular-push' : 'fakie-push');
      await qa.keyboard.up('w'); await qa.waitForTimeout(350);
      await capture(stance > 0 ? 'regular-ride' : 'fakie-ride');
    }
    // Reset to a clear flat spot, then let the input and simulation drive the whole jump.
    await qa.evaluate(() => __game.startRun());
    await qa.keyboard.down('w'); await qa.waitForTimeout(650); await qa.keyboard.up('w');
    await qa.keyboard.down('Space'); await qa.waitForTimeout(650);
    await capture('charged-crouch');
    await qa.keyboard.up('Space'); await qa.waitForFunction(() => __game.skater.state === 'air');
    await qa.keyboard.down('k');
    await qa.waitForFunction(() => __game.skater.trick?.kind === 'grab' && __game.skater.trick.t > .22);
    await capture('live-grab');
    await qa.keyboard.up('k');
    await qa.waitForFunction(() => __game.skater.state === 'ride' && __game.skater.landSquash > .1);
    await capture('live-landing');
    await qa.waitForTimeout(400);
    if (!await qa.evaluate(() => __game.skater.score >= 300)) throw new Error('Live grab did not land and score');
    await qa.evaluate(() => new Promise(resolve => {
      outfitRecorder.onstop = () => {
        window.outfitClip = URL.createObjectURL(new Blob(outfitChunks, { type: 'video/webm' }));
        outfitRecorder.stream.getTracks().forEach(track => track.stop()); resolve();
      };
      outfitRecorder.stop();
    }));
    const download = qa.waitForEvent('download');
    await qa.evaluate(() => { const a = document.createElement('a'); a.href = outfitClip; a.download = 'outfit-gameplay.webm'; a.click(); });
    await (await download).saveAs(root + 'outfit-gameplay.webm');
    if (report.errors.length) throw new Error(report.errors.join('\n'));
    return report;
  } finally { await context.close(); }
}

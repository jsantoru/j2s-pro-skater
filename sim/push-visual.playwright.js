// Run through Playwright browser_run_code_unsafe with the filename argument.
async (page) => {
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/warehouse-after/';
  const context = await page.context().browser().newContext({ viewport: { width: 960, height: 720 } });
  const qa = await context.newPage(), errors = [];
  qa.on('pageerror', e => errors.push(e.message));
  await qa.addInitScript(() => { navigator.getGamepads = () => []; });
  try {
    await qa.goto('http://127.0.0.1:5173/');
    await qa.waitForFunction(() => !!window.__game); await qa.evaluate(() => __game.floorSurface.ready);
    await qa.evaluate(() => { window.qaRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
    await qa.waitForTimeout(100);
    await qa.evaluate(() => {
      __game.startRun(); document.querySelector('#hud').style.display = 'none';
      document.querySelector('#settings-btn').style.display = 'none';
      __game.character.root.position.set(-4, 0, 14);
      __game.camera.position.set(-2, 1.65, 11); __game.camera.fov = 35;
      __game.camera.lookAt(-4, .9, 14); __game.camera.updateProjectionMatrix();
      window.qaState = { state: 'ride', crouch: 0, landSquash: 0, pushing: 1, stance: 1, lean: 0, speed: 4, bailT: 0, trick: null };
      window.qaLabel = document.createElement('div');
      qaLabel.style.cssText = 'position:fixed;top:24px;left:24px;color:#e7c482;font:18px monospace';
      document.body.append(qaLabel);
      window.qaChunks = [];
      window.qaRecorder = new MediaRecorder(__game.renderer.domElement.captureStream(30), { mimeType: 'video/webm' });
      qaRecorder.ondataavailable = e => qaChunks.push(e.data);
      qaRecorder.start();
    });
    for (const stance of [1, -1]) {
      await qa.evaluate(stance => {
        qaState.stance = stance; __game.character.root.rotation.set(0, stance < 0 ? Math.PI : 0, 0);
        qaLabel.textContent = stance > 0 ? 'REGULAR PUSH' : 'FAKIE PUSH';
        for (let i = 0; i < 120; i++) __game.character.update(qaState, 1 / 60, i / 60);
      }, stance);
      for (const [label, phase] of [['plant', .2], ['stroke', 2.4], ['return', 4.5]]) {
        await qa.evaluate(phase => {
          __game.character.pushPhase = phase;
          __game.character.update(qaState, 0, 0);
          __game.renderer.render(__game.scene, __game.camera);
        }, phase);
        await qa.screenshot({ path: root + `push-${stance > 0 ? 'regular' : 'fakie'}-${label}.png` });
      }
      await qa.evaluate(() => new Promise(resolve => {
        let count = 0;
        const frame = () => {
          __game.character.update(qaState, 1 / 60, count / 60);
          __game.renderer.render(__game.scene, __game.camera);
          if (++count < 180) qaRAF(frame); else resolve();
        };
        qaRAF(frame);
      }));
    }
    if (errors.length) throw new Error(errors.join('\n'));
    await qa.evaluate(() => new Promise(resolve => {
      qaRecorder.onstop = () => {
        window.qaClip = URL.createObjectURL(new Blob(qaChunks, { type: 'video/webm' }));
        qaRecorder.stream.getTracks().forEach(track => track.stop());
        resolve();
      };
      qaRecorder.stop();
    }));
    const downloadReady = qa.waitForEvent('download');
    await qa.evaluate(() => { const a = document.createElement('a'); a.href = qaClip; a.download = 'push-motion.webm'; a.click(); });
    await (await downloadReady).saveAs(root + 'push-motion.webm');
  } finally { await context.close(); }
  return { errors, video: root + 'push-motion.webm', phaseScreenshots: 6 };
}

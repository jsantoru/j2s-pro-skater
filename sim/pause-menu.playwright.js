// Run through Playwright browser_run_code_unsafe with this file as `filename`.
// Exercises the actual RAF loop, physics, DOM and standard gamepad polling.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const qa = await context.newPage(), report = { checks: [], errors: [] };
  const root = 'C:/Users/Joe/Documents/coding/j2s-pro-skater/screenshots/pause-menu/';
  const check = (ok, label) => { if (!ok) throw new Error(label); report.checks.push(label); };
  qa.on('pageerror', e => report.errors.push(e.message));
  qa.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await qa.addInitScript(() => { window.qaPad = null; window.qaRumbles = 0; window.qaStops = 0;
    navigator.getGamepads = () => window.qaPad ? [window.qaPad] : []; });
  const pressPad = async (i, on) => {
    await qa.evaluate(([i, on]) => { qaPad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; }, [i, on]);
    await qa.waitForTimeout(70);
  };
  const tapPad = async i => { await pressPad(i, true); await pressPad(i, false); };
  const snapshot = () => qa.evaluate(() => {
    const { skater: s, character, camera, fx, session } = __game, pose = [];
    character.root.traverse(o => pose.push([...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]));
    return JSON.stringify({ session, pos: s.pos.toArray(), vel: s.vel.toArray(), state: s.state,
      score: s.score, combo: [s.combo.text, s.combo.points, s.combo.multiplier],
      crouch: [s.crouchTime, s.crouch, s.crouching], push: [s.pushing, s.pushTimer], airTime: s.airTime,
      balance: [s.balance.x, s.balance.v], camera: [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.fov],
      pose, dust: [...fx.dust.life], sparks: [...fx.sparks.life],
      hud: ['timer', 'score', 'trick-text', 'combo-points', 'combo-mult'].map(id => document.getElementById(id).textContent) });
  });
  const verifyFrozen = async label => {
    await qa.waitForTimeout(120);
    const before = await snapshot();
    // Read the scene itself; an element screenshot also composites the menu's CSS transitions.
    const scenePixels = () => qa.evaluate(() => { const g = __game; g.renderer.render(g.scene, g.camera); return g.renderer.domElement.toDataURL(); });
    const pixels = await scenePixels();
    await qa.waitForTimeout(1100);
    check(before === await snapshot(), label + ': physics, pose, camera, effects, score and exact timer freeze');
    const nextPixels = await scenePixels();
    if (pixels !== nextPixels) {
      const diff = await qa.evaluate(async urls => {
        const canvas = document.createElement('canvas'); canvas.width = innerWidth; canvas.height = innerHeight;
        const c = canvas.getContext('2d'), images = [];
        for (const u of urls) { const im = await createImageBitmap(await (await fetch(u)).blob()); c.drawImage(im, 0, 0); images.push(c.getImageData(0, 0, innerWidth, innerHeight).data); }
        let changed = 0, max = 0;
        for (let i = 0; i < images[0].length; i++) { const d = Math.abs(images[0][i] - images[1][i]); if (d) changed++; max = Math.max(max, d); }
        return { changed, max };
      }, [pixels, nextPixels]);
      // A handful of edge channels can round by 1/255 across GPU draws.
      check(diff.max <= 1 && diff.changed < 100, label + ': scene is still within GPU rounding tolerance ' + JSON.stringify(diff));
    } else check(true, label + ': rendered scene stays identical');
    check(await qa.evaluate(() => __game.audio.paused && __game.audio.worldBus.gain.value < .001
      && __game.audio.sfxBus.gain.value < .001 && __game.audio.reverbGain.gain.value < .001), label + ': skating audio is silent');
  };
  try {
    await qa.goto('http://127.0.0.1:5173/'); await qa.waitForFunction(() => !!window.__game);
    await qa.evaluate(() => __game.floorSurface.ready);
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => __game.session.paused);
    check(await qa.locator('#restart-run').isHidden(), 'Pre-run settings cannot restart an inactive session');
    await qa.keyboard.press('Tab');
    check(await qa.locator('#music-toggle').evaluate(el => el === document.activeElement), 'Tab reaches music');
    await qa.keyboard.press('Space');
    check(await qa.evaluate(() => __game.settings.music && __game.session.mode === 'title'), 'Music keyboard activation preserves title state');
    await qa.keyboard.press('Tab');
    check(await qa.locator('#resume-run').evaluate(el => el === document.activeElement), 'Tab wraps within the dialog');
    await qa.keyboard.press('Shift+Tab');
    check(await qa.locator('#music-toggle').evaluate(el => el === document.activeElement), 'Reverse Tab wraps within the dialog');
    check(await qa.locator('#overlay').evaluate(el => el.inert), 'Background controls are inert while settings are open');
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => !__game.session.paused);
    await qa.keyboard.press('Enter'); await qa.waitForFunction(() => __game.session.mode === 'playing');
    await qa.keyboard.down('Space'); await qa.waitForTimeout(560); await qa.keyboard.up('Space');
    await qa.waitForFunction(() => __game.skater.state === 'air'); await qa.keyboard.press('j');
    await qa.waitForFunction(() => __game.skater.score >= 100);
    await qa.keyboard.press('Enter'); await qa.waitForFunction(() => __game.session.paused);
    check(await qa.evaluate(() => __game.skater.score >= 100 && __game.session.timeLeft < 120), 'Enter pauses the earned score/run instead of restarting');
    await verifyFrozen('Riding pause');
    await qa.screenshot({ path: root + 'earned-score.png' });
    const pausedTime = await qa.evaluate(() => __game.session.timeLeft);
    await qa.keyboard.press('Enter'); await qa.waitForFunction(() => !__game.session.paused); await qa.waitForTimeout(180);
    check(await qa.evaluate(t => t - __game.session.timeLeft < .5 && __game.skater.score >= 100, pausedTime), 'Resume keeps score/time without catching up paused seconds');

    await qa.evaluate(() => __game.startRun());
    await qa.keyboard.down('Space'); await qa.waitForTimeout(520); await qa.keyboard.up('Space');
    await qa.waitForFunction(() => __game.skater.state === 'air');
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => __game.session.paused);
    check(await qa.evaluate(() => __game.skater.state === 'air'), 'Pause captures an actual airborne ollie');
    await verifyFrozen('Midair pause');
    await qa.screenshot({ path: root + 'midair.png' });
    await qa.keyboard.down('j'); await qa.keyboard.down('ArrowRight');
    await qa.locator('#resume-run').click(); await qa.waitForTimeout(120);
    check(await qa.evaluate(() => !__game.skater.trick && __game.input.state.steer === 0), 'Held menu flip/steering keys do not leak after resume');
    await qa.keyboard.up('j'); await qa.keyboard.up('ArrowRight');
    await qa.waitForFunction(() => __game.skater.state === 'ride');
    check(await qa.evaluate(() => __game.skater.state === 'ride'), 'Airborne pause resumes and lands normally');

    await qa.evaluate(() => __game.startRun());
    await qa.keyboard.down('Space'); await qa.waitForTimeout(350);
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => __game.session.paused);
    await qa.keyboard.up('Space'); await qa.waitForTimeout(100);
    check(await qa.evaluate(() => __game.skater.crouching), 'Crouch pose stays frozen when the key is released in the menu');
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => !__game.session.paused); await qa.waitForTimeout(140);
    check(await qa.evaluate(() => __game.skater.state === 'ride' && !__game.skater.crouching), 'Interrupted crouch cancels without an accidental ollie');

    await qa.evaluate(() => { const s = __game.skater; __game.startRun(); s.pos.set(-10.5, 0, 10);
      s.heading.set(1, 0, 0); s.facing.set(1, 0, 0); s.speed = 6; s.vel.set(6, 0, 0); s.updateModelQuat(1); __game.followCam.snap(s);
      window.qaPad = { id: 'QA Standard Gamepad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        vibrationActuator: { playEffect() { qaRumbles++; return Promise.resolve(); }, reset() { qaStops++; return Promise.resolve(); } } }; });
    await qa.keyboard.down('Space'); await qa.waitForTimeout(220); await qa.keyboard.up('Space'); await qa.keyboard.press('l');
    await qa.waitForFunction(() => __game.skater.state === 'grind'); await qa.waitForTimeout(100);
    await pressPad(9, true); await qa.waitForFunction(() => __game.session.paused);
    await qa.waitForTimeout(250);
    check(await qa.evaluate(() => __game.session.paused && __game.skater.state === 'grind'), 'Holding controller Start pauses once without restarting/closing');
    await pressPad(9, false);
    await verifyFrozen('Rail grind pause');
    const rumbles = await qa.evaluate(() => qaRumbles);
    await qa.waitForTimeout(180);
    check(await qa.evaluate(n => qaRumbles === n && qaStops > 0 && __game.input._pulseT === 0, rumbles), 'Pause resets the actuator and sends no further rumble commands');
    await qa.screenshot({ path: root + 'grind.png' });
    await tapPad(13);
    check(await qa.locator('#restart-run').evaluate(el => el === document.activeElement), 'Controller D-pad focuses Restart');
    await qa.evaluate(() => { qaPad.axes[1] = .9; }); await qa.waitForTimeout(90);
    check(await qa.locator('#music-toggle').evaluate(el => el === document.activeElement), 'Controller stick focuses Music');
    await qa.evaluate(() => { qaPad.axes[1] = 0; }); await qa.waitForTimeout(70);
    await tapPad(0);
    check(await qa.evaluate(() => !__game.settings.music && __game.session.paused), 'Controller A changes music while the run stays paused');
    await tapPad(1); await qa.waitForFunction(() => !__game.session.paused);
    check(await qa.evaluate(() => !__game.audio.paused && __game.skater.state === 'grind'), 'Controller B resumes the existing grind');
    await tapPad(9); await qa.waitForFunction(() => __game.session.paused);
    await tapPad(8); await qa.waitForFunction(() => !__game.session.paused);
    check(!await qa.locator('#controls-panel').isVisible(), 'Controller Back closes pause without opening the controls panel');

    await qa.evaluate(() => { __game.skater.score = 4250; });
    await tapPad(9); await qa.waitForFunction(() => __game.session.paused);
    await tapPad(13); await pressPad(0, true); await qa.waitForFunction(() => !__game.session.paused);
    await qa.waitForTimeout(180);
    check(await qa.evaluate(() => __game.skater.score === 0 && __game.session.timeLeft > 119
      && __game.skater.state === 'ride' && !__game.skater.crouching && !__game.settings.music), 'Explicit controller Restart resets run and preserves music; held A does not crouch');
    await pressPad(0, false);
    await pressPad(0, true); await qa.waitForTimeout(450); await pressPad(0, false);
    await qa.waitForFunction(() => __game.skater.state === 'air');
    check(await qa.evaluate(() => __game.skater.state === 'air'), 'Fresh controller A works normally after leaving the menu');
    await qa.evaluate(() => { window.qaPad = null; __game.startRun(); });
    await qa.locator('#start-btn').click();
    check(await qa.evaluate(() => __game.session.paused), 'On-screen Pause opens the same paused settings menu');
    await qa.mouse.click(8, 8); await qa.waitForFunction(() => !__game.session.paused);
    check(!await qa.locator('#settings-panel').isVisible(), 'Backdrop resumes the session');

    for (const [width, height, label] of [[390, 844, 'phone'], [844, 390, 'landscape'], [1440, 900, 'desktop']]) {
      await qa.setViewportSize({ width, height }); await qa.locator('#start-btn').click();
      await qa.waitForFunction(() => __game.session.paused); await qa.waitForTimeout(100);
      check(await qa.evaluate(() => [...document.querySelectorAll('#settings-panel button')].filter(el => !el.hidden).every(el => {
        const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      })), 'All pause controls fit the ' + label + ' viewport');
      await qa.screenshot({ path: root + label + '.png' });
      await qa.keyboard.press('Escape'); await qa.waitForFunction(() => !__game.session.paused);
    }
    await qa.evaluate(() => __game.endRun()); await qa.locator('#start-btn').click();
    check(await qa.locator('#restart-run').isHidden(), 'End-screen settings hide the in-run Restart action');
    await qa.keyboard.press('Escape'); await qa.waitForFunction(() => !__game.session.paused);
    await qa.locator('#overlay-msg').click();
    check(await qa.evaluate(() => __game.session.mode === 'playing' && __game.skater.score === 0), 'Replay still starts a fresh session');
    await qa.reload(); await qa.waitForFunction(() => !!window.__game);
    check(await qa.evaluate(() => !__game.settings.music), 'Music choice persists after reload');
    await qa.goto('http://127.0.0.1:5173/?lowfx'); await qa.waitForFunction(() => !!window.__game);
    await qa.locator('#overlay-msg').click(); await qa.keyboard.press('Escape'); await qa.waitForFunction(() => __game.session.paused);
    await verifyFrozen('Low-effects pause');
    check(await qa.evaluate(() => __game.renderer.getContext().getError() === 0), 'No WebGL errors');
    check(report.errors.length === 0, 'No browser runtime or shader errors');
    return report;
  } finally { await context.close(); }
}

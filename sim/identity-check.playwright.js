// Verify that baked canvas lettering and UI agree, including unavailable/late local fonts.
async (page) => {
  const report = [], browser = page.context().browser();
  for (const mode of ['normal', 'unavailable', 'late']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const qa = await context.newPage(), errors = [];
    qa.on('pageerror', e => errors.push(e.message));
    try {
      if (mode === 'unavailable') await context.route('**/fonts/*.woff2', route => route.abort());
      if (mode === 'late') await context.route('**/fonts/*.woff2', async route => {
        const response = await route.fetch();
        await qa.waitForTimeout(2800);
        await route.fulfill({ response });
      });
      await qa.addInitScript(() => {
        navigator.getGamepads = () => [];
        window.signFonts = [];
        const fillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
          // The floor atlas and mural caption; shipping labels intentionally retain monospace.
          if ((text === 'GENESEE BREWING CO.' && this.canvas.width === 2048) || text.startsWith('NEW YORK  /  FLOUR CITY')) signFonts.push(this.font);
          return fillText.call(this, text, ...args);
        };
      });
      await qa.goto('http://127.0.0.1:5175/', { waitUntil: 'domcontentloaded' });
      await qa.waitForFunction(() => !!window.__game);
      await qa.evaluate(() => __game.floorSurface.ready);
      if (mode === 'late') await qa.evaluate(() => document.fonts.ready);
      const state = await qa.evaluate(() => ({
        selection: document.documentElement.dataset.fonts,
        signFonts, uiFont: getComputedStyle(document.getElementById('score')).fontFamily,
        resources: performance.getEntriesByType('resource').filter(e => e.name.includes('.woff2')).map(e => e.name),
        gl: __game.renderer.getContext().getError(),
      }));
      const custom = mode === 'normal';
      if (state.selection !== (custom ? 'ready' : 'fallback')) throw new Error(mode + ': incorrect font selection');
      if (state.signFonts.length < 2 || state.signFonts.some(font => font.includes('Barlow') !== custom)) throw new Error(mode + ': inconsistent baked typeface ' + JSON.stringify(state));
      if (state.uiFont.includes('Barlow') !== custom) throw new Error(mode + ': UI does not match baked signs');
      if (state.resources.some(url => !url.startsWith('http://127.0.0.1:5175/'))) throw new Error('External font request');
      await qa.getByRole('button', { name: /DROP IN/ }).click();
      await qa.keyboard.down('w'); await qa.waitForTimeout(600); await qa.keyboard.up('w');
      if (!await qa.evaluate(() => __game.skater.speed > 3 && __game.session.mode === 'playing')) throw new Error(mode + ': fonts blocked gameplay');
      if (state.gl || errors.length) throw new Error(mode + ': ' + errors.join('\n'));
      report.push({ mode, ...state, errors });
    } finally { await context.close(); }
  }
  return report;
}

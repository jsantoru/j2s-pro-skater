// Share the same locally served typefaces between the UI and baked warehouse signs.
const fallback = () => typeof document !== 'undefined' && document.documentElement.dataset.fonts === 'fallback';
export const displayFont = size => `700 ${size}px ${fallback() ? '"Arial Narrow", Arial' : '"Barlow Condensed", "Arial Narrow"'}, sans-serif`;
export const labelFont = size => `700 ${size}px ${fallback() ? 'Arial' : 'Barlow, Arial'}, sans-serif`;

export async function loadIdentityFonts() {
  let timeout;
  try {
    await Promise.race([
      Promise.allSettled(['400 16px Barlow', '700 16px Barlow', '700 16px "Barlow Condensed"'].map(font => document.fonts.load(font))),
      new Promise(resolve => { timeout = setTimeout(resolve, 1800); }),
    ]);
    const loaded = ['400 16px Barlow', '700 16px Barlow', '700 16px "Barlow Condensed"'].every(font => document.fonts.check(font));
    document.documentElement.dataset.fonts = loaded ? 'ready' : 'fallback';
  } catch {
    document.documentElement.dataset.fonts = 'fallback';
  } finally { clearTimeout(timeout); }
}

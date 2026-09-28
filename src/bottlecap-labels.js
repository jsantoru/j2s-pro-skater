import * as THREE from 'three';

export const CAP_LABEL_ATLAS_URL = '/textures/bottlecaps/genesee-label-atlas.webp';
export const CAP_LABEL_ATLAS_SIZE = Object.freeze({ width: 1536, height: 1024 });
export const CAP_LINER_ATLAS_RECT = Object.freeze([1088, 576, 384, 384]);
const LABEL_SIZE = 512;
const HAS_CANVAS = typeof document !== 'undefined' && typeof Image !== 'undefined';

// Source rectangles are measured in the atlas's top-left pixel coordinates. Each
// stays inside its 512px cell; the wider blue/black crops retain their rim lettering.
export const CAP_STYLES = Object.freeze([
  { id: 'genesee-beer', name: 'Genesee Beer', metalColor: 0xaaa98d, skirtColor: 0xa3151c, faceColor: 0xc1c5ae, inkColor: 0xa91a1f, roughness: 0.62, atlasRect: [32, 32, 448, 448], fallbackLines: ['GENESEE', 'Beer'] },
  { id: '12-horse-ale', name: '12 Horse Genesee Ale', metalColor: 0xbca362, skirtColor: 0x8b7a38, faceColor: 0x176654, inkColor: 0xc6b467, roughness: 0.48, atlasRect: [544, 32, 448, 448], fallbackLines: ['12 Horse', 'GENESEE', 'Ale'] },
  { id: 'cream-ale', name: 'Genesee Cream Ale', metalColor: 0xb8b790, skirtColor: 0x007d44, faceColor: 0x078649, inkColor: 0xe6df67, roughness: 0.51, atlasRect: [1056, 32, 448, 448], fallbackLines: ['GENESEE', 'CREAM ALE'] },
  { id: 'genny-light', name: 'Genny Light', metalColor: 0xb9bab0, skirtColor: 0x182337, faceColor: 0x143387, inkColor: 0xe5e8dc, roughness: 0.55, atlasRect: [24, 536, 464, 464], fallbackLines: ['GENNY', 'LIGHT'] },
  { id: 'light-ale', name: 'Genesee Light Ale', metalColor: 0xb5b3a3, skirtColor: 0x89897b, faceColor: 0x191b18, inkColor: 0xe4db9a, roughness: 0.69, atlasRect: [536, 536, 464, 464], fallbackLines: ['GENESEE', 'LIGHT ALE'] },
].map(style => Object.freeze({ ...style, atlasRect: Object.freeze(style.atlasRect), fallbackLines: Object.freeze(style.fallbackLines) })));

export const capLabelsStatus = { state: HAS_CANVAS ? 'loading' : 'unavailable', width: 0, height: 0 };

// A single decoded image is shared, but never uploaded as a full-size GPU atlas.
// Each cap owns one small CanvasTexture, populated synchronously with its fallback
// and then updated in place. Missing assets resolve gracefully to those fallbacks.
export const capLabelsReady = HAS_CANVAS ? new Promise(resolve => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    const valid = image.naturalWidth === CAP_LABEL_ATLAS_SIZE.width && image.naturalHeight === CAP_LABEL_ATLAS_SIZE.height;
    capLabelsStatus.state = valid ? 'ready' : 'fallback';
    capLabelsStatus.width = image.naturalWidth;
    capLabelsStatus.height = image.naturalHeight;
    resolve(valid ? image : null);
  };
  image.onerror = () => { capLabelsStatus.state = 'fallback'; resolve(null); };
  image.src = CAP_LABEL_ATLAS_URL;
}) : Promise.resolve(null);

const cssColor = value => `#${value.toString(16).padStart(6, '0')}`;

function drawFallback(ctx, style) {
  ctx.fillStyle = cssColor(style.faceColor);
  ctx.fillRect(0, 0, LABEL_SIZE, LABEL_SIZE);
  ctx.strokeStyle = cssColor(style.inkColor);
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(256, 256, 232, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = cssColor(style.inkColor);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = style.fallbackLines;
  for (const [index, line] of lines.entries()) {
    ctx.font = `bold ${line === 'GENESEE' || line === 'GENNY' ? 73 : 55}px Arial, sans-serif`;
    ctx.fillText(line, 256, 256 + (index - (lines.length - 1) / 2) * 79, 418);
  }
}

/**
 * The caller owns and disposes map/roughnessMap. `ready` always resolves, even if
 * loading fails or the caller disposes a texture before loading completes.
 * Maps use normal unrotated 0..1 UVs and flipY=true: label top is local positive Y.
 * Use a white material tint with map; faceColor is only the untextured fallback.
 */
export function createCapLabelTextures(index = 0) {
  const numeric = Number.isFinite(index) ? Math.trunc(index) : 0;
  const style = CAP_STYLES[((numeric % CAP_STYLES.length) + CAP_STYLES.length) % CAP_STYLES.length];
  if (!HAS_CANVAS) return { map: null, roughnessMap: null, ready: Promise.resolve(false) };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LABEL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { map: null, roughnessMap: null, ready: Promise.resolve(false) };
  drawFallback(ctx, style);
  const map = new THREE.CanvasTexture(canvas);
  map.name = `${style.name} printed face`;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.userData = { capStyle: style.id, source: CAP_LABEL_ATLAS_URL, sourceRect: [...style.atlasRect], labelReady: false };
  let disposed = false;
  map.addEventListener('dispose', () => { disposed = true; });
  const ready = capLabelsReady.then(image => {
    if (!image || disposed) return false;
    // This is UV extraction at load time, not new artwork. Sampling each region
    // into its own texture avoids neighboring atlas cells bleeding into mipmaps.
    try {
      ctx.clearRect(0, 0, LABEL_SIZE, LABEL_SIZE);
      ctx.drawImage(image, ...style.atlasRect, 0, 0, LABEL_SIZE, LABEL_SIZE);
      map.userData.labelReady = true;
      map.needsUpdate = true;
      return true;
    } catch {
      drawFallback(ctx, style); map.needsUpdate = true;
      return false;
    }
  });
  return { map, roughnessMap: null, ready };
}

/** A separately owned 256px cork liner, extracted from the atlas's sixth cell. */
export function createCapLinerTexture() {
  if (!HAS_CANVAS) return { map: null, ready: Promise.resolve(false) };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { map: null, ready: Promise.resolve(false) };
  const drawFallbackCork = () => {
    ctx.fillStyle = '#bb8b58'; ctx.fillRect(0, 0, 256, 256);
    let seed = 177;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = i % 3 ? '#60451d38' : '#f4ca8b48';
      const x = random() * 256, y = random() * 256, size = .4 + random() * 1.6;
      ctx.fillRect(x, y, size, size);
    }
  };
  drawFallbackCork();
  const map = new THREE.CanvasTexture(canvas);
  map.name = 'Vintage cork bottle-cap liner';
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.userData = { source: CAP_LABEL_ATLAS_URL, sourceRect: [...CAP_LINER_ATLAS_RECT], linerReady: false };
  let disposed = false;
  map.addEventListener('dispose', () => { disposed = true; });
  const ready = capLabelsReady.then(image => {
    if (!image || disposed) return false;
    try {
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(image, ...CAP_LINER_ATLAS_RECT, 0, 0, 256, 256);
      map.userData.linerReady = true;
      map.needsUpdate = true;
      return true;
    } catch {
      drawFallbackCork(); map.needsUpdate = true;
      return false;
    }
  });
  return { map, ready };
}

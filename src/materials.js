// Locally generated, deterministic surface maps. No asset downloads or runtime texture work.
import * as THREE from 'three';

export const HAS_DOM = typeof document !== 'undefined';
export function randomSeed(seed = 17) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function canvasMap(draw, size = 1024, color = true, height = size) {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = height;
  draw(canvas.getContext('2d'), size, randomSeed());
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return map;
}

function grain(ctx, size, rgb, amplitude, rng) {
  const pixels = ctx.createImageData(size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = (rng() - 0.5) * amplitude;
    for (let c = 0; c < 3; c++) pixels.data[i + c] = rgb[c] + v;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
}

function stains(ctx, s, rng, count, color = '49,42,33') {
  for (let i = 0; i < count; i++) {
    const x = rng() * s, y = rng() * s, radius = 12 + rng() * s * 0.3;
    // Wrap the marks as well as the fine grain, so tiling doesn't create hard borders.
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
      g.addColorStop(0, `rgba(${color},0.065)`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  }
}

function concrete(ctx, s, rng) {
  grain(ctx, s, [151, 149, 140], 20, rng);
  stains(ctx, s, rng, 28);
  // Mineral aggregate; deliberately subpixel-small at normal skating distance.
  for (let i = 0; i < 16000; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(43,44,40,0.12)' : 'rgba(241,235,214,0.2)';
    ctx.fillRect(rng() * s, rng() * s, 0.5 + rng() * 1.8, 0.5 + rng());
  }
  // Hairline fractures, distinct from the large expansion joints placed on the floor.
  for (let i = 0; i < 6; i++) {
    let x = rng() * s, y = rng() * s;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 12; j++) { x += rng() * 22 - 8; y += rng() * 18 - 5; ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(44,40,35,0.19)'; ctx.lineWidth = 0.65; ctx.stroke();
  }
}

function plywood(ctx, s, rng) {
  grain(ctx, s, [178, 139, 88], 11, rng);
  for (let y = 0; y < s; y += 2) {
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y + Math.sin(x / 95 + y / 38) * 2.8 + Math.sin(x / 34) * 0.5);
    ctx.strokeStyle = `rgba(70,43,23,${0.025 + rng() * 0.12})`; ctx.lineWidth = 0.4 + rng(); ctx.stroke();
  }
  stains(ctx, s, rng, 24, '72,43,18');
  for (const y of [0, s / 2]) {
    ctx.fillStyle = 'rgba(50,34,21,0.55)'; ctx.fillRect(0, y, s, 1.5);
    ctx.fillStyle = 'rgba(244,212,161,0.45)'; ctx.fillRect(0, y + 2, s, 1);
    for (let x = 18; x < s; x += 100) for (const sy of [y + 12, y + s / 2 - 12]) {
      ctx.fillStyle = '#6a6254'; ctx.beginPath(); ctx.arc(x, sy, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c1aa85'; ctx.fillRect(x - 1, sy, 2, 0.6);
    }
  }
  ctx.fillStyle = 'rgba(52,35,22,0.35)'; ctx.fillRect(0, 0, 1.5, s);
  // Thin wheel scuffs follow the sheet, without looking like cartoon wood planks.
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(42,35,27,${rng() * 0.075})`; ctx.lineWidth = rng() * 2 + 0.4;
    const x = rng() * s, y = rng() * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 70 - 35, y + rng() * 260); ctx.stroke();
  }
}

function masonry(ctx, s, rng) {
  grain(ctx, s, [105, 110, 109], 17, rng);
  const row = s / 12, brick = s / 4;
  for (let y = 0, r = 0; y < s; y += row, r++) {
    for (let x = -(r % 2) * brick / 2; x < s; x += brick) {
      const v = Math.floor(112 + rng() * 27);
      ctx.fillStyle = `rgb(${v + 4},${v + 2},${v - 5})`; ctx.fillRect(x + 2, y + 2, brick - 4, row - 4);
      ctx.fillStyle = 'rgba(228,222,206,0.23)'; ctx.fillRect(x + 2, y + 2, brick - 4, 1);
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(42,37,30,${rng() * 0.1})`;
        ctx.fillRect(x + rng() * brick, y + rng() * row, 0.5 + rng() * 2, 0.7);
      }
    }
  }
  stains(ctx, s, rng, 95);
}

export function makeMaterials() {
  const floor = canvasMap(concrete), wood = canvasMap(plywood), wall = canvasMap(masonry);
  const micro = canvasMap((c, s, r) => grain(c, s, [145, 145, 145], 75, r), 256, false);
  const rough = canvasMap((c, s, r) => { grain(c, s, [220, 220, 220], 22, r); stains(c, s, r, 45, '0,0,0'); }, 512, false);
  const woodBump = canvasMap(plywood, 1024, false);
  const wallBump = canvasMap(masonry, 1024, false);
  const M = (color, map, roughness = 0.85, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, map, roughness, metalness, ...extra });
  const stone = { bumpMap: micro, bumpScale: 0.018, roughnessMap: rough };
  return {
    floor: M(0xffffff, floor, 0.92, 0, stone),
    concrete: M(0xffffff, floor, 0.92, 0, stone),
    wood: M(0xffffff, wood, 0.78, 0, { bumpMap: woodBump, bumpScale: 0.014, roughnessMap: rough }),
    wall: M(0xcbd0d1, wall, 0.96, 0, { bumpMap: wallBump, bumpScale: 0.045 }),
    metal: M(0xadb5b7, null, 0.38, 0.8, { bumpMap: micro, bumpScale: 0.002 }),
    roof: M(0x30383b, null, 0.91),
    coping: M(0xbfc5c6, null, 0.26, 0.92), rail: M(0xc4ced1, null, 0.24, 0.95),
    railDark: M(0x3a4344, null, 0.52, 0.7),
    rainbow: M(0xffffff, null, 0.63, 0.05, { vertexColors: true, bumpMap: micro, bumpScale: 0.01, roughnessMap: rough }),
    yellow: M(0xe6b848, null, 0.68, 0.15), red: M(0xa93d32, null, 0.72),
    blue: M(0x366776, null, 0.72), green: M(0x50694d, null, 0.72),
    dark: M(0x252e30, null, 0.6, 0.45), sky: new THREE.MeshBasicMaterial({ color: 0xdff1ff }),
  };
}

// UVs measured in metres keep concrete grain and plywood sheets consistent across differently sized props.
export function surfaceUV(geometry, scale = 3) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (az > ax && az > ay) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getY(i) / scale; }
    else if (ay > ax) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getZ(i) / scale; }
    else { uv[i * 2] = p.getZ(i) / scale; uv[i * 2 + 1] = p.getY(i) / scale; }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

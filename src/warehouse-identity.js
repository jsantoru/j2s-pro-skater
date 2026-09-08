import * as THREE from 'three';
import { canvasMap } from './materials.js';
import { geneseeMarkPath } from './genesee-mark.js';
import { rochesterMarkPath } from './rochester-mark.js';
import { displayFont, labelFont } from './typography.js';

// A uniform scale preserves each mark's proportions in canvas or floor world units.
export function paintMark(c, kind, x, y, height, color) {
  const genesee = kind === 'genesee';
  const width = genesee ? 99.5 : 78.434196, h = genesee ? 116 : 75.269669;
  c.save(); c.translate(x, y); c.scale(height / h, height / h);
  c.translate(-width / 2, -h / 2);
  if (!genesee) c.translate(-124.94866, -30.922463);
  c.fillStyle = color; c.fill(new Path2D(genesee ? geneseeMarkPath : rochesterMarkPath));
  c.restore();
}

function paintLoss(c, s, h, rng, count) {
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i++) {
    c.fillStyle = `rgba(0,0,0,${.2 + rng() * .55})`;
    c.fillRect(rng() * s, rng() * h, .5 + rng() * 4, .4 + rng() * 1.3);
  }
  c.restore();
}

export function geneseeWallSign() {
  const map = canvasMap((c, s, rng) => {
    const h = s / 3;
    c.fillStyle = '#d6c7a6'; c.fillRect(0, 0, s, h);
    c.strokeStyle = '#78332e'; c.lineWidth = 5; c.strokeRect(16, 16, s - 32, h - 32);
    paintMark(c, 'genesee', s * .158, h * .50, h * .71, '#982f35');
    c.strokeStyle = '#806d53'; c.lineWidth = 2; c.beginPath(); c.moveTo(s * .30, h * .18); c.lineTo(s * .30, h * .82); c.stroke();
    c.fillStyle = '#8c3030'; c.textAlign = 'left'; c.font = displayFont(174);
    c.fillText('GENESEE', s * .335, h * .54, s * .60);
    c.font = displayFont(46); c.fillText('BREWING COMPANY', s * .34, h * .70, s * .57);
    c.font = labelFont(21); c.fillStyle = '#4d4d3c'; c.fillText('ROCHESTER, NEW YORK  /  EST. 1878', s * .34, h * .84, s * .57);
    for (let i = 0; i < 8000; i++) {
      const x = rng() * s, y = rng() * h, edge = Math.min(x, s - x, y, h - y);
      c.fillStyle = edge < 9 + rng() * 10 ? '#6b5038' : `rgba(65,49,29,${rng() * .12})`;
      c.fillRect(x, y, .5 + rng() * 5, .4 + rng() * 1.5);
    }
    for (const x of [32, s - 32]) for (const y of [30, h - 30]) {
      const rust = c.createLinearGradient(0, y, 0, y + 55);
      rust.addColorStop(0, '#705030aa'); rust.addColorStop(1, '#70503000');
      c.fillStyle = rust; c.fillRect(x - 4, y, 8, 55);
      c.fillStyle = '#554d3d'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
    }
  }, 1536, true, 512);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: .91 });
  mat.name = 'Genesee G heritage wall sign'; return mat;
}

export function rochesterWallPaint() {
  const map = canvasMap((c, s, rng) => {
    paintMark(c, 'rochester', s * .5, s * .36, s * .57, '#cbbfaa');
    c.textAlign = 'center'; c.fillStyle = '#cbbfaa'; c.font = displayFont(102);
    c.fillText('ROCHESTER', s * .5, s * .81, s * .87);
    c.font = labelFont(26); c.fillText('NEW YORK  /  FLOUR CITY • FLOWER CITY', s * .5, s * .88, s * .86);
    paintLoss(c, s, s, rng, 8500);
  }, 1024);
  const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2 });
  mat.name = 'Rochester flower painted masonry'; return mat;
}

export function rochesterPlaque() {
  const map = canvasMap((c, s, rng) => {
    c.fillStyle = '#344e5a'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#b2b8ad'; c.lineWidth = 4; c.strokeRect(14, 14, s - 28, s - 28);
    paintMark(c, 'rochester', s / 2, s * .38, s * .49, '#d8d0b6');
    c.fillStyle = '#e1d4b6'; c.textAlign = 'center'; c.font = displayFont(51);
    c.fillText('ROCHESTER, NY', s / 2, s * .79, s * .85);
    c.font = labelFont(15); c.fillText('HIGH FALLS / 585', s / 2, s * .88);
    for (let i = 0; i < 1500; i++) { c.fillStyle = '#172a2d33'; c.fillRect(rng() * s, rng() * s, 1 + rng() * 4, rng() * 2); }
  }, 512);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: .92 });
  mat.name = 'Rochester flower loading plaque'; return mat;
}

import * as THREE from 'three';
import { canvasMap, randomSeed } from './materials.js';
import { displayFont, labelFont } from './typography.js';

const WIDTH = 1024, HEIGHT = 1280;

function paintPanel(c, captain) {
  const rng = randomSeed(1878);
  c.fillStyle = '#183557'; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = '#eacb58'; c.fillRect(16, 224, 992, 992);
  // Preserve the full reference illustration, including pipe, grapefruit and tray.
  if (captain) c.drawImage(captain, 16, 224, 992, 992);
  c.textAlign = 'center'; c.fillStyle = '#e5d7ac';
  c.font = labelFont(24); c.fillText('GENESEE SPECIALTY', WIDTH / 2, 48);
  c.font = 'italic bold 86px Georgia, serif'; c.fillText('Ruby Red', WIDTH / 2, 134);
  c.font = displayFont(66); c.fillText('KÖLSCH', WIDTH / 2, 204);
  c.font = labelFont(22); c.fillText('ROCHESTER, NEW YORK', WIDTH / 2, 1254);

  // Faded enamel and edge corrosion stay subtle enough to preserve the face.
  c.fillStyle = 'rgba(154,126,66,.10)'; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.strokeStyle = '#b8ab80'; c.lineWidth = 3; c.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);
  for (let i = 0; i < 11000; i++) {
    const x = rng() * WIDTH, y = rng() * HEIGHT;
    const edge = Math.min(x, WIDTH - x, y, HEIGHT - y);
    c.fillStyle = edge < 5 + rng() * 10 ? '#675338' : `rgba(59,43,25,${rng() * .14})`;
    c.fillRect(x, y, .5 + rng() * 4, .4 + rng() * 1.7);
  }
  for (const x of [28, WIDTH - 28]) for (const y of [27, HEIGHT - 27]) {
    const rust = c.createLinearGradient(0, y, 0, y + 90);
    rust.addColorStop(0, '#6c432b88'); rust.addColorStop(1, '#6c432b00');
    c.fillStyle = rust; c.fillRect(x - 4, y, 8, 90);
    c.fillStyle = '#534d3f'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b5a98c'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.stroke();
  }
}

export function captainMural(level) {
  // A branded fallback is available immediately; asset loading never blocks play.
  const map = canvasMap(c => paintPanel(c), WIDTH, true, HEIGHT);
  const material = new THREE.MeshStandardMaterial({ map, color: 0xe1d7c0, roughness: .93 });
  material.name = 'Ruby Red Kolsch captain enamel panel';
  level.captainStatus = map ? 'loading' : 'unavailable';
  level.captainReady = map ? new Promise(resolve => {
    const captain = new Image();
    captain.onload = () => {
      paintPanel(map.image.getContext('2d'), captain);
      map.needsUpdate = true;
      level.captainStatus = 'ready'; resolve(true);
    };
    captain.onerror = () => { level.captainStatus = 'fallback'; resolve(false); };
    captain.src = `${import.meta.env.BASE_URL}textures/brewery/ruby-red-captain.png`;
  }) : Promise.resolve(false);
  return material;
}

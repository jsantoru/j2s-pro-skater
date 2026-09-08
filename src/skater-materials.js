import * as THREE from 'three';
import { canvasMap, randomSeed } from './materials.js';

// Garment-scale wash and stitching, with a separate fine normal/roughness weave.
// The maps are built once per character and shared by its matching garment parts.
function fabric(color, twill = false) {
  const base = new THREE.Color(color), rgb = [base.r, base.g, base.b].map(v => THREE.ColorManagement.fromWorkingColorSpace(new THREE.Color(v, v, v), THREE.SRGBColorSpace).r * 255);
  const map = canvasMap((c, s, rng) => {
    const pixels = c.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const wash = Math.sin(u * 19 + Math.sin(v * 13)) * 2.7 + Math.cos(v * 32 + u * 7) * 1.6;
      const thread = twill ? Math.sin((x - y) * Math.PI / 2) * 1.6 : Math.sin(x * Math.PI) * .5;
      const grain = (rng() - .5) * 5;
      const offset = (y * s + x) * 4;
      for (let k = 0; k < 3; k++) pixels.data[offset + k] = rgb[k] + wash + thread + grain;
      pixels.data[offset + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
    // Subtle seam shadow and twin rows of worn thread on the side seams and hems.
    for (const u of [0, .5]) {
      c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(u * s, 0, 3, s);
      c.strokeStyle = 'rgba(218,210,183,.18)'; c.lineWidth = 1; c.setLineDash([3, 3]);
      for (const d of [5, 9]) { c.beginPath(); c.moveTo(u * s + d, 0); c.lineTo(u * s + d, s); c.stroke(); }
    }
    for (const y of [s * .06, s * .93]) {
      c.strokeStyle = 'rgba(225,211,180,.16)'; c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke();
    }
    c.setLineDash([]);
  }, 1024);
  const size = 256, data = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4), rng = randomSeed(921);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, wave = (twill ? x - y : x + (y % 4) * .5) * Math.PI / 2;
    data[i] = 128 + Math.sin(wave) * 24; data[i + 1] = 128 + Math.cos(y * Math.PI / 2) * 16; data[i + 2] = 252; data[i + 3] = 255;
    rough[i] = rough[i + 1] = rough[i + 2] = 210 + rng() * 30; rough[i + 3] = 255;
  }
  const normalMap = new THREE.DataTexture(data, size, size), roughnessMap = new THREE.DataTexture(rough, size, size);
  for (const texture of [normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 3);
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true; texture.anisotropy = 8;
  }
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, normalMap, normalScale: new THREE.Vector2(.26, .26), roughnessMap,
    roughness: 1, sheen: .3, sheenRoughness: .85, sheenColor: color });
}

export function skaterMaterials() {
  const shirt = fabric('#303e66'), pants = fabric('#55564e', true), sock = fabric('#b7b6a6');
  shirt.name = 'Washed navy cotton'; pants.name = 'Worn charcoal twill'; sock.name = 'Ribbed skate socks';
  const skin = new THREE.MeshStandardMaterial({ color: 0xc39880, roughness: .68 });
  skin.map = canvasMap((c, s, rng) => {
    const p = c.createImageData(s, s);
    for (let i = 0; i < p.data.length; i += 4) { const n = (rng() - .5) * 6; p.data[i] = 243 + n; p.data[i + 1] = 231 + n; p.data[i + 2] = 224 + n; p.data[i + 3] = 255; }
    c.putImageData(p, 0, 0);
    for (let i = 0; i < 1300; i++) { c.fillStyle = 'rgba(82,44,30,.10)'; c.fillRect(rng() * s, rng() * s, .7, .7); }
  }, 512);
  const shoe = fabric('#434c55'); shoe.name = 'Scuffed suede'; shoe.normalScale.set(.4, .4);
  const sole = new THREE.MeshStandardMaterial({ color: 0xbebbb0, roughness: .9 });
  sole.map = canvasMap((c, s, rng) => {
    c.fillStyle = '#eeeade'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(70,60,45,${rng() * .18})`; c.fillRect(rng() * s, rng() * s, 1 + rng() * 3, 1); }
    c.fillStyle = '#7d817d'; c.fillRect(0, s * .2, s, 3);
  }, 256);
  return { shirt, pants, sock, skin, shoe, sole };
}

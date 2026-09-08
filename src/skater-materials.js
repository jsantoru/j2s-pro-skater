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
      const front = Math.exp(-(((u - .25) / .16) ** 2));
      const fade = twill ? front * (14 * Math.exp(-(((v - .30) / .23) ** 2)) + 20 * Math.exp(-(((v - .58) / .095) ** 2))) : 0;
      const whiskers = twill ? front * Math.exp(-(((v - .23) / .07) ** 2)) * Math.sin(v * 160 + Math.abs(u - .25) * 24) * 2.5 : 0;
      const offset = (y * s + x) * 4;
      for (let k = 0; k < 3; k++) pixels.data[offset + k] = rgb[k] + wash + thread + grain + fade + whiskers;
      pixels.data[offset + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
    // Subtle seam shadow and twin rows of worn thread on the side seams and hems.
    for (const u of [0, .5]) {
      c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(u * s, 0, 3, s);
      c.strokeStyle = twill ? 'rgba(203,161,102,.52)' : 'rgba(169,173,171,.12)'; c.lineWidth = 1; c.setLineDash([3, 3]);
      for (const d of [5, 9]) { c.beginPath(); c.moveTo(u * s + d, 0); c.lineTo(u * s + d, s); c.stroke(); }
    }
    for (const y of [s * .06, s * .93]) {
      c.strokeStyle = 'rgba(225,211,180,.16)'; c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke();
    }
    c.setLineDash([]);
    if (twill) {
      // Five-pocket construction printed into the denim, so it bends with the leg.
      const path = pts => { c.beginPath(); pts.forEach(([u,v],i) => i ? c.lineTo(u*s,v*s) : c.moveTo(u*s,v*s)); };
      const pocket = [[.63,.12],[.87,.12],[.85,.255],[.75,.28],[.65,.255],[.63,.12]];
      path(pocket); c.fillStyle='rgba(12,26,45,.10)'; c.fill();
      c.strokeStyle='rgba(12,24,39,.40)'; c.lineWidth=3; c.stroke();
      c.strokeStyle='rgba(213,167,100,.66)'; c.lineWidth=1.3; c.setLineDash([3,2]);
      path(pocket); c.stroke();
      path([[.685,.195],[.72,.21],[.75,.192],[.78,.21],[.815,.195]]); c.stroke();
      for(const pts of [[[.06,.07],[.11,.12],[.15,.155],[.19,.165]],[[.44,.07],[.39,.12],[.35,.155],[.31,.165]]]) { path(pts); c.stroke(); }
      c.setLineDash([]);
      for(const [u,v] of [[.635,.13],[.865,.13],[.11,.12],[.39,.12]]) { c.fillStyle='#9e794a';c.beginPath();c.arc(u*s,v*s,2,0,Math.PI*2);c.fill(); }
      c.fillStyle='rgba(25,40,54,.35)'; c.fillRect(0,s*.956,s,s*.025);
      c.strokeStyle='rgba(212,171,116,.46)'; c.lineWidth=1.5; c.setLineDash([3,3]);
      for(const v of [.951,.966]) { path([[0,v],[1,v]]); c.stroke(); }
    }
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
  const shirt = fabric('#333638'), pants = fabric('#465f76', true), sock = fabric('#b7b6a6');
  shirt.name = 'Washed black hoodie fleece'; pants.name = 'Worn indigo denim'; sock.name = 'Ribbed skate socks';
  shirt.sheen = .42; shirt.sheenColor.set('#5a6265'); shirt.normalScale.set(.20,.20);
  const rib = shirt.clone(); rib.name = 'Ribbed black cotton';
  rib.map = canvasMap((c,s) => {
    c.fillStyle='#25282b';c.fillRect(0,0,s,s);
    for(let x=0;x<s;x+=8){c.fillStyle='#303336';c.fillRect(x,0,3,s);c.fillStyle='#1d2023';c.fillRect(x+5,0,1,s);}
    c.strokeStyle='#424549';c.lineWidth=2;c.setLineDash([3,3]);
    for(const y of [s*.18,s*.83]){c.beginPath();c.moveTo(0,y);c.lineTo(s,y);c.stroke();}
  },512);
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
  return { shirt, pants, sock, skin, shoe, sole, rib };
}

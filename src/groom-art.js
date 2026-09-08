import * as THREE from 'three';
import { canvasMap, randomSeed } from './materials.js';

// Short facial hair follows the same deforming surface and neck weights as the face.
// Separate alpha-tested fibers leave the lips, nose and upper cheeks exposed.
export function addBeard(rig, headSurface, rings) {
  const profile = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[0], r[1], r[2])), false, 'catmullrom', .25);
  const coverage = (height, a) => {
    const front = Math.sin(a), side = Math.abs(Math.cos(a));
    const top = .079 + .050 * side ** 1.4;
    let beard = THREE.MathUtils.smoothstep(height, .022, .038)
      * (1 - THREE.MathUtils.smoothstep(height, top - .010, top + .006))
      * THREE.MathUtils.smoothstep(front, -.24, .14);
    const sideburn = Math.exp(-(((front - .13) / .22) ** 2))
      * THREE.MathUtils.smoothstep(height, .09, .12)
      * (1 - THREE.MathUtils.smoothstep(height, .149, .161));
    const mustache = Math.exp(-(((height - .093) / .006) ** 4)) * Math.max(0, front) ** 20;
    const lips = Math.exp(-(((height - .080) / .006) ** 4)) * Math.max(0, front) ** 34;
    beard = Math.max(beard, sideburn, mustache) * (1 - lips);
    return THREE.MathUtils.clamp(beard, 0, 1);
  };
  const map = canvasMap((c, s, rng) => {
    const pixels = c.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      const height = profile.getPoint(1 - y / (s - 1)).x;
      for (let x = 0; x < s; x++) {
        const u = x / s, a = u * Math.PI * 2, amount = coverage(height, a);
        const strand = Math.sin(x * 2.8 + y * Math.cos(a) * .65 + Math.sin(y * .08 + x) * 1.6) * .5 + .5;
        const grain = rng(), v = 68 + strand * 19 + grain * 30, i = (y * s + x) * 4;
        pixels.data[i] = v; pixels.data[i + 1] = v * .68; pixels.data[i + 2] = v * .44;
        pixels.data[i + 3] = 255 * amount * (.15 + strand * .25 + grain * .6);
      }
    }
    c.putImageData(pixels, 0, 0);
  }, 1024);
  const material = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x62412b,
    roughness: .93, alphaTest: .43, side: THREE.DoubleSide });
  material.name = 'Chestnut beard fibers';
  const geometry = headSurface.geometry.clone(), p = geometry.attributes.position, n = geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) - .5, a = geometry.attributes.uv.getX(i) * Math.PI * 2;
    const depth = .0006 + coverage(h, a) * (.002 + .003 * Math.exp(-(((h - .052) / .025) ** 2)));
    p.setXYZ(i, p.getX(i) + n.getX(i) * depth, p.getY(i) + n.getY(i) * depth, p.getZ(i) + n.getZ(i) * depth);
  }
  const beard = new THREE.SkinnedMesh(geometry, material);
  beard.name = 'Contoured brown beard and mustache'; beard.frustumCulled = false;
  beard.castShadow = beard.receiveShadow = true; rig.torso.add(beard);
  beard.bind(headSurface.skeleton, headSurface.bindMatrix);
  // In Node there is no canvas: omit the unmasked shell from ray-based anatomy tests.
  if (!map) beard.visible = false;
}

// Curved locks emerge below the cap. A few narrow strips form each lock; their
// tapered ends and directional fibers break up the silhouette without bulky spikes.
export function addShaggyHair(rig, skullAt, hair) {
  const rng = randomSeed(1878), p = [], uv = [], index = [], colors = [];
  const color = new THREE.Color();
  for (let lock = 0; lock < 72; lock++) {
    const a = Math.PI * .92 + lock / 71 * Math.PI * 1.16;
    const back = Math.max(0, -Math.sin(a));
    const start = .153 - rng() * .006, end = .124 - back * .018 + (rng() - .5) * .012;
    const halfWidth = .0035 + rng() * .003, sweep = Math.sin(a * 3) * .11 + (rng() - .5) * .28, base = p.length / 3;
    color.setRGB(.38 + rng() * .04, .28 + rng() * .025, .19 + rng() * .015, THREE.SRGBColorSpace);
    for (let j = 0; j <= 7; j++) for (let k = 0; k <= 2; k++) {
      const t = j / 7, across = k - 1;
      const height = THREE.MathUtils.lerp(start, end, t);
      const [rx, rz, cz] = skullAt(height), taper = Math.max(.035, Math.sin(Math.PI * (.18 + t * .82)));
      const angle = a + sweep * t + across * halfWidth * taper / rx;
      const lift = .002 + Math.sin(t * Math.PI * .8) * (.003 + back * .004) + (1 - Math.abs(across)) * .0018;
      p.push(Math.cos(angle) * (rx + lift), height, cz + Math.sin(angle) * (rz + lift));
      uv.push(k / 2, t); colors.push(color.r, color.g, color.b);
      if (j && k) { const b = base + j * 3 + k; index.push(b - 4, b - 1, b, b - 4, b, b - 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const material = hair.clone(); material.color.setHex(0xffffff); material.vertexColors = true; material.side = THREE.DoubleSide;
  const locks = new THREE.Mesh(geometry, material); locks.name = 'Short shaggy brown locks';
  locks.castShadow = locks.receiveShadow = true; rig.head.add(locks);
}

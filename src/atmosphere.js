import * as THREE from 'three';
import { canvasMap, randomSeed } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Late afternoon through the factory roof. Opaque roof strips actually occlude
// the sun; the existing four-metre skylights remain open to its shadow camera.
export function lightWarehouse(scene, level, { lowfx = false } = {}) {
  scene.background = new THREE.Color(0x78868a);
  scene.fog = new THREE.FogExp2(0x78868a, 0.006);
  scene.environmentIntensity = 0.32;
  const ambient = new THREE.HemisphereLight(0xc5e1ef, 0x504234, 0.68);
  const sun = new THREE.DirectionalLight(0xffdeb0, 3.4);
  sun.position.set(-24, 32, -18);
  sun.castShadow = !lowfx;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 38, bottom: -38, near: 1, far: 100 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  const fill = new THREE.DirectionalLight(0xa1c8df, 0.38);
  fill.position.set(20, 9, 16);
  scene.add(ambient, sun, fill);

  const roof = [];
  const slab = (w, d, x, z) => {
    const g = new THREE.BoxGeometry(w, 0.08, d);
    g.translate(x, 9.04, z); roof.push(g);
  };
  // Skylight centres are -25, -15, ... 35. The last is clipped by the east wall.
  slab(9, 46, -31.5, 0);
  for (let x = -20; x <= 30; x += 10) slab(6, 46, x, 0);
  for (let x = -25; x <= 35; x += 10) {
    const width = x === 35 ? 3 : 4, centre = x === 35 ? 34.5 : x;
    for (const z of [-21.5, 21.5]) slab(width, 3, centre, z);
    for (let z = -18; z <= 18; z += 1.5) slab(width, 0.075, centre, z);
    slab(.075, 40, centre, 0);
  }
  const occluder = new THREE.Mesh(mergeGeometries(roof), level.mats.roof);
  occluder.name = 'Skylight roof and sun occlusion';
  occluder.castShadow = true;
  level.group.add(occluder); roof.forEach(g => g.dispose());

  // Distinct pools around the loading bay and transition deck, no extra shadow maps.
  for (const [x, z, color] of [[-24, 21, 0xffb46b], [24, -21, 0xffb46b], [0, -13, 0xa6dbe3]]) {
    const lamp = new THREE.PointLight(color, lowfx ? 0 : 20, 10, 2);
    lamp.position.set(x, 4.2, z); scene.add(lamp);
  }
  const dust = lowfx ? null : makeMotes(scene);
  return { sun, update(time) { if (dust) dust.material.uniforms.time.value = time; } };
}

function makeMotes(scene) {
  const rng = randomSeed(64), positions = [], seeds = [];
  for (let i = 0; i < 180; i++) {
    positions.push(rng() * 66 - 33, 0.4 + rng() * 7.5, rng() * 40 - 20);
    seeds.push(rng());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute float seed; uniform float time; varying float opacity;
      void main() {
        vec3 p = position;
        p.x += sin(time * .14 + seed * 80.) * .35;
        p.y += sin(time * .21 + seed * 31.) * .25;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(22. / max(1., -mv.z), 1., 2.5);
        opacity = (.08 + .18 * seed) * (1. - smoothstep(8., 28., -mv.z));
      }`,
    fragmentShader: `varying float opacity;
      void main() { float a = 1. - smoothstep(.08, .5, length(gl_PointCoord - .5));
        gl_FragColor = vec4(.92, .83, .65, a * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const motes = new THREE.Points(g, material); motes.name = 'Drifting warehouse dust';
  scene.add(motes); return motes;
}

// Soft local contact complements the broad sun shadow, including in lowfx.
export function contactShadow(scene) {
  const map = canvasMap((c, s) => {
    const gradient = c.createRadialGradient(s / 2, s / 2, s * .04, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(16,20,22,.7)');
    gradient.addColorStop(.4, 'rgba(16,20,22,.28)');
    gradient.addColorStop(1, 'rgba(16,20,22,0)');
    c.fillStyle = gradient; c.fillRect(0, 0, s, s);
  }, 128);
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: .6, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = 'Skater contact shadow'; mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh); return mesh;
}

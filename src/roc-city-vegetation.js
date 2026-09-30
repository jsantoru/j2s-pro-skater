// Riverway planting, in the same authored coordinates as the park. These are
// decorative batches only: skating surfaces and collision remain level-owned.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSeed } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const GROUND = -.028;

// A cutout cluster of small broad leaves, without a recognizable fern silhouette.
// Building the pixels
// directly keeps the exact same alpha coverage in browsers and Node previews.
function leafSprayMap() {
  const size = 256, data = new Uint8Array(size * size * 4), rng = randomSeed(7418);
  for (let i = 0; i < data.length; i += 4) { data[i] = 94; data[i + 1] = 116; data[i + 2] = 53; }
  const pixel = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  };
  const line = (ax, ay, bx, by, width = 1) => {
    const length = Math.hypot(bx - ax, by - ay), steps = Math.ceil(length * 1.5);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(ax + (bx - ax) * i / steps), y = Math.round(ay + (by - ay) * i / steps);
      for (let dx = -width; dx <= width; dx++) for (let dy = -width; dy <= width; dy++) pixel(x + dx, y + dy, 96, 100, 52);
    }
  };
  const leaf = (x, y, angle, length, width) => {
    const dx = Math.cos(angle), dy = Math.sin(angle), tone = rng() * 24;
    const cx = x + dx * length * .5, cy = y + dy * length * .5;
    const radius = Math.ceil(length * .6 + width);
    for (let py = Math.max(0, Math.floor(cy - radius)); py < Math.min(size, cy + radius); py++) {
      for (let px = Math.max(0, Math.floor(cx - radius)); px < Math.min(size, cx + radius); px++) {
        const along = ((px - x) * dx + (py - y) * dy) / length;
        if (along <= 0 || along >= 1) continue;
        const cross = -(px - x) * dy + (py - y) * dx;
        const edge = width * Math.pow(Math.sin(along * Math.PI), .72) * (1 + .065 * Math.sin(along * 43));
        if (Math.abs(cross) > edge) continue;
        const vein = Math.abs(cross) < .65 ? 17 : 0;
        const light = 11 * (1 - Math.abs(cross) / edge) + Math.sin(px * 13 + py * 7) * 3;
        pixel(px, py, 72 + tone + light + vein, 94 + tone + light + vein, 35 + tone * .6 + light * .5);
      }
    }
  };
  // Several offset shoots overlap irregularly. Small gaps remain throughout,
  // but no single large stem or repeating frond dominates a close tree.
  for (let shoot = 0; shoot < 8; shoot++) {
    const angle = shoot * 2.39996 + rng() * .5;
    const radius = shoot === 0 ? 0 : 31 + rng() * 45;
    const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius;
    const shootAngle = rng() * Math.PI * 2;
    line(x - Math.cos(shootAngle) * 23, y - Math.sin(shootAngle) * 23,
      x + Math.cos(shootAngle) * 23, y + Math.sin(shootAngle) * 23, 0);
    for (let j = 0; j < 19; j++) {
      const a = j * 2.39996 + rng() * .7, distance = Math.sqrt(rng()) * 35;
      leaf(x + Math.cos(a) * distance, y + Math.sin(a) * distance, a + (rng() - .5), 20 + rng() * 15, 10 + rng() * 6);
    }
  }
  // A transparent rim keeps a cropped leaf from revealing a rectangular card.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
    if (edge < 8) data[(y * size + x) * 4 + 3] *= edge / 8;
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.name = 'Riverway broadleaf spray / porous alpha';
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.anisotropy = 4; map.needsUpdate = true;
  return map;
}

function foldedCard() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, 0, -.5, .09, .5, -.5, 0,
    -.5, .5, 0, 0, .5, .09, .5, .5, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, .5, 0, 1, 0, 0, 1, .5, 1, 1, 1], 2));
  g.setIndex([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]);
  g.computeVertexNormals();
  return g;
}

function insidePolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

// Apply the same authored-space motion after instancing in both the visible
// and shadow passes. Instance matrices and geometry buffers remain immutable.
function windMaterial(mat, clock, kind, lowfx) {
  const previous = mat.onBeforeCompile;
  const header = `uniform float riverwayWindTime;
    vec3 riverwayWindPosition(vec3 p) {
      float phase = dot(p.xz, vec2(.105, .063));
      float breeze = sin(riverwayWindTime * .78 + phase);
      ${lowfx ? '' : 'breeze += sin(riverwayWindTime * 1.31 + phase * 1.73) * .22;'}
      ${kind === 'foliage'
        ? 'float bend = .025 + .050 * smoothstep(.2, 9.0, p.y);'
        : 'float height = max(0.0, p.y + .028); float bend = min(.072, height * height * .40);'}
      p.xz += vec2(.89, .46) * breeze * bend;
      return p;
    }
  `;
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.uniforms.riverwayWindTime = clock;
    shader.vertexShader = header + shader.vertexShader
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace(
        'mvPosition = modelViewMatrix * mvPosition;',
        'mvPosition.xyz = riverwayWindPosition(mvPosition.xyz);\nmvPosition = modelViewMatrix * mvPosition;'))
      .replace('#include <worldpos_vertex>', THREE.ShaderChunk.worldpos_vertex.replace(
        'worldPosition = modelMatrix * worldPosition;',
        'worldPosition.xyz = riverwayWindPosition(worldPosition.xyz);\nworldPosition = modelMatrix * worldPosition;'));
  };
  mat.customProgramCacheKey = () => `riverway-wind-v1-${kind}-${lowfx ? 'low' : 'full'}`;
  return mat;
}

/** Adds four vegetation batches, with every material/map owned by the caller. */
export function addRiverwayVegetation({ group, add, material, surfaceMap, tiledMaterials, ownedMaterials, lowfx = false, layout }) {
  const rng = randomSeed(73490), sprays = [], mulchParts = [], grassPositions = [], grassColors = [];
  const trunks = [], groundPatches = [], plantingPockets = [], windTime = { value: 0 };
  const trail = new THREE.CatmullRomCurve3(layout.trail.map(([x, z]) => new THREE.Vector3(x, 0, z))).getPoints(280).map(p => [p.x, p.z]);
  const outline = layout.mainPerimeter || layout.perimeter;
  const safeGround = (x, z, clearance = .2) => {
    if (x < -39.5 || (x > 17.55 && x < 33.7) || (z > layout.bridge.minZ - 1.4 && z < layout.bridge.maxZ + 2)) return false;
    if (insidePolygon(x, z, outline)) return false;
    for (let i = 0; i < outline.length; i++) if (segmentDistance(x, z, outline[i], outline[(i + 1) % outline.length]) < clearance) return false;
    for (let i = 1; i < trail.length; i++) if (segmentDistance(x, z, trail[i - 1], trail[i]) < layout.trailWidth / 2 + clearance) return false;
    return true;
  };
  const bark = material('Riverway furrowed bark', 0x8b8370, 1, 0,
    surfaceMap('#7c7464', ['#342d2544', '#d8c5a321', '#50463733'], 1.6));
  tiledMaterials.add(bark);
  const mulch = material('Riverway irregular leaf litter', 0x8f8267, 1, 0,
    surfaceMap('#7c705c', ['#372f2444', '#b8a37544', '#a4987433'], 1.8));
  const blades = material('Riverway meadow blades', 0xffffff, 1);
  blades.vertexColors = true; blades.side = THREE.DoubleSide;
  const foliage = material('Riverway cutout broadleaf foliage', 0xffffff, .98, 0, leafSprayMap());
  foliage.side = THREE.DoubleSide; foliage.shadowSide = THREE.DoubleSide;
  foliage.alphaTest = .42; foliage.transparent = false; foliage.depthWrite = true;
  windMaterial(foliage, windTime, 'foliage', lowfx);
  windMaterial(blades, windTime, 'grass', lowfx);
  const depth = windMaterial(new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking,
    map:foliage.map, alphaTest:foliage.alphaTest, side:THREE.DoubleSide }), windTime, 'foliage', lowfx);
  const distance = windMaterial(new THREE.MeshDistanceMaterial({ map:foliage.map,
    alphaTest:foliage.alphaTest, side:THREE.DoubleSide }), windTime, 'foliage', lowfx);
  depth.name = 'Riverway moving foliage depth'; distance.name = 'Riverway moving foliage distance';
  const materials = [bark, mulch, blades, foliage, depth, distance];
  // Maps are shared rather than cloned; the owning art deduplicates textures.
  for (const mat of materials) ownedMaterials.add(mat);

  const taper = (a, b, bottom, top, segments = 7) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), delta = B.clone().sub(A);
    const geometry = new THREE.CylinderGeometry(top, bottom, delta.length(), segments, 1, false);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()));
    add(geometry, bark, A.add(B).multiplyScalar(.5).toArray());
  };
  const spray = (x, y, z, scale, tone = 1) => {
    // Uniform directions include near-vertical planes. Upward-facing sheets
    // alone disappear edge-on and turn a canopy into a stack of flat shelves.
    const azimuth = rng() * Math.PI * 2, vertical = rng() * 2 - 1;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    const normal = new THREE.Vector3(Math.cos(azimuth) * horizontal, vertical, Math.sin(azimuth) * horizontal);
    const rotation = new THREE.Quaternion().setFromUnitVectors(FRONT, normal);
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(FRONT, rng() * Math.PI * 2));
    sprays.push({ position: new THREE.Vector3(x, y, z), rotation,
      scale: new THREE.Vector3(scale * (.8 + rng() * .4), scale, scale),
      color: new THREE.Color().setRGB(tone * (.85 + rng() * .21), tone * (.88 + rng() * .15), tone * (.78 + rng() * .22)) });
  };
  const lobe = (center, radii, count, size, tone) => {
    for (let i = 0; i < count; i++) {
      const azimuth = rng() * Math.PI * 2, vertical = rng() * 2 - 1;
      const radius = Math.pow(rng(), .36), horizontal = Math.sqrt(1 - vertical * vertical);
      spray(center[0] + Math.cos(azimuth) * horizontal * radius * radii[0],
        center[1] + vertical * radius * radii[1], center[2] + Math.sin(azimuth) * horizontal * radius * radii[2],
        size * (.8 + rng() * .4), tone);
    }
  };
  const groundBed = (x, z, rx, rz) => {
    const points = [], count = 24;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2, uneven = .89 + rng() * .13;
      const px = x + Math.cos(angle) * rx * uneven, pz = z + Math.sin(angle) * rz * uneven;
      if (!safeGround(px, pz, .1)) return;
      points.push(new THREE.Vector2(px, -pz));
    }
    const g = new THREE.ShapeGeometry(new THREE.Shape(points));
    g.rotateX(-Math.PI / 2); g.translate(0, GROUND + .006, 0);
    mulchParts.push(g); groundPatches.push({ x, z, rx, rz });
  };
  const tuft = (x, z, height = .12) => {
    if (!safeGround(x, z, .3)) return;
    const n = lowfx ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const angle = rng() * Math.PI * 2, width = .0045 + rng() * .004;
      const h = height * (.55 + rng() * .55), px = x + (rng() - .5) * .15, pz = z + (rng() - .5) * .15;
      const dx = Math.cos(angle), dz = Math.sin(angle), lean = h * (.22 + rng() * .5);
      const a = [px - dx * width, GROUND, pz - dz * width], b = [px + dx * width, GROUND, pz + dz * width];
      const m = [px + dz * lean * .25, GROUND + h * .55, pz - dx * lean * .25];
      const tip = [px + dz * lean, GROUND + h, pz - dx * lean];
      grassPositions.push(...a, ...b, ...m, ...b, ...tip, ...m);
      const green = rng(), c = new THREE.Color();
      for (let j = 0; j < 6; j++) {
        const light = j === 4 ? 1.05 : j < 2 ? .72 : .90;
        // Vertex colours are linear in Three. Convert the chosen muted turf
        // colours from sRGB so sunlit tips never become pale straw triangles.
        c.setRGB((66 + green * 19) / 255, (82 + green * 24) / 255, (37 + green * 14) / 255).convertSRGBToLinear().multiplyScalar(light);
        grassColors.push(c.r, c.g, c.b);
      }
    }
  };
  const tree = (x, z, height, young = false, narrow = false, distant = false) => {
    if (!safeGround(x, z, young ? .45 : .75)) return;
    const leanX = (rng() - .5) * (young ? .12 : .7), leanZ = (rng() - .5) * (young ? .12 : .7);
    const radius = young ? .045 + rng() * .012 : .21 + rng() * .09;
    const trunkTop = height * .88, levels = [0, .06, .32, .55, .76, 1];
    for (let i = 1; i < levels.length; i++) {
      const a = levels[i - 1], b = levels[i];
      const point = t => [x + leanX * t * t, GROUND + trunkTop * t, z + leanZ * t * t];
      taper(point(a), point(b), radius * (1 - a * .88) * (i === 1 ? 1.4 : 1), radius * (1 - b * .88), young || distant ? 6 : 9);
    }
    if (!young && !distant) for (let j = 0; j < 5; j++) {
      const a = j / 5 * Math.PI * 2 + rng() * .2;
      taper([x + Math.cos(a) * radius * 2.2, GROUND, z + Math.sin(a) * radius * 2.2], [x, .42, z], radius * .35, radius * .30, 5);
    }
    const branches = distant ? 5 : young ? 6 : 9;
    const crownWidth = young ? (narrow ? .45 : .72) : height * ((distant ? .20 : .24) + rng() * .045);
    for (let j = 0; j < branches; j++) {
      const angle = j * 2.39996 + rng() * .65;
      const rootY = height * (.36 + j / branches * .36);
      const reach = crownWidth * (.62 + rng() * .36);
      const end = [x + leanX * .65 + Math.cos(angle) * reach, height * (.63 + rng() * .22), z + leanZ * .65 + Math.sin(angle) * reach];
      const root = [x + leanX * .2, rootY, z + leanZ * .2];
      const mid = [root[0] + (end[0] - root[0]) * .52, rootY + (end[1] - rootY) * .57, root[2] + (end[2] - root[2]) * .52];
      const branchRadius = radius * (young ? .4 : .47) * (1 - j / branches * .5);
      taper(root, mid, branchRadius, branchRadius * .61, young || distant ? 5 : 7);
      taper(mid, end, branchRadius * .61, young ? .004 : .016, young || distant ? 5 : 6);
      for (const side of [-1, 1]) {
        const twig = [end[0] + Math.cos(angle + side * .8) * crownWidth * .26,
          end[1] + height * (.035 + rng() * .045), end[2] + Math.sin(angle + side * .8) * crownWidth * .26];
        taper(mid, twig, branchRadius * .48, young ? .003 : .008, 5);
        const size = young ? (narrow ? .25 : .30) : distant ? .79 : .59;
        const spread = young ? (narrow ? .23 : .36) : .73 + rng() * .24;
        const count = distant ? (lowfx ? 5 : 9) : lowfx ? (young ? 10 : 13) : (young ? 20 : 25);
        lobe(twig, [spread, young ? .43 : 1.04, spread], count, size * (lowfx ? 1.12 : 1), .91 + rng() * .17);
      }
      // Inner and hanging foliage hides selected forks while preserving the
      // larger structural branches and the open space beneath a mature crown.
      const inner = [mid[0] + (end[0] - mid[0]) * .35, mid[1] + (end[1] - mid[1]) * .55, mid[2] + (end[2] - mid[2]) * .35];
      lobe(inner, [crownWidth * .30, height * .09, crownWidth * .30], distant ? 4 : lowfx ? (young ? 4 : 7) : (young ? 8 : 14), young ? .27 : .58, .91);
    }
    lobe([x + leanX * .7, height * .75, z + leanZ * .7], [crownWidth * .51, height * .16, crownWidth * .51], distant ? 22 : lowfx ? (young ? 25 : 52) : (young ? 48 : 100), young ? .29 : .63, .97);
    lobe([x + leanX, height * .91, z + leanZ], [crownWidth * .38, height * .074, crownWidth * .38], distant ? 16 : lowfx ? (young ? 15 : 33) : (young ? 28 : 65), young ? .27 : .58, 1.04);
    const rx = young ? (narrow ? .53 : .9) : radius * 4.1, rz = young ? 1.05 : radius * 4.5;
    groundBed(x, z, rx, rz);
    for (let j = 0; j < (distant ? 0 : lowfx ? 15 : 27); j++) {
      const angle = rng() * Math.PI * 2, r = .93 + rng() * .56;
      tuft(x + Math.cos(angle) * rx * r, z + Math.sin(angle) * rz * r, young ? .13 : .10);
    }
    trunks.push({ x, z, height, radius, young, distant });
  };

  // Retain the established planting areas, moving four anchors clear of the
  // elevated western approach. The final tree also stays north of I-490.
  const mature = [[-25, -43], [-25, -50], [-21, -52], [-16, -57], [-7, -61], [4, -60], [15, -58],
    [38, -49], [39, -29], [38, -6], [39, 14], [-25.5, -28], [-36.6, -2], [-28, 13], [-32, 18]];
  for (const [x, z] of mature) tree(x, z, 7.5 + rng() * 2.6);
  for (const [x, z] of [[16.7, -29], [16.7, -10], [16.7, 11], [-1.5, -52], [7, -52], [-26, -13], [-27, 5]]) tree(x, z, 3.5 + rng() * .9, true, x > 15);
  // An estimated distant tree line gives the southern exit depth. It begins
  // beyond the bridge, with the road and the actual skating footprint clear.
  for (const [x, z] of [[-12, 65], [-4, 72], [3, 66], [10, 74], [13, 63]]) tree(x, z, 7.2 + rng() * 1.7, false, false, true);

  // Broken clumps along the outside of the trail, not a continuous card wall.
  // Each candidate checks the actual spline and concrete perimeter before use.
  for (const [x, z, rx, rz] of [[-25, -31, 1.2, 3], [-26, -15, 1.3, 3.5], [-27, 1, 1.4, 3.5],
    [-21, 13, 1.2, 1.6], [-9, -54, 2.3, 1.4], [8, -46, .8, 1.1], [16.6, -5, .5, 2]]) {
    for (let i = 0; i < (lowfx ? 35 : 68); i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
      tuft(x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r, .075 + rng() * .085);
    }
  }

  // Pocket planting breaks up the lawn with low, interrupted layers. Every
  // shrub checks its whole footprint, not just its centre, including wind room.
  const seedHead = (x, z) => {
    if (!safeGround(x, z, .28)) return;
    const h = .26 + rng() * .19, lean = (rng() - .5) * .12, angle = rng() * Math.PI * 2;
    const dx = Math.cos(angle), dz = Math.sin(angle), color = new THREE.Color(0x8a8056);
    const triangle = (...points) => { grassPositions.push(...points.flat()); for (let i = 0; i < 3; i++) grassColors.push(color.r, color.g, color.b); };
    const a = [x - dx * .0035,GROUND,z - dz * .0035], b = [x + dx * .0035,GROUND,z + dz * .0035];
    const tip = [x + lean,GROUND + h,z];
    triangle(a,b,tip);
    for (let j = 0; j < 4; j++) {
      const y = GROUND + h - .018 - j * .025, side = j % 2 ? -1 : 1;
      const cx = x + lean * (y - GROUND) / h + dx * side * .013, cz = z + dz * side * .013;
      const base = [cx,y - .014,cz], top = [cx + dx * side * .012,y + .019,cz + dz * side * .012];
      triangle(base,[cx - dz * .009,y,cz + dx * .009],top);
      triangle(base,top,[cx + dz * .009,y,cz - dx * .009]);
    }
  };
  for (const [x,z,rx,rz] of [[-25.7,-29,1.0,1.8],[-26.3,-13,1.1,1.7],[-27,4,1.0,1.6],
    [-22.8,11,1.0,1.5],[-9,-53,1.4,1.0],[8,-46,.65,1.0],
    [16.55,-35,.46,1.8],[16.55,-20,.46,1.6],[16.55,-4,.46,1.5],[16.55,7,.46,1.4],[16.55,16,.46,1.0]]) {
    let shrubs = 0;
    const clusters = lowfx ? 4 : 7;
    for (let i = 0; i < clusters; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()), px = x + Math.cos(a) * rx * r, pz = z + Math.sin(a) * rz * r;
      for (let j = 0; j < (lowfx ? 2 : 4); j++) tuft(px + (rng() - .5) * .30,pz + (rng() - .5) * .30,.13 + rng() * .12);
      const radius = .20 + rng() * .10;
      if (i % 2 === 0 && safeGround(px,pz,radius+.22)) {
        const height = .17 + rng() * .12;
        lobe([px,GROUND+height,pz],[radius,height*.7,radius],lowfx?9:17,.19+rng()*.08,.98);
        shrubs++;
      }
      if (i % 2 === 1) seedHead(px,pz);
    }
    plantingPockets.push({x,z,rx,rz,shrubs});
  }

  // Small mown spaces around the stationary neighbours and the bench bag.
  // Filter only intersecting low plants after generation: the seeded trees and
  // every distant planting pocket keep their exact accepted positions.
  const standingClearings = [[8.5,-46.3],[9.7,-45.5],[16.12,-6.6],[16.35,-5.5],[9.25,-44.15]];
  const clearRadius = .40;
  let kept = 0;
  for (const s of sprays) {
    const reach = Math.hypot(s.scale.x,s.scale.y)*.5 + .04; // Includes gentle wind.
    const overlaps = s.position.y < 1 && standingClearings.some(([x,z]) =>
      Math.hypot(s.position.x-x,s.position.z-z) < clearRadius+reach);
    if (!overlaps) sprays[kept++] = s;
  }
  sprays.length = kept;
  kept = 0;
  for (let i=0;i<grassPositions.length;i+=9) {
    const minX=Math.min(grassPositions[i],grassPositions[i+3],grassPositions[i+6]);
    const maxX=Math.max(grassPositions[i],grassPositions[i+3],grassPositions[i+6]);
    const minZ=Math.min(grassPositions[i+2],grassPositions[i+5],grassPositions[i+8]);
    const maxZ=Math.max(grassPositions[i+2],grassPositions[i+5],grassPositions[i+8]);
    const overlaps=standingClearings.some(([x,z])=>Math.hypot(Math.max(minX-x,0,x-maxX),Math.max(minZ-z,0,z-maxZ))<clearRadius+.09);
    if (!overlaps) for (let j=0;j<9;j++) {
      grassPositions[kept]=grassPositions[i+j]; grassColors[kept++]=grassColors[i+j];
    }
  }
  grassPositions.length=grassColors.length=kept;

  const canopy = new THREE.InstancedMesh(foldedCard(), foliage, sprays.length);
  canopy.name = 'Riverway open broadleaf crowns'; canopy.castShadow = !lowfx; canopy.receiveShadow = true;
  canopy.customDepthMaterial = depth; canopy.customDistanceMaterial = distance;
  const matrix = new THREE.Matrix4();
  sprays.forEach((s, i) => { matrix.compose(s.position, s.rotation, s.scale); canopy.setMatrixAt(i, matrix); canopy.setColorAt(i, s.color); });
  canopy.instanceMatrix.needsUpdate = true; canopy.instanceColor.needsUpdate = true;
  canopy.computeBoundingBox(); canopy.computeBoundingSphere();
  canopy.boundingBox.expandByScalar(.13); canopy.boundingSphere.radius += .13; group.add(canopy);
  if (mulchParts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(mulchParts, false), mulch);
    mesh.name = 'Riverway uneven mulch and leaf litter'; mesh.receiveShadow = true; mesh.castShadow = false;
    group.add(mesh); mulchParts.forEach(g => g.dispose());
  }
  const grass = new THREE.BufferGeometry();
  grass.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  grass.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3));
  grass.computeVertexNormals();
  const meadow = new THREE.Mesh(grass, blades); meadow.name = 'Riverway scattered meadow tufts';
  meadow.receiveShadow = true; meadow.castShadow = false; group.add(meadow);
  grass.computeBoundingBox(); grass.computeBoundingSphere();
  grass.boundingBox.expandByScalar(.1); grass.boundingSphere.radius += .1;
  const result = { trees: trunks, groundPatches, plantingPockets, foliage: canopy, materials,
    foliageTriangles: sprays.length * 4, groundTriangles: grassPositions.length / 9, lowfx,
    update(time) { if (Number.isFinite(time)) windTime.value = time; } };
  group.userData.vegetation = { trees: trunks, groundPatches, plantingPockets, foliageTriangles: result.foliageTriangles,
    groundTriangles: result.groundTriangles, batches: 4, lowfx };
  return result;
}

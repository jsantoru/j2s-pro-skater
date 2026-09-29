// Rochester-inspired streetscape, interpreted from the South Avenue and park
// reference photographs. Decorative architecture, not surveyed building models.
// All coordinates are authored metres; the ROC City parent owns world scaling.
import * as THREE from 'three';
import { canvasMap } from './materials.js';

function brickMap(palette, relief = false, size = 1024) {
  return canvasMap((c, s, rng) => {
    const width = s / 16, height = s / 48, joint = s / 620;
    c.fillStyle = relief ? '#444444' : palette.mortar;
    c.fillRect(0, 0, s, s);
    for (let row = 0; row < 48; row++) for (let col = -1; col < 17; col++) {
      const x = (col + (row % 2) * .5) * width, y = row * height;
      const tone = (rng() - .5) * 22;
      c.fillStyle = relief ? `rgb(${175 + tone},${175 + tone},${175 + tone})`
        : `rgb(${palette.base[0] + tone},${palette.base[1] + tone * .7},${palette.base[2] + tone * .55})`;
      c.fillRect(x + joint, y + joint, width - joint * 2, height - joint * 2);
      for (let i = 0; i < 12; i++) {
        c.fillStyle = rng() > .55 ? '#fff4de12' : '#24181017';
        c.fillRect(x + joint + rng() * (width - joint * 2), y + joint + rng() * (height - joint * 2), .6 + rng() * 4, .4 + rng() * 1.5);
      }
      c.fillStyle = relief ? '#858585' : '#211c1820';
      c.fillRect(x + joint, y + height - joint * 2, width - joint * 2, joint);
    }
    if (!relief) {
      // Low-contrast soot and lime deposits soften the brick grid without
      // painting large repeating stains onto every floor of the facade.
      for (let i = 0; i < 95; i++) {
        const x = rng() * s, y = rng() * s, radius = 8 + rng() * 42;
        const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, '#e5d7ba0b'); gradient.addColorStop(1, '#e5d7ba00');
        c.fillStyle = gradient; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }, size, !relief);
}

const BUILDINGS = [
  { id: 'south-avenue-corner', x: 48, z: -65, w: 18, d: 17, h: 9.4, floors: 3, bays: 6, ry: -Math.PI / 2, masonry: 'buff', storefront: true, sign: 1 },
  { id: 'south-avenue-redbrick', x: 46, z: -39, w: 22, d: 14, h: 11.7, floors: 3, bays: 7, ry: -Math.PI / 2, masonry: 'brick', storefront: true, sign: 0, fireEscape: true },
  { id: 'south-avenue-studios', x: 47.5, z: -9, w: 24, d: 15, h: 13.2, floors: 4, bays: 8, ry: -Math.PI / 2, masonry: 'buff', storefront: true, sign: 2 },
  { id: 'south-avenue-workshop', x: 49, z: 14, w: 16, d: 17, h: 8.6, floors: 2, bays: 5, ry: -Math.PI / 2, masonry: 'brick', industrial: true },
  { id: 'east-service-block', x: 66, z: -39, w: 32, d: 14, h: 12.2, floors: 3, bays: 9, ry: -Math.PI / 2, masonry: 'brick', industrial: true, distant: true },
  { id: 'west-bank-mill', x: -85, z: -41, w: 28, d: 16, h: 13, floors: 4, bays: 8, ry: Math.PI / 2, masonry: 'brick', industrial: true, distant: true },
  { id: 'west-bank-lofts', x: -86, z: 3, w: 30, d: 18, h: 11.2, floors: 3, bays: 8, ry: Math.PI / 2, masonry: 'buff', distant: true },
  { id: 'west-bank-south', x: -85, z: 63, w: 19, d: 17, h: 12.7, floors: 4, bays: 6, ry: Math.PI / 2, masonry: 'brick', distant: true },
];

/** Add batched streetscape geometry using the landscape's owned-material path. */
export function addRocCityBuildings({ group, add, box, bar, material, surfaceMap, tiledMaterials, ownedMaterials, lowfx = false }) {
  const size = lowfx ? 512 : 1024;
  const red = { base: [128, 73, 55], mortar: '#aa9a82' };
  const buff = { base: [174, 151, 115], mortar: '#c5b9a0' };
  const relief = brickMap(red, true, size);
  const masonry = material('Rochester warm red brick', 0xffffff, .96, 0, brickMap(red, false, size));
  const buffBrick = material('Rochester buff brick', 0xffffff, .96, 0, brickMap(buff, false, size));
  for (const mat of [masonry, buffBrick]) { mat.bumpMap = relief; mat.bumpScale = .018; tiledMaterials.add(mat); }
  const stone = material('Rochester limestone trim', 0xd3cbb7, .94, 0, surfaceMap('#b9b7ab', ['#fffbe717', '#55514716']));
  const dark = material('Rochester recessed charcoal frames', 0x283033, .76, .22);
  const metal = material('Rochester aged facade metal', 0x768080, .72, .48);
  const roof = material('Rochester roofs and service paving', 0x535b5b, .98, 0, surfaceMap('#969792', ['#e8e4d11a', '#252b3030']));
  tiledMaterials.add(stone); tiledMaterials.add(roof);
  const glassMap = canvasMap((c, s) => {
    const gradient = c.createLinearGradient(0, 0, s * .22, s);
    gradient.addColorStop(0, '#a0b7bb'); gradient.addColorStop(.42, '#718e98');
    gradient.addColorStop(.5, '#657e84'); gradient.addColorStop(1, '#354c53');
    c.fillStyle = gradient; c.fillRect(0, 0, s, s);
    c.fillStyle = '#d6dcce16'; c.beginPath(); c.moveTo(s * .10, 0); c.lineTo(s * .33, 0); c.lineTo(s * .73, s); c.lineTo(s * .50, s); c.fill();
    c.fillStyle = '#19282e35'; c.fillRect(0, s * .68, s * .16, s * .32); c.fillRect(s * .8, s * .54, s * .2, s * .46);
  }, 256);
  const glass = material('Rochester window reflections', 0xffffff, .38, .32, glassMap);
  glass.vertexColors = true;
  const awningMap = canvasMap((c, s) => {
    c.fillStyle = '#354c49'; c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += s / 24) {
      c.fillStyle = '#c6b893'; c.fillRect(x, 0, s / 140, s);
      c.fillStyle = '#132d2829'; c.fillRect(x + s / 140, 0, s / 70, s);
    }
  }, 256);
  const awning = material('Rochester striped canvas awnings', 0xc4cdc2, .98, 0, awningMap);
  const signMap = canvasMap((c, s) => {
    const names = ['RIVERWAY SUPPLY', 'COFFEE & PROVISIONS', 'STUDIOS / WORKSHOPS'];
    c.fillStyle = '#34453f'; c.fillRect(0, 0, s, s);
    for (let row = 0; row < 3; row++) {
      const y = row * s / 3;
      c.strokeStyle = '#a99973'; c.lineWidth = 2; c.strokeRect(10, y + 10, s - 20, s / 3 - 20);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e3d9bd';
      c.font = `600 ${s * .057}px Georgia, serif`; c.fillText(names[row], s / 2, y + s / 6, s * .9);
    }
  }, 512);
  const signs = material('Rochester modest storefront signs', 0xffffff, .96, 0, signMap);
  const materials = { brick: masonry, buff: buffBrick, stone, dark, metal, roof, glass, awning, signs };
  // Material creation normally registers these. Explicit registration also
  // makes the module safe with a standalone preview's lightweight helper.
  for (const mat of Object.values(materials)) ownedMaterials.add(mat);

  const flat = (w, d, x, y, z, mat) => {
    const geometry = new THREE.PlaneGeometry(w, d); geometry.rotateX(-Math.PI / 2); add(geometry, mat, [x, y, z]);
  };
  // Connected property surfaces ground the buildings. Their edges stay beyond
  // South Avenue and on the far riverbank, never in the park or Riverway trail.
  for (const [w, d, x, z] of [[42, 100, 54.5, -27], [29, 82, -88, -17], [29, 24, -88, 64]]) flat(w, d, x, -.019, z, roof);
  for (const [x, z, count] of [[35.3, -69, 4], [35.3, -18, 5], [59.5, -46, 6], [-74.8, -48, 5]]) {
    for (let i = 0; i < count; i++) box(3.1, .009, .065, x, -.008, z + i * 2.6, stone);
  }

  const records = [];
  for (let index = 0; index < BUILDINGS.length; index++) {
    const b = BUILDINGS[index], brick = materials[b.masonry];
    const c = Math.cos(b.ry), s = Math.sin(b.ry);
    const world = (x, y, z) => [b.x + x * c + z * s, y, b.z - x * s + z * c];
    const localBox = (w, h, d, x, y, z, mat) => box(w, h, d, ...world(x, y, z), mat, b.ry);
    const front = { ry: 0, width: b.w, x: 0, z: b.d / 2 };
    const sides = [
      { ry: -Math.PI / 2, width: b.d, x: -b.w / 2, z: 0 },
      { ry: Math.PI / 2, width: b.d, x: b.w / 2, z: 0 },
    ];
    const facePoint = (face, u, y, distance = 0) => world(face.x + u * Math.cos(face.ry) + distance * Math.sin(face.ry), y,
      face.z - u * Math.sin(face.ry) + distance * Math.cos(face.ry));
    const faceBox = (face, w, h, d, u, y, distance, mat) => box(w, h, d, ...facePoint(face, u, y, distance), mat, b.ry + face.ry);
    const faceBar = (face, a, end, radius = .024, mat = dark) => bar(facePoint(face, ...a), facePoint(face, ...end), radius, mat, 6);
    const pane = (face, w, h, u, y, distance, variation = 0) => {
      const geometry = new THREE.PlaneGeometry(w, h); geometry.rotateY(b.ry + face.ry);
      const tint = new THREE.Color().setHSL(.53 + (variation % 3) * .008, .10, .57 + (variation % 5) * .045);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); add(geometry, glass, facePoint(face, u, y, distance));
    };
    const window = (face, u, y, width, height, variation, ornate = false) => {
      faceBox(face, width + .17, height + .19, .06, u, y, .038, dark);
      pane(face, width, height, u, y, .074, variation);
      for (const dx of [-width / 2 - .035, width / 2 + .035]) faceBox(face, .072, height + .16, .12, u + dx, y, .12, metal);
      for (const dy of [-height / 2 - .035, height / 2 + .035]) faceBox(face, width + .14, .072, .12, u, y + dy, .12, metal);
      faceBox(face, width, .055, .085, u, y - .045, .14, dark);
      if (width > 1.25) faceBox(face, .047, height, .085, u, y, .14, dark);
      faceBox(face, width + .32, .135, .38, u, y - height / 2 - .13, .13, stone);
      faceBox(face, width + .28, .19, .25, u, y + height / 2 + .13, .11, stone);
      if (ornate) {
        faceBox(face, width + .43, .085, .36, u, y + height / 2 + .265, .16, stone);
        for (const dx of [-width * .38, width * .38]) faceBox(face, .15, .16, .23, u + dx, y + height / 2 + .025, .13, stone);
      }
    };

    localBox(b.w, b.h, b.d, 0, b.h / 2, 0, brick);
    localBox(b.w + .12, .42, b.d + .12, 0, .21, 0, stone);
    localBox(b.w + .15, .2, b.d + .15, 0, b.h - .5, 0, brick);
    // A built-up cornice and real roof well give an architectural silhouette.
    for (const [extra, height, y] of [[.22, .14, b.h - .23], [.42, .16, b.h - .07], [.55, .12, b.h + .075]]) localBox(b.w + extra, height, b.d + extra, 0, y, 0, stone);
    localBox(b.w - .65, .04, b.d - .65, 0, b.h + .16, 0, roof);
    for (const side of [-1, 1]) {
      localBox(b.w + .24, .42, .24, 0, b.h + .26, side * (b.d / 2 + .01), brick);
      localBox(.24, .42, b.d, side * (b.w / 2 + .01), b.h + .26, 0, brick);
      localBox(b.w + .4, .11, .4, 0, b.h + .515, side * (b.d / 2 + .01), stone);
      localBox(.4, .11, b.d, side * (b.w / 2 + .01), b.h + .515, 0, stone);
    }
    localBox(b.w + 2.6, .14, 2.9, 0, -.015, b.d / 2 + 1.28, stone);
    for (let u = -b.w / 2; u < b.w / 2 + .1; u += 3) faceBox(front, .025, .009, 2.65, u, .062, 1.22, dark);

    const ground = b.storefront ? 3.45 : b.industrial ? 3.55 : 2.95;
    const upperFloors = b.floors - 1, spacing = (b.h - ground - .42) / upperFloors;
    for (const [faceIndex, face] of [front, ...sides].entries()) {
      const bays = faceIndex === 0 ? b.bays : Math.max(3, Math.floor(face.width / 3.2));
      const step = face.width / bays;
      for (let floor = 0; floor < upperFloors; floor++) {
        const height = Math.min(1.85, spacing - .72), y = ground + spacing * (floor + .5);
        for (let bay = 0; bay < bays; bay++) {
          const u = -face.width / 2 + step * (bay + .5);
          window(face, u, y, Math.min(b.industrial ? 1.72 : 1.42, step * .54), height, index * 11 + floor * 3 + bay,
            b.storefront && faceIndex === 0 && !lowfx);
        }
      }
      faceBox(face, face.width + .2, .16, .23, 0, ground - .09, .1, stone);
      // Shallow brick piers and pilasters catch side light beside the windows.
      for (let bay = 0; bay <= bays; bay++) {
        const u = -face.width / 2 + step * bay;
        faceBox(face, bay === 0 || bay === bays ? .35 : .19, b.h - ground - .45, .13, u, (b.h + ground) / 2 - .25, .075, brick);
      }
      if (!lowfx && !b.distant) for (let u = -face.width / 2 + .25; u < face.width / 2; u += .45) faceBox(face, .15, .16, .22, u, b.h - .32, .17, stone);
    }

    if (b.storefront) {
      const shops = Math.max(2, Math.round(b.w / 7)), shopWidth = b.w / shops;
      for (let shop = 0; shop < shops; shop++) {
        const u = -b.w / 2 + shopWidth * (shop + .5), left = u - shopWidth / 2;
        faceBox(front, shopWidth - .26, 2.84, .08, u, 1.57, .058, dark);
        const doorU = left + .91, displayU = u + .60, displayWidth = shopWidth - 2.04;
        pane(front, displayWidth, 1.93, displayU, 1.54, .107, index + shop + 1);
        for (let j = 0; j < 3; j++) faceBox(front, .06, 2.03, .16, displayU + (j - 1) * displayWidth / 2, 1.54, .145, metal);
        for (const y of [.53, 2.56]) faceBox(front, displayWidth + .11, .085, .17, displayU, y, .15, metal);
        faceBox(front, 1.12, 2.77, .12, doorU, 1.49, .115, stone);
        faceBox(front, .9, 2.46, .13, doorU, 1.38, .174, dark);
        pane(front, .68, 1.53, doorU, 1.64, .245, shop + 2);
        faceBox(front, .72, .56, .035, doorU, .57, .255, metal);
        faceBar(front, [doorU + .28, 1.08, .30], [doorU + .28, 1.46, .30], .017, metal);
        faceBox(front, 1.18, .085, .66, doorU, .095, .29, stone);
        faceBox(front, shopWidth - .14, .47, .21, u, 3.05, .16, stone);
        const sign = new THREE.PlaneGeometry(shopWidth - .42, .32), uv = sign.attributes.uv;
        const row = (b.sign + shop) % 3;
        for (let i = 0; i < uv.count; i++) uv.setY(i, (2 - row + uv.getY(i)) / 3);
        sign.rotateY(b.ry); add(sign, signs, facePoint(front, u, 3.05, .28));
        // Pitched fabric with a short valance; no transparent decal or shadow trick.
        const canopy = new THREE.PlaneGeometry(shopWidth - .15, 1.02);
        canopy.rotateX(-1.12); canopy.rotateY(b.ry); add(canopy, awning, facePoint(front, u, 2.71, .70));
        faceBox(front, shopWidth - .15, .19, .055, u, 2.47, 1.14, awning);
        for (const dx of [-shopWidth / 2 + .22, shopWidth / 2 - .22]) faceBar(front, [u + dx, 2.19, .13], [u + dx, 2.52, 1.13], .023, dark);
      }
    } else {
      const doors = b.industrial ? Math.max(2, Math.floor(b.w / 5.5)) : 1;
      for (let i = 0; i < doors; i++) {
        const u = -b.w / 2 + b.w * (i + .5) / doors;
        if (b.industrial) {
          faceBox(front, 2.75, 2.65, .075, u, 1.66, .075, dark);
          faceBox(front, 2.45, 2.4, .085, u, 1.66, .13, metal);
          for (let y = .55; y < 2.85; y += .25) faceBox(front, 2.4, .028, .025, u, y, .184, dark);
          faceBox(front, 3.05, .18, .35, u, 3.04, .13, stone);
          for (const dx of [-1.6, 1.6]) faceBar(front, [u + dx, .1, .80], [u + dx, .89, .80], .052, metal);
        } else {
          faceBox(front, 1.3, 2.55, .13, u, 1.40, .09, stone);
          faceBox(front, 1.05, 2.37, .12, u, 1.35, .18, dark);
          pane(front, .83, 1.65, u, 1.59, .25, 1);
        }
      }
    }

    // Side-alley service entries, downpipes and windowless rear walls distinguish
    // a real block from a freestanding facade on all four faces.
    const service = sides[1];
    faceBox(service, 1.1, 2.4, .11, -service.width * .25, 1.29, .08, dark);
    faceBox(service, .88, 2.17, .06, -service.width * .25, 1.27, .16, metal);
    for (const face of sides) {
      const u = face.width / 2 - .4;
      faceBar(face, [u, .25, .20], [u, b.h + .42, .20], .042, metal);
      faceBar(face, [u, .25, .20], [u + .3, .12, .37], .042, metal);
    }

    if (b.fireEscape) {
      const face = sides[1], floorHeight = (b.h - 3.35) / 2;
      for (let floor = 0; floor < 2; floor++) {
        const y = 3.4 + floor * floorHeight;
        faceBox(face, 2.7, .09, 1.23, -.2, y, .68, dark);
        for (const u of [-1.48, 1.08]) faceBar(face, [u, y, 1.25], [u, y + .94, 1.25], .023);
        faceBar(face, [-1.48, y + .94, 1.25], [1.08, y + .94, 1.25], .024);
        for (let u = -1.2; u <= 1.0; u += .36) faceBar(face, [u, y + .04, 1.25], [u, y + .90, 1.25], .012);
        const direction = floor % 2 ? -1 : 1;
        for (let step = 0; step <= 12; step++) {
          const t = step / 12, u = -.2 + direction * (t * 2.3 - 1.15), sy = y + t * floorHeight;
          faceBox(face, .23, .065, .68, u, sy, .66, dark);
        }
        for (const offset of [.25, 1.06]) faceBar(face, [-.2 - direction * 1.15, y + .88, offset], [-.2 + direction * 1.15, y + floorHeight + .88, offset], .025);
        faceBar(face, [-1.45, y, .1], [-1.45, y, 1.24], .034);
        faceBar(face, [1.05, y, .1], [1.05, y, 1.24], .034);
      }
      for (const u of [-.4, .15]) faceBar(face, [u, 1.55, .75], [u, 3.4, .75], .024);
      for (let y = 1.62; y < 3.4; y += .28) faceBar(face, [-.4, y, .75], [.15, y, .75], .018);
    }

    // Roof machinery is low and varied, with visible fan housings and vent runs.
    for (let unit = 0; unit < (b.distant ? 1 : 2); unit++) {
      const u = -b.w * .19 + unit * b.w * .32, z = -b.d * .16 + unit * b.d * .20;
      localBox(2.4, .16, 1.8, u, b.h + .23, z, dark);
      localBox(2.15, .94, 1.52, u, b.h + .78, z, metal);
      for (const du of [-.54, .54]) {
        const fan = new THREE.CylinderGeometry(.37, .37, .055, lowfx ? 10 : 16);
        add(fan, dark, world(u + du, b.h + 1.28, z));
        if (!lowfx) for (let blade = 0; blade < 3; blade++) {
          const g = new THREE.BoxGeometry(.57, .022, .065); g.rotateY(b.ry + blade * Math.PI / 3); add(g, metal, world(u + du, b.h + 1.32, z));
        }
      }
      localBox(1.0, .26, b.d * .24, u + .45, b.h + .39, z - b.d * .17, metal);
    }
    localBox(1.1, 1.35, 1.2, b.w * .32, b.h + .64, -b.d * .29, brick);
    localBox(1.25, .13, 1.36, b.w * .32, b.h + 1.38, -b.d * .29, stone);
    records.push({ id: b.id, authoredCenter: [b.x, b.h / 2, b.z], dimensions: [b.d, b.h, b.w], facadeFacesPark: true,
      bounds: { minX: b.x - b.d / 2 - 2.85, maxX: b.x + b.d / 2 + 2.85, minZ: b.z - b.w / 2 - 1.6, maxZ: b.z + b.w / 2 + 1.6 } });
  }
  group.userData.cityBuildings = { decorativeOnly: true, coordinates: 'authored', materialCount: Object.keys(materials).length, buildings: records };
  return { materials, buildings: records, bounds: records.map(record => record.bounds) };
}

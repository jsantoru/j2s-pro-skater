import * as THREE from 'three';
import { CAP_STYLES, createCapLabelTextures, createCapLinerTexture } from './bottlecap-labels.js';

export const CAP_FLUTES = 21;
export const CAP_RADIUS = 0.555;
export const CAP_ROTATION_PERIOD = 26;
const SEGMENTS = CAP_FLUTES * 6;
const TAU = Math.PI * 2;

// The cross section follows the pressed sheet from its crown, down the fluted
// skirt, around the folded lower edge, and back up the inside of the cap.
// Local +Z is the printed face. Geometry is shared by all five collectibles.
function turnedProfile(profile) {
  const positions = [], uv = [], indices = [];
  for (const [radius, z, flute = 0] of profile) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = i / SEGMENTS * TAU;
      const r = radius + Math.cos(angle * CAP_FLUTES) * flute;
      positions.push(Math.cos(angle) * r, Math.sin(angle) * r, z);
      uv.push(i / SEGMENTS, (z + 0.15) / 0.25);
    }
  }
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = row * (SEGMENTS + 1) + i, b = a + SEGMENTS + 1;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Duplicated UV-seam vertices need the same normal for uninterrupted metal.
  const normals = geometry.attributes.normal;
  for (let row = 0; row < profile.length; row++) {
    const first = row * (SEGMENTS + 1), last = first + SEGMENTS;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function domedDisc(radius, edgeZ, dome, facing = 1, rings = 5) {
  const positions = [0, 0, edgeZ + dome], uv = [0.5, 0.5], indices = [];
  for (let ring = 1; ring <= rings; ring++) {
    const t = ring / rings, r = radius * t;
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = i / SEGMENTS * TAU;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      positions.push(x, y, edgeZ + dome * (1 - t * t));
      uv.push(x / (radius * 2) + 0.5, y / (radius * 2) + 0.5);
    }
  }
  const triangle = (a, b, c) => facing > 0 ? indices.push(a, b, c) : indices.push(a, c, b);
  for (let i = 0; i < SEGMENTS; i++) triangle(0, i + 1, i + 2);
  for (let ring = 1; ring < rings; ring++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = 1 + (ring - 1) * (SEGMENTS + 1) + i, b = a + SEGMENTS + 1;
      triangle(a, b, b + 1); triangle(a, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createBottlecapGeometries() {
  return {
    face: domedDisc(0.475, 0.072, 0.023),
    skirt: turnedProfile([
      [0.475, 0.072], [0.490, 0.062, 0.001], [0.505, 0.039, 0.004],
      [0.513, 0.004, 0.009], [0.516, -0.039, 0.015],
      [0.526, -0.088, 0.020], [0.534, -0.116, 0.021],
    ]),
    // A rounded, bare-metal hem catches light at each of the 21 crimp peaks.
    rim: turnedProfile([
      [0.534, -0.116, 0.021], [0.533, -0.133, 0.020],
      [0.521, -0.144, 0.018], [0.507, -0.139, 0.016],
      [0.494, -0.123, 0.014],
    ]),
    inside: turnedProfile([
      [0.494, -0.123, 0.014], [0.491, -0.082, 0.011],
      [0.484, -0.025, 0.006], [0.462, 0.031, 0.001], [0.435, 0.035],
    ]),
    liner: domedDisc(0.437, 0.034, -0.005, -1, 3),
  };
}

function corkTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  let seed = 7419;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed >>> 24) / 255;
    const dark = grain < 0.13 ? 0.56 : 0.82 + grain * 0.18;
    data[i * 4] = 184 * dark; data[i * 4 + 1] = 148 * dark;
    data[i * 4 + 2] = 92 * dark; data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createBottlecapModel(index, geometries) {
  const styleIndex = ((index % CAP_STYLES.length) + CAP_STYLES.length) % CAP_STYLES.length;
  const style = CAP_STYLES[styleIndex];
  const labels = createCapLabelTextures(styleIndex);
  const liner = createCapLinerTexture();
  const linerMap = liner.map || corkTexture();
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: labels.map ? 0xffffff : style.faceColor,
    map: labels.map, roughnessMap: labels.roughnessMap,
    metalness: 0.28, roughness: style.roughness ?? 0.62,
    emissive: 0xffffff, emissiveMap: labels.map, emissiveIntensity: labels.map ? 0.12 : 0,
    envMapIntensity: 0.8,
  });
  const skirtMaterial = new THREE.MeshStandardMaterial({
    color: style.skirtColor, metalness: 0.55, roughness: 0.47, envMapIntensity: 1,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: style.metalColor, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.1,
  });
  const insideMaterial = new THREE.MeshStandardMaterial({
    color: style.metalColor, metalness: 0.68, roughness: 0.7, envMapIntensity: 0.7,
  });
  const linerMaterial = new THREE.MeshStandardMaterial({ map: linerMap, roughness: 0.95, metalness: 0 });
  const group = new THREE.Group();
  group.name = `Vintage ${style.name} crown cap`;
  group.userData.bottlecap = { styleId: style.id, styleIndex, flutes: CAP_FLUTES, radius: CAP_RADIUS };
  for (const [part, mat] of [
    ['face', faceMaterial], ['skirt', skirtMaterial], ['rim', metalMaterial],
    ['inside', insideMaterial], ['liner', linerMaterial],
  ]) {
    const mesh = new THREE.Mesh(geometries[part], mat);
    mesh.name = `cap-${part}`;
    group.add(mesh);
  }
  setBottlecapRotation(group, 0, styleIndex);
  return {
    group, materials: [faceMaterial, skirtMaterial, metalMaterial, insideMaterial, linerMaterial],
    textures: [...new Set([labels.map, labels.roughnessMap, linerMap].filter(Boolean))],
    ready: Promise.all([labels.ready, liner.ready]),
  };
}

export function setBottlecapRotation(group, elapsed, index = 0) {
  // Rotate in world Y before the small fixed tilt. The face is a physical mesh,
  // so approaching from behind reveals the skirt and cork, never a billboard.
  group.rotation.order = 'YXZ';
  group.rotation.set(-0.14, elapsed / CAP_ROTATION_PERIOD * TAU + index * 0.37, -0.075, 'YXZ');
}

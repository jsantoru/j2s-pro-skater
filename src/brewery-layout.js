import * as THREE from 'three';

// Shared placement data keeps the rendered stock and simple collision hulls aligned.
// y is the supporting floor/platform, never the centre of the prop.
export const BREWERY_STOCK = [
  { kind: 'kegs', x: -28.5, y: 0, z: -20.4, rows: 2 },
  { kind: 'kegs', x: -30, y: 0, z: -20.4, rows: 2 },
  { kind: 'kegs', x: -31.5, y: 0, z: -21.5, rows: 1 },
  { kind: 'keg', x: -33, y: 0, z: -19 },
  { kind: 'keg', x: -33.7, y: 0, z: -20.1 },
  { kind: 'keg', x: 33, y: 1.6, z: 20 },
  { kind: 'keg', x: 32, y: 1.6, z: 21.2 },
  { kind: 'cases', x: 28, y: 0, z: -20.6, rows: 4, brand: 1 },
  { kind: 'cases', x: 29.4, y: 0, z: -20.6, rows: 6, brand: 0, wrap: true },
  { kind: 'cases', x: 30.8, y: 0, z: -20.6, rows: 5, brand: 0 },
  { kind: 'cases', x: 28, y: 0, z: -22, rows: 5, brand: 2 },
  { kind: 'cases', x: 30.8, y: 0, z: -22, rows: 6, brand: 1, wrap: true },
  { kind: 'cases', x: -26.9, y: 0, z: 20.8, rows: 4, brand: 0, wrap: true },
  { kind: 'cases', x: -28.3, y: 0, z: 20.8, rows: 3, brand: 1 },
  { kind: 'crates', x: -21.4, y: 0, z: 21.6, rows: 3 },
  { kind: 'crates', x: 26.3, y: 0, z: -21.4, rows: 2 },
  { kind: 'tank', x: -33.6, y: 0, z: -13.4, number: '04' },
  { kind: 'tank', x: -33.6, y: 0, z: -16.3, number: '05' },
];

export function addBreweryColliders(level) {
  for (const prop of BREWERY_STOCK) {
    const {kind, x, y, z, rows = 1} = prop;
    let geometry, centerY;
    if (kind === 'tank') {
      // Rounded body envelope includes the supporting frame; valves stay decorative.
      geometry = new THREE.CylinderGeometry(.96, .96, 4.12, 16); centerY = 2.06;
    } else if (kind === 'keg') {
      geometry = new THREE.CylinderGeometry(.219, .219, .62, 16); centerY = .31;
    } else {
      const height = kind === 'kegs' ? .18 + rows * .62 : kind === 'cases' ? .18 + rows * .29 : rows * .33;
      const width = kind === 'crates' ? .57 : 1.18, depth = kind === 'crates' ? .39 : 1.02;
      geometry = new THREE.BoxGeometry(width, height, depth); centerY = height / 2;
    }
    const hull = new THREE.Mesh(geometry, level.mats.dark);
    hull.name = 'Brewery stock: ' + kind; hull.userData.breweryProp = prop;
    hull.position.set(x, y + centerY, z); hull.visible = false;
    level.add(hull, true, false);
  }
}

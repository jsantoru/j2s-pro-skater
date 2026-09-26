import * as THREE from 'three';
import { PICKUPS } from './goals.js';

export { PICKUPS } from './goals.js';

const COLORS = { letter: 0xffce62, cap: 0x6ee7d4, tape: 0xfa91dc };
const HAS_CANVAS = typeof document !== 'undefined';
const UP = new THREE.Vector3(0, 1, 0);

function canvasTexture(draw, width = 256, height = 256) {
  if (!HAS_CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glyphTexture(label, type) {
  return canvasTexture((ctx, w, h) => {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${type === 'letter' ? 190 : 152}px "Arial Black", Arial, sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 14;
    ctx.strokeStyle = '#342718'; ctx.strokeText(label, w / 2, h / 2 + 9);
    ctx.fillStyle = type === 'letter' ? '#fff3b8' : '#d8fff7';
    ctx.fillText(label, w / 2, h / 2 + 9);
  });
}

function material(color, options = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...options });
}

// Small shared geometry, no lights or shadows. Physical medals sit behind readable,
// camera-facing glyphs; a low floor ring makes the pickup's landing spot unambiguous.
export class Collectibles {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'Warehouse goal pickups';
    this.group.visible = false;
    parent?.add(this.group);
    this.elapsed = 0;
    this._cameraQuaternion = new THREE.Quaternion();
    this.haloTexture = canvasTexture((ctx, w, h) => {
      const glow = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2);
      glow.addColorStop(0, '#ffffffb0');
      glow.addColorStop(0.32, '#ffffff40');
      glow.addColorStop(1, '#ffffff00');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    });
    this.geometries = {
      rim: new THREE.TorusGeometry(0.46, 0.045, 6, 36),
      cap: new THREE.CylinderGeometry(0.34, 0.34, 0.11, 20),
      capRim: new THREE.TorusGeometry(0.34, 0.036, 4, 20),
      ring: new THREE.RingGeometry(0.43, 0.47, 36),
      tape: new THREE.BoxGeometry(0.88, 0.53, 0.16),
      reel: new THREE.CylinderGeometry(0.105, 0.105, 0.025, 16),
      reelHole: new THREE.CylinderGeometry(0.036, 0.036, 0.03, 12),
      label: new THREE.PlaneGeometry(0.64, 0.10),
    };
    this.items = PICKUPS.map((definition, index) => this.create(definition, index));
  }

  create(definition, index) {
    const color = COLORS[definition.type];
    const root = new THREE.Group(); root.name = definition.id;
    root.position.fromArray(definition.position);
    const face = new THREE.Group(); root.add(face);
    const materials = [];
    const own = (mat) => { materials.push(mat); return mat; };
    const colored = own(material(color));
    const dark = own(material(definition.type === 'cap' ? 0x154b49 : 0x332619));

    if (definition.type === 'letter') {
      const rim = new THREE.Mesh(this.geometries.rim, colored);
      face.add(rim);
    } else if (definition.type === 'cap') {
      const cap = new THREE.Mesh(this.geometries.cap, dark);
      cap.rotation.x = Math.PI / 2; face.add(cap);
      const rim = new THREE.Mesh(this.geometries.capRim, colored);
      rim.position.z = 0.07; face.add(rim);
    } else {
      const body = new THREE.Mesh(this.geometries.tape, dark);
      face.add(body);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(this.geometries.tape),
        own(new THREE.LineBasicMaterial({ color, toneMapped: false })));
      face.add(outline);
      const label = new THREE.Mesh(this.geometries.label, colored);
      label.position.set(0, 0.15, 0.085); face.add(label);
      for (const x of [-0.22, 0.22]) {
        const reel = new THREE.Mesh(this.geometries.reel, colored);
        reel.rotation.x = Math.PI / 2; reel.position.set(x, -0.055, 0.09); face.add(reel);
        const hole = new THREE.Mesh(this.geometries.reelHole, dark);
        hole.rotation.x = Math.PI / 2; hole.position.set(x, -0.055, 0.11); face.add(hole);
      }
    }

    const texture = definition.type === 'tape' ? null : glyphTexture(definition.type === 'letter' ? definition.label : 'G', definition.type);
    if (texture) {
      const glyph = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: texture, toneMapped: false, depthWrite: false })));
      const size = definition.type === 'letter' ? 0.90 : 0.54;
      glyph.scale.set(size, size, 1); glyph.position.z = 0.09; face.add(glyph);
    }
    if (this.haloTexture) {
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({
        map: this.haloTexture, color, transparent: true, opacity: 0.34,
        blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false,
      })));
      halo.scale.set(1.9, 1.9, 1); root.add(halo);
    }

    const ringMaterial = own(material(color, { transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    const ring = new THREE.Mesh(this.geometries.ring, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(definition.position[0], definition.surfaceY + 0.025, definition.position[2]);
    this.group.add(root, ring);
    for (const mat of materials) {
      mat.userData.restOpacity = mat.opacity;
      mat.userData.restTransparent = mat.transparent;
    }
    return { definition, root, face, ring, materials, texture, index, collected: false, burst: 0 };
  }

  sync(collected = new Set()) {
    for (const item of this.items) {
      const next = collected.has(item.definition.id);
      if (next === item.collected) continue;
      item.collected = next; item.burst = 0;
      // A fresh run restores every mesh/material, including a pickup mid-animation.
      item.root.visible = true; item.ring.visible = !next;
      item.root.scale.setScalar(1);
      for (const mat of item.materials) {
        mat.opacity = mat.userData.restOpacity;
        if (!next) mat.transparent = mat.userData.restTransparent;
      }
    }
  }

  update(dt, active = true, camera = null) {
    this.group.visible = active;
    if (!active) return;
    this.elapsed += Math.max(0, dt);
    if (camera) camera.getWorldQuaternion(this._cameraQuaternion);
    for (const item of this.items) {
      if (!item.root.visible) continue;
      const phase = this.elapsed * 2.15 + item.index * 0.71;
      item.root.position.y = item.definition.position[1] + Math.sin(phase) * 0.075;
      if (camera) item.face.quaternion.copy(this._cameraQuaternion);
      else item.face.quaternion.setFromAxisAngle(UP, Math.sin(phase * 0.35) * 0.35);
      item.face.rotateZ(Math.sin(phase * 0.7) * 0.045);
      item.ring.scale.setScalar(1 + Math.sin(phase) * 0.07);
      if (item.collected) {
        item.burst += dt;
        const t = Math.min(1, item.burst / 0.32);
        item.root.position.y += t * 0.55;
        item.root.scale.setScalar(1 + t * 0.55);
        for (const mat of item.materials) {
          mat.transparent = true;
          mat.opacity = mat.userData.restOpacity * (1 - t);
        }
        if (t >= 1) item.root.visible = false;
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const item of this.items) {
      item.texture?.dispose();
      for (const mat of item.materials) mat.dispose();
      // The tape outline is the only unshared mesh geometry.
      item.face.children.find(child => child.isLineSegments)?.geometry.dispose();
    }
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.haloTexture?.dispose();
  }
}

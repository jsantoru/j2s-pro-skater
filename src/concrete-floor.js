import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { canvasMap } from './materials.js';
import { concreteTintGLSL, upgradeConcreteObstacles } from './concrete-obstacles.js';

// One floor material: measured surface detail, unique wear, and a small planar reflection.
// Geometry, collision, lights, exposure and the rest of the park are unchanged.
export class ConcreteFloor {
  constructor(floor, { lowfx = false, level = null } = {}) {
    this.floor = floor;
    this.status = 'loading';
    this.reflections = !lowfx;
    this.reflectionPasses = 0;
    this.disposed = false;
    this.textures = [];
    this.previousMaterial = floor.material;
    this.previousBeforeRender = floor.onBeforeRender;
    const loader = new THREE.TextureLoader();
    const base = `${import.meta.env.BASE_URL}textures/concrete/`;
    const load = async (file, color) => {
      const t = await loader.loadAsync(base + file);
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = lowfx ? 4 : 8;
      this.textures.push(t);
      if (this.disposed) t.dispose();
      return t;
    };
    this.ready = Promise.all([load('albedo.jpg', true), load('normal.jpg', false), load('roughness.jpg', false)])
      .then(([map, normalMap, roughnessMap]) => {
        if (this.disposed) return false;
        this.wear = createWearMap();
        this.material = new THREE.MeshStandardMaterial({
          name: 'Worn polished concrete', map, normalMap, roughnessMap,
          normalScale: new THREE.Vector2(0.38, 0.38), roughness: 0.65, metalness: 0,
          envMapIntensity: 0.35,
        });
        const uniforms = {
          floorWearMap: { value: this.wear },
          floorPaintMap: { value: floor.userData.paintMap },
          floorReflection: { value: null },
          floorReflectionMatrix: { value: new THREE.Matrix4() },
        };
        if (!lowfx) {
          this.reflector = new Reflector(floor.geometry, { textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: 0.003 });
          const rt = this.reflector.getRenderTarget();
          rt.texture.generateMipmaps = true;
          rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
          uniforms.floorReflection.value = rt.texture;
          uniforms.floorReflectionMatrix.value = this.reflector.material.uniforms.textureMatrix.value;
          // The same pass, re-projected from world space so the obstacles can share it.
          const floorWorldInverse = floor.matrixWorld.clone().invert();
          this.obstacleReflection = {
            texture: { value: rt.texture },
            matrix: { value: new THREE.Matrix4() },
            enabled: { value: 0 },
          };
          floor.onBeforeRender = (renderer, scene, camera) => {
            // Skip offscreen passes, including the reflection itself. This prevents feedback.
            if (renderer.getRenderTarget()) return;
            this.reflector.matrixWorld.copy(floor.matrixWorld);
            const visible = floor.visible;
            floor.visible = false;
            // Obstacles must not sample the target they are being drawn into.
            this.obstacleReflection.enabled.value = 0;
            this.obstacleReflection.texture.value = null;
            try { this.reflector.onBeforeRender(renderer, scene, camera); this.reflectionPasses++; }
            finally { floor.visible = visible; }
            this.obstacleReflection.matrix.value
              .multiplyMatrices(this.reflector.material.uniforms.textureMatrix.value, floorWorldInverse);
            this.obstacleReflection.texture.value = rt.texture;
            this.obstacleReflection.enabled.value = 1;
          };
        }
        this.material.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
            varying vec2 vFloorMeters;
            varying vec4 vFloorReflection;
            uniform mat4 floorReflectionMatrix;
          `).replace('#include <begin_vertex>', `#include <begin_vertex>
            vFloorMeters = position.xy;
            vFloorReflection = floorReflectionMatrix * vec4(position, 1.0);
          `);
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
            ${concreteTintGLSL}
            varying vec2 vFloorMeters;
            varying vec4 vFloorReflection;
            uniform sampler2D floorWearMap;
            uniform sampler2D floorPaintMap;
            uniform sampler2D floorReflection;
            vec2 floorHash(vec2 p) {
              return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)))) * 43758.5453);
            }
          `).replace('#include <map_fragment>', `
            // Offset each poured slab independently. All three PBR maps use the SAME coordinates.
            vec2 slab = floor(vFloorMeters / 6.0);
            vec2 scanUV = vFloorMeters / 2.7 + floorHash(slab) * 7.0;
            vec2 areaUV = (vFloorMeters + vec2(36.0,23.0)) / vec2(72.0,46.0);
            vec3 wear = texture2D(floorWearMap, areaUV).rgb;
            vec4 paint = texture2D(floorPaintMap, areaUV);
            vec3 scan = texture2D(map, scanUV).rgb;
            float scanLuma = dot(scan, vec3(0.2126,0.7152,0.0722));
            float scanRough = texture2D(roughnessMap, scanUV).g;
            // Neutral mineral tint replaces the source's terracotta pigment, retaining its wear.
            vec3 stone = concreteTint(scan);
            stone *= mix(0.92,1.07,floorHash(slab).x);
            stone *= 1.0 - wear.r * 0.40;
            stone = mix(stone, vec3(0.22,0.225,0.218),wear.b * 0.55);
            // Chipped, anti-aliased saw cuts, measured in metres instead of texture pixels.
            vec2 jointSigned = mod(vFloorMeters + 3.0,6.0) - 3.0;
            float jointDistance = min(abs(jointSigned.x),abs(jointSigned.y));
            float aa = max(fwidth(jointDistance),0.001);
            float joint = 1.0 - smoothstep(0.005-aa,0.010+aa,jointDistance);
            float chippedEdge = (1.0-smoothstep(0.016,0.048,jointDistance)) * smoothstep(0.44,0.78,scanRough);
            stone = mix(stone, stone * 0.68, chippedEdge);
            stone = mix(stone, vec3(0.026,0.028,0.025),joint * 0.86);
            // Paint sits in the same surface response and is worn through by the scan's fine detail.
            float paintCoverage = paint.a * smoothstep(0.12,0.34,scanLuma + 0.19);
            diffuseColor.rgb *= mix(stone,paint.rgb,paintCoverage);
          `).replace('#include <roughnessmap_fragment>', `
            float roughnessFactor = clamp(0.42 + scanRough * 0.34 - wear.g * 0.13 + wear.r * 0.16 + wear.b * 0.12, 0.40, 0.92);
            roughnessFactor = mix(roughnessFactor,0.75,paintCoverage * 0.8);
            roughnessFactor = mix(roughnessFactor,0.95,joint);
          `).replace('#include <normal_fragment_maps>', `
            vec3 mapN = texture2D(normalMap,scanUV).xyz * 2.0 - 1.0;
            mapN.xy *= normalScale * (1.0-wear.g * 0.35);
            mapN.xy += sign(jointSigned) * (1.0-smoothstep(vec2(0.008),vec2(0.035),abs(jointSigned))) * 0.14;
            normal = normalize(tbn * mapN);
          `);
          if (!lowfx) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            // Mip-filtered reflection: rough patches spread the skylights, polished lines retain them.
            vec2 reflectionUV = vFloorReflection.xy / vFloorReflection.w;
            reflectionUV += mapN.xy * 0.018;
            float reflectionLod = 1.4 + roughnessFactor * 4.8;
            vec3 reflectionColor = textureLod(floorReflection,clamp(reflectionUV,vec2(0.001),vec2(0.999)),reflectionLod).rgb;
            float viewFacing = clamp(dot(normal,normalize(vViewPosition)),0.0,1.0);
            float fresnel = 0.055 + 0.85 * pow(1.0-viewFacing,3.0);
            // Retain a satin grazing sheen without turning ceiling panels into bright floor stripes.
            float reflectionWeight = 0.48 * fresnel * (1.0-roughnessFactor*0.62) * (1.0-joint*0.92);
            outgoingLight = mix(outgoingLight,reflectionColor,reflectionWeight);
            #include <opaque_fragment>
          `);
        };
        this.material.customProgramCacheKey = () => `concrete-floor-v2-${lowfx}`;
        floor.material = this.material;
        if (level) this.restoreObstacles = upgradeConcreteObstacles(level, { map, normalMap, roughnessMap }, this.obstacleReflection);
        this.status = 'ready';
        return true;
      }).catch(error => {
        this.status = 'fallback';
        if (!this.disposed && floor.userData.paintMap) {
          this.fallbackPaint = new THREE.Mesh(new THREE.PlaneGeometry(72,46),new THREE.MeshStandardMaterial({
            map: floor.userData.paintMap, transparent: true, depthWrite: false, roughness: 0.94,
          }));
          this.fallbackPaint.position.z = 0.006;
          this.fallbackPaint.receiveShadow = true;
          floor.add(this.fallbackPaint);
        }
        console.warn('Concrete textures could not load; keeping the procedural floor.', error);
        return false;
      });
  }

  dispose() {
    this.disposed = true;
    this.floor.onBeforeRender = this.previousBeforeRender;
    this.floor.material = this.previousMaterial;
    this.restoreObstacles?.();
    this.reflector?.dispose();
    this.material?.dispose();
    this.wear?.dispose();
    this.textures.forEach(t => t.dispose());
    if (this.fallbackPaint) {
      this.floor.remove(this.fallbackPaint);
      this.fallbackPaint.geometry.dispose(); this.fallbackPaint.material.dispose();
    }
  }
}

function createWearMap() {
  // Packed linear data: R = dirt, G = wheel polish, B = repaired patches.
  return canvasMap((c,s,rng) => {
    c.fillStyle = 'rgb(15,35,0)'; c.fillRect(0,0,s,s);
    c.scale(s/72,s/46); c.translate(36,23);
    const smudge = (x,z,rx,rz,color) => {
      c.save(); c.translate(x,z); c.scale(rx,rz);
      const g = c.createRadialGradient(0,0,0,0,0,1);
      g.addColorStop(0,color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.fillRect(-1,-1,2,2); c.restore();
    };
    c.globalCompositeOperation='lighter';
    // Long overlapping routes, concentrated at the actual rail, gap, and transition approaches.
    for (const [x,z,rx,rz] of [[-10,14,19,3.2],[-15,4,13,2.1],[10,12,10,2.5],[20,-2,2.3,8],[-29,4,4,13],[29,-5,4,8],[0,-14,13,2.8],[0,15,12,2.5]]) {
      smudge(x,z,rx,rz,'rgba(0,220,0,0.66)');
    }
    for(let i=0;i<110;i++) smudge(rng()*70-35,rng()*44-22,0.3+rng()*2.2,0.2+rng()*1.4,'rgba(210,0,0,0.18)');
    // Dust gathers near perimeter walls and along obstacle bases.
    for(const z of [-22.5,22.5]) for(let x=-34;x<35;x+=2) smudge(x,z,3,1.5,'rgba(200,0,0,0.30)');
    for(const x of [-35.5,35.5]) for(let z=-20;z<21;z+=2) smudge(x,z,1.4,3,'rgba(200,0,0,0.30)');
    for(const [x,z,rx,rz] of [[2,2,5,5],[12,-2,4.4,0.8],[-12,-4,4,0.8],[0,-7,12,1.1],[0,-20.6,12,1.1]]) smudge(x,z,rx,rz,'rgba(200,0,0,0.34)');
    c.globalCompositeOperation='source-over';
    // Small irregular repair fills, away from the key takeoff points.
    for(const [x,z,w,h] of [[-9,16,0.65,1.5],[16,5,1.1,0.45],[-24,-4,0.8,0.7],[7,-4,0.5,1.1]]) {
      c.fillStyle='rgb(25,25,185)'; c.beginPath();
      c.moveTo(x,z); c.lineTo(x+w,z+0.08); c.lineTo(x+w*0.94,z+h); c.lineTo(x+0.06,z+h*0.92); c.closePath(); c.fill();
    }
  },1024,false);
}

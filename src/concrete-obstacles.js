import * as THREE from 'three';

// Shared with the floor so every concrete surface uses the same mineral tint.
export const concreteTintGLSL = `
  vec3 concreteTint(vec3 scan) {
    float luminance = dot(scan,vec3(0.2126,0.7152,0.0722));
    return vec3(1.015,1.0,0.965) * (0.065 + luminance * 1.25);
  }
`;

// Reuse the already-loaded floor textures, its surface response, and its reflection pass.
// No extra textures, materials per piece, or additional render passes.
export function upgradeConcreteObstacles(level, { map, normalMap, roughnessMap }, reflection = null) {
  const original = level.mats.concrete;
  const material = new THREE.MeshStandardMaterial({
    name: 'Worn cast concrete', map, normalMap, roughnessMap,
    color: 0xffffff, normalScale: new THREE.Vector2(0.40,0.40),
    roughness: 0.62, metalness: 0, envMapIntensity: 0.35,
  });
  const uniforms = reflection && {
    concreteReflection: reflection.texture,
    concreteReflectionMatrix: reflection.matrix,
    concreteReflectionOn: reflection.enabled,
  };
  material.onBeforeCompile = shader => {
    if (uniforms) Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vConcreteWorld;
      varying float vConcreteUp;
      ${reflection ? 'varying vec4 vConcreteReflection;\nuniform mat4 concreteReflectionMatrix;' : ''}
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 concreteWorld = modelMatrix * vec4(position,1.0);
      vConcreteWorld = concreteWorld.xyz;
      vConcreteUp = max(0.0,normalize(mat3(modelMatrix) * normal).y);
      ${reflection ? 'vConcreteReflection = concreteReflectionMatrix * concreteWorld;' : ''}
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vConcreteWorld;
      varying float vConcreteUp;
      ${reflection ? 'varying vec4 vConcreteReflection;\nuniform sampler2D concreteReflection;\nuniform float concreteReflectionOn;' : ''}
      vec2 concreteHash(vec2 p) {
        return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)))) * 43758.5453);
      }
      ${concreteTintGLSL}
    `).replace('#include <map_fragment>', `
      vec3 concreteScan = texture2D(map,vMapUv).rgb;
      vec3 stone = concreteTint(concreteScan);
      // Cast on the floor's six-metre pour grid, so neighbouring slabs vary by the same amount.
      stone *= mix(0.93,1.06,concreteHash(floor(vConcreteWorld.xz / 6.0)).x);
      // Trucks and wheels burnish the surfaces that get ridden; dust gathers at the foot.
      float concretePolish = smoothstep(0.30,0.92,vConcreteUp);
      float concreteGrime = 1.0 - smoothstep(0.0,0.24,vConcreteWorld.y);
      stone *= 1.0 - concreteGrime * 0.09;
      diffuseColor.rgb *= stone;
    `).replace('#include <roughnessmap_fragment>', `
      // Same base gloss as the floor, so a box top and the slab beside it read as one pour.
      float roughnessFactor = clamp(0.46 + texture2D(roughnessMap,vRoughnessMapUv).g * 0.34
        - concretePolish * 0.07 + concreteGrime * 0.10, 0.42, 0.92);
    `);
    if (reflection) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      // The floor's single reflection pass, reused on the surfaces that face up enough to catch it.
      vec2 concreteReflectUV = vConcreteReflection.xy / vConcreteReflection.w;
      vec3 concreteReflectColor = textureLod(concreteReflection,clamp(concreteReflectUV,vec2(0.001),vec2(0.999)),2.2 + roughnessFactor * 4.4).rgb;
      float concreteFacing = clamp(dot(normal,normalize(vViewPosition)),0.0,1.0);
      float concreteFresnel = 0.05 + 0.80 * pow(1.0-concreteFacing,3.0);
      float concreteReflectWeight = 0.48 * concreteReflectionOn * concreteFresnel
        * (1.0-roughnessFactor*0.62) * smoothstep(0.30,0.86,vConcreteUp);
      outgoingLight = mix(outgoingLight,concreteReflectColor,concreteReflectWeight);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `cast-concrete-v4-${Boolean(reflection)}`;
  const changed = [], position = new THREE.Vector3(), normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  level.group.updateMatrixWorld(true);
  level.group.traverse(mesh => {
    if (!mesh.isMesh || mesh.material !== original) return;
    const entry = { mesh, uv: mesh.geometry.attributes.uv };
    changed.push(entry); mesh.material = material;
    if (!mesh.visible) return; // Hidden collision proxies retain their original geometry and UVs.
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (let i=0;i<p.count;i++) {
      position.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
      const ax=Math.abs(normal.x), ay=Math.abs(normal.y), az=Math.abs(normal.z);
      // Same 2.7-metre texture footprint on banks, box tops, stair risers, and side faces.
      if (ay >= ax && ay >= az) { uv[i*2]=position.x/2.7; uv[i*2+1]=-position.z/2.7; }
      else if (ax > az) { uv[i*2]=position.z/2.7; uv[i*2+1]=position.y/2.7; }
      else { uv[i*2]=position.x/2.7; uv[i*2+1]=position.y/2.7; }
    }
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  });
  level.mats.concrete = material;
  return () => {
    for (const {mesh,uv} of changed) { mesh.material=original; mesh.geometry.setAttribute('uv',uv); }
    level.mats.concrete=original; material.dispose(); // Shared textures remain owned by the floor.
  };
}

import { upgradeConcreteObstacles } from './concrete-obstacles.js';

// Reuse the warehouse's photographed CC0 concrete maps. Both worlds remain
// cached, so the park needs no duplicate texture uploads or reflection pass.
export function upgradeRocCityConcrete(level, source) {
  let restore = null;
  const surfaces = [level.floor, level.floorSouth].filter(Boolean);
  const previous = surfaces.map(mesh => mesh.material);
  const state = { status: 'loading', ready: null, disposed: false, dispose() {
    state.disposed = true;
    restore?.();
    surfaces.forEach((mesh, index) => { mesh.material = previous[index]; });
  } };
  state.ready = Promise.resolve(source?.ready).then(() => {
    if (state.disposed) return false;
    const { map, normalMap, roughnessMap } = source?.material || {};
    if (!map || !normalMap || !roughnessMap) {
      state.status = 'fallback'; return false;
    }
    for (const mesh of surfaces) mesh.material = level.mats.concrete;
    restore = upgradeConcreteObstacles(level, { map, normalMap, roughnessMap });
    const material = level.mats.concrete;
    material.name = 'ROC City cast concrete';
    // Curved park walls cross projection axes. A tangent-space normal map on
    // those discontinuous UVs made visible bands through the mini and bowl.
    // Their shaped normals carry the surface; the shared scan supplies subtle
    // mineral texture through a continuous world-space blend below.
    material.normalMap = null;
    material.bumpMap = map;
    material.bumpScale = .10;
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      compile(shader);
      shader.vertexShader = shader.vertexShader
        .replace('varying float vConcreteUp;', 'varying float vConcreteUp;\nvarying vec3 vRocNormal;')
        .replace('vConcreteWorld = concreteWorld.xyz;', 'vConcreteWorld = concreteWorld.xyz;\nvRocNormal = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('varying float vConcreteUp;', 'varying float vConcreteUp;\nvarying vec3 vRocNormal;')
        .replace('vec3 concreteScan = texture2D(map,vMapUv).rgb;', `
          vec3 axisWeight = pow(abs(normalize(vRocNormal)), vec3(4.0));
          axisWeight /= max(dot(axisWeight, vec3(1.0)), 0.0001);
          vec3 concreteScan = texture2D(map, vConcreteWorld.zy / 2.7).rgb * axisWeight.x
            + texture2D(map, vConcreteWorld.xz / 2.7).rgb * axisWeight.y
            + texture2D(map, vConcreteWorld.xy / 2.7).rgb * axisWeight.z;
        `)
        .replace('vec3 stone = concreteTint(concreteScan);',
          'vec3 stone = mix(vec3(0.36, 0.358, 0.348), concreteTint(concreteScan), 0.78);')
        .replace('mix(0.93,1.06,concreteHash', 'mix(0.986,1.014,concreteHash')
        .replace('concreteGrime * 0.09', 'concreteGrime * 0.035')
        .replace('diffuseColor.rgb *= stone;', `
        // Hairline slab joints and slight pour variation on the flat decks.
        // The continuous bowl transitions remain free of a square tile grid.
        float flatDeck = 1.0 - step(0.025, min(min(abs(vConcreteWorld.y), abs(vConcreteWorld.y - 1.62)),
          min(abs(vConcreteWorld.y - 1.26), abs(vConcreteWorld.y + 0.9))));
        vec2 slab = abs(fract(vConcreteWorld.xz / 4.0 + 0.5) - 0.5) * 4.0;
        float jointDistance = min(slab.x, slab.y);
        float joint = 1.0 - smoothstep(0.006, 0.021, jointDistance);
        stone *= 1.0 - joint * flatDeck * smoothstep(0.94, 0.995, vConcreteUp) * 0.17;
        diffuseColor.rgb *= stone;
      `).replace('0.46 + texture2D(roughnessMap,vRoughnessMapUv).g * 0.34',
        '0.67 + dot(concreteScan, vec3(0.2126, 0.7152, 0.0722)) * 0.20')
        .replace('#include <normal_fragment_maps>', `
          // Screen derivatives of the same blended scan stay continuous across
          // curved walls and require no extra normal-texture lookups.
          float rocBump = bumpScale * dot(concreteScan, vec3(0.2126, 0.7152, 0.0722));
          normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(rocBump), dFdy(rocBump)), faceDirection);
        `);
    };
    material.customProgramCacheKey = () => 'roc-city-concrete-v2';
    state.status = 'ready'; return true;
  }).catch(() => { state.status = 'fallback'; return false; });
  return state;
}

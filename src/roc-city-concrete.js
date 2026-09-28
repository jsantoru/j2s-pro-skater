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
    material.normalScale.set(.24, .24);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      compile(shader);
      shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= stone;', `
        // Hairline slab joints and slight pour variation on the flat decks.
        // The continuous bowl transitions remain free of a square tile grid.
        float flatDeck = 1.0 - step(0.025, min(min(abs(vConcreteWorld.y), abs(vConcreteWorld.y - 1.62)),
          min(abs(vConcreteWorld.y - 1.26), abs(vConcreteWorld.y + 0.9))));
        vec2 slab = abs(fract(vConcreteWorld.xz / 4.0 + 0.5) - 0.5) * 4.0;
        float jointDistance = min(slab.x, slab.y);
        float joint = 1.0 - smoothstep(0.006, 0.021, jointDistance);
        stone *= 1.0 - joint * flatDeck * smoothstep(0.94, 0.995, vConcreteUp) * 0.24;
        diffuseColor.rgb *= stone;
      `).replace('0.46 + texture2D(roughnessMap,vRoughnessMapUv).g * 0.34',
        '0.63 + texture2D(roughnessMap,vRoughnessMapUv).g * 0.27');
    };
    material.customProgramCacheKey = () => 'roc-city-concrete-v1';
    state.status = 'ready'; return true;
  }).catch(() => { state.status = 'fallback'; return false; });
  return state;
}

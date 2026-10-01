import * as THREE from 'three';

// Same photographed concrete scans as the other levels, with Perinton's
// integrally coloured tan transitions retained. Curves use a continuous
// triplanar projection so quarter-pipes never inherit stretched wall UVs.
export function upgradePerintonConcrete(level,source){
  const replacements=new Map(),changed=[];
  const state={status:'loading',disposed:false,ready:null,dispose(){
    if(state.disposed)return;state.disposed=true;
    for(const [mesh,material]of changed)mesh.material=material;
    for(const [old,material]of replacements){
      for(const key of Object.keys(level.mats))if(level.mats[key]===material)level.mats[key]=old;
      material.dispose();
    }
  }};
  state.ready=Promise.resolve(source?.ready).then(()=>{
    if(state.disposed)return false;
    const {map}=source?.material||{};
    if(!map){state.status='fallback';return false;}
    for(const original of new Set([level.mats.concrete,level.mats.tan,level.mats.floor,level.mats.blendedConcrete,level.mats.centralConcrete])){
      if(!original)continue;
      const material=original.clone();material.name=`Perinton scanned ${original===level.mats.tan?'sandstone tan':'cast gray'} concrete`;
      material.map=map;material.bumpMap=map;material.bumpScale=.055;material.normalMap=null;
      material.roughness=.84;material.metalness=0;material.envMapIntensity=.3;
      const centralHeight=original.userData.perintonCentralHeight;
      material.onBeforeCompile=shader=>{
        if(centralHeight!==undefined){
          shader.uniforms.perintonCentralHeight={value:centralHeight};
          shader.uniforms.perintonGray={value:level.mats.concrete.color.clone()};
          shader.uniforms.perintonTan={value:level.mats.tan.color.clone()};
        }
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
          varying vec3 vParkWorld; varying vec3 vParkNormal;
        `).replace('#include <begin_vertex>',`#include <begin_vertex>
          vParkWorld=(modelMatrix*vec4(position,1.0)).xyz;
          vParkNormal=inverseTransformDirection(normalMatrix*normal,viewMatrix);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          varying vec3 vParkWorld; varying vec3 vParkNormal;
          ${centralHeight!==undefined?'uniform float perintonCentralHeight; uniform vec3 perintonGray; uniform vec3 perintonTan;':''}
        `).replace('#include <map_fragment>',`
          vec3 weights=pow(abs(normalize(vParkNormal)),vec3(4.0));
          weights/=max(dot(weights,vec3(1.0)),.0001);
          vec3 scan=texture2D(map,vParkWorld.zy/2.7).rgb*weights.x
            +texture2D(map,vParkWorld.xz/2.7).rgb*weights.y
            +texture2D(map,vParkWorld.xy/2.7).rgb*weights.z;
          float grain=dot(scan,vec3(.2126,.7152,.0722));
          float stone=clamp(.46+grain*2.3,.38,1.14);
          vec2 slab=abs(fract(vParkWorld.xz/3.6+.5)-.5)*3.6;
          float joint=1.0-smoothstep(.004,.016,min(slab.x,slab.y));
          float slabMask=(1.0-smoothstep(.015,.03,abs(vParkWorld.y)))*smoothstep(.97,.998,vParkNormal.y);
          stone*=1.0-joint*slabMask*.16;
          diffuseColor.rgb*=stone;
        `).replace('#include <normal_fragment_maps>',`
          float scanBump=bumpScale*grain;
          normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(scanBump),dFdy(scanBump)),faceDirection);
        `);
        if(centralHeight!==undefined)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          // Evaluate the pour boundary per fragment: coarse curved-lip cells
          // must not turn a straight deck edge into a row of white triangles.
          float tanBand=smoothstep(.008,.098,vParkWorld.y)*(1.0-smoothstep(perintonCentralHeight-.045,perintonCentralHeight,vParkWorld.y));
          diffuseColor.rgb*=mix(perintonGray,perintonTan,tanBand);
        `);
      };
      material.customProgramCacheKey=()=> `perinton-scanned-concrete-v2-${centralHeight??'standard'}`;
      replacements.set(original,material);
    }
    level.group.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const next=Array.isArray(mesh.material)?mesh.material.map(m=>replacements.get(m)||m):replacements.get(mesh.material);
      if(next){changed.push([mesh,mesh.material]);mesh.material=next;}
    });
    for(const key of Object.keys(level.mats))if(replacements.has(level.mats[key]))level.mats[key]=replacements.get(level.mats[key]);
    state.status='ready';return true;
  }).catch(()=>{state.status='fallback';return false;});
  return state;
}

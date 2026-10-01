import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fixturePoint } from './roc-city-fixtures.js';

// Shared bodywork definitions. Placements are authored park coordinates, but
// local car dimensions remain metres after the level's horizontal scale.
export const ROC_PARKED_CARS=Object.freeze([
  {id:'south-avenue-car-1',x:31.7,z:-38,color:0x6e3430},
  {id:'south-avenue-car-2',x:31.7,z:-8,color:0xaaa99c},
  {id:'south-avenue-car-3',x:31.7,z:12,color:0x3e5865},
]);
export const CAR_BODY=Object.freeze({size:[1.66,.49,4.06],centerY:.59,radius:.10});
export const CAR_CABIN=Object.freeze({profile:[[-1.22,0],[-.65,.53],[.68,.55],[1.18,0]],width:1.40,baseY:.81,bevel:.025});

export function createCarBodyGeometry() {
  return new RoundedBoxGeometry(...CAR_BODY.size,2,CAR_BODY.radius);
}

export function createCarCabinGeometry() {
  const shape=new THREE.Shape(CAR_CABIN.profile.map(p=>new THREE.Vector2(...p)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:CAR_CABIN.width,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:CAR_CABIN.bevel,bevelThickness:CAR_CABIN.bevel});
  geometry.translate(0,0,-CAR_CABIN.width/2);geometry.rotateY(Math.PI/2);
  return geometry;
}

export const ROC_STREET_EDGES=Object.freeze([
  {id:'south-avenue-west-curb',size:[.22,.22,164],position:[17.9,.01,-6],category:'curb'},
  {id:'south-avenue-east-curb',size:[.22,.22,164],position:[21.7,.01,-6],category:'curb'},
  {id:'river-wall-coping',size:[1,.24,220],position:[-41,.14,0],category:'curb',grindRange:[-82,78]},
]);

/** The actual beveled roof silhouette at the cabin's long metal edge. */
export function createCarGrindProfile() {
  const geometry=createCarCabinGeometry(),positions=geometry.attributes.position,vertices=new Map();
  for(let i=0;i<positions.count;i++) {
    if(Math.abs(positions.getX(i)-CAR_CABIN.width/2)>1e-5)continue;
    const z=positions.getZ(i),y=positions.getY(i)+CAR_CABIN.baseY;
    vertices.set(`${z.toFixed(6)},${y.toFixed(6)}`,[z,y]);
  }
  geometry.dispose();
  // Extract the upper hull instead of assuming a particular number/order of
  // extrusion vertices. Additional bevel subdivisions must not move the path
  // onto a lower seam or create a rail through the cabin.
  const contour=[];
  for(const point of [...vertices.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1])) {
    while(contour.length>1) {
      const a=contour.at(-2),b=contour.at(-1);
      if((b[0]-a[0])*(point[1]-b[1])-(b[1]-a[1])*(point[0]-b[0])< -1e-8)break;
      contour.pop();
    }
    contour.push(point);
  }
  const top=CAR_BODY.centerY+CAR_BODY.size[1]/2,half=CAR_BODY.size[2]/2-CAR_BODY.radius;
  const atHeight=(a,b)=>[THREE.MathUtils.lerp(a[0],b[0],(top-a[1])/(b[1]-a[1])),top];
  const clipped=[];
  for(let i=0;i<contour.length;i++) {
    const point=contour[i],previous=contour[i-1];
    if(previous&&(previous[1]<top)!==(point[1]<top))clipped.push(atHeight(previous,point));
    if(point[1]>=top)clipped.push(point);
  }
  return [[-half,top],...clipped,[half,top]];
}

/** Register before the level's world scale. Decoration never drives physics. */
export function registerRocCityGrindables(level) {
  const scale=level.horizontalScale;
  level.environmentRails=[];
  level.environmentColliders=[...level.fixtureColliders];
  level.environment={cars:ROC_PARKED_CARS,streetEdges:ROC_STREET_EDGES};
  const collider=(geometry,position,feature,category,part,localScale=null)=>{
    const mesh=new THREE.Mesh(geometry,level.mats.concrete);
    mesh.position.fromArray(position);if(localScale)mesh.scale.fromArray(localScale);
    mesh.visible=false;mesh.name=`${feature} — ${part} collider`;
    mesh.userData={environment:true,feature,category,part,solidBoundary:true};
    level.add(mesh,true,false);level.environmentColliders.push(mesh);return mesh;
  };
  const rail=(a,b,feature,category,environmentPart,{radius=0,kind=radius?'rail':'ledge'}={})=>{
    const item=level.addRail(new THREE.Vector3(...a),new THREE.Vector3(...b),kind,{visual:false,radius});
    if(!item)return null;
    // Keep scenery assist local: a fence beside a ledge must not steal that
    // ledge's approach before its endpoint enters the ordinary grind window.
    Object.assign(item,{environment:true,requiresIntent:true,captureRadius:.65,feature,category,environmentPart});
    level.environmentRails.push(item);return item;
  };

  const profile=createCarGrindProfile(),parts=['trunk-edge','rear-pillar','roof-edge','front-pillar','hood-edge'];
  for(const car of ROC_PARKED_CARS) {
    const localScale=[1/scale,1,1/scale];
    collider(createCarBodyGeometry(),[car.x,CAR_BODY.centerY,car.z],car.id,'car','body',localScale);
    collider(createCarCabinGeometry(),[car.x,CAR_CABIN.baseY,car.z],car.id,'car','cabin',localScale);
    for(const side of [-1,1]) {
      const x=car.x+side*CAR_CABIN.width/2/scale,chain=[];
      for(let i=1;i<profile.length;i++) {
        const [az,ay]=profile[i-1],[bz,by]=profile[i];
        const item=rail([x,ay,car.z+az/scale],[x,by,car.z+bz/scale],car.id,'car',parts[i-1]);
        item.side=side;chain.push(item);
      }
      level.linkRails(chain);
    }
  }

  for(const fixture of level.fixtures.railings) {
    const top=fixture.rails.filter(segment=>Math.abs(segment.a[1]-fixture.baseY-fixture.height)<1e-6);
    const chain=top.map(segment=>rail(segment.a,segment.b,fixture.id,'fence','top',{radius:segment.radius}));
    level.linkRails(chain);
  }
  for(const bench of level.fixtures.benches) {
    const seat=bench.boxes.find(part=>part.id==='seat-0'),back=bench.boxes.find(part=>part.id==='back-1');
    for(const [part,id,side] of [[seat,'seat-front',-1],[back,'back-top',1]]) {
      const y=part.position[1]+part.size[1]/2,z=part.position[2]+side*part.size[2]/2;
      rail(fixturePoint(bench,[-part.size[0]/2,y,z]),fixturePoint(bench,[part.size[0]/2,y,z]),bench.id,'bench',id);
    }
  }

  // Sidewalk and road support extends beyond each curb end, matching the
  // visible streetscape. No support is added on the river side of the wall.
  collider(new THREE.BoxGeometry(3.8,.16,164),[19.7,-.09,-6],'south-avenue-sidewalk','ground','slab');
  const asphalt=new THREE.PlaneGeometry(11,170);asphalt.rotateX(-Math.PI/2);
  collider(asphalt,[27.3,-.018,-6],'south-avenue-road','ground','asphalt');
  for(const edge of ROC_STREET_EDGES) {
    const [width,height,length]=edge.size,[x,y,z]=edge.position;
    if(edge.id!=='river-wall-coping')collider(new THREE.BoxGeometry(...edge.size),edge.position,edge.id,'curb','body');
    const range=edge.grindRange||[z-length/2,z+length/2];
    // Only the land-facing edge of the river wall is a practical skate route.
    for(const side of edge.id==='river-wall-coping'?[1]:[-1,1])
      rail([x+side*width/2,y+height/2,range[0]],[x+side*width/2,y+height/2,range[1]],edge.id,'curb',side<0?'west-edge':'east-edge');
  }
  for(const [id,a,b,floor] of [
    ['lower',[5,2.45,54],[11,2.45,54],1.4],
    ['upper',[11,3.05,54],[15,3.05,54],2],
  ]) {
    rail(a,b,'south-quarter-guardrail','fence',id,{radius:.035});
    const height=a[1]+.035-floor;
    collider(new THREE.BoxGeometry(b[0]-a[0],height,.07),[(a[0]+b[0])/2,floor+height/2,54],'south-quarter-guardrail','fence',id);
  }
  return level.environment;
}

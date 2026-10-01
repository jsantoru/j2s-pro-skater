// Perinton setting reconstructed from the Town's completed-park photographs:
// Grand Opening 33/35/36 and skatepark-1; close shelter details in SkateBuffalo's
// first-hand visitor photos05/06. The green fabric shade, green picnic
// tables, paired LED heads, western woods/playground and front parking are
// observed. Individual tree, parked-car and background-house placements are
// scenic estimates, not a surveyed site plan. No photographic assets are copied.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasMap, surfaceUV } from './materials.js';
import { riverwaySurface, varySurface } from './roc-city-surfaces.js';
import { addRiverwayVegetation } from './roc-city-vegetation.js';
import { addRocCityLife } from './roc-city-life.js';
import { CAR_BODY, CAR_CABIN, createCarBodyGeometry, createCarCabinGeometry, createCarGrindProfile } from './roc-city-grindables.js';

const UP = new THREE.Vector3(0, 1, 0), cache = new WeakMap();
const V = values => new THREE.Vector3(...values);
const TABLES = [[28.6,-12],[28.6,-2],[28.6,8],[-3.6,23.5],[3.6,23.5]];
const POLES = [[-24,15],[24,15],[24,-19],[-24,-20]];
const CARS = [
  { id:'perinton-car-1', x:-18,z:32.4,color:0x58666c },
  { id:'perinton-car-2', x:-12.4,z:32.4,color:0xaba89e },
  { id:'perinton-car-3', x:15.2,z:32.4,color:0x723e37 },
  { id:'perinton-car-4', x:23.6,z:32.4,color:0x52636e },
  { id:'perinton-car-5', x:-9.6,z:49.6,color:0x818177 },
  { id:'perinton-car-6', x:7.2,z:49.6,color:0xa6a7a2 },
];
const PADS = [
  { id:'front-walk',size:[58,.08,2.1],position:[0,-.04,21.5] },
  { id:'east-walk',size:[2.1,.08,44],position:[25,-.04,.55] },
  { id:'shelter-pad',size:[12,.08,5.6],position:[0,-.04,24.3] },
  { id:'entry-join',size:[14,.08,3.55],position:[0,-.04,19.75] },
  ...TABLES.slice(0,3).map(([x,z],i)=>({id:`table-pad-${i}`,size:[4.2,.08,3.4],position:[x,-.04,z]})),
];

function barGeometry(a,b,r=.035,segments=8) {
  const start=V(a),end=V(b),direction=end.clone().sub(start);
  const geometry=new THREE.CylinderGeometry(r,r,direction.length(),segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(.5).toArray());return geometry;
}
function roofGeometry(width,depth,eave,ridge,x,z) {
  const shape=new THREE.Shape([new THREE.Vector2(-depth/2,eave),new THREE.Vector2(0,ridge),new THREE.Vector2(depth/2,eave),
    new THREE.Vector2(depth/2,eave-.055),new THREE.Vector2(0,ridge-.055),new THREE.Vector2(-depth/2,eave-.055)]);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1});
  geometry.translate(0,0,-width/2);geometry.rotateY(Math.PI/2);geometry.translate(x,0,z);surfaceUV(geometry,2);return geometry;
}
function shelterRoofGeometry() {
  const points=[[-5.4,2.65,21.4],[5.4,2.65,21.4],[5.4,2.65,25.8],[-5.4,2.65,25.8],[-3.1,3.48,23.6],[3.1,3.48,23.6]];
  const top=[0,4,5,0,5,1,1,5,2,2,5,4,2,4,3,3,4,0],positions=points.flat(),indices=[...top];
  positions.push(...points.map(([x,y,z])=>[x,y-.028,z]).flat());
  for(let i=0;i<top.length;i+=3)indices.push(top[i]+6,top[i+2]+6,top[i+1]+6);
  for(let i=0;i<4;i++){const j=(i+1)%4;indices.push(i,j,i+6,j,j+6,i+6);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();surfaceUV(geometry,2);return geometry;
}
function polygon(points,y,holes=[]) {
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const hole of holes)shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);geometry.translate(0,y,0);surfaceUV(geometry,3);return geometry;
}
// Exact planar difference from the UNION of all park/visitor footprints. A
// regular ShapeGeometry cannot subtract overlapping holes (pump/plaza/turf).
// Split at polygon vertices and crossing stations, then triangulate the outside
// vertical intervals. This leaves no competing lawn beneath any concrete.
function lawnGeometry(outlines,y=-.037) {
  const minX=-140,maxX=140,minZ=-130,maxZ=110;
  const edges=[],stations=[minX,maxX];
  outlines.forEach((outline,poly)=>outline.forEach((a,i)=>{
    const b=outline[(i+1)%outline.length];stations.push(a[0]);
    if(Math.abs(b[0]-a[0])>1e-8)edges.push({a,b,poly,z:x=>a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])});
  }));
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const a=edges[i],b=edges[j];if(a.poly===b.poly)continue;
    const dx=a.b[0]-a.a[0],dz=a.b[1]-a.a[1],ex=b.b[0]-b.a[0],ez=b.b[1]-b.a[1],den=dx*ez-dz*ex;
    if(Math.abs(den)<1e-9)continue;
    const ox=b.a[0]-a.a[0],oz=b.a[1]-a.a[1],t=(ox*ez-oz*ex)/den,u=(ox*dz-oz*dx)/den;
    if(t>1e-8&&t<1-1e-8&&u>1e-8&&u<1-1e-8)stations.push(a.a[0]+t*dx);
  }
  const xs=[...new Set(stations.map(x=>Math.round(x*1e7)/1e7))].filter(x=>x>=minX&&x<=maxX).sort((a,b)=>a-b),positions=[];
  const low={z:()=>minZ},high={z:()=>maxZ};
  const strip=(x0,x1,a,b)=>{
    const az0=a.z(x0),az1=a.z(x1),bz0=b.z(x0),bz1=b.z(x1);
    if((bz0-az0)+(bz1-az1)<1e-7)return;
    positions.push(x0,y,az0,x0,y,bz0,x1,y,az1,x1,y,az1,x0,y,bz0,x1,y,bz1);
  };
  for(let i=1;i<xs.length;i++){
    const x0=xs[i-1],x1=xs[i],mid=(x0+x1)/2,byPolygon=new Map(),intervals=[];
    for(const edge of edges)if(mid>Math.min(edge.a[0],edge.b[0])&&mid<Math.max(edge.a[0],edge.b[0])){
      if(!byPolygon.has(edge.poly))byPolygon.set(edge.poly,[]);byPolygon.get(edge.poly).push(edge);
    }
    for(const crossings of byPolygon.values()){
      crossings.sort((a,b)=>a.z(mid)-b.z(mid));
      for(let k=0;k+1<crossings.length;k+=2)intervals.push({a:crossings[k],b:crossings[k+1]});
    }
    intervals.sort((a,b)=>a.a.z(mid)-b.a.z(mid));let boundary=low;
    for(const interval of intervals){
      if(interval.a.z(mid)>boundary.z(mid)+1e-7)strip(x0,x1,boundary,interval.a);
      if(interval.b.z(mid)>boundary.z(mid))boundary=interval.b;
    }
    strip(x0,x1,boundary,high);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();surfaceUV(geometry,2.4);return geometry;
}
function gableEnd(width,rise,x,y,z,side) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([x,y,z-width/2,x,y+rise,z,x,y,z+width/2],3));
  geometry.setIndex(side>0?[0,1,2]:[0,2,1]);geometry.computeVertexNormals();surfaceUV(geometry,3);return geometry;
}
function pointIn(polygon,x,z) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
  }return result;
}
function boundaryDistance(points,x,z) {
  let distance=Infinity;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  }return distance;
}
function tableParts(x,z) {
  const parts=[{id:'top',size:[2.2,.075,.76],position:[x,.755,z]}];
  for(const side of [-1,1])parts.push({id:`seat-${side}`,size:[2.2,.065,.32],position:[x,.445,z+side*.7]});
  for(const dx of [-.72,.72])for(const side of [-1,1])parts.push({id:`leg-${dx}-${side}`,a:[x+dx,.035,z+side*.84],b:[x+dx,.72,z+side*.24],radius:.033});
  for(const dx of [-.72,.72])parts.push({id:`brace-${dx}`,a:[x+dx,.395,z-.84],b:[x+dx,.395,z+.84],radius:.033});
  return parts;
}

/** Called once by the world owner before dressing. Physics never depends on FX. */
export function registerPerintonArtFixtures(level) {
  if(level.artFixtures)return level.artFixtures;
  const fixtures={pads:PADS,tables:TABLES.map(([x,z],i)=>({id:`perinton-table-${i}`,position:[x,0,z],parts:tableParts(x,z)})),poles:POLES,cars:CARS};
  level.artFixtures=fixtures;level.artColliders=[];level.artRails=[];
  const collider=(geometry,id,part)=>{
    const mesh=new THREE.Mesh(geometry,level.mats.rail);mesh.visible=false;
    mesh.name=`${id} / ${part} physical surface`;mesh.userData={environment:true,feature:id,part,solidBoundary:true};
    level.add(mesh,true,false);level.artColliders.push(mesh);return mesh;
  };
  const boxCollider=(size,position,id,part)=>collider(new THREE.BoxGeometry(...size).translate(...position),id,part);
  const rail=(a,b,id,category,part)=>{
    const item=level.addRail(V(a),V(b),'ledge',{feature:id,visual:false,radius:0});
    Object.assign(item,{environment:true,requiresIntent:true,captureRadius:.65,category,environmentPart:part});
    level.artRails.push(item);return item;
  };
  for(const pad of fixtures.pads)boxCollider(pad.size,pad.position,pad.id,'pad');
  for(const x of [-4.9,4.9])for(const z of [22.05,25.15])boxCollider([.16,2.60,.16],[x,1.30,z],'perinton-shelter','post');
  collider(shelterRoofGeometry(),'perinton-shelter','shade-roof');
  for(const table of fixtures.tables){
    for(const part of table.parts)part.size?boxCollider(part.size,part.position,table.id,part.id):collider(barGeometry(part.a,part.b,part.radius),table.id,part.id);
    for(const part of table.parts.filter(part=>part.size))for(const side of [-1,1]){
      const [x,y,z]=part.position,[w,h,d]=part.size;
      rail([x-w/2,y+h/2,z+side*d/2],[x+w/2,y+h/2,z+side*d/2],table.id,'bench',part.id);
    }
  }
  for(const [x,z] of POLES)collider(barGeometry([x,-.035,z],[x,7.6,z],.072),'perinton-light','pole');
  const profile=createCarGrindProfile();
  for(const car of CARS){
    collider(createCarBodyGeometry().translate(car.x,CAR_BODY.centerY-.04,car.z),car.id,'body');
    collider(createCarCabinGeometry().translate(car.x,CAR_CABIN.baseY-.04,car.z),car.id,'cabin');
    for(const side of [-1,1]){
      const chain=[];
      for(let i=1;i<profile.length;i++)chain.push(rail([car.x+side*CAR_CABIN.width/2,profile[i-1][1]-.04,car.z+profile[i-1][0]],
        [car.x+side*CAR_CABIN.width/2,profile[i][1]-.04,car.z+profile[i][0]],car.id,'car',`edge-${i}`));
      level.linkRails(chain);
    }
  }
  return fixtures;
}

export function createPerintonArt(root,level,{lowfx=false}={}) {
  if(cache.has(level))return cache.get(level);
  if(!level.artFixtures)throw new Error('Register Perinton fixtures before creating its scenery.');
  const dressing=new THREE.Group();dressing.name='Perinton / woodland community park';level.group.add(dressing);
  const ownedMaterials=new Set(),batches=new Map(),tiledMaterials=new Set();
  const material=(name,color,roughness=.9,metalness=0,map=null)=>{
    const m=new THREE.MeshStandardMaterial({name,color,roughness,metalness,map});ownedMaterials.add(m);return m;
  };
  const surfaceMap=(base,speckles)=>canvasMap((c,s,r)=>{c.fillStyle=base;c.fillRect(0,0,s,s);for(let i=0;i<12000;i++){c.fillStyle=speckles[i%speckles.length];c.fillRect(r()*s,r()*s,.6+r()*2,.6+r()*2);}},256);
  const grass=varySurface(material('Perinton mown natural lawn',0xffffff,1,0,riverwaySurface('grass')),.13);
  const concrete=material('Perinton pale path concrete',0xc8c8bc,.94,0,riverwaySurface('concrete'));
  const asphalt=material('Perinton parking asphalt',0xffffff,1,0,riverwaySurface('asphalt'));
  const soil=material('Perinton woodland leaf litter',0x746950,1,0,surfaceMap('#766b54',['#32362433','#aa967144','#6e733855']));
  const green=material('Perinton forest-green shelter and picnic enamel',0x23584e,.67,.38);
  const shade=material('Perinton taut green fabric shade',0x275951,.95,0);
  const trim=material('Perinton light galvanized steel',0xa3aaa7,.49,.65);
  const dark=material('Perinton charcoal light poles',0x293135,.63,.57);
  const paint=material('Perinton muted parking lines',0xc8b465,.97);
  const rubber=material('Perinton tires and playground fittings',0x252b29,.92);
  const glass=material('Perinton blue-gray glazing',0x334c56,.25,.38);glass.side=THREE.DoubleSide;
  const cream=material('Perinton neighborhood siding',0xbab6a7,.91);
  const cream2=material('Perinton neighborhood warm siding',0xa49d8c,.94);
  const roof=material('Perinton neighborhood shingles',0x565c56,.94);
  const white=material('Perinton window and gable trim',0xd1d1c5,.83);
  const yellow=material('Perinton playground warm yellow',0xbea04a,.8,.25);
  const headlamp=material('Perinton car lamps',0xc6cec8,.29,.2);
  const tail=material('Perinton car rear lamps',0x883d32,.5,.15);
  [grass,concrete,asphalt,soil,cream,cream2,roof].forEach(m=>tiledMaterials.add(m));
  const add=(geometry,mat,position)=>{
    if(position)geometry.translate(...position);
    if(tiledMaterials.has(mat))surfaceUV(geometry,mat===grass?2.4:3.1);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    const unindexed=geometry.index?geometry.toNonIndexed():geometry;if(unindexed!==geometry)geometry.dispose();
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(unindexed);
  };
  const box=(w,h,d,x,y,z,mat,rotation=0)=>{const g=new THREE.BoxGeometry(w,h,d);if(rotation)g.rotateY(rotation);add(g,mat,[x,y,z]);};
  const bar=(a,b,r,mat,segments=8)=>add(barGeometry(a,b,r,segments),mat);
  const plane=(w,d,x,y,z,mat)=>{const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);add(g,mat,[x,y,z]);};

  const rectangle=(x,z,w,d)=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
  const skatingOutlines=[level.mainOutline||level.layout.mainOutline,level.turfOutline||level.layout.turfOutline,level.pumpOutline,level.bowlDeckOutline].filter(Boolean);
  const lawnHoles=[...skatingOutlines,...PADS.map(p=>rectangle(p.position[0],p.position[2],p.size[0],p.size[2])),rectangle(0,41.5,64,27),rectangle(0,59,145,6)];
  add(lawnGeometry(lawnHoles),grass);
  plane(64,27,0,-.032,41.5,asphalt);
  plane(145,6,0,-.031,59,asphalt);
  for(const pad of level.artFixtures.pads)add(new THREE.BoxGeometry(...pad.size).translate(...pad.position),concrete);
  for(let x=-28;x<=28;x+=2.8)for(const z of [32.5,49.5])box(.08,.003,5.0,x,-.027,z,paint);
  for(const z of [29.95,52.05])box(56,.003,.08,0,-.027,z,paint);
  // A wide, unblocked pedestrian connection is more important than squeezing
  // parking stalls into the shelter entrance.
  for(let z=28.9;z<30;z+=.32)box(4,.003,.13,0,-.026,z,white);
  for(const z of [30,52])for(let x=-26.6;x<28;x+=5.6)box(1.55,.13,.16,x,.025,z,concrete);
  for(const x of [-4.9,4.9])for(const z of [22.05,25.15])box(.16,2.60,.16,x,1.30,z,trim);
  add(shelterRoofGeometry(),shade);
  for(const z of [22.05,25.15])box(9.95,.12,.12,0,2.52,z,trim);
  for(const x of [-4.9,4.9]){
    box(.12,.12,3.25,x,2.52,23.6,trim);
    bar([x,2.50,22.05],[Math.sign(x)*3.1,3.44,23.6],.033,trim);bar([Math.sign(x)*3.1,3.44,23.6],[x,2.50,25.15],.033,trim);
  }
  bar([-3.1,3.44,23.6],[3.1,3.44,23.6],.04,trim);
  for(const table of level.artFixtures.tables)for(const part of table.parts){
    if(part.size)add(new THREE.BoxGeometry(...part.size).translate(...part.position),green);
    else add(barGeometry(part.a,part.b,part.radius),trim);
  }
  for(const [x,z] of POLES){
    bar([x,-.035,z],[x,7.6,z],.072,dark,10);box(.29,.035,.29,x,-.02,z,dark);
    box(1.05,.10,.095,x,7.55,z,dark);
    for(const side of [-1,1]){box(.47,.075,.68,x+side*.40,7.60,z,dark);box(.37,.009,.53,x+side*.40,7.555,z,headlamp);}
  }

  // Cars use the same chassis/cabin factories and parked positions as collision
  // and linked grind edges. Familiar objects keep metre-scale dimensions.
  const body=material('Perinton parked cars muted paint',0xffffff,.35,.36);body.vertexColors=true;
  for(const car of CARS){
    const {x,z}=car;
    const painted=(geometry,y)=>{const color=new THREE.Color(car.color),data=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<data.length;i+=3)color.toArray(data,i);geometry.setAttribute('color',new THREE.BufferAttribute(data,3));add(geometry,body,[x,y-.04,z]);};
    painted(createCarBodyGeometry(),CAR_BODY.centerY);painted(createCarCabinGeometry(),CAR_CABIN.baseY);
    const pane=points=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();add(g,glass);};
    for(const side of [-1,1]){
      const xx=x+side*.745;
      pane([[xx,.82,z-1.12],[xx,1.25,z-.65],[xx,1.25,z+.64],[xx,.82,z+1.13]]);
      box(.026,.42,.046,xx,1.03,z-.09,dark);
      for(const dz of [-1.24,1.23]){const tire=new THREE.CylinderGeometry(.335,.335,.19,14);tire.rotateZ(Math.PI/2);add(tire,rubber,[x+side*.79,.275,z+dz]);const hub=new THREE.CylinderGeometry(.185,.185,.195,10);hub.rotateZ(Math.PI/2);add(hub,trim,[x+side*.80,.275,z+dz]);}
      for(const dz of [-1.94,1.94])box(.41,.16,.065,x+side*.48,.65,z+dz,dz<0?tail:headlamp);
      box(.19,.09,.24,x+side*.84,.95,z+.8,dark);box(.025,.025,.18,xx,.75,z+.61,trim);
    }
    for(const [side,base,top,rise]of[[1,1.22,.65,.53],[-1,1.18,.68,.55]]){
      const run=base-top,length=Math.hypot(run,rise),at=t=>[.77+rise*t+run/length*.04,z+side*(base-run*t+rise/length*.04)];
      const [by,bz]=at(.12),[ty,tz]=at(.87);pane([[x-.61,by,bz],[x+.61,by,bz],[x+.61,ty,tz],[x-.61,ty,tz]]);
    }
    for(const dz of [-2.015,2.015]){box(1.49,.09,.05,x,.41,z+dz,dark);box(.36,.105,.012,x,.52,z+dz,headlamp);}
  }

  // Background playground is beyond the western riding boundary, nestled in
  // woodland as in skatepark-1. It is visual context, not a new obstacle course.
  plane(14,12,-37,-.03,-1,soil);
  for(const [x,z]of[[-37,-4],[-33,2]]){
    for(const dx of[-.7,.7])for(const dz of[-.7,.7])bar([x+dx,-.035,z+dz],[x+dx,3.2,z+dz],.045,yellow);
    box(1.5,.1,1.5,x,1.45,z,green);add(roofGeometry(2,2,3.15,3.8,x,z),green);
    for(const side of[-1,1])for(let j=-.55;j<.65;j+=.28)bar([x+side*.73,1.5,z+j],[x+side*.73,2.15,z+j],.025,yellow,6);
    const slide=new THREE.CatmullRomCurve3([V([x,1.45,z+.8]),V([x,1.2,z+1.6]),V([x,.2,z+2.8]),V([x,.08,z+3.5])]);
    add(new THREE.TubeGeometry(slide,14,.23,8,false),yellow);
  }
  for(const z of [-5.5,4.5]){bar([-44,0,z],[-43,2.8,z],.04,green);bar([-42,0,z],[-43,2.8,z],.04,green);}
  bar([-43,2.8,-5.5],[-43,2.8,4.5],.05,green);
  for(const z of [-3,1.4]){for(const dz of[-.22,.22])bar([-43,2.78,z+dz],[-43,.48,z+dz],.011,trim,5);box(.43,.035,.45,-43,.465,z,rubber);}

  // Low homes and modest utility buildings frame the opposite side. Their
  // placement and facades are deliberately generic beyond the documented park.
  for(const [i,x,z,w,d,h]of[[0,41,-16,8,8,5],[1,43,1,10,9,4.8],[2,43,18,8,10,5.4],[3,12,-43,10,7,4]]){
    const facade=i%2?cream2:cream;
    box(w,h,d,x,h/2-.04,z,facade);add(roofGeometry(w+.5,d+.8,h+.05,h+2,x,z),roof);
    for(const side of[-1,1]){
      add(gableEnd(d,2.04,x+side*w/2,h-.04,z,side),facade);
      bar([x+side*(w/2+.08),h+.04,z-d/2-.2],[x+side*(w/2+.08),h+2.02,z],.06,white,5);
      bar([x+side*(w/2+.08),h+2.02,z],[x+side*(w/2+.08),h+.04,z+d/2+.2],.06,white,5);
      box(.075,.46,.5,x+side*(w/2+.025),h+.65,z,white);box(.085,.35,.38,x+side*(w/2+.03),h+.65,z,dark);
    }
    box(w+.5,.16,.13,x,h,z-d/2-.3,white);box(w+.5,.16,.13,x,h,z+d/2+.3,white);
    for(let y=.5;y<h;y+=.24)for(const side of[-1,1]){box(.014,.012,d,x+side*(w/2+.009),y,z,white);box(w,.012,.014,x,y,z+side*(d/2+.009),white);}
    for(const side of[-1,1])for(const dz of[-d*.29,d*.29])for(const y of[1.65,h-1.05]){
      box(.045,1.15,.9,x+side*(w/2+.026),y,z+dz,white);box(.052,.97,.73,x+side*(w/2+.031),y,z+dz,glass);
      box(.058,.034,.76,x+side*(w/2+.035),y,z+dz,white);box(.058,1,.034,x+side*(w/2+.035),y,z+dz,white);
    }
    for(const side of[-1,1])for(const dx of[-w*.3,0,w*.3])for(const y of[1.65,h-1.05]){
      box(.9,1.15,.045,x+dx,y,z+side*(d/2+.026),white);box(.73,.97,.052,x+dx,y,z+side*(d/2+.031),glass);
      box(.76,.034,.058,x+dx,y,z+side*(d/2+.035),white);box(.034,1,.058,x+dx,y,z+side*(d/2+.035),white);
    }
    // Downspouts and small foundation courses ground the plain facades.
    for(const dx of[-w/2+.12,w/2-.12])for(const side of[-1,1])bar([x+dx,.07,z+side*(d/2+.04)],[x+dx,h-.05,z+side*(d/2+.04)],.032,white,6);
    box(w+.06,.22,d+.06,x,.07,z,concrete);
    box(.05,2.05,1,x-w/2-.032,1,z,green);box(1.4,.13,1.6,x-w/2-.6,.025,z,concrete);
    box(1.3,.08,1.65,x-w/2-.56,2.32,z,roof);
  }
  // Greenery checks the actual geometry outlines and all paved visitor spaces.
  const outlines=skatingOutlines;
  const inRect=(x,z,cx,cz,w,d,clearance)=>Math.abs(x-cx)<w/2+clearance&&Math.abs(z-cz)<d/2+clearance;
  const safeGround=(x,z,clearance=.2)=>{
    if(outlines.some(p=>pointIn(p,x,z)||boundaryDistance(p,x,z)<clearance+.3))return false;
    if(PADS.some(p=>inRect(x,z,p.position[0],p.position[2],p.size[0],p.size[2],clearance)))return false;
    if(inRect(x,z,0,41.5,66,29,clearance)||inRect(x,z,0,59,145,6,clearance)||inRect(x,z,-37,-1,17,15,clearance))return false;
    return true;
  };
  const people=[
    {id:'perinton-entry-skater',kind:'idle',position:[-8.6,-.04,18.5],yaw:.65,phase:.8,height:1.73,shirt:0x65736c,pants:0x495361,shoes:0xd6d1c6,skin:0xb38361,hair:0x373026,style:'cap',board:true},
    {id:'perinton-entry-friend',kind:'idle',position:[-9.7,-.04,18],yaw:-1.8,phase:3,height:1.67,shirt:0x956147,pants:0x3e4946,shoes:0xc3beb1,skin:0xd0a17d,hair:0x3c3028,style:'long'},
    {id:'perinton-east-walker',kind:'walker',route:[25,-18,12,.25],speed:.68,phase:12,height:1.72,shirt:0x637588,pants:0x48483f,shoes:0xd8d3c7,skin:0x8b6249,hair:0x302a27,style:'short'},
    {id:'perinton-picnic-parent',kind:'seated',position:[28.6,.015,-1.3],yaw:Math.PI,phase:2,height:1.7,shirt:0x75805e,pants:0x444d59,shoes:0x9e9d92,skin:0xd2a382,hair:0x554134,style:'short'},
  ];
  const planting={
    mature:[[-29,-22],[-34,-25],[-41,-21],[-46,-12],[-31,-13],[-30,9],[-35,14],[-43,15],[-48,2],[-40,22],[-30,25],[-32,59],[34,58],[38,36],[34,-27],[43,-34]],
    young:[[28,-21],[31,-17],[31,-6],[32,6],[30,17],[-18,-24],[-7,-25],[6,-24],[17,-24]],
    distant:[[-50,-30],[-39,-36],[-26,-39],[-16,-44],[-4,-47],[23,-43],[42,-48],[-47,38],[-43,52],[-22,67],[1,70],[24,68],[46,47],
      ...Array.from({length:lowfx?13:25},(_,i)=>{
        const x=-49+i*(lowfx?6.9:3.6),z=-31.5-Math.sin(i*2.399)*3.1-(i%3)*2.2;return[x,z];
      }),
      ...Array.from({length:lowfx?5:9},(_,i)=>[-51-Math.sin(i*2)*3,-17+i*(lowfx?12:6)]),
      ...Array.from({length:lowfx?6:11},(_,i)=>[-30+i*(lowfx?12:6),67+Math.sin(i*2.399)*3]),
    ],
    tufts:[[-27,-19,1.1,2.7],[-29,-10,1.8,2],[-28,10,1,2.3],[-35,20,2,2],[30,-22,1.2,2],[32,-7,.65,2],[32,7,.7,2],[-10,-26,3,.8],[9,-25,3,.7]],
    pockets:[[-28,-19,1,1.5],[-30,10,1,1.8],[-34,20,1.1,1.2],[32,-8,.6,1.4],[32,7,.6,1.4],[-12,-27,1.3,.8],[10,-26,1.3,.8]],
    clearings:people.filter(p=>p.position).map(p=>[p.position[0],p.position[2]]),safeGround,
  };
  const vegetation=addRiverwayVegetation({group:dressing,add,material,surfaceMap,tiledMaterials,ownedMaterials,lowfx,layout:level.layout,planting});
  const life=addRocCityLife({group:dressing,ownedMaterials,lowfx,horizontalScale:1,layout:level.layout,peopleDefinitions:people});
  life.group.name='Perinton neighbours outside the skating lines';
  for(const [mat,geometries]of batches){
    const merged=mergeGeometries(geometries,false);if(!merged)throw new Error(`Cannot batch ${mat.name}`);
    const mesh=new THREE.Mesh(merged,mat);mesh.name=mat.name;mesh.receiveShadow=true;
    mesh.castShadow=!lowfx&&![grass,asphalt,paint,soil].includes(mat);dressing.add(mesh);geometries.forEach(g=>g.dispose());
  }
  dressing.userData={...dressing.userData,materials:ownedMaterials,fixtures:level.artFixtures,decorativeOnly:true,ambientPeople:life.metadata};

  const lights=new THREE.Group();lights.name='Perinton afternoon daylight';root.add(lights);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new THREE.Color(0x6f9cb7)},horizon:{value:new THREE.Color(0xc8d1c9)}},
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w*.99999;}',
    fragmentShader:`uniform vec3 top;uniform vec3 horizon;varying vec3 direction;void main(){vec3 d=normalize(direction);float h=smoothstep(-.04,.8,d.y);gl_FragColor=vec4(mix(horizon,top,h),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(350,24,12),skyMaterial);sky.name='Perinton open sky';sky.frustumCulled=false;sky.renderOrder=-100;lights.add(sky);
  const sun=new THREE.DirectionalLight(0xffe8c5,3.15);sun.position.set(-32,48,24);sun.target.position.set(0,0,0);sun.castShadow=!lowfx;
  sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-45,right:45,top:48,bottom:-48,near:1,far:130});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=2;
  const fill=new THREE.DirectionalLight(0xc1d5e0,.24);fill.position.set(28,14,-26);
  lights.add(sun,sun.target,new THREE.HemisphereLight(0xbad0df,0x575b41,.95),fill);
  let disposed=false;
  const reducedMotion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const result={dressing,lights,sun,ready:Promise.resolve(true),cameraFar:230,background:new THREE.Color(0xc8d1c9),fog:new THREE.Fog(0xc8d1c9,100,225),environmentIntensity:.36,toneMappingExposure:.96,
    update(time){if(disposed)return;const t=reducedMotion?.matches?0:time;vegetation.update(t);life.update(t);},
    dispose(){
      if(disposed)return;disposed=true;
      const geometries=new Set(),instances=new Set(),textures=new Set();
      for(const group of[dressing,lights])group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.isInstancedMesh)instances.add(node);});
      geometries.forEach(g=>g.dispose());instances.forEach(i=>i.dispose());
      for(const mat of[...ownedMaterials,skyMaterial]){for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);mat.dispose();}
      textures.forEach(texture=>texture.dispose());sun.shadow.map?.dispose();dressing.removeFromParent();lights.removeFromParent();cache.delete(level);
    },
  };
  cache.set(level,result);return result;
}

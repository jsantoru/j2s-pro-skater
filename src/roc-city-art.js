// Outdoor dressing for the published Phase 1 ROC City footprint. These objects
// are visual only; roc-city-level owns every skating surface and collider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasMap, randomSeed, surfaceUV } from './materials.js';
import { paintMark } from './warehouse-identity.js';
import { displayFont, labelFont } from './typography.js';
import { ROC_CITY_LAYOUT } from './roc-city-layout.js';
import { createTrailGeometry, createTrailFoundationGeometry } from './roc-city-surroundings.js';
import { createRocCityFixtures, fixturePoint } from './roc-city-fixtures.js';
import { riverwaySurface, varySurface } from './roc-city-surfaces.js';
import { addRiverwayStreets } from './roc-city-streets.js';
import { addRiverwayVegetation } from './roc-city-vegetation.js';
import { addRocCityBuildings } from './roc-city-buildings.js';

const UP = new THREE.Vector3(0, 1, 0);
const layouts = new WeakMap();

function surfaceMap(base, speckles, scale = 1) {
  return canvasMap((c, s, rng) => {
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 18000; i++) {
      c.fillStyle = speckles[i % speckles.length];
      c.fillRect(rng() * s, rng() * s, (.4 + rng() * 2.3) * scale, (.5 + rng() * 1.5) * scale);
    }
  }, 512);
}

function flatShape(points, y, holes = []) {
  const shape = new THREE.Shape(points.map(([x,z]) => new THREE.Vector2(x,-z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x,z]) => new THREE.Vector2(x,-z))));
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, y, 0);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i=0;i<p.count;i++) uv.setXY(i,p.getX(i)/5,p.getZ(i)/5);
  return geometry;
}

/** Build once, attach to the level, and return the owned decorative group. */
export function dressRocCity(level, { lowfx = false } = {}) {
  if (layouts.has(level)) return layouts.get(level);
  const L = level.layout || ROC_CITY_LAYOUT, group = new THREE.Group();
  const horizontalScale=level.horizontalScale??1;
  const fixtures=level.fixtures || createRocCityFixtures(L);
  group.name = 'ROC City / Riverway landscape and I-490';
  level.group.add(group); layouts.set(level,group);
  const batches = new Map(), ownedMaterials = new Set(), rng = randomSeed(490);
  const material = (name,color,roughness=.9,metalness=0,map=null) => {
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness,map}); m.name=name; ownedMaterials.add(m); return m;
  };
  const grassMap=riverwaySurface('grass');
  const grass=varySurface(material('Riverway grass',0xffffff,1,0,grassMap),.23);
  const concreteMap=riverwaySurface('concrete');
  const concrete=varySurface(material('Weathered bridge concrete',0xffffff,.97,0,concreteMap),.13);
  concrete.bumpMap=concreteMap;concrete.bumpScale=.009;
  const coping=material('Light curb edge',0xc4c0b1,.93,0,concreteMap);
  const asphalt=varySurface(material('Riverway asphalt',0xffffff,1,0,riverwaySurface('asphalt')),.22);
  const road=varySurface(material('South Avenue asphalt',0xffffff,1,0,riverwaySurface('road')),.25);
  asphalt.bumpMap=asphalt.map;asphalt.bumpScale=.012;road.bumpMap=road.map;road.bumpScale=.009;
  const steel=material('Oxidized I-490 steel',0xbca18b,.86,.4,riverwaySurface('steel'));
  const darkSteel=material('Steel flange edges',0x3b302b,.7,.6);
  const black=material('Park light graphite',0x263538,.66,.65);
  const rail=material('Galvanized park railing',0x8c9b9e,.52,.68);
  const blue=material('ROC bridge edge blue',0x2e708b,.72,.25);
  const line=material('Weathered lane paint',0xcfcbbb,.96);
  const yellow=material('South Avenue centreline',0xc8b055,.98);
  const aggregateMap=canvasMap((c,s,r)=>{
    c.fillStyle='#777b78';c.fillRect(0,0,s,s);
    const colors=['#90938f','#858a87','#969993','#818683','#8c908c'];
    // Small, tightly packed angular stones fill the gaps between the 3D rocks.
    // Wrap the drawing so the low-cost texture has no visible tile boundary.
    for(let i=0;i<2600;i++){
      const x=r()*s,z=r()*s,rx=3+r()*9,rz=3+r()*7;
      const points=Array.from({length:6},(_,j)=>{const a=j*Math.PI/3;return [Math.cos(a)*rx*(.7+r()*.3),Math.sin(a)*rz*(.7+r()*.3)];});
      c.fillStyle=colors[i%colors.length];
      for(const dx of [-s,0,s])for(const dz of [-s,0,s]){
        c.beginPath();points.forEach(([px,pz],j)=>j?c.lineTo(x+dx+px,z+dz+pz):c.moveTo(x+dx+px,z+dz+pz));c.closePath();c.fill();
      }
    }
    for(let i=0;i<22000;i++){
      c.fillStyle=i%2?'rgba(220,222,212,.12)':'rgba(32,36,34,.12)';
      c.fillRect(r()*s,r()*s,.6+r()*1.4,.6+r()*1.4);
    }
  },512);
  const aggregate=material('Pale riprap aggregate bed',0xffffff,1,0,aggregateMap);
  const rock=material('Bridge riprap',0xffffff,1,0,aggregateMap);
  rock.bumpMap=aggregateMap;rock.bumpScale=.025;
  const soil=material('Park earth foundation',0x73756c,1);
  const emissive=new THREE.MeshStandardMaterial({color:0xe8efd6,emissive:0xdce6cf,emissiveIntensity:1.8,roughness:.8});
  emissive.name='Overpass strip diffusers'; ownedMaterials.add(emissive);

  const tiledMaterials=new Set([grass,concrete,coping,asphalt,road,steel,aggregate]);
  const add=(geometry,mat,pos) => {
    if (pos) geometry.translate(...pos);
    if(tiledMaterials.has(mat))surfaceUV(geometry,mat===grass?2.4:mat===aggregate?2:3.4);
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    if(!batches.has(mat))batches.set(mat,[]); batches.get(mat).push(g);
  };
  const box=(w,h,d,x,y,z,mat=concrete,ry=0) => {
    const g=new THREE.BoxGeometry(w,h,d);if(ry)g.rotateY(ry);add(g,mat,[x,y,z]);
  };
  const bar=(a,b,r=.035,mat=rail,segments=7) => {
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),D=B.clone().sub(A);
    const g=new THREE.CylinderGeometry(r,r,D.length(),segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,D.normalize()));
    add(g,mat,A.add(B).multiplyScalar(.5).toArray());
  };
  const plane=(w,d,x,y,z,mat) => { const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);add(g,mat,[x,y,z]); };
  const railPath=(points,y,h=1.04) => {
    for(let i=1;i<points.length;i++) {
      const [ax,az]=points[i-1],[bx,bz]=points[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/1.9);
      for(const dy of [.18,.55,h])bar([ax,y+dy,az],[bx,y+dy,bz],.023,rail);
      for(let j=0;j<=n;j++){const t=j/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;bar([x,y,z],[x,y+h+.06,z],.03,rail);box(.11,.035,.11,x,y+.02,z,rail);}
    }
  };

  // The concrete footprint remains a hole in the landscape: grass can never
  // overlay bowl interiors or the lower promenade floor.
  const landscapeOpening=[...L.perimeter.slice(0,5),[15,24],[38,24],[38,56],[-11,56],[-11,24],[5,24],...L.perimeter.slice(7)];
  plane(129,215,23.5,-1.24,-2.5,soil);
  plane(1000,1000,0,-3.7,0,grass);
  add(flatShape([[-41,-110],[88,-110],[88,105],[-41,105]],-.035,[landscapeOpening]),grass);
  const trailCurve=new THREE.CatmullRomCurve3(L.trail.map(([x,z])=>new THREE.Vector3(x,0,z)));
  add(createTrailGeometry(L),asphalt);
  add(createTrailFoundationGeometry(L),soil);
  const trailLength=trailCurve.getLength();
  for(let distance=2;distance<trailLength;distance+=6){const t=distance/trailLength,p=trailCurve.getPointAt(t),direction=trailCurve.getTangentAt(t);box(.07,.012,1.1,p.x,.018,p.z,line,Math.atan2(direction.x,direction.z));}
  // South Avenue frames the east side instead of boxing the park in.
  box(3.8,.16,164,19.7,-.09,-6,coping);
  box(.22,.22,164,17.9,.01,-6,concrete);
  box(.22,.22,164,21.7,.01,-6,concrete);
  plane(11,170,27.3,-.018,-6,road);
  for(let z=-84;z<77;z+=7){box(.1,.012,3,27.1,.0,z,yellow);box(.1,.012,3,27.5,.0,z,yellow);}
  for(const x of [22.8,31.8])box(.1,.012,160,x,.003,-6,line);
  for(let z=-76;z<72;z+=4)box(3.5,.016,.032,19.7,.005,z,concrete);
  const streetDetail=addRiverwayStreets({add,box,bar,material,layout:L,concrete,rail,black,horizontalScale});
  streetDetail.materials.forEach(mat=>ownedMaterials.add(mat));
  // A recessed river and substantial retaining wall give the trail its context.
  const waterMap=canvasMap((c,s,r)=>{
    c.fillStyle='#5f8886';c.fillRect(0,0,s,s);
    for(let i=0;i<700;i++){c.strokeStyle=`rgba(190,214,203,${r()*.2})`;c.lineWidth=.4+r();const x=r()*s,y=r()*s;c.beginPath();c.moveTo(x,y);c.lineTo(x+10+r()*70,y+2);c.stroke();}
  },512);
  if(waterMap)waterMap.repeat.set(3,18);
  const water=material('Genesee River',0x547b79,.32,.12,waterMap);
  plane(30,220,-57,-3.15,0,water);
  box(.8,3.8,220,-41,-1.8,0,concrete);
  box(1,.24,220,-41,.14,0,coping);
  railPath([[-40.8,-82],[-40.8,78]],.26,1.07);

  // A broad concrete deck, rusty transverse I-sections and heavy cap beams,
  // all placed outside the playable ribbon. The deck really casts its shadow.
  const bridge=L.bridge, zc=(bridge.minZ+bridge.maxZ)/2, depth=bridge.maxZ-bridge.minZ;
  box(114,.7,depth+1.5,0,7.84,zc,concrete);
  box(114,.09,depth-.8,0,8.235,zc,road);
  for(const z of [zc-.16,zc+.16])box(113,.012,.105,0,8.288,z,yellow);
  for(const z of [zc-7.4,zc+7.4])for(let x=-55;x<57;x+=8.5)box(4.2,.012,.10,x,8.29,z,line);
  for(const z of [bridge.minZ+.6,bridge.maxZ-.6])box(113,.012,.12,0,8.29,z,line);
  for(let x=-40;x<=40;x+=20)box(.052,.015,depth-.8,x,8.29,zc,darkSteel);
  for(const z of [bridge.minZ-.7,bridge.maxZ+.7]) {
    const sections=z<zc?[[-57,-17],[-3,57]]:[[-57,57]];
    for(const [start,end] of sections){box(end-start,1.12,.65,(start+end)/2,8.68,z,concrete);box(end-start,.18,.78,(start+end)/2,9.27,z,coping);}
    for(let x=-55;x<57;x+=4)if(z>zc||x<-17||x>-3)box(.035,.98,.025,x,8.66,z+(z<zc?-.333:.333),darkSteel);
  }
  for(let z=bridge.minZ+.5;z<bridge.maxZ;z+=2.35) {
    box(113,.87,.12,0,7.05,z,steel);
    for(const y of [6.57,7.53])box(113,.13,.51,0,y,z,darkSteel);
    for(let x=-53;x<57;x+=4.8)box(.065,.83,.55,x,7.05,z,steel);
  }
  // Photo 06 shows the bent caps running along both sides of the promenade;
  // transverse steel girders span between those longitudinal concrete rows.
  const pierBounds=[];
  for(const x of bridge.pierRows) {
    box(1.85,1.05,depth+1,x,5.95,zc,concrete);
    for(const z of bridge.pierStations) {
      box(...bridge.pierSize,x,bridge.pierCenterY,z,concrete);
      pierBounds.push({x:x*horizontalScale,y:bridge.pierCenterY,z:z*horizontalScale,width:bridge.pierSize[0]*horizontalScale,height:bridge.pierSize[1],depth:bridge.pierSize[2]*horizontalScale});
      box(...bridge.pierFootingSize,x,bridge.pierFootingY,z,concrete);
      const shoulder=new THREE.Shape([new THREE.Vector2(-.73,0),new THREE.Vector2(-1.65,1.05),new THREE.Vector2(1.65,1.05),new THREE.Vector2(.73,0)]);
      const g=new THREE.ExtrudeGeometry(shoulder,{depth:1.7,bevelEnabled:false});g.translate(0,0,-.85);g.rotateY(Math.PI/2);add(g,concrete,[x,4.92,z]);
      box(1.47,.045,1.72,x,1.1,z,coping);
    }
  }
  for(const x of [6.8,13.3])for(let z=28;z<54;z+=4.2) {
    box(.34,.10,3.65,x,6.40,z,black);box(.24,.045,3.48,x,6.325,z,emissive);
    bar([x,6.45,z-1.5],[x,7.55,z-1.5],.018,rail);
  }
  // The curving western approach is visible above the trail in the reference.
  // Its piers stay on the far side of the path and outside all playable lines.
  const approach=new THREE.CatmullRomCurve3([[-35,6.1,-83],[-35,6.45,-57],[-34,6.8,-31],[-29,7.25,-7],[-18,7.6,16],[-10,7.75,27],[15,7.84,35]].map(p=>new THREE.Vector3(...p)));
  const approachPoints=approach.getPoints(70);
  for(let i=1;i<approachPoints.length;i++) {
    const a=approachPoints[i-1],b=approachPoints[i],mid=a.clone().add(b).multiplyScalar(.5),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),ry=Math.atan2(dx,dz);
    box(6.7,.56,len+.09,mid.x,mid.y,mid.z,concrete,ry);
    box(5.94,.06,len+.09,mid.x,mid.y+.31,mid.z,road,ry);
    for(const side of [-1,1]){
      if(mid.z>24)continue;
      const x=mid.x+dz/len*3.18*side,z=mid.z-dx/len*3.18*side;
      box(.34,.8,len+.10,x,mid.y+.62,z,concrete,ry);
      box(.4,.10,len+.10,x,mid.y+1.07,z,coping,ry);
    }
    if(i%7<3)box(.085,.016,len+.08,mid.x,mid.y+.35,mid.z,line,ry);
    // Once the approach joins I-490, its existing bent caps carry the span.
    // A separate approach pier here would stand inside the skate promenade.
    if(i%11===2 && mid.z<bridge.minZ){
      const pier=new THREE.CylinderGeometry(.72,.86,mid.y-.28,12);add(pier,concrete,[mid.x,(mid.y-.28)/2-.03,mid.z]);
      box(6.25,.56,1.4,mid.x,mid.y-.57,mid.z,concrete,ry);
    }
  }
  // The paired steel arches over the river continue I-490 westward. The curved
  // silhouette is intentionally background scenery, with no invented skate route.
  const archSteel=material('River bridge blue-gray arch',0x607880,.62,.55);
  box(80,.68,21,-78,7.84,40,concrete);box(80,.08,20.4,-78,8.22,40,road);
  for(const z of [29.6,50.4])box(80,1.0,.45,-78,8.68,z,concrete);
  const archHeight=x=>8.6+21*Math.sin(Math.PI*(x+118)/80);
  for(const z of [30.5,49.5]) {
    for(let i=0;i<44;i++){const x=-118+i*80/44,nx=-118+(i+1)*80/44;bar([x,archHeight(x),z],[nx,archHeight(nx),z],.39,archSteel,8);}
    for(let x=-114;x<-40;x+=5.7)bar([x,8.3,z],[x,archHeight(x),z],.028,rail);
  }
  for(const x of [-106,-94,-82,-70,-58,-46])bar([x,archHeight(x),30.5],[x,archHeight(x),49.5],.13,archSteel,8);
  // Subtle baked shade also holds the underpass together on low-power devices.
  const shade=new THREE.MeshBasicMaterial({color:0x17212a,transparent:true,opacity:lowfx?.3:.12,depthWrite:false});ownedMaterials.add(shade);
  plane(10,depth+1,10,bridge.floorY+.013,zc,shade);
  box(16,.12,depth+2,-3,bridge.floorY-.10,zc,aggregate);
  box(23,.12,depth+2,26.5,bridge.floorY-.10,zc,aggregate);
  const stoneGeometry=new THREE.IcosahedronGeometry(1,lowfx?0:1);
  const stonePosition=stoneGeometry.attributes.position;
  for(let i=0;i<stonePosition.count;i++){
    const x=stonePosition.getX(i),y=stonePosition.getY(i),z=stonePosition.getZ(i);
    const warp=1+.12*Math.sin(x*8.4+y*4.8+z*7.1);
    stonePosition.setXYZ(i,x*warp,y*warp,z*warp);
  }
  stoneGeometry.computeVertexNormals();
  const stones=new THREE.InstancedMesh(stoneGeometry,rock,lowfx?700:1050);
  stones.name='Gray bridge riprap beds';stones.receiveShadow=true;
  const transform=new THREE.Object3D(), tint=new THREE.Color();
  for(let i=0;i<stones.count;i++) {
    const east=i%2===0,nearEdge=i%4<2;
    const x=east?(nearEdge?15.72+rng()*4.2:20.2+rng()*14.7):(nearEdge?4.28-rng()*4.2:-9.7+rng()*9);
    // Riprap is embedded beside the flush promenade, not piled into a wall.
    transform.position.set(x,bridge.floorY-.085+rng()*.045,bridge.minZ+rng()*depth);
    transform.scale.set(.22+rng()*.42,.13+rng()*.16,.25+rng()*.45);transform.rotation.set((rng()-.5)*.3,rng()*6,(rng()-.5)*.3);transform.updateMatrix();stones.setMatrixAt(i,transform.matrix);
    tint.setHSL(.12+rng()*.04,.012+rng()*.018,.84+rng()*.15);stones.setColorAt(i,tint);
  }
  group.add(stones);
  // The west chain-link screen is open, allowing the river and trail to read.
  const fenceMap=canvasMap((c,s)=>{c.clearRect(0,0,s,s);c.strokeStyle='#a5b1b1';c.lineWidth=4;for(let i=-s;i<s*2;i+=64){c.beginPath();c.moveTo(i,0);c.lineTo(i+s,s);c.stroke();c.beginPath();c.moveTo(i,0);c.lineTo(i-s,s);c.stroke();}},256);
  if(fenceMap)fenceMap.repeat.set(13,1.6);
  const fence=new THREE.MeshStandardMaterial({map:fenceMap,color:0x9ba8ac,transparent:true,alphaTest:.28,side:THREE.DoubleSide,roughness:.7,metalness:.4});ownedMaterials.add(fence);
  const fenceGeometry=new THREE.PlaneGeometry(depth,1.8);fenceGeometry.rotateY(Math.PI/2);add(fenceGeometry,fence,[3.9,bridge.floorY+1,zc]);
  railPath([[3.9,bridge.minZ],[3.9,bridge.maxZ]],bridge.floorY,1.95);

  railPath([[6,-42],[11.7,-38],[15.6,-32]],0,1.0);
  railPath([[15.6,-17],[15.6,17]],0,1.0);
  // Grounded on the actual pool-deck boundary; these same records define the
  // physical posts and rails. Shared corner posts avoid doubled metal faces.
  for(const railing of fixtures.railings){
    for(const segment of railing.rails)bar(segment.a,segment.b,segment.radius,rail);
    for(const post of railing.posts){
      const [x,y,z]=post.position;
      bar([x,y+.025,z],[x,y+post.height,z],post.radius,rail);
      box(...post.footSize,x,y+post.footSize[1]/2,z,rail);
    }
  }
  // Thin twin-arm park lights echo the actual Riverway fixtures.
  const lamp=(x,z,y=0,height=5.7,turn=0) => {
    const dx=Math.cos(turn),dz=Math.sin(turn);
    bar([x,y,z],[x,y+height,z],.055,black,9);box(.26,.14,.26,x,y+.07,z,black);
    for(const side of [-1,1]) {
      const a=[x,y+height-.30,z],b=[x+dx*.62*side,y+height+.13,z+dz*.62*side],c=[x+dx*1.3*side,y+height+.20,z+dz*1.3*side];
      bar(a,b,.028,black);bar(b,c,.028,black);
      const head=new THREE.SphereGeometry(1,10,6);head.scale(.4,.09,.17);head.rotateY(-turn);add(head,black,c);
      box(.52,.025,.19,c[0],c[1]-.075,c[2],emissive,-turn);
    }
  };
  for(const [x,z,t] of [[-4.7,-46,.3],[-18.6,-31,1.2],[-24,-10,.6],[-17,11,-.4],[17,15,.5],[17,-32,1.1],[-30,-53,.3]])lamp(x,z,0,5.8,t);
  for(let x=-47;x<50;x+=26)lamp(x,bridge.minZ-.66,9.26,5.4,0);

  // Benches and a simple park sign sit beyond the entrances, never in a line.
  for(const bench of fixtures.benches) {
    for(const part of bench.boxes){
      const [x,y,z]=fixturePoint(bench,part.position);
      box(...part.size,x,y,z,part.material==='slat'?rail:black,bench.rotationY);
    }
  }
  const signMap=canvasMap((c,s)=>{
    c.fillStyle='#274853';c.fillRect(0,0,s,s/2);c.fillStyle='#e6eadb';c.font=displayFont(115);c.fillText('ROC CITY',38,140);c.font=displayFont(76);c.fillText('SKATEPARK',40,227);c.fillStyle='#92b2b4';c.font=labelFont(25);c.fillText('GENESEE RIVERWAY · ROCHESTER',40,290);
    c.fillStyle='#4e808a';c.fillRect(40,323,s-80,3);c.fillStyle='#d5ded4';c.font=labelFont(24);c.fillText('RESPECT THE PARK. SHARE THE LINE.',40,374);
  },1024,true,512);
  const sign=material('ROC City entrance sign',0xffffff,.83,0,signMap);
  const sg=new THREE.PlaneGeometry(2.7,1.35);add(sg,sign,[-4.5,1.45,-44.3]);
  for(const x of [-5.6,-3.4])bar([x,0,-44.34],[x,2.16,-44.34],.055,black);
  const flowerMap=canvasMap((c,s,r)=>{
    c.strokeStyle='#12669a';c.lineWidth=s*.026;c.beginPath();c.arc(s/2,s/2,s*.438,0,Math.PI*2);c.stroke();
    paintMark(c,'rochester',s/2,s/2,s*.765,'#12669a');
    c.globalCompositeOperation='destination-out';for(let i=0;i<2400;i++)c.clearRect(r()*s,r()*s,r()*2.2,.4+r());
  },1024);
  if(flowerMap) {
    const flower=new THREE.MeshStandardMaterial({map:flowerMap,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});flower.name='Blue Rochester flower deck paint';ownedMaterials.add(flower);
    plane(6.8,6.8,L.flower.x,L.flower.y+.018,L.flower.z,flower);
  }

  const artContext={group,add,box,bar,material,surfaceMap,tiledMaterials,ownedMaterials,lowfx,layout:L};
  addRiverwayVegetation(artContext);
  const city=addRocCityBuildings(artContext);
  const building=city.materials.brick;
  const windows=material('Skyline window glass',0x4e676d,.55,.28);
  const towerStone=material('Downtown pale slab',0xb8b7ae,.94);
  const towerGlass=material('Downtown glazing',0x506774,.4,.4);
  const crown=material('Downtown copper roof',0x4d6e67,.8,.3);
  const towerBrick=material('Downtown warm masonry tower',0xa18c77,.98);
  const towerDark=material('Downtown dark monolith',0x3b4b50,.86);
  // Photo 05's skyline reads as three different silhouettes: a pale slab,
  // stepped warm masonry with a copper crown, and a dark flat-topped tower.
  // Their distant placement is scenic context, not a surveyed building model.
  box(10,38,12,-13,19,-94,towerStone);
  box(10.45,.45,12.45,-13,38.22,-94,coping);
  box(7,1.6,8,-13,39,-94,towerStone);
  for(let dx=-4.2;dx<4.3;dx+=1.4)for(let y=2.6;y<36.5;y+=2.2)box(.72,1.25,.08,-13+dx,y,-87.95,towerGlass);
  for(let dz=-5;dz<5.2;dz+=1.4)for(let y=2.6;y<36.5;y+=2.2)box(.08,1.25,.7,-18.05,y,-94+dz,towerGlass);
  for(const y of [2,12.9,23.9,37])box(10.18,.18,12.18,-13,y,-94,coping);

  box(13,21,11,4,10.5,-102,towerBrick);
  box(9.6,6,8.6,4,24,-102,towerBrick);
  box(7,4.5,6.6,4,29.25,-102,towerBrick);
  box(5.8,2.1,5.4,4,32.55,-102,towerStone);
  for(const [w,d,y] of [[13.35,11.35,21],[9.95,8.95,27],[7.35,6.95,31.5],[6.15,5.75,33.6]])box(w,.32,d,4,y,-102,coping);
  for(let dx=-5.4;dx<5.5;dx+=1.5)for(let y=2.4;y<20;y+=2.2)box(.72,1.25,.08,4+dx,y,-96.45,towerGlass);
  for(let dz=-4.5;dz<4.6;dz+=1.5)for(let y=2.4;y<20;y+=2.2)box(.08,1.25,.72,-2.55,y,-102+dz,towerGlass);
  for(const [y,z,w] of [[23,-97.65,8],[25.1,-97.65,8],[28.6,-98.65,5.8],[30.2,-98.65,5.8]])for(let dx=-w/2;dx<w/2;dx+=1.4)box(.7,1,.08,4+dx,y,z,towerGlass);
  const roof=new THREE.ConeGeometry(4.55,5,4);roof.rotateY(Math.PI/4);add(roof,crown,[4,36.1,-102]);
  bar([4,38.5,-102],[4,41.3,-102],.06,rail);

  box(12,32.5,11,37,16.25,-105,towerDark);
  box(12.25,.32,11.25,37,32.66,-105,black);
  for(let dx=-5.4;dx<5.5;dx+=1.15)box(.68,29.5,.075,37+dx,16.6,-99.45,towerGlass);
  for(let dz=-4.8;dz<4.9;dz+=1.15)box(.075,29.5,.68,30.95,16.6,-105+dz,towerGlass);
  for(let y=3;y<32;y+=2.1)box(12.05,.08,11.05,37,y,-105,towerDark);
  box(14,12,12,21,6,-91,building);box(14.3,.3,12.3,21,12.1,-91,coping);
  for(let dx=-5.8;dx<6;dx+=1.8)for(let y=2;y<11;y+=2.2)box(1,1.25,.08,21+dx,y,-84.95,windows);

  for(const [mat,geometries] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(geometries,false),mat);mesh.name=mat.name;
    mesh.receiveShadow=true;mesh.castShadow=![grass,asphalt,road,aggregate,water,line,yellow,shade,fence,emissive,...streetDetail.materials].includes(mat);
    group.add(mesh);geometries.forEach(g=>g.dispose());
  }
  group.userData.materials=ownedMaterials;
  group.userData.pierBounds=pierBounds;
  group.userData.fixtures=fixtures;
  group.userData.water=waterMap;
  group.userData.decorativeOnly=true;
  return group;
}

/** Cached-world lighting: lights belong to root, not the shared scene. */
export function createRocCityArt(root, level, { lowfx = false } = {}) {
  const horizontalScale=level.horizontalScale??1;
  const dressing=dressRocCity(level,{lowfx}), lights=new THREE.Group();lights.name='ROC City outdoor daylight';root.add(lights);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new THREE.Color(0x689bb9)},horizon:{value:new THREE.Color(0xc5ceca)}},
    vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w*.99999;}',
    fragmentShader:`uniform vec3 top; uniform vec3 horizon; varying vec3 direction;
      float cloudHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(direction);float h=smoothstep(-.04,.78,d.y);
        vec2 p=d.xz/max(.16,d.y+.22)*2.1;
        float clouds=cloudNoise(p)*.58+cloudNoise(p*2.1)*.28+cloudNoise(p*4.3)*.14;
        clouds=smoothstep(.49,.76,clouds)*smoothstep(.005,.2,d.y)*.55;
        vec3 sky=mix(mix(horizon,top,h),vec3(.83,.85,.81),clouds);
        float glow=pow(max(0.,dot(d,normalize(vec3(-48.,54.,-35.)))),18.);
        gl_FragColor=vec4(sky+vec3(.13,.095,.035)*glow,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(450,24,12),skyMaterial);sky.name='Open Riverway sky';sky.frustumCulled=false;sky.renderOrder=-100;lights.add(sky);
  const ambient=new THREE.HemisphereLight(0xb9d2e2,0x52563c,.92);
  const sun=new THREE.DirectionalLight(0xffe6bf,3.35);sun.position.set(-48,54,-35).multiplyScalar(horizontalScale);sun.target.position.set(0,0,0);
  sun.castShadow=!lowfx;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-58*horizontalScale,right:58*horizontalScale,top:71*horizontalScale,bottom:-71*horizontalScale,near:1,far:170*horizontalScale});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=2;
  const fill=new THREE.DirectionalLight(0xc4d8e0,.26);fill.position.set(28,10,39);lights.add(ambient,sun,sun.target,fill);
  if(!lowfx)for(const z of [30,40,50]){const lamp=new THREE.PointLight(0xe3eddb,3.5,10*horizontalScale,2);lamp.position.set(10*horizontalScale,4.8,z*horizontalScale);lights.add(lamp);}
  let disposed=false;
  return {
    sun, pierBounds:dressing.userData.pierBounds, cameraFar:260*horizontalScale, background:new THREE.Color(0xc5ceca),fog:new THREE.Fog(0xc5ceca,110*horizontalScale,240*horizontalScale),environmentIntensity:.36,toneMappingExposure:.96,
    update(time) { const water=dressing.userData.water;if(water)water.offset.x=time*.002; },
    dispose() {
      if(disposed)return;disposed=true;lights.removeFromParent();sun.shadow.map?.dispose();sky.geometry.dispose();skyMaterial.dispose();
      const textures=new Set();dressing.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.isInstancedMesh)object.dispose();});
      for(const mat of dressing.userData.materials||[]){for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);mat.dispose();}
      textures.forEach(texture=>texture.dispose());dressing.removeFromParent();layouts.delete(level);
    },
  };
}

/** Standalone scene convenience; the cached game uses createRocCityArt. */
export function lightRocCity(scene, level, options) {
  const art=createRocCityArt(scene,level,options);
  scene.background=art.background;scene.fog=art.fog;scene.environmentIntensity=art.environmentIntensity;
  return art;
}

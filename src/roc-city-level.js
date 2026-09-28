import * as THREE from 'three';
import { makeMaterials, surfaceUV } from './materials.js';
import { ROC_CITY_LAYOUT } from './roc-city-layout.js';

const UP = new THREE.Vector3(0,1,0);
const v = p => new THREE.Vector3(...p);
const smooth = t => t*t*(3-2*t);

// A real open floor, rather than a plane concealed below the bowl rendering.
export function horizontalPolygon(outline, holes, height) {
  const shape = new THREE.Shape(outline.map(p=>new THREE.Vector2(...p)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
  const geometry = new THREE.ShapeGeometry(shape);
  const pos = geometry.attributes.position;
  for (let i=0;i<pos.count;i++) pos.setXYZ(i,pos.getX(i),height,pos.getY(i));
  const indices=geometry.index.array;
  for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  geometry.computeVertexNormals(); surfaceUV(geometry,3);
  return geometry;
}

export function createBowlOutline(segments=144) {
  const controls=[[-5,-28],[-1.5,-26.5],[-.6,-23],[-2.4,-18.5],[-.6,-14],[-1.2,-7],[-1.5,-1.8],[-3.2,.5],[-7.8,.4],[-9.4,-1.6],[-9.5,-8.5],[-12.5,-10],[-15.7,-13.4],[-16,-18.5],[-13.2,-22.6],[-9.3,-23.3],[-7.8,-26.8]];
  const curve=new THREE.CatmullRomCurve3(controls.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');
  return Array.from({length:segments},(_,i)=>{const p=curve.getPoint(i/segments);return [p.x,p.z];});
}

export function createBowlGeometry(outline, rimY=1.62, rings=44) {
  // The three lobes share one manifold surface. A shallow square tail blends
  // into the deep western pocket; the quarter-ellipse rises continuously to coping.
  const center=[-7.3,-13.8], count=outline.length;
  const positions=[center[0],rimY-2.65,center[1]], indices=[];
  for(let ring=1;ring<=rings;ring++) {
    const r=ring/rings;
    for(const [ox,oz] of outline) {
      const x=center[0]+(ox-center[0])*r, z=center[1]+(oz-center[1])*r;
      const shallowTail=smooth(THREE.MathUtils.clamp((z+12)/12,0,1));
      const northPocket=smooth(THREE.MathUtils.clamp((-z-17)/10,0,1));
      const depth=2.65-.98*shallowTail-.38*northPocket;
      const u=THREE.MathUtils.clamp((r-.38)/.62,0,1);
      const rise=1-Math.sqrt(Math.max(0,1-u*u));
      positions.push(x,rimY-depth*(1-rise),z);
    }
  }
  for(let i=0;i<count;i++) indices.push(0,1+(i+1)%count,1+i);
  for(let ring=1;ring<rings;ring++) for(let i=0;i<count;i++) {
    const a=1+(ring-1)*count+i,b=1+(ring-1)*count+(i+1)%count;
    const c=1+ring*count+i,d=1+ring*count+(i+1)%count;
    indices.push(a,b,d,a,d,c);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();surfaceUV(geometry,3);
  geometry.userData={rimY,rings,segments:count,center};
  return geometry;
}

export class RocCityLevel {
  constructor() {
    this.group=new THREE.Group();this.group.name='ROC City Skatepark — Phase 1';
    this.colliders=[];this.rails=[];this.mats=makeMaterials();
    this.mats.floor.color.set(0xe0ded5);this.mats.concrete.color.set(0xe5e3db);
    this.mats.rocYellow=new THREE.MeshStandardMaterial({color:0xefb322,roughness:.5,metalness:.38});
    this.mats.rocBlue=new THREE.MeshStandardMaterial({color:0x167bbe,roughness:.55,metalness:.3});
    this.mats.poolTile=new THREE.MeshStandardMaterial({color:0x3d514e,roughness:.42});
    this.spawn={pos:new THREE.Vector3(2,0,-44),heading:new THREE.Vector3(0,0,1)};
    this.bailFloorY=-3;
    this.layout=ROC_CITY_LAYOUT;this.features=ROC_CITY_LAYOUT.features;this.bounds=ROC_CITY_LAYOUT.bounds;
    this.menuCamera={position:[-38,28,38],target:[-1,0,-3],fov:61};
    this.build();this.group.updateMatrixWorld(true);
  }

  add(mesh,collide=true,shadow=true) {
    mesh.castShadow=shadow;mesh.receiveShadow=true;this.group.add(mesh);
    mesh.updateMatrixWorld(true);if(collide)this.colliders.push(mesh);return mesh;
  }

  box(w,h,d,x,y,z,mat=this.mats.concrete,{collide=true,rotY=0}={}) {
    const mesh=new THREE.Mesh(surfaceUV(new THREE.BoxGeometry(w,h,d),3),mat);
    mesh.position.set(x,y,z);mesh.rotation.y=rotY;return this.add(mesh,collide);
  }

  profile(points,width,x,y,z,rotation=0,mat=this.mats.concrete) {
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:1});
    geometry.translate(0,0,-width/2);surfaceUV(geometry,3);
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.rotation.y=rotation;
    return this.add(mesh);
  }

  beam(a,b,radius=.035,mat=this.mats.rocYellow) {
    const dir=b.clone().sub(a),len=dir.length();if(len<.001)return null;
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,8),mat);
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,dir.normalize());
    return this.add(mesh,false);
  }

  addRail(a,b,kind='rail',{visual=true,color=this.mats.rocYellow,posts=false,floor=0,radius=.035}={}) {
    const dir=b.clone().sub(a),len=dir.length();if(len<.001)return;
    const rail={a:a.clone(),b:b.clone(),dir:dir.normalize(),len,kind};this.rails.push(rail);
    if(visual)this.beam(a,b,radius,color);
    if(posts)for(const t of [.15,.5,.85]){const p=a.clone().lerp(b,t);this.beam(v([p.x,floor,p.z]),p,.024,color);}
    return rail;
  }

  linkRails(rails,closed=false) {
    for(let i=0;i<rails.length-(closed?0:1);i++){
      const rail=rails[i],next=rails[(i+1)%rails.length];
      rail.bLink={rail:next,dir:1};next.aLink={rail,dir:-1};
    }
  }

  bank(length,height,width,x,y,z,rotation=0) {
    return this.profile([[0,0],[length,height],[length,0]],width,x,y,z,rotation);
  }

  skirt(outline,top,bottom,collide=true) {
    const positions=[],indices=[];
    for(let i=0;i<outline.length;i++){
      const [ax,az]=outline[i],[bx,bz]=outline[(i+1)%outline.length],n=positions.length/3;
      positions.push(ax,bottom,az,bx,bottom,bz,bx,top,bz,ax,top,az);
      indices.push(n,n+2,n+1,n,n+3,n+2);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();surfaceUV(geometry,3);
    const mesh=this.add(new THREE.Mesh(geometry,this.mats.concrete),collide);mesh.name='Concrete retaining faces';return mesh;
  }

  quarter(radius,width,x,y,z,rotation=0,{deck=1.8,color=this.mats.rocBlue,feature=''}={}) {
    const points=[[0,0]];
    for(let i=1;i<=36;i++){const a=i/36*Math.PI/2;points.push([radius*Math.sin(a),radius*(1-Math.cos(a))]);}
    points.push([radius+deck,radius],[radius+deck,0]);
    const mesh=this.profile(points,width,x,y,z,rotation);mesh.userData.feature=feature;
    const a=v([radius,radius,-width/2]).applyMatrix4(mesh.matrixWorld),b=v([radius,radius,width/2]).applyMatrix4(mesh.matrixWorld);
    this.addRail(a,b,'coping',{color,radius:.045});return mesh;
  }

  ledge(w,h,d,x,y,z,{rotation=0,color=this.mats.rocBlue}={}) {
    const mesh=this.box(w,h,d,x,y+h/2,z,this.mats.concrete,{rotY:rotation});
    const edges=[];
    for(const side of [-1,1]){
      const a=v([-w/2,h/2,side*d/2]).applyMatrix4(mesh.matrixWorld),b=v([w/2,h/2,side*d/2]).applyMatrix4(mesh.matrixWorld);
      edges.push(this.addRail(a,b,'ledge',{color,radius:.035}));
    }
    mesh.railEdges=edges;
    return mesh;
  }

  stairs(count,rise,tread,width,start,direction,{bankWidth=2.5,feature='',hubbaColor=this.mats.rocYellow}={}) {
    const height=count*rise,run=count*tread;
    const angle=-Math.atan2(direction[1],direction[0]);
    const points=[[0,height]];
    for(let i=0;i<count;i++)points.push([i*tread,height-(i+1)*rise],[(i+1)*tread,height-(i+1)*rise]);
    points.push([0,0]);
    const mesh=this.profile(points,width,start[0],start[1],start[2],angle);
    mesh.userData={feature,steps:count,rise,tread};
    const local=(x,y,z)=>v([x,y,z]).applyMatrix4(mesh.matrixWorld);
    // Yellow risers and gray horizontal treads match the built park photos.
    for(let i=0;i<count;i++){
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,rise*.93),this.mats.rocYellow);
      plane.position.copy(local(i*tread+.003,height-(i+.5)*rise,0));
      plane.quaternion.copy(mesh.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(UP,Math.PI/2));
      this.add(plane,false);
    }
    for(const side of [-1,1]){
      const z=side*(width/2+.23);
      const ledge=this.profile([[0,height],[0,height+.3],[run,.3],[run,0]],.44,start[0],start[1],start[2],angle);
      const shift=v([0,0,z]).applyQuaternion(mesh.quaternion);ledge.position.add(shift);ledge.updateMatrixWorld(true);
      this.addRail(local(-.15,height+.32,z),local(run+.15,.32,z),'ledge',{radius:.04,color:hubbaColor});
      const bank=this.profile([[0,0],[0,height],[run+1.3,0]],bankWidth,start[0],start[1],start[2],angle);
      bank.position.add(v([0,0,side*(width/2+.45+bankWidth/2)]).applyQuaternion(mesh.quaternion));bank.updateMatrixWorld(true);
    }
    this.addRail(local(-.3,height+.82,0),local(run+.4,.82,0),'rail',{radius:.038});
    for(const t of [.15,.85])this.beam(local(run*t,height*(1-t),0),local(run*t,height*(1-t)+.82,0),.028);
    return mesh;
  }

  build() {
    const L=this.layout,M=this.mats;
    const groundOpening=[...L.perimeter.slice(0,5),[15,24],[38,24],[38,56],[-11,56],[-11,24],[5,24],...L.perimeter.slice(8)];
    this.surround=this.add(new THREE.Mesh(horizontalPolygon([[-48,-64],[42,-64],[42,70],[-48,70]],[groundOpening],-.04),M.floor),true,false);
    this.surround.visible=false;this.surround.name='Outdoor ground outside the park perimeter';
    const rocks=this.add(new THREE.Mesh(horizontalPolygon([[-11,24],[38,24],[38,56],[-11,56]],[[[5,24],[15,24],[15,54],[5,54]]],-.9),M.floor),true,false);
    rocks.visible=false;rocks.name='Underbridge gravel beds';
    const roadside=this.add(new THREE.Mesh(horizontalPolygon([[18,24],[33,24],[33,56],[18,56]],[],0),M.floor),true,false);roadside.visible=false;
    this.floor=this.add(new THREE.Mesh(horizontalPolygon(L.mainPerimeter,[L.westDeck],0),M.floor),true,false);
    this.floor.name='Main plaza with open bowl-deck footprint';
    this.bowlOutline=createBowlOutline();
    this.deck=this.add(new THREE.Mesh(horizontalPolygon(L.westDeck,[this.bowlOutline],L.westDeckY),M.concrete),true,false);
    this.deck.name='C — Raised pool deck with bowl opening';
    this.deckSkirt=this.skirt(L.westDeck,L.westDeckY,-.05);
    this.skirt(L.mainPerimeter,0,-.08,false);
    this.bowl=this.add(new THREE.Mesh(createBowlGeometry(this.bowlOutline,L.westDeckY),M.concrete),true,false);
    this.bowl.name='D — Continuous multi-depth pool bowl';this.bowl.userData.feature='D';
    this.buildPoolTrim();

    // The north mini-ramp feeds the deck through a broad, gentle entry bank.
    this.bank(6,1.62,8,-8,0,-38,-Math.PI/2);
    this.bank(5,1.62,3,1.5,0,-37,-Math.PI/2);
    this.quarter(1.3,6,-1,0,-35,Math.PI,{deck:1.1,color:M.rocYellow,feature:'B'});
    this.quarter(1.3,6,4,0,-35,0,{deck:1.1,color:M.rocYellow,feature:'B'});
    // No vertical retaining face blocks the long approach along the bowl's east side.
    this.bank(3,1.62,30,6,0,-13,Math.PI);

    this.box(10,1.26,11,10,.63,-25.5);
    this.bank(5,1.26,10,10,0,-36,-Math.PI/2);
    this.stairs(7,.18,.4,3.7,[10,0,-20],[0,1],{bankWidth:2.3,feature:'E',hubbaColor:M.rocBlue});

    // The curved western ledge follows the outside of the pool deck.
    const curve=new THREE.CatmullRomCurve3([v([-17.6,1.62,-10]),v([-17.5,1.62,-5]),v([-15.4,1.62,.5])]);
    const curvedEdges=[[],[]];
    for(let i=0;i<18;i++){
      const a=curve.getPoint(i/18),b=curve.getPoint((i+1)/18),mid=a.clone().add(b).multiplyScalar(.5),dir=b.clone().sub(a);
      const mesh=this.ledge(dir.length(),.35,.6,mid.x,1.62,mid.z,{rotation:-Math.atan2(dir.z,dir.x)});
      mesh.railEdges.forEach((rail,j)=>curvedEdges[j].push(rail));
    }
    // Meet at averaged corner points so a rider follows each continuous edge.
    for(const chain of curvedEdges){
      for(let i=0;i<chain.length-1;i++){
        const join=chain[i].b.clone().add(chain[i+1].a).multiplyScalar(.5);
        chain[i].b.copy(join);chain[i+1].a.copy(join);
      }
      for(const rail of chain){rail.dir.copy(rail.b).sub(rail.a);rail.len=rail.dir.length();rail.dir.normalize();}
      this.linkRails(chain);
    }
    this.stairs(9,.18,.43,4.2,[-5.4,0,7.294737],[-.20601048,.97854978],{bankWidth:2.4,feature:'G'});

    // A-frame spine, kinked rail, blue ledge and an adjoining quarter-pipe hip.
    const aframe=this.profile([[0,0],[3.2,.8],[4.2,.8],[7.4,0]],4.5,11,0,-3,-Math.PI/2);
    aframe.userData.feature='H';
    const ap=(x,y,z)=>v([x,y,z]).applyMatrix4(aframe.matrixWorld);
    const kink=[];
    for(const [a,b] of [[[0,.72,0],[3.2,1.52,0]],[[3.2,1.52,0],[4.2,1.52,0]],[[4.2,1.52,0],[7.4,.72,0]]])kink.push(this.addRail(ap(...a),ap(...b),'rail'));
    this.linkRails(kink);
    this.ledge(7,.34,.42,8.9,.02,.7,{rotation:Math.PI/2,color:M.rocYellow});
    this.quarter(1.25,3.6,12.5,0,3.8,0,{deck:.7,feature:'H',color:M.rocYellow});

    // Grade change into the narrow promenade under I-490.
    const ramp=this.profile([[0,0],[0,.9],[5,0]],10,10,-.9,19,-Math.PI/2);ramp.userData.feature='I';
    for(const x of [5.25,14.75]){
      this.addRail(v([x,.36,19]),v([x,-.54,24]),'ledge',{color:M.rocBlue,radius:.045});
      const side=this.profile([[0,.9],[0,1.2],[5,.3],[5,0]],.48,x,-.9,19,-Math.PI/2);side.userData.feature='I';
    }
    this.addRail(v([10,.72,18.5]),v([10,-.18,24.5]),'rail',{radius:.038});
    this.floorSouth=this.add(new THREE.Mesh(horizontalPolygon([[5,24],[15,24],[15,54],[5,54]],[],-.9),M.floor),true,false);
    this.floorSouth.name='Promenade under I-490';
    for(const x of [4.94,15.06])this.box(.12,.94,30,x,-.43,39,M.concrete);

    // Long, bright flatbar and blue-edged manual pad shown in the bridge photo.
    this.addRail(v([8,-.15,29]),v([8,-.15,38]),'rail',{posts:true,floor:-.9,radius:.045});
    for(const z of [30,33,36])this.beam(v([8,-.85,z]),v([8,-.15,z+1]),.027);
    this.manualPad=this.ledge(8.5,.48,2.1,13,-.9,35,{rotation:Math.PI/2});this.manualPad.userData.feature='K';
    this.quarter(2.3,6,8,-.9,47.5,-Math.PI/2,{deck:4.2,feature:'L'});
    this.quarter(2.9,4,13,-.9,47.5,-Math.PI/2,{deck:3.6,feature:'L'});
    // Blue guardrail along the back deck is scenery, not an invisible skate wall.
    this.beam(v([5,2.45,54]),v([11,2.45,54]),.035,M.rocBlue);
    this.beam(v([11,3.05,54]),v([15,3.05,54]),.035,M.rocBlue);
    for(let x=5;x<=15;x+=.8){const base=x<11?1.4:2;this.beam(v([x,base,54]),v([x,base+1.05,54]),.023,M.rocBlue);}
  }

  buildPoolTrim() {
    const outline=this.bowlOutline,y=this.layout.westDeckY;
    const coping=[];
    for(let i=0;i<outline.length;i++){
      const next=(i+1)%outline.length,a=outline[i],b=outline[next];
      coping.push(this.addRail(v([a[0],y+.035,a[1]]),v([b[0],y+.035,b[1]]),'coping',{color:this.mats.rocYellow,radius:.045}));
    }
    this.linkRails(coping,true);
    // A narrow dark tile band sits just inside the lip and follows the real surface.
    const geom=this.bowl.geometry,p=geom.attributes.position,n=outline.length,rings=geom.userData.rings;
    const positions=[],indices=[];
    for(let i=0;i<n;i++){
      const top=1+(rings-1)*n+i,lower=1+(rings-2)*n+i;
      const t=Math.min(1,.23/(p.getY(top)-p.getY(lower)));
      positions.push(THREE.MathUtils.lerp(p.getX(top),p.getX(lower),t),p.getY(top)-.23+.004,THREE.MathUtils.lerp(p.getZ(top),p.getZ(lower),t));
      positions.push(p.getX(top),p.getY(top)+.004,p.getZ(top));
      const j=(i+1)%n;indices.push(i*2,j*2,j*2+1,i*2,j*2+1,i*2+1);
    }
    const band=new THREE.BufferGeometry();band.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));band.setIndex(indices);band.computeVertexNormals();surfaceUV(band,1);
    this.add(new THREE.Mesh(band,this.mats.poolTile),false,false);
  }
}

import * as THREE from 'three';
import { makeMaterials, surfaceUV } from './materials.js';
import { ROC_CITY_LAYOUT, ROC_CITY_HORIZONTAL_SCALE } from './roc-city-layout.js';
import { buildRocCityHip } from './roc-city-hip.js';
import { createTrailGeometry, createTrailFoundationGeometry } from './roc-city-surroundings.js';
import { createRocCityFixtures, fixturePoint } from './roc-city-fixtures.js';
import { registerRocCityGrindables } from './roc-city-grindables.js';
import { paintedBorder, paintedHubba, railPost, archedRailSupport, rectangularFlatbar, createPoolTileMap, mapPoolBand } from './roc-city-trim.js';

const UP = new THREE.Vector3(0,1,0);
const v = p => new THREE.Vector3(...p);
const smooth = t => t*t*(3-2*t);

function surfaceGrid(xs,zs,point) {
  const positions=[],indices=[],width=xs.length;
  for(const z of zs)for(const x of xs)positions.push(...point(x,z));
  const triangle=(a,b,c)=>{
    const ax=positions[b*3]-positions[a*3],ay=positions[b*3+1]-positions[a*3+1],az=positions[b*3+2]-positions[a*3+2];
    const bx=positions[c*3]-positions[a*3],by=positions[c*3+1]-positions[a*3+1],bz=positions[c*3+2]-positions[a*3+2];
    if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>1e-8)indices.push(a,b,c);
  };
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<width-1;i++){
    const a=j*width+i,b=a+1,c=a+width,d=c+1;triangle(a,c,b);triangle(b,c,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();surfaceUV(geometry,3);return geometry;
}

function sampleRange(start,end,steps) {return Array.from({length:steps+1},(_,i)=>THREE.MathUtils.lerp(start,end,i/steps));}

function edgeXAt(edge,z) {
  for(let i=0;i<edge.length-1;i++)if(z<=edge[i+1][1])return THREE.MathUtils.lerp(edge[i][0],edge[i+1][0],THREE.MathUtils.clamp((z-edge[i][1])/(edge[i+1][1]-edge[i][1]),0,1));
  return edge.at(-1)[0];
}

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
  // The as-built overhead shows two organic kidney lobes and a distinct,
  // three-sided rectangular shallow tail, rather than a third round lobe.
  const path=new THREE.Path();path.moveTo(-5,-28);
  path.bezierCurveTo(-1.5,-28.2,.4,-25.5,-.7,-22);
  path.bezierCurveTo(-1.1,-20.4,-2.6,-19,-2.2,-17);
  path.bezierCurveTo(-1.8,-15.6,-.8,-14.5,-.8,-12);
  path.lineTo(-.8,-1.4);path.quadraticCurveTo(-.8,.5,-2.6,.5);
  path.lineTo(-7.5,.5);path.quadraticCurveTo(-9.3,.5,-9.3,-1.3);
  path.lineTo(-9.3,-7.3);path.bezierCurveTo(-9.3,-9.2,-10.5,-9.4,-12,-10);
  path.bezierCurveTo(-17.4,-11.4,-18,-19.2,-13.5,-22.6);
  path.bezierCurveTo(-11.5,-24.1,-9.7,-23.9,-8.8,-24.5);
  path.bezierCurveTo(-8.1,-25.1,-8.2,-28.1,-5,-28);path.closePath();
  return path.getSpacedPoints(segments).slice(0,-1).map(p=>[p.x,p.y]);
}

export function createBowlGeometry(outline, rimY=1.62, cellSize=.28) {
  // Clip a regular grid against the actual outline. Unlike a radial fan, this
  // preserves broad flat pockets and a rectangular shallow floor independently
  // of the coping silhouette, without any overlapping horizontal floor plane.
  const positions=[],indices=[],vertices=new Map();
  const minX=Math.min(...outline.map(p=>p[0])),maxX=Math.max(...outline.map(p=>p[0]));
  const minZ=Math.min(...outline.map(p=>p[1])),maxZ=Math.max(...outline.map(p=>p[1]));
  const heightAt=(x,z)=>{
    let distance=Infinity;
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
      distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
    }
    const tail=smooth(THREE.MathUtils.clamp((z+12)/5,0,1));
    const north=smooth(THREE.MathUtils.clamp((-z-20)/8,0,1));
    const depth=2.65-.98*tail-.28*north;
    const wallWidth=2.4-.65*tail;
    const t=THREE.MathUtils.clamp(distance/wallWidth,0,1);
    return rimY-depth*Math.sqrt(Math.max(0,1-(1-t)*(1-t)));
  };
  const vertex=(x,z)=>{
    const key=`${Math.round(x*1e6)},${Math.round(z*1e6)}`;
    if(vertices.has(key))return vertices.get(key);
    const index=positions.length/3;positions.push(x,heightAt(x,z),z);vertices.set(key,index);return index;
  };
  const clip=(polygon,axis,bound,keepGreater)=>{
    const result=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const ia=keepGreater?a[axis]>=bound-1e-9:a[axis]<=bound+1e-9;
      const ib=keepGreater?b[axis]>=bound-1e-9:b[axis]<=bound+1e-9;
      if(ia)result.push(a);
      if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push([THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t)]);}
    }
    return result;
  };
  for(let z=minZ;z<maxZ;z+=cellSize)for(let x=minX;x<maxX;x+=cellSize){
    let polygon=clip(outline,0,x,true);if(polygon.length<3)continue;
    polygon=clip(polygon,0,x+cellSize,false);polygon=clip(polygon,1,z,true);polygon=clip(polygon,1,z+cellSize,false);
    polygon=polygon.filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-7);
    if(polygon.length>2&&Math.hypot(polygon[0][0]-polygon.at(-1)[0],polygon[0][1]-polygon.at(-1)[1])<1e-7)polygon.pop();
    // Clipping at a nearly straight sampled rim can leave a few-micron sliver.
    // Remove that redundant point before triangulation, retaining a closed cell.
    for(let i=polygon.length-1;i>=0&&polygon.length>3;i--){
      const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i],c=polygon[(i+1)%polygon.length];
      const length=Math.hypot(c[0]-a[0],c[1]-a[1]);
      if(length>0&&Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/length<1e-5)polygon.splice(i,1);
    }
    if(polygon.length<3)continue;
    const local=polygon.map(p=>vertex(...p));
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(polygon.map(p=>new THREE.Vector2(...p)),[])){
      const pa=polygon[a],pb=polygon[b],pc=polygon[c];
      if(Math.abs((pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]))<1e-9)continue;
      indices.push(local[a],local[c],local[b]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();surfaceUV(geometry,3);
  geometry.userData={rimY,segments:outline.length,center:[-7.3,-13.8],profile:'connected kidney and shallow rectangular pocket'};
  return geometry;
}

export class RocCityLevel {
  constructor({ horizontalScale = ROC_CITY_HORIZONTAL_SCALE } = {}) {
    if (!Number.isFinite(horizontalScale) || horizontalScale <= 0) throw new RangeError('ROC horizontal scale must be positive.');
    this.group=new THREE.Group();this.group.name='ROC City Skatepark — Phase 1';
    this.colliders=[];this.rails=[];this.mats=makeMaterials();
    this.mats.floor.color.set(0xe0ded5);this.mats.concrete.color.set(0xe5e3db);
    this.mats.rocYellow=new THREE.MeshStandardMaterial({color:0xefb322,roughness:.5,metalness:.38});
    this.mats.rocBlue=new THREE.MeshStandardMaterial({color:0x167bbe,roughness:.55,metalness:.3});
    const poolMap=createPoolTileMap();
    this.mats.poolTile=new THREE.MeshStandardMaterial({color:poolMap?0xffffff:0x416a89,map:poolMap,roughness:.52});
    this.mats.poolPlain=new THREE.MeshStandardMaterial({color:0xa7aaa3,roughness:.85});
    this.mats.poolCoping=new THREE.MeshStandardMaterial({color:0xd9d8ca,roughness:.88});
    this.spawn={pos:new THREE.Vector3(2,1.62,-44),heading:new THREE.Vector3(0,0,1)};
    this.bailFloorY=-3;
    this.horizontalRailCapture=true;
    this.layout=ROC_CITY_LAYOUT;this.designLayout=ROC_CITY_LAYOUT;
    this.fixtures=createRocCityFixtures(this.layout);this.fixtureColliders=[];
    this.horizontalScale=horizontalScale;this.worldScale=Object.freeze({x:horizontalScale,y:1,z:horizontalScale});
    this.features=Object.freeze(Object.fromEntries(Object.entries(ROC_CITY_LAYOUT.features).map(([id,feature])=>[id,Object.freeze({
      ...feature,position:Object.freeze(this.toWorldPoint(feature.position)),
      ...(feature.secondEntry?{secondEntry:Object.freeze(this.toWorldPoint(feature.secondEntry))}:{}),
    })])));
    this.bounds=Object.freeze(Object.fromEntries(Object.entries(ROC_CITY_LAYOUT.bounds).map(([axis,value])=>[axis,value*horizontalScale])));
    this.menuCamera={position:[-38,28,38],target:[-1,0,-3],fov:61};
    // Build at identity: the rail and paint builders intentionally derive their
    // shared coordinates from the original meshes before the world transform.
    this.build();
    registerRocCityGrindables(this);
    this.group.scale.set(horizontalScale,1,horizontalScale);
    for(const rail of this.rails){
      rail.radiusScale=this.worldScale; // Rendering follows the tube's scaled cross-section.
      rail.a.x*=horizontalScale;rail.a.z*=horizontalScale;
      rail.b.x*=horizontalScale;rail.b.z*=horizontalScale;
      rail.dir.copy(rail.b).sub(rail.a);rail.len=rail.dir.length();rail.dir.normalize();
    }
    this.spawn.pos.x*=horizontalScale;this.spawn.pos.z*=horizontalScale;
    this.menuCamera.position=this.toWorldPoint(this.menuCamera.position);
    this.menuCamera.target=this.toWorldPoint(this.menuCamera.target);
    // Support curves, trim measurements and geometry userData stay in authored
    // space for editing; their meshes inherit group.matrixWorld for rendering.
    this.group.updateMatrixWorld(true);
  }

  toWorldPoint(point) {return [point[0]*this.horizontalScale,point[1],point[2]*this.horizontalScale];}
  toWorldXZ(point) {return [point[0]*this.horizontalScale,point[1]*this.horizontalScale];}

  isTransitionLip(position) {
    // Only B's two quarter-to-deck seams need the close-probe exception.
    // Test in authored space so widening the park keeps these bands aligned.
    const mini=this.layout.mini;
    const x=position.x/this.horizontalScale-mini.center[0],z=position.z/this.horizontalScale-mini.center[1];
    const along=x*mini.axis[0]+z*mini.axis[1],across=-x*mini.axis[1]+z*mini.axis[0];
    return Math.abs(Math.abs(along)-mini.flatHalf-mini.height)<.16
      && Math.abs(across)<=mini.width/2+.04 && Math.abs(position.y-mini.height)<.18;
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
    // A hidden ledge is authored at its flat top; drawn tubes use their radius.
    const contactRadius = visual ? radius : kind === 'ledge' ? 0 : radius;
    const rail={a:a.clone(),b:b.clone(),dir:dir.normalize(),len,kind,radius:contactRadius,surface:contactRadius?'round':'flat'};this.rails.push(rail);
    rail.visuals=[];
    if(visual)rail.visuals.push(this.beam(a,b,radius,color));
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

  sealBankPerimeter(surface,id,bottom=-.04) {
    // Keep the riding mesh unchanged. Its directed boundary edges define the
    // matching outward-facing concrete walls, including sloped end profiles.
    const p=surface.geometry.attributes.position,index=surface.geometry.index,edges=new Map();
    const key=i=>`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    const edge=(a,b)=>{
      const ka=key(a),kb=key(b);if(ka===kb)return;
      const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
      const existing=edges.get(k);if(existing)existing.count++;else edges.set(k,{a,b,count:1});
    };
    for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);edge(a,b);edge(b,c);edge(c,a);}
    const positions=[],indices=[];
    for(const {a,b,count} of edges.values()){
      if(count!==1||Math.max(p.getY(a),p.getY(b))<=bottom)continue;
      const n=positions.length/3;
      positions.push(p.getX(a),p.getY(a),p.getZ(a),p.getX(a),bottom,p.getZ(a),p.getX(b),bottom,p.getZ(b),p.getX(b),p.getY(b),p.getZ(b));
      indices.push(n,n+1,n+2,n,n+2,n+3);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();surfaceUV(geometry,3);
    const wall=this.add(new THREE.Mesh(geometry,this.mats.concrete));
    wall.name=`${surface.name} — solid retaining faces`;wall.userData={feature:'C',part:'bank-shell',surface:id,solidBoundary:true};
    (this.bankRetainingFaces??=[]).push(wall);return wall;
  }

  quarter(radius,width,x,y,z,rotation=0,{deck=1.8,color=this.mats.rocBlue,feature=''}={}) {
    const points=[[0,0]];
    for(let i=1;i<=36;i++){const a=i/36*Math.PI/2;points.push([radius*Math.sin(a),radius*(1-Math.cos(a))]);}
    points.push([radius+deck,radius],[radius+deck,0]);
    const mesh=this.profile(points,width,x,y,z,rotation);mesh.userData.feature=feature;
    const a=v([radius,radius,-width/2]).applyMatrix4(mesh.matrixWorld),b=v([radius,radius,width/2]).applyMatrix4(mesh.matrixWorld);
    this.addRail(a,b,'coping',{color,radius:.045});return mesh;
  }

  ledge(w,h,d,x,y,z,{rotation=0,color=this.mats.rocBlue,trim=true}={}) {
    const mesh=this.box(w,h,d,x,y+h/2,z,this.mats.concrete,{rotY:rotation});
    const edges=[];
    for(const side of [-1,1]){
      const a=v([-w/2,h/2,side*d/2]).applyMatrix4(mesh.matrixWorld),b=v([w/2,h/2,side*d/2]).applyMatrix4(mesh.matrixWorld);
      edges.push(this.addRail(a,b,'ledge',{visual:false}));
    }
    mesh.railEdges=edges;mesh.trimColor=color;
    if(trim)this.paintLedge(mesh);
    return mesh;
  }

  paintLedge(mesh,{sides=true,start=true,end=true}={}) {
    const [left,right]=mesh.railEdges,color=mesh.trimColor;
    if(sides){
      paintedBorder(this,left,right.a.clone().sub(left.a),{color});
      paintedBorder(this,right,left.a.clone().sub(right.a),{color});
    }
    for(const [enabled,key,sign] of [[start,'a',1],[end,'b',-1]])if(enabled){
      const a=left[key],b=right[key],edge={a,b,dir:b.clone().sub(a).normalize()};
      paintedBorder(this,edge,left.dir.clone().multiplyScalar(sign),{color,name:'Painted ledge end wrap'});
    }
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
      const ledge=this.profile([[0,feature==='G'?0:height],[0,height+.3],[run,.3],[run,0]],.44,start[0],start[1],start[2],angle);
      if(feature==='G'){ledge.name=`G — Solid ${side<0?'north':'south'} hubba`;ledge.userData={feature,part:'hubba',side,solidBoundary:true};}
      const shift=v([0,0,z]).applyQuaternion(mesh.quaternion);ledge.position.add(shift);ledge.updateMatrixWorld(true);
      const edge=this.addRail(local(-.15,height+.32,z),local(run+.15,.32,z),'ledge',{visual:false});edge.feature=feature;
      paintedHubba(this,edge,{color:hubbaColor,name:`${feature} — Painted hubba cap and end wraps`});
      if(bankWidth>0){
        const bank=this.profile([[0,0],[0,height],[run+1.3,0]],bankWidth,start[0],start[1],start[2],angle);
        bank.position.add(v([0,0,side*(width/2+.45+bankWidth/2)]).applyQuaternion(mesh.quaternion));bank.updateMatrixWorld(true);
      }
    }
    const rail=this.addRail(local(-.3,height+.82,0),local(run+.4,.82,0),'rail',{radius:.038});rail.feature=feature;
    if(feature==='E'){
      archedRailSupport(this,rail,0,1,{name:'E — Arched stair handrail brace'});
      for(const t of [0,.33,.66,1])railPost(this,rail,t,{name:'E — Stair handrail post'});
    }else for(const t of [.15,.85])railPost(this,rail,t,{name:`${feature} — Stair handrail post`});
    return mesh;
  }

  buildMini() {
    const m=this.layout.mini,H=m.height,half=m.width/2;
    const point=(u,w,y)=>[m.center[0]+m.axis[0]*u-m.axis[1]*w,y,m.center[1]+m.axis[1]*u+m.axis[0]*w];
    const us=[...sampleRange(-m.flatHalf-H,-m.flatHalf,24),...sampleRange(-m.flatHalf,m.flatHalf,12).slice(1),...sampleRange(m.flatHalf,m.flatHalf+H,24).slice(1)];
    const ws=[...sampleRange(-half-m.sideBank,-half,16),...sampleRange(-half,half,10).slice(1),...sampleRange(half,half+m.sideBank,16).slice(1)];
    const geometry=surfaceGrid(us,ws,(u,w)=>{
      const t=THREE.MathUtils.clamp((Math.abs(u)-m.flatHalf)/H,0,1);
      const quarter=H*(1-Math.sqrt(Math.max(0,1-t*t)));
      const bank=H*smooth(THREE.MathUtils.clamp((Math.abs(w)-half)/m.sideBank,0,1));
      return point(u,w,quarter+bank-quarter*bank/H);
    });
    this.mini=this.add(new THREE.Mesh(geometry,this.mats.concrete),true,false);
    this.mini.name='B — Embedded diagonal mini-ramp with clear flat bottom';this.mini.userData.feature='B';
    for(const sign of [-1,1]){
      // Seat the coping center on the deck side of the lip. Its 45 mm radius
      // still covers the seam, while endpoint exits land on the flat apron.
      const lip=sign*(m.flatHalf+H+.02);
      const rail=this.addRail(v(point(lip,-half,H+.035)),v(point(lip,half,H+.035)),'coping',{color:this.mats.rocYellow,radius:.045});
      rail.feature='B';
    }
    // The short raised extension sits on the deck, outside the riding lane.
    const apron=[[m.flatHalf+H,.15],[m.flatHalf+H+1,.15],[m.flatHalf+H+1,2.45],[m.flatHalf+H,2.45]];
    // Keep the reference platform's top and outline while seating its base
    // below the adjoining flower-deck slope instead of leaving an air gap.
    const center=point(m.flatHalf+H+.5,1.3,H+.04);
    this.miniExtension=this.box(1,.52,2.3,...center,this.mats.concrete,{rotY:-Math.atan2(m.axis[1],m.axis[0])});
    this.miniExtension.name='B — Raised rectangular deck extension';
    for(let i=0;i<apron.length;i++){
      const rail=this.addRail(v(point(...apron[i],H+.335)),v(point(...apron[(i+1)%apron.length],H+.335)),'ledge',{radius:.045});
      rail.feature='B';
    }
  }

  buildDeckConnector() {
    const L=this.layout,left=z=>edgeXAt(L.connectorEdge,z);
    const northRows=[...sampleRange(-38,-20,72),...L.connectorEdge.map(p=>p[1]).filter(z=>z>-38&&z<-20),-34,-31].sort((a,b)=>a-b).filter((z,i,a)=>!i||z-a[i-1]>.001);
    const xs=sampleRange(0,1,20);
    const north=surfaceGrid(xs,northRows,(t,z)=>{
      const x0=left(z),x1=z<-32?11+(z+38)*4/6:15;
      const x=THREE.MathUtils.lerp(x0,x1,t),shoulder=Math.min(x1,Math.max(5.4,x0+.65));
      const flowerY=1.62-.36*smooth(THREE.MathUtils.clamp((z+34)/3,0,1));
      const blend=THREE.MathUtils.clamp((x-x0)/Math.max(.001,shoulder-x0),0,1);
      return [x,THREE.MathUtils.lerp(1.62,flowerY,blend),z];
    });
    this.flowerDeck=this.add(new THREE.Mesh(north,this.mats.concrete),true,false);
    this.flowerDeck.name='Connected entry, bowl deck and flower plateau';
    const southRows=[...sampleRange(-20,2,88),-15.9].sort((a,b)=>a-b).filter((z,i,a)=>!i||z-a[i-1]>.001);
    const south=surfaceGrid(xs,southRows,(t,z)=>{
      const rightY=1.26*THREE.MathUtils.clamp(1-(z+20)/4.1,0,1);
      return [THREE.MathUtils.lerp(3,5.4,t),THREE.MathUtils.lerp(1.62,rightY,t),z];
    });
    this.deckConnector=this.add(new THREE.Mesh(south,this.mats.concrete),true,false);
    this.deckConnector.name='Continuous bowl-to-street bank beside seven stairs';
    // Carry the existing divider into G's northern hubba; the staircase itself
    // has no independent side banks. Both edges use the same authored stations.
    const G=L.nineStair,upperStart=[3,L.westDeckY,2],lowerStart=[5.4,0,2];
    const end=surfaceGrid(xs,sampleRange(0,1,12),(across,along)=>{
      const high=upperStart.map((value,i)=>THREE.MathUtils.lerp(value,G.upperNorth[i],along));
      const low=lowerStart.map((value,i)=>THREE.MathUtils.lerp(value,G.lowerNorth[i],along));
      return high.map((value,i)=>THREE.MathUtils.lerp(value,low[i],across));
    });
    this.deckConnectorEnd=this.add(new THREE.Mesh(end,this.mats.concrete),true,false);
    this.deckConnectorEnd.name='C — Divider bank ending at nine-stair hubba';
    this.deckConnectorEnd.userData.feature='C';
    this.sealBankPerimeter(this.flowerDeck,'flower-deck');
    this.sealBankPerimeter(this.deckConnector,'central-bank');
    this.sealBankPerimeter(this.deckConnectorEnd,'divider-end');
  }

  buildEntryAccess() {
    const L=this.layout,curve=new THREE.CatmullRomCurve3(L.trail.map(([x,z])=>v([x,0,z])));
    const rows=sampleRange(.012,.065,16),cols=sampleRange(0,1,12);
    const point=(across,t)=>{
      const p=curve.getPoint(t),direction=curve.getTangent(t),side=new THREE.Vector3(direction.z,0,-direction.x).normalize();
      p.addScaledVector(side,L.trailWidth/2);
      const topX=-2-3*(p.z+48)/7;
      return [THREE.MathUtils.lerp(p.x,topX,across),THREE.MathUtils.lerp(L.trailY,L.westDeckY,across),p.z];
    };
    const mesh=this.add(new THREE.Mesh(surfaceGrid(cols,rows,point),this.mats.concrete),true,false);
    mesh.name='A — Trail-to-entry concrete access apron';
    this.entryAccess=mesh;
    for(const t of [rows[0],rows.at(-1)]){
      const a=point(0,t),b=point(1,t),positions=[...a,...b,b[0],-.05,b[2],a[0],-.05,a[2]];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setIndex(t===rows[0]?[0,2,1,0,3,2]:[0,1,2,0,2,3]);geometry.computeVertexNormals();surfaceUV(geometry,3);
      this.add(new THREE.Mesh(geometry,this.mats.concrete));
    }
  }

  buildFixtureColliders() {
    const record=(mesh,fixture,fixtureType,part)=>{
      mesh.visible=false;mesh.castShadow=false;
      mesh.name=`${fixture} — ${part} collider`;mesh.userData={fixture,fixtureType,part,solidBoundary:true,environment:true,feature:fixture,category:fixtureType==='railing'?'fence':'bench'};
      this.fixtureColliders.push(mesh);return mesh;
    };
    for(const railing of this.fixtures.railings??[this.fixtures.westRailing]){
      const radius=Math.max(...railing.rails.map(rail=>rail.radius));
      for(let i=1;i<railing.points.length;i++){
        const [ax,az]=railing.points[i-1],[bx,bz]=railing.points[i];
        const length=Math.hypot(bx-ax,bz-az),height=railing.height+radius;
        // A rider cannot fit between the three bars. Use their narrow occupied
        // span for body clearance, without bridging the intentional entry gaps.
        const mesh=this.box(length,height,.06,(ax+bx)/2,railing.baseY+height/2,(az+bz)/2,this.mats.concrete,{rotY:-Math.atan2(bz-az,bx-ax)});
        record(mesh,railing.id,'railing',`span-${i-1}`);
      }
      for(const post of railing.posts){
        const [x,y,z]=post.position,height=post.height-.025;
        const mesh=this.add(new THREE.Mesh(new THREE.CylinderGeometry(post.radius,post.radius,height,7),this.mats.concrete));
        mesh.position.set(x,y+.025+height/2,z);mesh.updateMatrixWorld(true);
        record(mesh,railing.id,'railing',post.id);
        record(this.box(...post.footSize,x,y+post.footSize[1]/2,z),railing.id,'railing',`${post.id}-foot`);
      }
    }
    for(const bench of this.fixtures.benches)for(const part of bench.boxes){
      const [x,y,z]=fixturePoint(bench,part.position);
      record(this.box(...part.size,x,y,z,this.mats.concrete,{rotY:bench.rotationY}),bench.id,'bench',part.id);
    }
  }

  build() {
    const L=this.layout,M=this.mats;
    const groundOpening=[...L.perimeter.slice(0,5),[15,24],[38,24],[38,56],[-11,56],[-11,24],[5,24],...L.perimeter.slice(7)];
    this.surround=this.add(new THREE.Mesh(horizontalPolygon([[-41,-110],[42,-110],[42,105],[-41,105]],[groundOpening],-.04),M.floor),true,false);
    this.surround.visible=false;this.surround.name='Outdoor ground outside the park perimeter';
    const rocks=this.add(new THREE.Mesh(horizontalPolygon([[-11,24],[38,24],[38,56],[-11,56]],[[[5,24],[15,24],[15,54],[5,54]]],-.9),M.floor),true,false);
    rocks.visible=false;rocks.name='Underbridge gravel beds';
    const roadside=this.add(new THREE.Mesh(horizontalPolygon([[18,24],[33,24],[33,56],[18,56]],[],0),M.floor),true,false);roadside.visible=false;
    this.trail=this.add(new THREE.Mesh(createTrailGeometry(L),M.floor),true,false);
    this.trail.visible=false;this.trail.name='Riverway trail support';
    const trailBase=this.add(new THREE.Mesh(createTrailFoundationGeometry(L),M.concrete),true,false);
    trailBase.visible=false;trailBase.name='Riverway trail foundation';
    // Match the visible retaining wall and railing, with no floating ground on
    // the water side. A rail envelope prevents riding through its open bars.
    for(const [w,h,d,x,y,z,name] of [
      [.8,3.8,220,-41,-1.8,0,'River retaining wall'],
      [1,.24,220,-41,.14,0,'River wall coping'],
    ]){
      const barrier=this.box(w,h,d,x,y,z,M.concrete);barrier.visible=false;barrier.name=name;
    }
    for(const x of L.bridge.pierRows)for(const z of L.bridge.pierStations){
      const column=this.box(...L.bridge.pierSize,x,L.bridge.pierCenterY,z,M.concrete);
      column.visible=false;column.name='I-490 bridge column';
      const footing=this.box(...L.bridge.pierFootingSize,x,L.bridge.pierFootingY,z,M.concrete);
      footing.visible=false;footing.name='I-490 bridge footing';
    }
    this.floor=this.add(new THREE.Mesh(horizontalPolygon(L.mainPerimeter,[L.westDeck],0),M.floor),true,false);
    this.floor.name='Main plaza with open bowl-deck footprint';
    this.bowlOutline=createBowlOutline();
    this.deck=this.add(new THREE.Mesh(horizontalPolygon(L.westDeck,[this.bowlOutline,L.mini.opening],L.westDeckY),M.concrete),true,false);
    this.deck.name='C — Raised pool deck with bowl opening';
    this.deckSkirt=this.skirt(L.westDeck,L.westDeckY,-.05);
    this.skirt(L.mainPerimeter,0,-.08,false);
    this.bowl=this.add(new THREE.Mesh(createBowlGeometry(this.bowlOutline,L.westDeckY),M.concrete),true,false);
    this.bowl.name='D — Continuous multi-depth pool bowl';this.bowl.userData.feature='D';
    this.buildPoolTrim();

    this.buildMini();
    this.buildDeckConnector();
    this.buildEntryAccess();
    this.stairs(7,.18,.4,3.7,[10,0,-20],[0,1],{bankWidth:2.3,feature:'E',hubbaColor:M.rocBlue});

    // The curved western ledge follows the outside of the pool deck.
    const curve=new THREE.CatmullRomCurve3([v([-16.6,1.62,-10]),v([-16.5,1.62,-5]),v([-14.4,1.62,.5])]);
    const curvedEdges=[[],[]],curvedMeshes=[];
    for(let i=0;i<18;i++){
      const a=curve.getPoint(i/18),b=curve.getPoint((i+1)/18),mid=a.clone().add(b).multiplyScalar(.5),dir=b.clone().sub(a);
      const mesh=this.ledge(dir.length(),.35,.6,mid.x,1.62,mid.z,{rotation:-Math.atan2(dir.z,dir.x),trim:false});
      mesh.name='F — Curved pool-deck ledge';mesh.userData.feature='F';mesh.railEdges.forEach(rail=>{rail.feature='F';});
      curvedMeshes.push(mesh);
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
    curvedMeshes.forEach((mesh,i)=>this.paintLedge(mesh,{start:i===0,end:i===curvedMeshes.length-1}));
    const G=L.nineStair;
    this.nineStair=this.stairs(G.count,G.rise,G.tread,G.width,G.start,G.axis,{bankWidth:G.bankWidth,feature:'G'});
    this.nineStair.name='G — Nine stairs from bowl terrace to street plaza';

    this.hip=buildRocCityHip(this);

    // Grade change into the narrow promenade under I-490.
    const ramp=this.profile([[0,0],[0,.9],[5,0]],10,10,-.9,19,-Math.PI/2);ramp.userData.feature='I';
    for(const x of [5.25,14.75]){
      const edge=this.addRail(v([x,.36,19]),v([x,-.54,24]),'ledge',{visual:false});edge.feature='I';
      paintedHubba(this,edge,{width:.48,color:M.rocBlue,name:'I — Blue bank hubba cap'});
      const side=this.profile([[0,.9],[0,1.2],[5,.3],[5,0]],.48,x,-.9,19,-Math.PI/2);side.userData.feature='I';
    }
    const bankRail=this.addRail(v([10,.72,18.5]),v([10,-.18,24.5]),'rail',{radius:.038});bankRail.feature='I';
    for(const t of [.2,.5,.8])railPost(this,bankRail,t,{name:'I — Grounded bank handrail post'});
    this.floorSouth=this.add(new THREE.Mesh(horizontalPolygon([[5,24],[15,24],[15,54],[5,54]],[],-.9),M.floor),true,false);
    this.floorSouth.name='Promenade under I-490';
    // Photo 06's paving meets the riprap near flush, without enclosing walls.
    for(const x of [4.94,15.06]){
      const edge=this.box(.12,.12,30,x,-.96,39,M.concrete);
      edge.name='Promenade flush concrete edge';
    }

    // Long, bright flatbar and blue-edged manual pad shown in the bridge photo.
    const flatRail=this.addRail(v([8,-.15,29]),v([8,-.15,38]),'rail',{visual:false});flatRail.feature='J';
    rectangularFlatbar(this,flatRail);
    for(const t of [0,1/3,2/3,1])railPost(this,flatRail,t,{radius:.032,name:'J — Flatbar post'});
    for(let i=0;i<3;i++)archedRailSupport(this,flatRail,i/3,(i+1)/3,{name:'J — Arched flatbar brace'});
    this.manualPad=this.ledge(8.5,.48,2.1,13,-.9,35,{rotation:Math.PI/2});this.manualPad.userData.feature='K';
    this.quarter(2.3,6,8,-.9,47.5,-Math.PI/2,{deck:4.2,feature:'L'});
    this.quarter(2.9,4,13,-.9,47.5,-Math.PI/2,{deck:3.6,feature:'L'});
    // The shared environment registration supplies collision and deliberate
    // grind targets for these blue back-deck guardrails.
    this.beam(v([5,2.45,54]),v([11,2.45,54]),.035,M.rocBlue);
    this.beam(v([11,3.05,54]),v([15,3.05,54]),.035,M.rocBlue);
    for(let x=5;x<=15;x+=.8){const base=x<11?1.4:2;this.beam(v([x,base,54]),v([x,base+1.05,54]),.023,M.rocBlue);}
    this.buildFixtureColliders();
  }

  buildPoolTrim() {
    const outline=this.bowlOutline,y=this.layout.westDeckY;
    const coping=[];
    for(let i=0;i<outline.length;i++){
      const next=(i+1)%outline.length,a=outline[i],b=outline[next];
      const yellow=(a[1]+b[1])/2<-21.5;
      const rail=this.addRail(v([a[0],y+.035,a[1]]),v([b[0],y+.035,b[1]]),'coping',{color:yellow?this.mats.rocYellow:this.mats.poolCoping,radius:yellow?.045:.075});
      rail.feature='D';coping.push(rail);
    }
    this.linkRails(coping,true);
    // Clip the actual wall triangles so the strip conforms to the collision
    // surface, including irregular rim cells and the straight shallow tail.
    const geometry=this.bowl.geometry,p=geometry.attributes.position,n=geometry.attributes.normal;
    const minimumY=y-.23;
    const positions=[],indices=[],groups=[];
    for(let i=0;i<geometry.index.count;i+=3){
      const triangle=[0,1,2].map(k=>{
        const id=geometry.index.getX(i+k);
        return {p:new THREE.Vector3().fromBufferAttribute(p,id),n:new THREE.Vector3().fromBufferAttribute(n,id)};
      });
      const clipped=[];
      for(let j=0;j<3;j++){
        const a=triangle[j],b=triangle[(j+1)%3],insideA=a.p.y>=minimumY,insideB=b.p.y>=minimumY;
        if(insideA)clipped.push(a);
        if(insideA!==insideB){
          const t=(minimumY-a.p.y)/(b.p.y-a.p.y);
          clipped.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize()});
        }
      }
      if(clipped.length<3)continue;
      const base=positions.length/3;
      for(const sample of clipped)positions.push(...sample.p.clone().addScaledVector(sample.n,.006));
      const indexStart=indices.length,center=clipped.reduce((sum,sample)=>sum.add(sample.p),new THREE.Vector3()).multiplyScalar(1/clipped.length);
      for(let j=1;j<clipped.length-1;j++)indices.push(base,base+j,base+j+1);
      groups.push([indexStart,indices.length-indexStart,center.z>-22.5&&center.z<-8&&center.x<-3?0:1]);
    }
    const band=new THREE.BufferGeometry();band.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));band.setIndex(indices);band.computeVertexNormals();mapPoolBand(band,outline,y);
    // Gather by material rather than issuing one draw call per clipped cell.
    const grouped=[];
    for(const material of [0,1]){
      const start=grouped.length;
      for(const [offset,count,index] of groups)if(index===material)grouped.push(...indices.slice(offset,offset+count));
      band.addGroup(start,grouped.length-start,material);
    }
    band.setIndex(grouped);
    this.poolBand=this.add(new THREE.Mesh(band,[this.mats.poolTile,this.mats.poolPlain]),false,false);this.poolBand.name='D — Continuous pool tile band';
  }
}

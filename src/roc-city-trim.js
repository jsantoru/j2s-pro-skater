import * as THREE from 'three';
import { canvasMap } from './materials.js';

const UP=new THREE.Vector3(0,1,0);

function faces(level,quads,material,name) {
  const positions=[],indices=[];
  for(const {points,normal} of quads){
    const base=positions.length/3;
    positions.push(...points.flatMap(point=>point.toArray()));
    const cross=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    if(cross.dot(normal)>=0)indices.push(base,base+1,base+2,base,base+2,base+3);
    else indices.push(base,base+2,base+1,base,base+3,base+2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=level.add(new THREE.Mesh(geometry,material),false,false);mesh.name=name;
  return mesh;
}

/** A painted L-section follows the exact grind edge, then wraps down its face. */
export function paintedBorder(level,rail,inward,{width=.16,drop=.14,color=level.mats.rocBlue,name='Painted ledge border'}={}) {
  const side=inward.clone().setY(0).normalize(),lift=new THREE.Vector3(0,.004,0);
  const a=rail.a.clone().add(lift).addScaledVector(side,-.003),b=rail.b.clone().add(lift).addScaledVector(side,-.003);
  const c=b.clone().addScaledVector(side,width),d=a.clone().addScaledVector(side,width);
  const mesh=faces(level,[
    {points:[a,b,c,d],normal:UP},
    {points:[a,b,b.clone().addScaledVector(UP,-drop),a.clone().addScaledVector(UP,-drop)],normal:side.clone().negate()},
  ],color,name);
  (rail.visuals??=[]).push(mesh);(level.paintedTrim??=[]).push({rail,mesh,width,drop,kind:'border'});
  return mesh;
}

/** Full hubba cap, including both outer faces and the exposed end corners. */
export function paintedHubba(level,rail,{width=.44,drop=.13,endDrop=.3,color=level.mats.rocBlue,name='Painted hubba cap'}={}) {
  const side=new THREE.Vector3(-rail.dir.z,0,rail.dir.x).normalize(),lift=new THREE.Vector3(0,.004,0);
  const along=rail.dir.clone().setY(0).normalize(),halfWidth=width/2+.003;
  // The vertical paint wraps need the same small outward separation as the
  // horizontal cap. Coplanar side/end faces otherwise flicker over concrete.
  const a=rail.a.clone().add(lift).addScaledVector(along,-.003).addScaledVector(side,-halfWidth);
  const b=rail.b.clone().add(lift).addScaledVector(along,.003).addScaledVector(side,-halfWidth);
  const c=b.clone().addScaledVector(side,halfWidth*2),d=a.clone().addScaledVector(side,halfWidth*2);
  const down=(p,h)=>p.clone().addScaledVector(UP,-h);
  const mesh=faces(level,[
    {points:[a,b,c,d],normal:UP},
    {points:[a,b,down(b,drop),down(a,drop)],normal:side.clone().negate()},
    {points:[d,c,down(c,drop),down(d,drop)],normal:side},
    {points:[a,d,down(d,endDrop),down(a,endDrop)],normal:along.clone().negate()},
    {points:[b,c,down(c,endDrop),down(b,endDrop)],normal:along},
  ],color,name);
  (rail.visuals??=[]).push(mesh);(level.paintedTrim??=[]).push({rail,mesh,width,drop,kind:'hubba'});
  return mesh;
}

export function groundAt(level,point) {
  const ray=new THREE.Raycaster(point.clone().addScaledVector(UP,2),UP.clone().negate(),0,10);
  return ray.intersectObjects(level.colliders,false)[0]?.point;
}

export function railPost(level,rail,t,{radius=.028,name='Grounded yellow rail post'}={}) {
  const top=rail.a.clone().lerp(rail.b,t),bottom=groundAt(level,top);
  if(!bottom)return null;
  const mesh=level.beam(bottom,top,radius,level.mats.rocYellow);mesh.name=name;
  (level.railSupports??=[]).push({rail,mesh,bottom:bottom.clone(),top:top.clone(),kind:'post'});
  return mesh;
}

/** Curved arches beneath the straight E/J bars, as in the built park photos. */
export function archedRailSupport(level,rail,start,end,{radius=.026,name='Yellow arched rail brace'}={}) {
  const a=rail.a.clone().lerp(rail.b,start),b=rail.a.clone().lerp(rail.b,end);
  const floorA=groundAt(level,a),floorB=groundAt(level,b);
  if(!floorA||!floorB)return null;
  const lowA=floorA.clone().addScaledVector(UP,.035),lowB=floorB.clone().addScaledVector(UP,.035);
  const apex=a.clone().lerp(b,.5).addScaledVector(UP,-.055);
  const control=apex.clone().multiplyScalar(2).sub(lowA.clone().add(lowB).multiplyScalar(.5));
  const curve=new THREE.QuadraticBezierCurve3(lowA,control,lowB);
  const mesh=level.add(new THREE.Mesh(new THREE.TubeGeometry(curve,24,radius,8,false),level.mats.rocYellow),false);
  mesh.name=name;(level.railSupports??=[]).push({rail,mesh,curve,bottom:floorA,otherBottom:floorB,kind:'arch'});
  return mesh;
}

export function rectangularFlatbar(level,rail,width=.075,height=.07) {
  const geometry=new THREE.BoxGeometry(width,height,rail.len),mesh=new THREE.Mesh(geometry,level.mats.rocYellow);
  mesh.position.copy(rail.a).lerp(rail.b,.5).addScaledVector(UP,-height/2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),rail.dir);
  level.add(mesh,false);mesh.name='J — Rectangular yellow flatbar';(rail.visuals??=[]).push(mesh);return mesh;
}

/** Small ceramic tiles with a restrained cream/blue diamond motif. */
export function createPoolTileMap() {
  return canvasMap((c,s,rng)=>{
    const tile=16,rows=8;
    c.fillStyle='#969eab';c.fillRect(0,0,s,128);
    for(let row=0;row<rows;row++)for(let col=0;col<s/tile;col++){
      const x=col*tile,y=row*tile,motif=(col%8),diamond=Math.abs(motif-3.5)+Math.abs(row-3.5);
      const pale=diamond>2.2&&diamond<3.2;
      const blue=row===0||row===7?'#243b67':pale?'#c9d1cf':['#37658d','#447493','#2c537d'][Math.floor(rng()*3)];
      c.fillStyle=blue;c.fillRect(x+1,y+1,tile-1,tile-1);
      c.fillStyle='rgba(237,240,224,.12)';c.fillRect(x+2,y+2,tile-3,1);
    }
  },512,true,128);
}

/** Arc-length UVs remain continuous around the clipped, non-radial wall mesh. */
export function mapPoolBand(geometry,outline,rimY) {
  const lengths=[0];
  for(let i=0;i<outline.length;i++)lengths.push(lengths.at(-1)+Math.hypot(outline[(i+1)%outline.length][0]-outline[i][0],outline[(i+1)%outline.length][1]-outline[i][1]));
  const total=lengths.at(-1),p=geometry.attributes.position,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);let nearest=Infinity,along=0;
    for(let j=0;j<outline.length;j++){
      const a=outline[j],b=outline[(j+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
      const distance=(x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
      if(distance<nearest){nearest=distance;along=lengths[j]+t*(lengths[j+1]-lengths[j]);}
    }
    uv[i*2]=along/.96;uv[i*2+1]=THREE.MathUtils.clamp((p.getY(i)-(rimY-.23))/.23,0,1);
  }
  // The band uses independent clipped triangles, so the one arc-length seam
  // can unwrap per triangle without changing any neighboring wall geometry.
  for(let i=0;i<geometry.index.count;i+=3){
    const ids=[0,1,2].map(k=>geometry.index.getX(i+k)),values=ids.map(id=>uv[id*2]);
    if(Math.max(...values)-Math.min(...values)>total/.96/2)for(const id of ids)if(uv[id*2]<total/.96/2)uv[id*2]+=total/.96;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));return geometry;
}

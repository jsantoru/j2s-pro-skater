import * as THREE from 'three';

const TAU = Math.PI * 2;
const UPPER_LEG = .405;
const LOWER_LEG = .405;
const HIP_HEIGHT = .875;
const IDLE_HIP_HEIGHT = .916;
const ANKLE_HEIGHT = .105;

// These are scenic people, not skating characters. Routes deliberately live
// across South Avenue; the two friends stand beyond the north entry apron.
const PEOPLE = [
  { id:'frontage-walker-north', kind:'walker', route:[34.62,-65,-43,.35], speed:.83, phase:3.2, height:1.76, shirt:0x536c68, pants:0x343e48, shoes:0xd1cbc0, skin:0xae7758, hair:0x2f2925, style:'short', backpack:true },
  { id:'frontage-walker-middle', kind:'walker', route:[34.62,-24,3,.35], speed:.76, phase:17, height:1.66, shirt:0xb06a4b, pants:0x48596c, shoes:0xd6d0c5, skin:0xd8aa88, hair:0x4b3529, style:'long' },
  { id:'frontage-walker-south', kind:'walker', route:[34.62,6,16,.35], speed:.90, phase:5, height:1.79, shirt:0xc2b9a2, pants:0x3b4640, shoes:0x373b36, skin:0x745044, hair:0x252421, style:'short' },
  { id:'north-entry-skater', kind:'idle', position:[8.5,-.035,-46.3], yaw:.94, phase:.8, height:1.74, shirt:0x3c4c5c, pants:0x727369, shoes:0xdbd5c8, skin:0xd6a383, hair:0x423024, style:'cap', board:true },
  { id:'north-entry-friend', kind:'idle', position:[9.7,-.035,-45.5], yaw:-2.2, phase:3.6, height:1.68, shirt:0x86514a, pants:0x343c43, shoes:0xb8b7a9, skin:0x936349, hair:0x292728, style:'short', backpack:true },
  { id:'east-fence-skater', kind:'idle', position:[16.12,-.035,-6.6], yaw:-1.35, phase:2.3, height:1.75, shirt:0x897154, pants:0x3d4951, shoes:0xd5d1c1, skin:0xb78565, hair:0x30302a, style:'cap', board:true },
  { id:'east-fence-friend', kind:'idle', position:[16.35,-.035,-5.5], yaw:-1.9, phase:4.6, height:1.67, shirt:0x536760, pants:0x56555b, shoes:0xcac6bb, skin:0x705045, hair:0x282526, style:'long' },
  { id:'cafe-patron', kind:'seated', position:[37.72,.06,-15], yaw:Math.PI/2, phase:1.9, height:1.73, shirt:0x718086, pants:0x464b52, shoes:0xaaa797, skin:0xd0a280, hair:0x565046, style:'short' },
];

// A softly chamfered box with 64 triangles, rather than a densely subdivided
// rounded cube. Small hems, sneakers and bags need a silhouette, not tessellation.
function softBoxGeometry() {
  const section=[[-.35,-.5],[.35,-.5],[.5,-.35],[.5,.35],[.35,.5],[-.35,.5],[-.5,.35],[-.5,-.35]];
  const positions=[],indices=[];
  for(const [y,size] of [[-.5,.75],[-.35,1],[.35,1],[.5,.75]])for(const [x,z] of section)positions.push(x*size,y,z*size);
  for(let row=0;row<3;row++)for(let i=0;i<8;i++) {
    const a=row*8+i,b=row*8+(i+1)%8,c=b+8,d=a+8;indices.push(a,d,b,b,d,c);
  }
  positions.push(0,-.5,0,0,.5,0);
  for(let i=0;i<8;i++)indices.push(32,i,(i+1)%8,33,24+(i+1)%8,24+i);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function ringGeometry(rings, sides=10) {
  const positions=[], indices=[];
  for(const [y,width,depth] of rings) {
    for(let i=0;i<sides;i++) {
      const angle=i/sides*TAU;
      positions.push(Math.cos(angle)*width,y,Math.sin(angle)*depth);
    }
  }
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<sides;i++) {
    const a=row*sides+i,b=row*sides+(i+1)%sides,c=b+sides,d=a+sides;
    indices.push(a,d,b,b,d,c);
  }
  const bottom=positions.length/3;positions.push(0,rings[0][0],0);
  const top=positions.length/3;positions.push(0,rings.at(-1)[0],0);
  for(let i=0;i<sides;i++) {
    const next=(i+1)%sides,last=(rings.length-1)*sides;
    indices.push(bottom,i,next,top,last+next,last+i);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function deckGeometry() {
  const shape=new THREE.Shape();
  shape.moveTo(-.105,-.28);shape.quadraticCurveTo(-.105,-.385,0,-.385);
  shape.quadraticCurveTo(.105,-.385,.105,-.28);shape.lineTo(.105,.28);
  shape.quadraticCurveTo(.105,.385,0,.385);shape.quadraticCurveTo(-.105,.385,-.105,.28);
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:false,curveSegments:4,steps:1});
  geometry.translate(0,0,-.009);
  return geometry;
}

/**
 * Add ambient people in authored coordinates. Their body dimensions are
 * world metres; only route placement inherits the park's horizontal scaling.
 * Every GPU resource belongs to group / ownedMaterials, matching art disposal.
 */
export function addRocCityLife({ group, ownedMaterials, lowfx=false, horizontalScale=1, layout }={}) {
  if(!group || !ownedMaterials)throw new TypeError('Ambient life needs an art group and material owner.');
  const scale=Number.isFinite(horizontalScale)&&horizontalScale>0?horizontalScale:1;
  const life=new THREE.Group();life.name='Riverway people — decorative, outside riding lines';
  life.userData.decorativeOnly=true;group.add(life);
  const fabric=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.89,metalness:0});
  fabric.name='Riverway people — dyed fabric and skin';ownedMaterials.add(fabric);
  const detail=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72,metalness:.03});
  detail.name='Riverway people — shoes, bags and skate details';ownedMaterials.add(detail);

  const sides=lowfx?8:10;
  const geometries={
    torso:ringGeometry([[0,.145,.094],[.045,.169,.110],[.335,.208,.113],[.403,.172,.095],[.446,.075,.073]],sides),
    limb:ringGeometry([[-.5,.33,.33],[.05,.50,.46],[.5,.34,.32]],7),
    arm:ringGeometry([[-.5,.29,.28],[.18,.49,.45],[.5,.43,.42]],7),
    sphere:new THREE.SphereGeometry(1,6,4),
    head:new THREE.SphereGeometry(1,sides,lowfx?6:7),
    hair:new THREE.SphereGeometry(1,sides,4,0,TAU,0,Math.PI*.57),
    softBox:softBoxGeometry(),
    box:new THREE.BoxGeometry(1,1,1),
    deck:deckGeometry(),
  };
  const buckets=Object.fromEntries(Object.entries(geometries).map(([name,geometry])=>[name,{geometry,parts:[],mesh:null}]));
  const parts=[],people=[];
  let currentPersonId=null;
  const bounds=new THREE.Box3();
  const tempPoint=new THREE.Vector3();

  const node=(parent,x=0,y=0,z=0)=>{
    const result=new THREE.Object3D();result.position.set(x,y,z);parent.add(result);return result;
  };
  function part(parent,type,color,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0) {
    const object=node(parent,x,y,z);object.scale.set(sx,sy,sz);object.rotation.set(rx,ry,rz);
    object.updateMatrix();object.matrixAutoUpdate=false;
    const bucket=buckets[type],record={node:object,index:bucket.parts.length,color,personId:currentPersonId};
    bucket.parts.push(record);parts.push(record);
    return object;
  }
  function buildPerson(definition,index) {
    currentPersonId=definition.id;
    const rig=new THREE.Object3D(),size=definition.height/(definition.kind==='idle'?1.771:1.73);
    rig.scale.set(size/scale,size,size/scale);
    const hips=node(rig,0,HIP_HEIGHT,0),torso=node(hips,0,.057,0);
    part(hips,'softBox',definition.pants,0,.015,0,.292,.16,.192);
    part(torso,'torso',definition.shirt,0,0,0);
    // Hem, collar and a small folded sleeve keep the silhouette clothed.
    part(torso,'softBox',definition.shirt,0,.032,0,.343,.045,.228);
    part(torso,'sphere',definition.skin,0,.494,0,.063,.079,.059);
    part(torso,'sphere',definition.shirt,0,.446,0,.088,.035,.081);
    const head=node(torso,0,.642,.002);
    part(head,'head',definition.skin,0,0,0,.106,.137,.099);
    part(head,'sphere',definition.skin,0,-.008,.103,.025,.036,.024);
    for(const side of [-1,1]) {
      part(head,'sphere',definition.skin,side*.103,-.008,-.003,.022,.037,.023);
      part(head,'box',0x30302b,side*.039,.028,.091,.027,.010,.012,0,side*.16,0);
      part(head,'box',definition.hair,side*.039,.049,.089,.029,.007,.012,0,side*.16,-side*.05);
    }
    part(head,'box',0x926957,0,-.060,.086,.034,.006,.013);
    part(head,'hair',definition.style==='cap'?0x8b925d:definition.hair,0,.002,-.003,.111,.143,.103);
    if(definition.style==='cap') {
      part(head,'softBox',0x8b925d,0,.066,.117,.175,.021,.143,-.12);
      part(head,'box',0xd0c9a1,0,.100,.083,.031,.022,.007);
    } else if(definition.style==='long') {
      part(head,'sphere',definition.hair,0,-.078,-.079,.111,.17,.055);
      part(head,'sphere',definition.hair,.087,-.033,.002,.034,.133,.05);
    } else {
      part(head,'softBox',definition.hair,-.035,.097,.060,.13,.041,.078,0,.1,-.14);
    }
    const arms=[],legs=[];
    for(const side of [-1,1]) {
      const shoulder=node(torso,side*.201,.358,0);
      const elbow=node(shoulder,0,-.276,0),wrist=node(elbow,0,-.252,0);
      part(shoulder,'limb',definition.shirt,0,-.075,0,.177,.213,.162,0,0,side*.12);
      part(shoulder,'arm',definition.skin,0,-.224,0,.112,.148,.109);
      part(elbow,'sphere',definition.skin,0,0,0,.039,.041,.037);
      part(elbow,'arm',definition.skin,0,-.119,0,.116,.270,.111);
      part(wrist,'sphere',definition.skin,0,-.045,.009,.043,.07,.034);
      // Dark watch on one wrist reads without a separate texture/material.
      if(side===1)part(elbow,'softBox',0x414742,0,-.224,.002,.098,.024,.097);
      arms.push({shoulder,elbow,wrist,side});

      const thigh=node(hips,side*.092,-.008,0),knee=node(thigh,0,-UPPER_LEG,0),ankle=node(knee,0,-LOWER_LEG,0);
      part(thigh,'limb',definition.pants,0,-UPPER_LEG/2,0,.164,UPPER_LEG+.045,.167);
      part(knee,'limb',definition.pants,0,-LOWER_LEG/2,0,.130,LOWER_LEG+.025,.137);
      part(ankle,'softBox',definition.pants,0,.025,0,.132,.065,.145);
      part(ankle,'softBox',definition.shoes,0,-.042,.040,.122,.090,.267);
      part(ankle,'box',0xe0ddcf,0,-.094,.044,.125,.022,.272);
      part(ankle,'box',0x888b80,0,-.001,.068,.052,.006,.076,.05);
      legs.push({thigh,knee,ankle,side});
    }
    if(definition.backpack) {
      part(torso,'softBox',0x746653,0,.230,-.163,.277,.336,.146,.08);
      part(torso,'softBox',0x5d5e4e,0,.151,-.245,.235,.128,.047,.08);
      part(torso,'box',0x333e3b,0,.229,-.274,.19,.012,.01);
      for(const side of [-1,1])part(torso,'box',0x525b50,side*.111,.243,.105,.031,.354,.014,0,0,-side*.12);
      part(torso,'box',0xc2b398,.074,.097,-.278,.029,.018,.005);
    }
    if(definition.board) {
      const held=node(arms[0].wrist,-.083,.13,-.035);held.rotation.set(.02,.35,-.10);
      part(held,'deck',0xb99762,0,0,0);
      part(held,'deck',0x303631,0,0,-.011,.95,.972,.12);
      for(const end of [-1,1]) {
        part(held,'box',0x929a92,0,end*.235,.044,.17,.031,.038);
        for(const side of [-1,1])part(held,'sphere',0xc7c3a7,side*.096,end*.235,.056,.025,.033,.033);
      }
      part(held,'box',0x7f534a,0,.066,.010,.133,.123,.004);
    }
    const result={definition,index,rig,hips,torso,head,arms,legs,size};
    people.push(result);
    const padding=.65/scale;
    if(definition.route) {
      const [x,minZ,maxZ,radius]=definition.route;
      bounds.expandByPoint(tempPoint.set(x-radius-padding,-.03,minZ-padding));
      bounds.expandByPoint(tempPoint.set(x+radius+padding,definition.height+.07,maxZ+padding));
    } else {
      const [x,y,z]=definition.position;
      bounds.expandByPoint(tempPoint.set(x-padding,y-.02,z-padding));
      bounds.expandByPoint(tempPoint.set(x+padding,y+definition.height+.07,z+padding));
    }
    return result;
  }
  PEOPLE.forEach(buildPerson);
  let triangles=0;
  for(const [name,bucket] of Object.entries(buckets)) {
    if(!bucket.parts.length){bucket.geometry.dispose();continue;}
    const mesh=new THREE.InstancedMesh(bucket.geometry,['softBox','box','deck'].includes(name)?detail:fabric,bucket.parts.length);
    mesh.name=`Riverway people — ${name}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.personIds=bucket.parts.map(record=>record.personId);
    mesh.castShadow=!lowfx;mesh.receiveShadow=true;
    for(const record of bucket.parts)mesh.setColorAt(record.index,new THREE.Color(record.color));
    mesh.boundingBox=bounds.clone();mesh.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
    bucket.mesh=mesh;life.add(mesh);
    triangles+=(bucket.geometry.index?.count??bucket.geometry.attributes.position.count)/3*bucket.parts.length;
  }

  function placeWalker(person,time) {
    const definition=person.definition,[x,minZ,maxZ,r]=definition.route;
    const straight=maxZ-minZ-2*r,arc=Math.PI*r,length=straight*2+arc*2;
    let distance=((time*definition.speed/scale+definition.phase)%length+length)%length;
    let xx,zz,yaw;
    if(distance<straight) {xx=x-r;zz=minZ+r+distance;yaw=0;}
    else if((distance-=straight)<arc) {
      const angle=distance/r;xx=x-r*Math.cos(angle);zz=maxZ-r+r*Math.sin(angle);yaw=angle;
    } else if((distance-=arc)<straight) {xx=x+r;zz=maxZ-r-distance;yaw=Math.PI;}
    else {
      distance-=straight;const angle=distance/r;
      xx=x+r*Math.cos(angle);zz=minZ+r-r*Math.sin(angle);yaw=Math.PI+angle;
    }
    person.rig.position.set(xx,-.018,zz);person.rig.rotation.y=yaw;
  }

  // Two-bone sagittal IK keeps each shoe on the ground through stance. The
  // knee bends naturally forward; the swing foot lifts rather than moonwalks.
  function setLeg(leg,hipHeight,footZ,lift) {
    const down=hipHeight-.008-ANKLE_HEIGHT-lift;
    const reach=Math.min(UPPER_LEG+LOWER_LEG-.001,Math.max(.2,Math.hypot(down,footZ)));
    const aim=Math.atan2(footZ,down);
    const bend=Math.acos(THREE.MathUtils.clamp((UPPER_LEG*UPPER_LEG+reach*reach-LOWER_LEG*LOWER_LEG)/(2*UPPER_LEG*reach),-1,1));
    leg.thigh.rotation.x=-aim-bend;
    leg.knee.rotation.x=Math.PI-Math.acos(THREE.MathUtils.clamp((UPPER_LEG*UPPER_LEG+LOWER_LEG*LOWER_LEG-reach*reach)/(2*UPPER_LEG*LOWER_LEG),-1,1));
    leg.ankle.rotation.x=-leg.thigh.rotation.x-leg.knee.rotation.x;
  }

  const activeBuckets=Object.values(buckets).filter(bucket=>bucket.mesh);
  function update(time=0) {
    const t=Number.isFinite(time)?time:0;
    for(const person of people) {
      const d=person.definition,phase=t*.55+d.phase;
      if(d.kind==='walker') {
        placeWalker(person,t);
        const gait=t*d.speed/1.12*TAU+d.phase;
        person.hips.position.set(.011*Math.sin(gait),HIP_HEIGHT+.008*Math.cos(gait*2),0);
        person.hips.rotation.y=.045*Math.sin(gait);
        person.torso.rotation.set(.035, -.065*Math.sin(gait),.013*Math.cos(gait));
        person.head.rotation.set(-.02,.11*Math.sin(phase*.69),-.012*Math.sin(phase));
        for(const leg of person.legs) {
          const cycle=gait+(leg.side===1?Math.PI:0);
          setLeg(leg,person.hips.position.y,.22*Math.cos(cycle),.070*Math.max(0,-Math.sin(cycle)));
        }
        for(const arm of person.arms) {
          arm.shoulder.rotation.set(-arm.side*.29*Math.cos(gait),0,arm.side*.055);
          arm.elbow.rotation.x=-.18-.07*Math.sin(gait+arm.side);
        }
      } else if(d.kind==='seated') {
        person.rig.position.set(...d.position);person.rig.rotation.y=d.yaw;
        person.hips.position.set(0,.578,0);
        person.torso.rotation.set(.10,0,.008*Math.sin(phase));
        person.head.rotation.set(.05,.10*Math.sin(phase*.7),0);
        for(const leg of person.legs) {
          leg.thigh.rotation.set(-1.42,leg.side*.035,0);leg.knee.rotation.x=1.42;leg.ankle.rotation.x=0;
        }
        for(const arm of person.arms) {
          arm.shoulder.rotation.set(-.27,0,arm.side*.055);arm.elbow.rotation.x=-.73;
        }
      } else {
        person.rig.position.set(...d.position);person.rig.rotation.y=d.yaw;
        const supportSide=person.index%2===0?1:-1;
        const hipShift=supportSide*.021+.002*Math.sin(phase*.65);
        const hipHeight=IDLE_HIP_HEIGHT+.0007*Math.sin(phase*.65);
        person.hips.position.set(hipShift,hipHeight,0);
        person.torso.rotation.set(.004,.026*Math.sin(phase*.77),-supportSide*.018+.006*Math.sin(phase*.65));
        person.head.rotation.set(.012*Math.sin(phase),.10*Math.sin(phase*.62),-.022);
        for(const leg of person.legs) {
          setLeg(leg,hipHeight,leg.side===supportSide?-.075:.020,0);
          // A straight supporting leg and a softer free knee, with the pelvis
          // over one foot. Counter-roll keeps the shoes flat on the grass.
          leg.thigh.rotation.z=Math.atan2(leg.side*.021-hipShift,hipHeight-ANKLE_HEIGHT);
          leg.ankle.rotation.z=-leg.thigh.rotation.z;
        }
        for(const arm of person.arms) {
          arm.shoulder.rotation.set(d.board?-.035:-.060,0,arm.side*(d.board ? .070 : .095));
          arm.elbow.rotation.x=d.board&&arm.side===-1?-.24:!d.board&&arm.side===1?-.43-.025*Math.sin(phase):-.16-.025*Math.sin(phase+arm.side);
        }
      }
      person.rig.updateMatrixWorld(true);
    }
    for(const bucket of activeBuckets) {
      for(const record of bucket.parts)bucket.mesh.setMatrixAt(record.index,record.node.matrixWorld);
      bucket.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  update(0);

  const metadata={
    coordinateSpace:'authored; bodies compensate horizontalScale',
    decorativeOnly:true,people:PEOPLE.map(person=>({id:person.id,kind:person.kind,height:person.height,position:person.position?[...person.position]:null,route:person.route?[...person.route]:null})),
    bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
    drawCalls:life.children.length,triangles,horizontalScale:scale,
  };
  life.userData.ambientPeople=metadata;
  return {update,metadata,group:life};
}

export const createRocCityLife=addRocCityLife;

import * as THREE from 'three';
import { mirrorSwitchPose } from './stance-pose.js';

const DOWN=new THREE.Vector3(0,-1,0);
// Physical point on the sculpted palm, rather than the wrist-group origin.
export const GRAB_PALM_CONTACT=Object.freeze([0,-.052,.013]);
const BASE_POSE={torsoX:14,torsoY:0,torsoZ:0,headX:-8,headY:-48,lArmX:0,lArmZ:68,lElbow:24,rArmX:0,rArmZ:-68,rElbow:24,
  lHip:65,lKnee:115,lLegZ:0,rHip:65,rKnee:115,rLegZ:0,hipsX:0,hipsZ:0,hipsYaw:0,hipsSide:0,hipsY:.65,hipsFwd:0};

// Regular profiles use the anatomical left hand/foot as travel-front. Switch
// variants swap limb roles and reflect root Z, retaining the same toe/heel edge.
// Root -X is toe edge. Grip coordinates lie on the actual
// concave deck rim (skater-art.js), including the raised nose/tail tips.
// Sources: TWS Trujillo Indy / Vallely Melon / Starting Point Stalefish;
// Skateboard Deutschland Judge Manual 2020 pp24–26 (incl. Judo front-foot kick);
// Neil Blender's Method photographed by Grant Brittain, Slam City interview;
// Tony Hawk's 1985 Airwalk photographed by Doug Pensinger (Getty 89148591).
export const GRAB_DEFINITIONS=Object.freeze({
  Indy:{hand:'right',site:'toe-edge',grip:[-.11,.126,-.015],inward:[1,0,0],pole:[-.65,-.10,1],
    board:[-.15,.35,0],rotation:[.09,0,-.08],pose:{torsoX:60,torsoZ:0,hipsY:.62,hipsFwd:-.20,lArmZ:76,rArmZ:-15}},
  Melon:{hand:'left',site:'heel-edge',grip:[.11,.126,.035],inward:[-1,0,0],pole:[.8,0,-1],
    board:[-.15,.35,.035],rotation:[.19,-.08,.19],pose:{torsoX:60,torsoZ:0,hipsY:.62,hipsFwd:-.20,rArmZ:-84,headX:-5}},
  Nosegrab:{hand:'left',site:'nose',grip:[0,.171,.44],inward:[0,0,-1],pole:[1,-.10,.3],
    board:[-.25,.30,-.035],rotation:[-.40,.025,-.035],pose:{torsoX:45,torsoY:0,hipsZ:0,hipsY:.68,rArmX:-16,rArmZ:-73,headY:-62}},
  Tailgrab:{hand:'right',site:'tail',grip:[0,.171,-.44],inward:[0,0,1],pole:[-1,-.05,.35],
    board:[-.15,.30,.035],rotation:[.42,-.035,.04],pose:{torsoX:45,torsoY:0,hipsZ:0,hipsY:.68,hipsFwd:-.20,lArmX:-14,lArmZ:78,headY:-32}},
  Method:{hand:'left',site:'heel-edge',grip:[.11,.126,.025],inward:[-1,0,0],pole:[.8,.1,-1],
    board:[.15,.35,-.015],rotation:[.06,-.16,.91],pose:{torsoX:-55,torsoY:0,torsoZ:0,hipsY:.62,hipsFwd:.20,rArmX:-26,rArmZ:-88,headX:20}},
  Stalefish:{hand:'right',site:'heel-edge',grip:[.11,.126,-.15],inward:[-1,0,0],pole:[-1,.02,-.75],
    board:[-.15,.35,-.025],rotation:[-.07,.12,-.20],pose:{torsoX:60,torsoY:0,torsoZ:-30,hipsY:.62,hipsFwd:-.20,lArmX:-18,lArmZ:86,headY:-35}},
  Judo:{hand:'left',site:'nose',grip:[0,.171,.44],inward:[0,0,-1],pole:[1,-.1,.3],
    board:[-.15,.30,-.045],rotation:[-.30,.05,-.13],pose:{torsoX:45,torsoY:0,hipsY:.62,hipsZ:0,rArmZ:-86,headY:-57},
    feet:[{position:[-.67,.58,.44],rotation:[.12,-1.20,.10]},null]},
  Airwalk:{hand:'left',site:'nose',grip:[0,.171,.44],inward:[0,0,-1],pole:[1,.05,.25],
    board:[0,.30,-.12],rotation:[-.58,.04,-.15],pose:{torsoX:45,torsoY:0,hipsY:.62,hipsZ:0,rArmX:-24,rArmZ:-90,headY:-52},
    feet:[{position:[-.22,.62,.80],rotation:[.20,-1.32,.12]},{position:[.32,.45,-.73],rotation:[-.19,-1.68,-.12]}]},
});
const NAMES=Object.keys(GRAB_DEFINITIONS),POSE_KEYS=Object.keys(BASE_POSE);
const reflectZ=([x,y,z])=>[x,y,-z];
function reflectedRotation(rotation,shoe=false) {
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  q.set(-q.x,-q.y,q.z,q.w);
  // A shoe's local forward remains its toe. Reflect the up/forward basis and
  // rebuild handedness, rather than reversing the toes along with board Z.
  if(shoe)q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
  const e=new THREE.Euler().setFromQuaternion(q);return [e.x,e.y,e.z];
}
const SWITCH_GRAB_DEFINITIONS=Object.fromEntries(NAMES.map(name=>{
  const d=GRAB_DEFINITIONS[name];
  return [name,{...d,hand:d.hand==='left'?'right':'left',grip:reflectZ(d.grip),inward:reflectZ(d.inward),
    pole:[-d.pole[0],d.pole[1],d.pole[2]],board:reflectZ(d.board),rotation:reflectedRotation(d.rotation),
    pose:mirrorSwitchPose({...BASE_POSE,...d.pose}),
    feet:d.feet?[d.feet[1],d.feet[0]].map(foot=>foot?{position:reflectZ(foot.position),rotation:reflectedRotation(foot.rotation,true)}:null):undefined}];
}));
export function getGrabDefinition(name,stance=1) {return (stance<0?SWITCH_GRAB_DEFINITIONS:GRAB_DEFINITIONS)[name];}
// Separate variant weights retain an outgoing grab's actual hand and pose even
// when landing changes stance or a new opposite-stance grab begins immediately.
const PROFILES=[1,-1].flatMap(stance=>NAMES.map(name=>{
  const d=getGrabDefinition(name,stance);
  return {...d,name,stance,pose:{...BASE_POSE,...d.pose},point:new THREE.Vector3(...d.grip),normal:new THREE.Vector3(...d.inward),
    position:new THREE.Vector3(...d.board),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rotation)),
    elbowPole:new THREE.Vector3(...d.pole),feet:d.feet?.map(foot=>foot?{position:new THREE.Vector3(...foot.position),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(...foot.rotation))}:null)};
}));

function contact(hand) {
  return {name:null,hand,site:null,weight:0,attached:false,error:0,boardLocal:new THREE.Vector3(),targetWorld:new THREE.Vector3(),palmWorld:new THREE.Vector3(),
    normal:new THREE.Vector3(),pole:new THREE.Vector3(),lastShoulder:new THREE.Quaternion(),lastElbow:new THREE.Quaternion(),lastHand:new THREE.Quaternion(),releaseStart:1};
}

function prepareGripMorph(hand) {
  const mesh=hand.getObjectByName('Continuous palm and wrist');
  if(!mesh)return null;
  // The source hand is cached by the body builder. Keep it untouched: this
  // clone belongs to the current rig and is disposed by Character's traversal.
  const geometry=mesh.geometry.clone(),grip=geometry.clone();
  const p=grip.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),distance=-.057-y;
    if(distance<=0)continue; // wrist, thumb saddle and palm contact stay fixed
    const angle=Math.min(distance/.024,2.65);
    const beyond=Math.max(0,distance-.024*2.65);
    p.setXYZ(i,p.getX(i),-.057-.024*Math.sin(angle),p.getZ(i)+.024*(1-Math.cos(angle))+beyond);
  }
  grip.computeVertexNormals();
  geometry.morphAttributes.position=[p];
  geometry.morphAttributes.normal=[grip.getAttribute('normal')];
  geometry.morphTargetsRelative=false;
  geometry.userData.grabGripMorph=true;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  mesh.geometry=geometry;mesh.updateMorphTargets();
  return mesh;
}

/** Render-only reach / hold / release layer. Never changes skating state. */
export class GrabAnimation {
  constructor() {
    this.weights=new Float64Array(PROFILES.length);this.weight=0;this.name=null;this.state='ride';this.allowBoard=false;this.stance=1;
    this.activeTrick=null;this.activeProfile=-1;
    this.contacts=[contact('left'),contact('right')];this.contact=this.contacts[0];
    this.restHands=new WeakMap();
    this.gripMeshes=new WeakMap();
    this.landingFactor=1;this.dt=0;this.hasBoardCorrection=false;this.exitBoard=false;
    this.boardOffset=new THREE.Vector3();this.boardCorrection=new THREE.Quaternion();
    this.landingRay=new THREE.Raycaster();this.landingRay.firstHitOnly=true;this.landingHits=[];
    this.landingOrigin=new THREE.Vector3();this.landingDirection=new THREE.Vector3();this.landingNormal=new THREE.Vector3();this.landingNormalMatrix=new THREE.Matrix3();
    this.v={point:new THREE.Vector3(),target:new THREE.Vector3(),wrist:new THREE.Vector3(),direction:new THREE.Vector3(),bend:new THREE.Vector3(),elbow:new THREE.Vector3(),lower:new THREE.Vector3(),
      position:new THREE.Vector3(),normal:new THREE.Vector3(),x:new THREE.Vector3(),y:new THREE.Vector3(),z:new THREE.Vector3(),offset:new THREE.Vector3(),
      boardQ:new THREE.Quaternion(),worldQ:new THREE.Quaternion(),parentQ:new THREE.Quaternion(),inverse:new THREE.Quaternion(),handQ:new THREE.Quaternion(),
      shoulderQ:new THREE.Quaternion(),elbowQ:new THREE.Quaternion(),authoredShoulder:new THREE.Quaternion(),authoredElbow:new THREE.Quaternion(),authoredHand:new THREE.Quaternion(),matrix:new THREE.Matrix4()};
  }

  reset() {
    this.weights.fill(0);this.weight=0;this.name=null;this.allowBoard=false;
    this.activeTrick=null;this.activeProfile=-1;
    this.landingFactor=1;this.hasBoardCorrection=false;this.exitBoard=false;this.boardOffset.set(0,0,0);this.boardCorrection.identity();
    for(const c of this.contacts){c.weight=0;c.attached=false;c.name=null;c.error=0;}
  }

  landingBlend(sk) {
    if(sk.state!=='air'||!sk.pos||!sk.vel||sk.vel.y>0||!sk.level)return 1;
    const gravity=sk.T?.gravity||22,horizon=.30;
    const probe=(origin,direction,far)=>{
      this.landingRay.set(origin,direction);this.landingRay.near=0;this.landingRay.far=far;this.landingHits.length=0;
      this.landingRay.intersectObjects(sk.level.colliders||[],false,this.landingHits);
      const hit=this.landingHits[0];if(!hit?.face)return null;
      this.landingNormal.copy(hit.face.normal).applyMatrix3(this.landingNormalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      // Descending skaters can reconnect to a steep quarter face too; only
      // reject ceilings and the wall impacts that physics treats as a bail.
      const vertical=this.landingNormal.y<.3;
      return this.landingNormal.y>.01&&(!vertical||sk.vel.dot(this.landingNormal)>=-(sk.T?.splatSpeed||6.5))?hit:null;
    };
    let remaining=Infinity;
    // Match the physical controller's downward and forward landing probes,
    // including its 30cm forward margin. Our own raycaster cannot change its
    // collision scratch state, and these probes never write simulation data.
    this.landingOrigin.copy(sk.pos);this.landingOrigin.y+=.30;
    const below=probe(this.landingOrigin,DOWN,.35-sk.vel.y*horizon+.5*gravity*horizon*horizon);
    if(below) {
      const height=Math.max(0,sk.pos.y-below.point.y-.05);
      remaining=(sk.vel.y+Math.sqrt(sk.vel.y*sk.vel.y+2*gravity*height))/gravity;
    }
    const speed=sk.vel.length();
    if(speed>.01) {
      this.landingOrigin.copy(sk.pos);this.landingOrigin.y+=.25;
      this.landingDirection.copy(sk.vel).multiplyScalar(1/speed);
      const ahead=probe(this.landingOrigin,this.landingDirection,speed*horizon+.30);
      if(ahead) {
        const closing=-sk.vel.dot(this.landingNormal);
        if(closing>0) {
          const distance=Math.max(0,ahead.distance-.30)*closing/speed;
          remaining=Math.min(remaining,2*distance/(closing+Math.sqrt(closing*closing+2*gravity*this.landingNormal.y*distance)));
        }
      }
    }
    remaining=Math.min(remaining,this.railLandingTime(sk,gravity));
    return THREE.MathUtils.smoothstep(remaining,.025,.24);
  }

  railLandingTime(sk,gravity) {
    const armed=sk.grindIntent>0,tolerance=armed?(sk.T?.grindSnapAssist||1.3):(sk.T?.grindSnapAuto||.62);
    let soonest=Infinity;
    for(const rail of sk.level.rails||[]) {
      if(rail.environment&&sk.departedEnvironmentFeature&&rail.feature===sk.departedEnvironmentFeature)continue;
      if(!rail.dir||!rail.len||(!armed&&(rail.kind==='coping'||rail.requiresIntent)))continue;
      const horizontal=rail.dir.x*rail.dir.x+rail.dir.z*rail.dir.z;
      const along=sk.vel.x*rail.dir.x+sk.vel.z*rail.dir.z;
      let time=0,parameter=0,x=0,y=0,z=0;
      // Refine the intercept once for sloping rails. The renderer only reads
      // the authored capture bounds; it never calls the magnet or findRail.
      for(let iteration=0;iteration<3;iteration++) {
        x=sk.pos.x+sk.vel.x*time;y=sk.pos.y+sk.vel.y*time-.5*gravity*time*time;z=sk.pos.z+sk.vel.z*time;
        const dx=x-rail.a.x,dy=y-rail.a.y,dz=z-rail.a.z;
        parameter=sk.level.horizontalRailCapture&&horizontal>1e-8
          ? (dx*rail.dir.x+dz*rail.dir.z)/(rail.len*horizontal)
          : (dx*rail.dir.x+dy*rail.dir.y+dz*rail.dir.z)/rail.len;
        if(iteration===2)break;
        const railY=rail.a.y+rail.dir.y*rail.len*THREE.MathUtils.clamp(parameter,0,1);
        // Physics captures before reaching the rail: 50cm plus one falling
        // step. Prepare for that real boundary, not an imaginary surface hit.
        const height=sk.pos.y-railY-.5-Math.max(0,-sk.vel.y)/60;
        time=height<=0?0:(sk.vel.y+Math.sqrt(sk.vel.y*sk.vel.y+2*gravity*height))/gravity;
      }
      if(time>.30||parameter<-.02||parameter>1.02||(parameter>.97&&along>0)||(parameter<.03&&along<0))continue;
      const cooldown=Math.max(0,(sk.railCooldown||0)-time);
      if(cooldown>0&&(rail===sk.lastRail||cooldown>.25))continue;
      parameter=THREE.MathUtils.clamp(parameter,0,1);
      const targetX=rail.a.x+rail.dir.x*rail.len*parameter,targetY=rail.a.y+rail.dir.y*rail.len*parameter,targetZ=rail.a.z+rail.dir.z*rail.len*parameter;
      const below=armed?-(sk.T?.grindSnapBelow||.45):-.3;
      if(y-targetY<below||Math.hypot(x-targetX,z-targetZ)>=Math.min(tolerance,rail.captureRadius??tolerance))continue;
      soonest=Math.min(soonest,time);
    }
    return soonest;
  }

  update(sk,dt) {
    this.dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));
    const trick=sk.state==='air'&&sk.trick?.kind==='grab'?sk.trick:null;
    if(trick!==this.activeTrick) {
      this.activeTrick=trick;
      const index=trick?NAMES.indexOf(trick.name):-1;
      this.activeProfile=index<0?-1:index+(sk.stance<0?NAMES.length:0);
    }
    const active=this.activeProfile;
    const allow=sk.state==='air'&&sk.trick?.kind!=='flip';
    if(this.allowBoard&&!allow) {
      for(const c of this.contacts)c.releaseStart=Math.max(.001,c.weight);
      this.exitBoard=sk.state==='air'&&this.hasBoardCorrection;
    }
    // The tiny residual belongs to the outgoing flip, never a later grab.
    // A legal new trick must regain control of its board immediately.
    if(sk.state!=='air'||allow)this.exitBoard=false;
    if(this.exitBoard) {
      const keep=Math.exp(-14*this.dt);this.boardOffset.multiplyScalar(keep);this.boardCorrection.slerp(this.v.inverse.identity(),1-keep);
      if(this.boardOffset.lengthSq()<1e-10&&this.boardCorrection.angleTo(this.v.inverse)<.0001)this.exitBoard=false;
    }
    this.state=sk.state;this.allowBoard=allow;this.stance=sk.stance<0?-1:1;
    this.landingFactor=allow&&(active>=0||this.weight>0)?this.landingBlend(sk):1;
    const a=1-Math.exp(-this.dt*(active>=0?20:14));
    this.weight=0;let best=-1,bestWeight=0;
    for(let i=0;i<this.weights.length;i++) {
      let w=this.weights[i]+((i===active?1:0)-this.weights[i])*a;
      if(allow)w=Math.min(w,this.landingFactor);
      if(w<.0001)w=0;else if(w>.9999)w=1;
      this.weights[i]=w;this.weight+=w;if(w>bestWeight){best=i;bestWeight=w;}
    }
    this.name=best>=0?PROFILES[best].name:null;
    for(const c of this.contacts) {
      c.weight=0;c.boardLocal.set(0,0,0);c.normal.set(0,0,0);c.pole.set(0,0,0);let largest=0;
      for(let i=0;i<PROFILES.length;i++) {
        const p=PROFILES[i],w=this.weights[i];if(p.hand!==c.hand||w<=0)continue;
        c.weight+=w;c.boardLocal.addScaledVector(p.point,w);c.normal.addScaledVector(p.normal,w);c.pole.addScaledVector(p.elbowPole,w);
        if(w>largest){largest=w;c.name=p.name;c.site=p.site;}
      }
      if(c.weight>0){c.boardLocal.multiplyScalar(1/c.weight);c.normal.normalize();c.pole.normalize();}
      else {c.name=null;c.error=0;}
      c.attached=allow&&c.weight>.98;
    }
    this.contact=this.contacts[1].weight>this.contacts[0].weight?this.contacts[1]:this.contacts[0];
  }

  modifyTarget(T) {
    if(this.weight<=0)return T;
    for(const key of POSE_KEYS) {
      let value=(T[key]??0)*(1-this.weight);
      for(let i=0;i<PROFILES.length;i++)value+=PROFILES[i].pose[key]*this.weights[i];
      T[key]=value;
    }
    return T;
  }

  applyBoard(character) {
    if(this.exitBoard) {
      character.board.position.add(this.boardOffset);character.board.quaternion.premultiply(this.boardCorrection);
      character.board.updateMatrixWorld(true);return;
    }
    if(!this.allowBoard||this.weight<=0){this.hasBoardCorrection=false;return;}
    const v=this.v;v.position.set(0,0,0);let accumulated=0;v.boardQ.identity();
    for(let i=0;i<PROFILES.length;i++) {
      const w=this.weights[i];if(w<=0)continue;
      v.position.addScaledVector(PROFILES[i].position,w);
      v.boardQ.slerp(PROFILES[i].quaternion,w/(accumulated+w));accumulated+=w;
    }
    v.position.multiplyScalar(1/this.weight);
    v.offset.copy(character.board.position);v.inverse.copy(character.board.quaternion).invert();
    character.board.position.lerp(v.position,this.weight);character.board.quaternion.slerp(v.boardQ,this.weight);
    this.boardOffset.copy(character.board.position).sub(v.offset);this.boardCorrection.copy(character.board.quaternion).multiply(v.inverse);this.hasBoardCorrection=true;
    character.board.updateMatrixWorld(true);
  }

  adjustFootTarget(character,index,targetWorld,orientationWorld) {
    if(this.state!=='air'||(this.weight<=0&&!this.exitBoard))return 1;
    const v=this.v;let total=0;v.position.set(0,0,0);v.worldQ.identity();
    if(this.exitBoard) {
      // The normal flip solver keeps shoes in the unspun deck frame. Carry
      // over only the departing grab's tilt, so a Method does not instantly
      // flatten both ankles when the flip starts.
      v.position.copy(targetWorld);character.root.worldToLocal(v.position);
      v.position.sub(character.board.position).applyQuaternion(this.boardCorrection).add(character.board.position);
      character.root.localToWorld(v.position);targetWorld.copy(v.position);
      character.root.getWorldQuaternion(v.parentQ);v.inverse.copy(v.parentQ).invert();
      v.worldQ.copy(v.parentQ).multiply(this.boardCorrection).multiply(v.inverse);orientationWorld.premultiply(v.worldQ);
      v.position.set(0,0,0);v.worldQ.identity();
    }
    for(let i=0;i<PROFILES.length;i++) {
      const foot=PROFILES[i].feet?.[index],w=this.weights[i];if(!foot||w<=0)continue;
      v.position.addScaledVector(foot.position,w);v.worldQ.slerp(foot.quaternion,w/(total+w));total+=w;
    }
    if(total<=0)return 1;
    v.position.multiplyScalar(1/total);character.root.localToWorld(v.position);
    targetWorld.lerp(v.position,total);
    character.root.getWorldQuaternion(v.parentQ);v.worldQ.premultiply(v.parentQ);orientationWorld.slerp(v.worldQ,total);
    return 1;
  }

  footContactWeight(index,normalWeight) {
    if(this.state!=='air')return normalWeight;
    let kicked=0;
    for(let i=0;i<PROFILES.length;i++)if(PROFILES[i].feet?.[index])kicked+=this.weights[i];
    // A new flip releases ordinary deck contact, but an already extended foot
    // first returns from its grab target rather than jumping to the flip pose.
    return THREE.MathUtils.lerp(normalWeight,1,Math.min(1,kicked/.25));
  }

  applyHands(character) {
    const v=this.v;
    for(const c of this.contacts) {
      const arm=c.hand==='left'?character.lArm:character.rArm;
      let rest=this.restHands.get(arm.hand);
      if(!rest){rest=arm.hand.quaternion.clone();this.restHands.set(arm.hand,rest);}
      let mesh=this.gripMeshes.get(arm.hand);
      if(mesh===undefined){mesh=prepareGripMorph(arm.hand);this.gripMeshes.set(arm.hand,mesh);}
      // Finish the reach before closing; open naturally during the same release
      // blend as the arm. The neutral mesh remains bit-for-bit unchanged.
      if(mesh)mesh.morphTargetInfluences[0]=THREE.MathUtils.smoothstep(c.weight,.25,.98);
      arm.hand.quaternion.copy(rest);
      if(c.weight<=0)continue;
      if(!this.allowBoard) {
        const release=Math.min(1,c.weight/c.releaseStart);
        arm.sh.quaternion.slerp(c.lastShoulder,release);arm.el.quaternion.slerp(c.lastElbow,release);arm.hand.quaternion.slerp(c.lastHand,release);
        continue;
      }
      character.root.updateMatrixWorld(true);
      c.targetWorld.copy(c.boardLocal);character.board.localToWorld(c.targetWorld);
      character.board.getWorldQuaternion(v.boardQ);
      // Palm +Z faces into the rim. Fingers (-Y) curl below the edge; the
      // thumb stays above/along it instead of placing the wrist on the board.
      v.z.copy(c.normal).applyQuaternion(v.boardQ);v.y.set(0,1,0).applyQuaternion(v.boardQ);
      v.x.crossVectors(v.y,v.z).normalize();v.y.crossVectors(v.z,v.x).normalize();
      v.matrix.makeBasis(v.x,v.y,v.z);v.handQ.setFromRotationMatrix(v.matrix);
      v.offset.fromArray(GRAB_PALM_CONTACT).applyQuaternion(v.handQ);
      v.wrist.copy(c.targetWorld).sub(v.offset);
      v.target.copy(v.wrist);character.torso.worldToLocal(v.target);v.target.sub(arm.sh.position);
      const upper=arm.el.position.length(),lower=arm.hand.position.length();
      const distance=THREE.MathUtils.clamp(v.target.length(),.015,upper+lower-.00001);
      v.direction.copy(v.target).normalize();
      v.bend.copy(c.pole).addScaledVector(v.direction,-c.pole.dot(v.direction));
      if(v.bend.lengthSq()<.00001)v.bend.set(1,0,0).addScaledVector(v.direction,-v.direction.x);
      v.bend.normalize();
      const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
      v.elbow.copy(v.direction).multiplyScalar(along).addScaledVector(v.bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
      v.authoredShoulder.copy(arm.sh.quaternion);v.authoredElbow.copy(arm.el.quaternion);v.authoredHand.copy(arm.hand.quaternion);
      v.shoulderQ.setFromUnitVectors(DOWN,v.lower.copy(v.elbow).normalize());
      v.inverse.copy(v.shoulderQ).invert();
      v.lower.copy(v.target).sub(v.elbow).normalize().applyQuaternion(v.inverse);
      v.direction.copy(arm.hand.position).normalize();v.elbowQ.setFromUnitVectors(v.direction,v.lower);
      arm.sh.quaternion.copy(v.shoulderQ);arm.el.quaternion.copy(v.elbowQ);
      arm.el.updateWorldMatrix(true,false);arm.el.getWorldQuaternion(v.parentQ).invert();
      arm.hand.quaternion.copy(v.parentQ).multiply(v.handQ);
      arm.sh.quaternion.slerp(v.authoredShoulder,1-c.weight);arm.el.quaternion.slerp(v.authoredElbow,1-c.weight);arm.hand.quaternion.slerp(v.authoredHand,1-c.weight);
      c.lastShoulder.copy(arm.sh.quaternion);c.lastElbow.copy(arm.el.quaternion);c.lastHand.copy(arm.hand.quaternion);
    }
    character.root.updateMatrixWorld(true);
    for(const c of this.contacts) {
      const arm=c.hand==='left'?character.lArm:character.rArm;
      c.palmWorld.fromArray(GRAB_PALM_CONTACT);arm.hand.localToWorld(c.palmWorld);
      if(c.name){c.targetWorld.copy(c.boardLocal);character.board.localToWorld(c.targetWorld);c.error=c.palmWorld.distanceTo(c.targetWorld);}
      else c.error=0;
    }
  }
}

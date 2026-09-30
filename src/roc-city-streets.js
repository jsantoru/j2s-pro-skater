import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasMap, randomSeed } from './materials.js';

// Decorative infrastructure outside the skating footprint. Nothing here enters
// the collision lists; street traffic is parked scenery, not a new skate route.
export function addRiverwayStreets({ add, box, bar, material, layout, concrete, rail, black, horizontalScale = 1 }) {
  const rng = randomSeed(1224);
  const joint = material('Road tar and expansion joints', 0x343936, .96);
  const gutter = material('Gutter sediment', 0x6c6c5b, 1);
  const repair = material('Asphalt utility repairs', 0x434a49, .99);
  const paint = material('Faded crossing and kerb markings', 0xbdbba8, .95);
  const leaf = material('Dry leaves in gutters', 0x907448, 1);
  const disc = (radius, x, y, z, mat) => {
    const g = new THREE.CircleGeometry(radius, 24); g.rotateX(-Math.PI / 2); add(g, mat, [x,y,z]);
  };
  const seam = (points, width, y, mat = joint) => {
    for (let i = 1; i < points.length; i++) {
      const [x,z] = points[i-1], [nx,nz] = points[i], dx=nx-x,dz=nz-z;
      box(width,.006,Math.hypot(dx,dz), (x+nx)/2,y,(z+nz)/2,mat,Math.atan2(dx,dz));
    }
  };
  // Small curb segments, drainage slots and repairs break the perfect runway.
  for (const x of [17.9,21.7]) for (let z=-84;z<76;z+=1.65) box(.224,.003,.018,x,.121,z,joint);
  for (let z=-78;z<74;z+=13.7) {
    box(.37,.014,2.1,22.08,-.002,z,gutter);
    box(.34,.022,.78,22.1,.002,z,black);
    for (let k=0;k<8;k++) box(.30,.028,.023,22.1,.009,z-.34+k*.095,rail);
    box(.08,.15,.93,21.82,.028,z,concrete);
    // Hairline cracks stay on the street, where they cannot suggest broken ramps.
    const x=24+rng()*6;
    seam([[x,z+4],[x+.14,z+4.7],[x-.17,z+5.1],[x+.21,z+5.8],[x+.08,z+6.3]],.017,-.004);
    seam([[x-.17,z+5.1],[x-.54,z+5.35],[x-.71,z+5.9]],.012,-.004);
  }
  for (const [x,z,w,d] of [[24,-33,1.2,4.4],[30,-5,2.3,3.5],[26,18,1.8,2.5],[29,-66,2.5,5.3]]) {
    box(w,.012,d,x,-.007,z,repair);
    seam([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2],[x-w/2,z-d/2]],.034,.001);
  }
  for (const [x,z] of [[25.1,-40],[28.7,8],[24.7,54]]) {
    disc(.42,x,.001,z,joint); disc(.35,x,.003,z,rail);
    for(let k=-3;k<=3;k++)box(.53,.005,.014,x,.011,z+k*.072,black);
    for(let k=-3;k<=3;k++)box(.014,.005,.53,x+k*.072,.012,z,black);
  }
  // The small crossing marks the north entrance; it ends at the opposite walk.
  for(let x=22.35;x<32.5;x+=.85)box(.45,.010,2.7,x,.002,-52,paint);
  for(const z of [-54.1,-49.9])box(10.3,.008,.15,27.35,.002,z,paint);
  for(const z of [-47,-18,16,65]) {
    for(let i=0;i<12;i++){
      const x=21.95+rng()*.25,zz=z+rng()*2.3;
      const g=new THREE.CircleGeometry(.025+rng()*.025,5);g.rotateX(-Math.PI/2);g.rotateY(rng()*6);add(g,leaf,[x,.014,zz]);
    }
  }
  // Scaled street signage and small utility furniture belong on the verge.
  const signMap=canvasMap((c,s)=>{
    c.fillStyle='#29554e';c.fillRect(0,0,s,s/4);c.strokeStyle='#d8ded0';c.lineWidth=5;c.strokeRect(8,8,s-16,s/4-16);
    c.fillStyle='#e9ecdc';c.font='bold 70px Arial';c.textAlign='center';c.fillText('SOUTH AVE',s/2,s*.165,s*.88);
  },512,true,128);
  const sign=material('South Avenue enamel signs',0xffffff,.64,.15,signMap);
  for(const z of [-48,17]){
    bar([21.1,0,z],[21.1,3.6,z],.033,rail,8);
    box(.03,.34,1.5,21.1,3.35,z,black);
    const g=new THREE.PlaneGeometry(1.46,.31);g.rotateY(-Math.PI/2);add(g,sign,[21.08,3.35,z]);
    box(.25,.09,.25,21.1,.04,z,concrete);
  }
  const cabinet = (x,z) => {
    box(.64,.95,.44,x,.48,z,rail);box(.66,.07,.47,x,1,z,black);
    box(.008,.64,.31,x-.325,.52,z,black);
    for(let i=0;i<7;i++)box(.012,.016,.24,x-.334,.33+i*.052,z,rail);
    box(.8,.11,.62,x,.035,z,concrete);
  };
  cabinet(34.2,-34); cabinet(34.2,19);

  // Rounded bodywork and a tapered cabin read as human-scale parked cars.
  const body=material('Parked car muted paint',0xffffff,.34,.38);body.vertexColors=true;
  const glass=material('Parked car blue glass',0x253d47,.22,.42);glass.side=THREE.DoubleSide;
  const rubber=material('Parked car rubber',0x202422,.95);
  const headlamp=material('Parked car headlamp glass',0xc3ccc7,.25,.35);
  const tail=material('Parked car rear reflectors',0x80312a,.4,.1);
  const carColors=[0x6e3430,0xaaa99c,0x3e5865];
  for(const [i,z] of [-38,-8,12].entries()) {
    const x=31.7;
    // The park's wider X/Z footprint must not turn familiar cars into wide
    // limousines or stretch circular wheels. Only their placement is scaled.
    const carAdd=(geometry,mat,pos)=>{
      if(pos)geometry.translate(...pos);
      geometry.translate(-x,0,-z);geometry.scale(1/horizontalScale,1,1/horizontalScale);geometry.translate(x,0,z);
      add(geometry,mat);
    };
    const carBox=(w,h,d,px,py,pz,mat)=>carAdd(new THREE.BoxGeometry(w,h,d),mat,[px,py,pz]);
    const painted=(g,px,py,pz)=>{
      const color=new THREE.Color(carColors[i]), colors=new Float32Array(g.attributes.position.count*3);
      for(let j=0;j<g.attributes.position.count;j++)color.toArray(colors,j*3);
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));carAdd(g,body,[px,py,pz]);
    };
    painted(new RoundedBoxGeometry(1.66,.49,4.06,2,.10),x,.59,z);
    const roofShape=new THREE.Shape([new THREE.Vector2(-1.22,0),new THREE.Vector2(-.65,.53),new THREE.Vector2(.68,.55),new THREE.Vector2(1.18,0)]);
    const cabin=new THREE.ExtrudeGeometry(roofShape,{depth:1.40,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.025,bevelThickness:.025});
    cabin.translate(0,0,-.7);cabin.rotateY(Math.PI/2);painted(cabin,x,.81,z);
    const pane=(points,mat=glass)=>{
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();carAdd(g,mat);
    };
    for(const side of [-1,1]){
      const xx=x+side*.745;
      pane([[xx,.86,z-1.12],[xx,1.29,z-.65],[xx,1.29,z+.64],[xx,.86,z+1.13]]);
      carBox(.025,.42,.045,xx,1.07,z-.09,black);
      carBox(.037,.025,.19,xx,.79,z+.64,rail);
      for(const dz of [-1.24,1.23]){
        const tire=new THREE.CylinderGeometry(.335,.335,.19,16);tire.rotateZ(Math.PI/2);carAdd(tire,rubber,[x+side*.79,.315,z+dz]);
        const hub=new THREE.CylinderGeometry(.195,.195,.195,12);hub.rotateZ(Math.PI/2);carAdd(hub,rail,[x+side*.80,.315,z+dz]);
        const cap=new THREE.CylinderGeometry(.095,.095,.202,10);cap.rotateZ(Math.PI/2);carAdd(cap,black,[x+side*.803,.315,z+dz]);
      }
      carBox(.20,.10,.25,x+side*.84,.99,z+.80,black);
      for(const dz of [-1.94,1.94])carBox(.41,.16,.065,x+side*.48,.69,z+dz,dz<0?tail:headlamp);
    }
    for(const [side,base,top,rise] of [[1,1.22,.65,.53],[-1,1.18,.68,.55]]){
      // Follow the actual cabin slope, beyond its bevel, so glass never cuts
      // through the opaque roof panel as the camera moves past the car.
      const run=base-top,length=Math.hypot(run,rise),offset=.04;
      const at=t=>[.81+rise*t+run/length*offset,z+side*(base-run*t+rise/length*offset)];
      const [by,bz]=at(.12),[ty,tz]=at(.87);
      pane([[x-.61,by,bz],[x+.61,by,bz],[x+.61,ty,tz],[x-.61,ty,tz]]);
    }
    for(const dz of [-2.015,2.015]){
      carBox(1.49,.09,.05,x,.45,z+dz,black);carBox(.36,.105,.012,x,.56,z+dz,headlamp);
    }
  }
  // Form joints, runoff stains and pads anchor the elevated road's piers.
  const stainMap=canvasMap((c,s,r)=>{
    c.clearRect(0,0,s,s);for(let i=0;i<38;i++){
      const x=r()*s,w=1+r()*4,h=s*(.2+r()*.8);
      const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(49,45,31,.13)');g.addColorStop(1,'rgba(49,45,31,0)');c.fillStyle=g;c.fillRect(x,0,w,h);
    }
  },256);
  if(stainMap){stainMap.wrapS=stainMap.wrapT=THREE.ClampToEdgeWrapping;}
  const stains=new THREE.MeshStandardMaterial({map:stainMap,color:0x766653,transparent:true,opacity:.3,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1});
  // Use material() ownership via the caller's set, including the texture.
  const bridge=layout.bridge;
  for(const x of bridge.pierRows)for(const z of bridge.pierStations){
    for(const side of [-1,1]){
      const g=new THREE.PlaneGeometry(1.62,3.4);g.rotateY(side*Math.PI/2);add(g,stains,[x+side*.728,3.11,z]);
      for(const y of [.18,1.70,3.22])box(.008,.018,1.66,x+side*.729,y,z,gutter);
    }
  }
  return { materials: [stains], parkedCars: 3 };
}

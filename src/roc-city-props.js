// Small signs of daily use, confined to the verges and shop frontage. These
// meshes never enter the skating collision lists or cover a park approach.
import * as THREE from 'three';
import { canvasMap } from './materials.js';

export function addRocCityProps({ group, add, material, horizontalScale = 1, lowfx = false }) {
  const paint = material('Riverway street furniture and personal belongings', 0xffffff, .87, .12);
  paint.vertexColors = true; paint.side = THREE.DoubleSide;
  const charcoal = 0x303b38, steel = 0x8c9792, wood = 0x977b51, cream = 0xc6bd9d;
  const anchors = [];
  const anchor = (x, y, z, angle = 0) => {
    anchors.push([x,y,z]);
    const put = (g, color, pos = [0,0,0], mat = paint) => {
      if (!g.attributes.uv) g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      if (mat === paint) {
        const tint = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
        for (let i=0;i<g.attributes.position.count;i++) tint.toArray(colors,i*3);
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));
      }
      g.translate(...pos); g.rotateY(angle);
      // Familiar objects stay human-sized when the park footprint is widened.
      g.scale(1/horizontalScale,1,1/horizontalScale);g.translate(x,y,z);add(g,mat);
    };
    const box = (w,h,d,px,py,pz,color=charcoal) => put(new THREE.BoxGeometry(w,h,d),color,[px,py,pz]);
    const bar = (a,b,r=.025,color=charcoal) => {
      const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),delta=B.clone().sub(A);
      const g=new THREE.CylinderGeometry(r,r,delta.length(),lowfx?6:8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
      put(g,color,A.add(B).multiplyScalar(.5).toArray());
    };
    const cylinder = (rt,rb,h,px,py,pz,color=charcoal,segments=16) => put(new THREE.CylinderGeometry(rt,rb,h,segments),color,[px,py,pz]);
    return {put,box,bar,cylinder};
  };

  // Two parked bikes lean slightly toward low racks, outside the east fence.
  for(const [x,z,color,angle] of [[16.18,-15,0x6f8b86,.16],[16.30,5,0xa8744d,-.22]]) {
    const {put,box,bar,cylinder}=anchor(x,-.028,z,angle);
    for(const zz of [-.60,.60]) {
      const tire=new THREE.TorusGeometry(.325,.033,6,lowfx?18:28);tire.rotateY(Math.PI/2);put(tire,0x272a27,[0,.36,zz]);
      const rim=new THREE.TorusGeometry(.289,.012,5,lowfx?18:28);rim.rotateY(Math.PI/2);put(rim,steel,[0,.36,zz]);
      for(let i=0;i<(lowfx?8:12);i++) {
        const a=i*Math.PI*2/(lowfx?8:12);
        bar([0,.36,zz],[0,.36+Math.cos(a)*.283,zz+Math.sin(a)*.283],.0035,steel);
      }
      bar([-.075,.36,zz],[.075,.36,zz],.04,steel);
    }
    const rear=[0,.36,-.60],crank=[0,.39,-.07],seat=[0,.85,-.26],head=[0,.87,.40],front=[0,.36,.60];
    for(const [a,b] of [[rear,seat],[seat,crank],[crank,rear],[seat,head],[head,crank]])bar(a,b,.024,color);
    for(const side of [-1,1])bar([side*.055,.85,.40],[side*.055,.36,.60],.019,color);
    bar(seat,[0,.96,-.28],.018,steel);box(.20,.045,.29,0,.98,-.29,0x292c28);
    bar(head,[0,1.06,.38],.020,steel);bar([-.25,1.065,.38],[.25,1.065,.38],.019,steel);
    for(const side of [-1,1])bar([side*.20,1.065,.38],[side*.30,1.035,.30],.025,0x292c28);
    const sprocket=new THREE.CylinderGeometry(.086,.086,.015,16);sprocket.rotateZ(Math.PI/2);put(sprocket,steel,[.056,.39,-.07]);
    for(const side of [-1,1]) {
      bar([side*.09,.39,-.07],[side*.09,.39+side*.10,-.07+side*.04],.011,steel);
      box(.13,.025,.07,side*.14,.39+side*.10,-.07+side*.04,0x343934);
    }
    // Separate wheel stand gives the parked bike a visible support.
    bar([.16,0,-.61],[.16,.21,-.57],.025);bar([-.16,0,-.61],[-.16,.21,-.57],.025);
    bar([-.16,.21,-.57],[.16,.21,-.57],.025);
    cylinder(.012,.015,.35,.10,.17,-.10,steel,6);
  }

  for(const [x,z] of [[16.65,-31],[16.65,8]]) {
    const {box,bar,cylinder}=anchor(x,-.026,z);
    cylinder(.27,.27,.66,0,.40,0,charcoal);cylinder(.31,.31,.045,0,.765,0,steel);
    cylinder(.255,.255,.018,0,.793,0,0x181f1c);
    for(let i=0;i<18;i++) {
      const a=i*Math.PI/9,px=Math.cos(a)*.284,pz=Math.sin(a)*.284;
      bar([px,.10,pz],[px,.735,pz],.016,0x68756a);
    }
    for(const dx of [-.18,.18])box(.07,.09,.10,dx,.045,0);
  }

  // A public notice board adds a local focal point without changing any ramp.
  const noticeMap=canvasMap((c,s)=>{
    c.fillStyle='#303e3b';c.fillRect(0,0,s,s);
    c.fillStyle='#dacead';c.fillRect(18,18,s-36,s-36);
    c.fillStyle='#2f4c46';c.fillRect(30,30,s-60,113);
    c.fillStyle='#f0e5c4';c.font='bold 56px Arial';c.textAlign='center';c.fillText('ROC CITY',s/2,91);
    c.font='17px Arial';c.fillText('COMMUNITY NOTICEBOARD',s/2,125);
    c.fillStyle='#ba754d';c.save();c.translate(157,293);c.rotate(-.045);c.fillRect(-108,-118,216,236);
    c.fillStyle='#f2e3bb';c.font='bold 34px Arial';c.fillText('KEEP',0,-58);c.fillText('ROLLING',0,-21);
    c.strokeStyle='#f2e3bb';c.lineWidth=4;c.beginPath();c.ellipse(0,26,62,17,-.18,0,Math.PI*2);c.stroke();
    c.font='15px Arial';c.fillText('ALL WHEELS WELCOME',0,81);c.restore();
    c.fillStyle='#f4efda';c.fillRect(293,178,170,122);c.fillStyle='#385349';c.font='bold 22px Arial';c.fillText('OPEN SESSION',378,217);
    c.font='16px Arial';c.fillText('SATURDAY / 2 PM',378,250);c.fillText('BRING A FRIEND',378,275);
    c.fillStyle='#577781';c.fillRect(299,327,152,86);c.fillStyle='#f2e8cd';c.font='18px Arial';c.fillText('SHARE THE LINE',375,361);c.fillText('LOOK OUT FOR',375,384);c.fillText('EACH OTHER',375,406);
    c.fillStyle='#505950';for(const [x,y] of [[59,182],[262,169],[304,188],[449,187],[313,338]]){c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();}
    c.font='15px Arial';c.fillText('GENESEE RIVERWAY / ROCHESTER, NY',s/2,467);
  },512);
  const notice=material('ROC community board posters',0xffffff,.96,0,noticeMap);
  {
    const {put,box,bar}=anchor(16.72,-.025,-13.1,-Math.PI/2);
    for(const x of [-.52,.52])bar([x,0,0],[x,2.08,0],.036);
    box(1.30,1.35,.09,0,1.48,0,wood);
    put(new THREE.PlaneGeometry(1.20,1.25),0xffffff,[0,1.48,.051],notice);
    box(1.39,.045,.30,0,2.18,.06,charcoal);
  }

  // Small possessions beside the north bench suggest an ongoing session.
  {
    const {box,bar,cylinder}=anchor(9.25,-.029,-44.15,.24);
    box(.32,.36,.22,0,.20,0,0x687a72);box(.27,.23,.035,0,.16,.13,0x41554c);
    bar([-.075,.39,0],[0,.46,0],.016,charcoal);bar([0,.46,0],[.075,.39,0],.016,charcoal);
    cylinder(.041,.048,.22,.30,.12,-.02,0xb09868,12);cylinder(.037,.037,.035,.30,.246,-.02,charcoal,10);
  }

  // Cafe furniture sits on the studios' existing paved frontage; walkers use
  // the separate roadside strip. Local dimensions are not stretched by scale.
  for(const z of [-15,-9]) {
    const {put,box,bar,cylinder}=anchor(38.4,.06,z);
    cylinder(.43,.43,.055,0,.76,0,wood,24);cylinder(.043,.06,.70,0,.36,0,charcoal,12);
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])bar([0,.12,0],[Math.cos(angle)*.32,.025,Math.sin(angle)*.32],.023);
    for(const [px,pz,facing] of [[-.85,0,Math.PI/2],[.85,0,-Math.PI/2],[0,.85,Math.PI]]) {
      const c=Math.cos(facing),s=Math.sin(facing),point=(x,y,z)=>[px+x*c+z*s,y,pz-x*s+z*c];
      for(const x of [-.18,.18])for(const dz of [-.18,.18])bar(point(x,-.005,dz),point(x,.48,dz),.018);
      for(let i=0;i<4;i++) {
        const g=new THREE.BoxGeometry(.40,.035,.083);g.rotateY(facing);put(g,wood,point(0,.48,-.14+i*.092));
      }
      for(const x of [-.18,.18])bar(point(x,.45,-.20),point(x,.91,-.24),.018);
      for(const y of [.70,.82]){
        const g=new THREE.BoxGeometry(.40,.08,.025);g.rotateY(facing);put(g,wood,point(0,y,-.23));
      }
    }
    cylinder(.036,.032,.10,.15,.845,.09,cream,10);bar([.18,.86,.08],[.205,.86,.08],.008,cream);
    box(.14,.006,.21,-.11,.792,-.1,cream);
    if(z===-15) {
      bar([0,.79,0],[0,2.52,0],.019,steel);
      // A taut, shallow canopy, with ribs and a scalloped valance.
      for(let i=0;i<10;i++) {
        const a=i*Math.PI/5,b=(i+1)*Math.PI/5,r=1.18;
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.Float32BufferAttribute([0,2.52,0,Math.cos(b)*r,2.22,Math.sin(b)*r,Math.cos(a)*r,2.22,Math.sin(a)*r,
          Math.cos(a)*r,2.22,Math.sin(a)*r,Math.cos(b)*r,2.22,Math.sin(b)*r,Math.cos(b)*r,2.09,Math.sin(b)*r,
          Math.cos(a)*r,2.22,Math.sin(a)*r,Math.cos(b)*r,2.09,Math.sin(b)*r,Math.cos(a)*r,2.09,Math.sin(a)*r],3));
        g.computeVertexNormals();put(g,i%2?0xb8b08d:0x667a6d);
        bar([0,2.50,0],[Math.cos(a)*r,2.20,Math.sin(a)*r],.009,steel);
      }
      cylinder(.05,.075,.07,0,2.545,0,charcoal,10);
    }
  }
  group.userData.neighborhoodProps={anchors,decorativeOnly:true,bikes:2,cafeTables:2,noticeboards:1};
}

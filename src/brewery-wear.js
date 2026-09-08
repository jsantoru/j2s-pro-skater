import * as THREE from 'three';
import { canvasMap, randomSeed } from './materials.js';

// Decals stay within storage bays: readable painted boundaries and accumulated use.
export function dressBreweryWear(level, {add,box,flat}) {
  const stencil = (title, sub, width, depth, x, z, turn = 0) => {
    const map = canvasMap((c,s,r) => {
      const h=s/2; c.strokeStyle='#bca976';c.fillStyle='#bca976';c.lineWidth=9;c.strokeRect(12,12,s-24,h-24);
      c.textAlign='center';c.font='900 67px sans-serif';c.fillText(title,s/2,h*.43,s*.85);
      c.font='bold 25px monospace';c.fillText(sub,s/2,h*.61,s*.80);
      for(let i=0;i<14;i++) {c.save();c.translate(25+i*73,h*.83);c.rotate(-.65);c.fillRect(0,-20,12,42);c.restore();}
      c.globalCompositeOperation='destination-out';
      for(let i=0;i<11000;i++)c.clearRect(r()*s,r()*h,1+r()*9,1+r()*3);
    },1024,true,512);
    const material = new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1});
    add(new THREE.PlaneGeometry(width,depth),material,[x,.019,z],new THREE.Euler(-Math.PI/2,0,turn));
  };
  stencil('KEG RETURNS','EMPTY / INSPECT / REFILL',5.4,2.1,-29.6,-18.7);
  stencil('DISPATCH 01','KEEP LOADING AISLE CLEAR',4.1,2.25,-23.6,19.8,Math.PI);
  stencil('PACKAGED BEER','STAGING / 02',5.5,1.5,29,-18.7);
  const dirtMap = canvasMap((c,s,r) => {
    for(let i=0;i<140;i++){
      const x=s*.5+(r()-.5)*s*.65,y=s*.5+(r()-.5)*s*.45,rad=s*(.015+r()*.17);
      const g=c.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,'rgba(43,35,20,.07)');g.addColorStop(1,'rgba(43,35,20,0)');
      c.fillStyle=g;c.fillRect(x-rad,y-rad,rad*2,rad*2);
    }
  },512);
  const dirt = new THREE.MeshStandardMaterial({map:dirtMap,transparent:true,depthWrite:false,roughness:1});
  for(const [x,z,w,d] of [[-29.6,-20.3,6,3.2],[29.5,-21,6.6,3],[-27.7,20.8,4.6,2.4],[-33.2,-14.8,4,6.5],[-21,21.3,2.4,2.3]])flat(w,d,x,.011,z,dirt,0,-Math.PI/2);
  const dampMap=canvasMap((c,s,r)=>{
    c.translate(s/2,s/2);c.fillStyle='rgba(42,51,43,.22)';c.beginPath();
    for(let i=0;i<=70;i++){
      const a=i/70*Math.PI*2,rad=s*(.28+.03*Math.sin(a*7)+.025*Math.sin(a*13));
      const x=Math.cos(a)*rad,y=Math.sin(a)*rad*.65;if(i)c.lineTo(x,y);else c.moveTo(x,y);
    }c.closePath();c.fill();
    c.strokeStyle='rgba(122,114,86,.15)';c.lineWidth=4;c.stroke();
    c.globalCompositeOperation='destination-out';for(let i=0;i<1900;i++)c.clearRect((r()-.5)*s,(r()-.5)*s,r()*4,.5+r()*2);
  },512);
  const damp=new THREE.MeshStandardMaterial({map:dampMap,transparent:true,depthWrite:false,roughness:.32,metalness:.08});
  for(const [x,z] of [[-32.5,-13.5],[-32.2,-16]])flat(2.0,1.7,x,.013,z,damp,0,-Math.PI/2);
  // Drain grate between the vessels and wall; repair patch near the dispatch threshold.
  box(.35,.009,1.5,-34.9,.008,-14.8,level.mats.dark);
  for(let i=0;i<21;i++)box(.33,.007,.022,-34.9,.016,-15.5+i*.07,level.mats.metal);
  const repairMap=canvasMap((c,s,r)=>{
    c.fillStyle='#7c7e6f';c.fillRect(0,0,s,s);c.strokeStyle='#484c43';c.lineWidth=7;c.strokeRect(4,4,s-8,s-8);
    for(let i=0;i<12000;i++){c.fillStyle=i%2?'rgba(210,204,184,.1)':'rgba(25,32,24,.1)';c.fillRect(r()*s,r()*s,1+r()*3,1+r()*3);}
  },256);
  flat(.8,1.25,-24.9,.009,21.8,new THREE.MeshStandardMaterial({map:repairMap,roughness:.96}),0,-Math.PI/2);
  const paper=new THREE.MeshStandardMaterial({color:0xb8a789,roughness:1,side:THREE.DoubleSide});
  const rng=randomSeed(99);
  for(let i=0;i<17;i++){
    const x=(i<9?28.8:-21.3)+(rng()-.5)*1.5,z=(i<9?-19.8:21.2)+(rng()-.5)*1.3;
    const g=new THREE.PlaneGeometry(.06+rng()*.16,.05+rng()*.13,2,2),p=g.attributes.position;
    for(let j=0;j<p.count;j++)p.setZ(j,rng()*.012);g.computeVertexNormals();
    add(g,paper,[x,.021,z],new THREE.Euler(-Math.PI/2,0,rng()*6));
  }
}

import * as THREE from 'three';
import { canvasMap } from './materials.js';

export function brewerySign(title, subtitle, bg = '#812f29', fg = '#d9cab0') {
  const map = canvasMap((c, s, rng) => {
    const h = s / 3;
    c.fillStyle = bg; c.fillRect(0, 0, s, h);
    for (let i=0;i<38;i++) {
      const x=rng()*s,y=rng()*h,r=s*(.03+rng()*.12);
      const fade=c.createRadialGradient(x,y,0,x,y,r);
      fade.addColorStop(0,'rgba(212,194,158,.10)'); fade.addColorStop(1,'rgba(212,194,158,0)');
      c.fillStyle=fade; c.fillRect(x-r,y-r,r*2,r*2);
    }
    // Chipped enamel over corroded steel, concentrated around seams and fixings.
    for (let i = 0; i < 18000; i++) {
      const x = rng() * s, y = rng() * h, edge = Math.min(x, s-x, y, h-y);
      c.fillStyle = edge < 15 + rng() * 18 ? '#473e2e' : `rgba(22,17,12,${rng()*.12})`;
      c.fillRect(x,y,1+rng()*5,1+rng()*2);
    }
    c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(18,18,s-36,h-36);
    c.textAlign = 'center'; c.fillStyle = fg;
    c.font = 'bold 19px Georgia, serif'; c.fillText('GENESEE BREWING COMPANY  /  ROCHESTER, NEW YORK',s/2,h*.19,s*.87);
    c.font = title === 'Genesee' ? 'italic bold 176px Georgia, serif' : '900 112px Georgia, serif';
    c.fillText(title,s/2,h*.65,s*.86);
    c.font = 'bold 25px Georgia, serif'; c.fillText(subtitle,s/2,h*.84,s*.85);
    // Worn flecks break the lettering as well as the background.
    for(let i=0;i<7500;i++){
      c.fillStyle=rng()>.4?bg:'rgba(31,25,16,.27)';
      c.fillRect(rng()*s,rng()*h,.6+rng()*3,.5+rng()*1.5);
    }
    for(let i=0;i<130;i++) {
      const edge=i%4,along=rng(),depth=3+rng()*17,length=2+rng()*26;
      c.fillStyle=i%3?'rgba(67,45,25,.65)':'rgba(186,168,133,.6)';
      if(edge<2)c.fillRect(along*s,edge===0?0:h-depth,length,depth);
      else c.fillRect(edge===2?0:s-depth,along*h,depth,length);
    }
    for(const x of [30,s-30])for(const y of [30,h-30]){
      const stain=c.createLinearGradient(0,y,0,y+65);stain.addColorStop(0,'rgba(40,25,11,.65)');stain.addColorStop(1,'rgba(40,25,11,0)');
      c.fillStyle=stain;c.fillRect(x-3,y,6,65);c.fillStyle='#343731';c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();
    }
  },1536,true,512);
  return new THREE.MeshStandardMaterial({map,roughness:.89,bumpMap:map,bumpScale:.004});
}

export function graffiti(word, fill = '#93a6a2', seed = 0) {
  const map = canvasMap((c,s,rng)=>{
    c.translate(s*.5,s*.55);c.rotate(-.045+seed*.017);c.textAlign='center';c.lineJoin='round';
    c.font='italic 900 270px Impact, sans-serif';
    // Old broad tags underneath the new piece; uneven cap pressure and overspray.
    for(let i=0;i<12;i++){
      c.strokeStyle=i%2?'rgba(133,59,46,.35)':'rgba(34,46,45,.42)';c.lineWidth=3+rng()*6;
      c.beginPath();c.moveTo(-s*.42+rng()*s*.2,-150+rng()*240);
      c.bezierCurveTo(-150,-300,120,180,s*.38,-120+rng()*180);c.stroke();
    }
    c.shadowColor='rgba(24,25,23,.45)';c.shadowBlur=16;c.strokeStyle='#262b29';c.lineWidth=42;c.strokeText(word,9,25,s*.86);
    c.shadowBlur=0;c.strokeStyle='#bdb495';c.lineWidth=25;c.strokeText(word,0,0,s*.86);
    c.lineWidth=11;c.strokeStyle='#343d3a';c.strokeText(word,0,0,s*.86);
    const g=c.createLinearGradient(0,-210,0,20);g.addColorStop(0,fill);g.addColorStop(1,'#546b68');c.fillStyle=g;c.fillText(word,0,0,s*.86);
    c.strokeStyle='rgba(224,218,184,.75)';c.lineWidth=3;
    c.beginPath();c.moveTo(-s*.36,40);c.bezierCurveTo(-s*.1,80,s*.18,38,s*.40,63);c.stroke();
    for(let i=0;i<32;i++){
      const x=(rng()-.5)*s*.84,y=15+rng()*35;
      c.strokeStyle=i%2?fill:'#293a36';c.lineWidth=1+rng()*3;c.beginPath();c.moveTo(x,y);c.lineTo(x,y+12+rng()*75);c.stroke();
    }
    c.font='italic 36px cursive';c.fillStyle='#c1bfa6';c.fillText('ROC / '+(585+seed),s*.27,120);
    // Tiny paint losses reveal the actual masonry underneath.
    c.globalCompositeOperation='destination-out';
    for(let i=0;i<17000;i++)c.clearRect((rng()-.5)*s,(rng()-.5)*s,1+rng()*4,.6+rng()*2);
  },1024);
  return new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
}

export function dressBrewery(level, {add,box,bar,flat}) {
  const M=level.mats;
  flat(13,4.1,0,4.95,-22.87,brewerySign('Genesee','BEER & ALE  /  ESTABLISHED 1878'));
  flat(10,3.3,0,5.55,22.87,brewerySign('Genesee','NEW YORK STATE’S OLDEST BREWERY'),Math.PI);
  flat(7.5,2.5,-35.86,5.7,3,brewerySign('CREAM ALE','GENESEE  /  ROCHESTER, N.Y.','#435c46','#d6ccb0'),Math.PI/2);
  flat(7.5,2.5,35.86,5.5,-5,brewerySign('BEER & ALE','BREWED IN ROCHESTER SINCE 1878'),-Math.PI/2);
  for(const [word,color,x,y,z,w,h,ry] of [
    ['HIGH FALLS','#ad8e74',-16,3,22.85,11,3.5,Math.PI],
    ['ROC','#8d9fa4',16,2.5,-22.84,8,3.2,0],
    ['585','#b3a47c',-35.85,4.1,15,5.5,2.7,Math.PI/2],
    ['FLOW','#83a5a2',35.85,3.8,16,6,2.5,-Math.PI/2],
    ['GENNY','#b58670',-25,2,-22.83,6,2.6,0],
  ]) flat(w,h,x,y,z,graffiti(word,color,Math.abs(x)%4),ry);
  // The exposed back of the half-pipe is a prominent canvas from the street section.
  flat(10.5,2.15,-2,1.45,-6.87,graffiti('ROCHESTER','#8caaa6',2));
  flat(3.1,1.05,7.2,1.50,-6.865,brewerySign('BOTTLING','DEPARTMENT 03','#b9aa85','#453f31'));

  const grime = new THREE.MeshStandardMaterial({transparent:true,depthWrite:false,roughness:1,map:canvasMap((c,s,rng)=>{
    for(let i=0;i<110;i++){
      const x=rng()*s,width=4+rng()*14,depth=s*(.2+rng()*.85);
      c.save();c.translate(x,0);c.scale(width,depth);
      const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(32,26,15,.15)');g.addColorStop(.4,'rgba(42,34,22,.08)');g.addColorStop(1,'rgba(42,34,22,0)');
      c.fillStyle=g;c.fillRect(-1,0,2,1);c.restore();
    }
  },1024)});
  for(const [x,z,ry,w] of [[0,-22.965,0,72],[0,22.965,Math.PI,72],[-35.965,0,Math.PI/2,46],[35.965,0,-Math.PI/2,46]])flat(w,8,x,4,z,grime,ry);

  const orange = new THREE.MeshStandardMaterial({color:0xb9642d,roughness:.83,map:canvasMap((c,s,rng)=>{
    c.fillStyle='#ded5c4';c.fillRect(0,0,s,s);for(let i=0;i<3200;i++){c.fillStyle=`rgba(50,42,31,${rng()*.25})`;c.fillRect(rng()*s,rng()*s,rng()*7+1,1+rng()*2);}
  },256)});
  const white = new THREE.MeshStandardMaterial({color:0xcac2a8,roughness:.77});
  for(const [x,y,z] of [[-14,0,20],[-16,0,20.5],[15,0,21],[18,-0.0,-21],[30.8,1.6,20]]){
    box(.42,.055,.42,x,y+.028,z,M.dark);
    add(new THREE.CylinderGeometry(.035,.18,.58,24),orange,[x,y+.345,z]);
    add(new THREE.CylinderGeometry(.076,.101,.105,24),white,[x,y+.47,z]);
  }
  // Returnable kegs on timber pallets: a brewing warehouse at the edges of the skate lines.
  const steel=new THREE.MeshStandardMaterial({color:0x9b9e94,roughness:.46,metalness:.83});
  for(const [x,z] of [[-28,-21],[-26.7,-21],[18.7,-21]]){
    for(const dx of [-.44,0,.44])box(.14,.12,1.05,x+dx,.06,z,M.wood);
    for(let dz=-.45;dz<=.45;dz+=.18)box(1.15,.06,.12,x,.15,z+dz,M.wood);
    for(const dx of [-.28,.28]){
      add(new THREE.CylinderGeometry(.25,.25,.79,24),steel,[x+dx,.575,z]);
      for(const y of [.23,.39,.80,.94])add(new THREE.TorusGeometry(.255,.019,8,24),steel,[x+dx,y,z],new THREE.Euler(Math.PI/2,0,0));
      add(new THREE.CylinderGeometry(.045,.045,.025,12),M.dark,[x+dx,.985,z]);
    }
    flat(.95,.27,x,.69,z+.26,brewerySign('GENESEE','RETURNABLE / ROCHESTER'));
  }
  const paper=new THREE.MeshStandardMaterial({color:0xa99b7d,roughness:1,side:THREE.DoubleSide});
  for(let i=0;i<28;i++){
    const x=-18+(i%8)*.62,z=21.3+Math.sin(i*3)*.5;
    add(new THREE.PlaneGeometry(.09+(i%3)*.035,.10),paper,[x,.014,z],new THREE.Euler(-Math.PI/2,0,i*2.2));
  }
}

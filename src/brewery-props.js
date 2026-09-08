import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasMap, randomSeed } from './materials.js';
import { BREWERY_STOCK } from './brewery-layout.js';

function stockMaterial(color, roughness = .85, metalness = 0, map = null) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, map });
  material.userData.castShadow = true;
  return material;
}

// Each box uses one atlas: printed long faces, utility end panels and taped flaps.
function cartonMaterial(brand) {
  const map = canvasMap((c, s, rng) => {
    const cell = s / 2, colors = ['#962e26', '#405940', '#977344'];
    c.fillStyle = '#a98b60'; c.fillRect(0, 0, s, s);
    for (let panel = 0; panel < 4; panel++) {
      const x = panel % 2 * cell, y = Math.floor(panel / 2) * cell;
      c.save(); c.translate(x, y);
      c.fillStyle = panel === 3 ? '#ad9065' : colors[brand]; c.fillRect(6, 6, cell - 12, cell - 12);
      c.strokeStyle = 'rgba(36,26,13,.4)'; c.lineWidth = 5; c.strokeRect(7, 7, cell - 14, cell - 14);
      c.textAlign = 'center';
      if (panel < 2) {
        c.fillStyle = '#e9d8ad'; c.fillRect(12, 90, cell - 24, 220);
        c.fillStyle = colors[brand]; c.font = 'italic bold 105px Georgia'; c.fillText('Genesee', cell / 2, 235, cell - 35);
        c.fillStyle = '#e9d8ad'; c.font = 'bold 28px Georgia'; c.fillText(brand === 1 ? 'CREAM ALE' : 'BEER', cell / 2, 365);
        c.font = 'bold 17px sans-serif'; c.fillText('ROCHESTER, NEW YORK  /  EST. 1878', cell / 2, 54, cell - 40);
        c.font = 'bold 22px sans-serif'; c.fillText('24  /  12 FL. OZ. BOTTLES', cell / 2, 440);
      } else if (panel === 2) {
        c.fillStyle = '#e5d4ac'; c.font = 'bold 46px Georgia'; c.fillText('GENESEE', cell / 2, 112);
        c.font = 'bold 23px sans-serif'; c.fillText('THIS SIDE UP  ↑ ↑', cell / 2, 170);
        c.fillStyle = '#d9cbb0'; c.fillRect(78, 235, 356, 154);
        for (let i = 0; i < 90; i++) { c.fillStyle = '#332c20'; c.fillRect(91 + i * 3.7, 249, 1 + rng() * 2, 88); }
        c.fillStyle = '#332c20'; c.font = '18px monospace'; c.fillText('GBC  01878  024', cell / 2, 370);
      } else {
        c.fillStyle = 'rgba(181,143,79,.7)'; c.fillRect(cell * .42, 0, cell * .16, cell);
        c.fillStyle = '#796143'; c.fillRect(cell / 2, 0, 2, cell);
        c.fillStyle = '#4e4434'; c.font = 'bold 22px monospace'; c.fillText('GENESEE / LOT 1878', cell / 2, 150);
        c.font = '19px monospace'; c.fillText('KEEP DRY', cell / 2, 395);
      }
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = i % 3 ? 'rgba(40,28,15,.09)' : 'rgba(222,196,150,.20)';
        c.fillRect(rng() * cell, rng() * cell, .6 + rng() * 4, .5 + rng() * 1.5);
      }
      c.restore();
    }
  }, 1024);
  return stockMaterial(0xffffff, .95, 0, map);
}

export function dressBreweryProps(level, batch) {
  const {add, box, bar, flat} = batch, rng = randomSeed(585);
  const steelMap = canvasMap((c, s, r) => {
    c.fillStyle = '#b8beba'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1300; i++) {
      c.strokeStyle = i % 3 ? `rgba(231,236,226,${r() * .04})` : `rgba(34,43,40,${r() * .025})`;
      const y = r() * s; c.beginPath(); c.moveTo(0, y); c.lineTo(s, y + r()); c.stroke();
    }
    for (let i = 0; i < 48; i++) {
      c.strokeStyle = 'rgba(33,39,35,.17)'; const x = r() * s, y = r() * s;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + r() * 50, y + r() * 4); c.stroke();
    }
  }, 512);
  const steel = stockMaterial(0xffffff, .43, .78, steelMap), polished = stockMaterial(0xb6beb8, .25, .88);
  const rubber = stockMaterial(0x242d2b, .92), red = stockMaterial(0x8a3328, .67, .22);
  const yellow = stockMaterial(0xb7953f, .68, .25), crateGreen = stockMaterial(0x304e41, .83);
  const woodMap = canvasMap((c,s,r) => {
    c.fillStyle='#8c7859'; c.fillRect(0,0,s,s);
    for(let i=0;i<2100;i++){
      const y=r()*s;c.strokeStyle=i%3?'rgba(38,28,17,.08)':'rgba(217,198,151,.09)';
      c.beginPath();c.moveTo(0,y);c.bezierCurveTo(s*.3,y+4,s*.7,y-3,s,y+1);c.stroke();
    }
    for(let i=0;i<90;i++){
      const x=r()*s,y=r()*s;c.strokeStyle='rgba(37,26,15,.3)';c.lineWidth=r()*2+.4;
      c.beginPath();c.moveTo(x,y);c.lineTo(x+8+r()*85,y+r()*3);c.stroke();
    }
    for(let i=0;i<35;i++){c.fillStyle='rgba(203,184,138,.3)';c.fillRect(r()*s,r()*s,10+r()*40,1+r()*3);}
  },512);
  const timber = stockMaterial(0xffffff, .96, 0, woodMap), amber = stockMaterial(0x3a2913, .26, .2);
  const cartons = [0, 1, 2].map(cartonMaterial);
  const wrapMap = canvasMap((c, s, r) => {
    c.fillStyle='rgba(220,231,221,.12)';c.fillRect(0,0,s,s);
    for (let y = 0; y < s; y += 3) {
      c.strokeStyle = `rgba(220,231,221,${.02 + r() * .13})`; c.lineWidth = .5 + r();
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s * .3, y + 5, s * .6, y - 5, s, y + 1); c.stroke();
    }
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = 'rgba(242,244,227,.26)'; c.beginPath(); c.moveTo(r() * s, s); c.lineTo(r() * s, 0); c.stroke();
    }
  }, 512);
  const wrap = new THREE.MeshPhysicalMaterial({ map: wrapMap, color: 0xe5eddd, transparent: true,
    opacity: .55, roughness: .26, metalness: .1, depthWrite: false, side: THREE.FrontSide });
  const labelMap = canvasMap((c, s, r) => {
    c.fillStyle = '#ddcfaa'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#8c342b'; c.fillRect(0, 0, s, s * .22);
    c.fillStyle = '#e6d9b8'; c.font = 'italic bold 80px Georgia'; c.textAlign = 'center'; c.fillText('Genesee', s / 2, s * .17);
    c.fillStyle = '#303c33'; c.font = 'bold 35px sans-serif'; c.fillText('RETURNABLE', s / 2, s * .35);
    c.font = '23px monospace'; c.fillText('GBC / ROCHESTER', s / 2, s * .45);
    for (let i = 0; i < 98; i++) c.fillRect(42 + i * 4.3, s * .55, 1 + r() * 3, s * .22);
    c.font = '24px monospace'; c.fillText('01878  /  050', s / 2, s * .88);
  }, 512);
  const label = stockMaterial(0xffffff, .89, 0, labelMap);
  const shipping = stockMaterial(0xffffff,.94,0,canvasMap((c,s,r)=>{
    c.fillStyle='#ddd9c6';c.fillRect(0,0,s,s);c.fillStyle='#313931';c.textAlign='left';
    c.font='bold 39px sans-serif';c.fillText('GBC / DISPATCH',24,63);
    c.font='22px monospace';
    for(const [i,line] of ['GENESEE BREWING CO.','ROCHESTER, NY','DOCK 01 / ROUTE 585','PALLET 007 / OF 012'].entries())c.fillText(line,24,118+i*44);
    c.fillRect(24,285,s-48,3);
    for(let i=0;i<95;i++)c.fillRect(30+i*4.7,315,1+r()*3,105);
    c.font='26px monospace';c.fillText('01878 585 007',80,473);
  },512));
  const vessel = stockMaterial(0xffffff,.78,0,canvasMap((c,s)=>{
    c.fillStyle='#c0c5b9';c.fillRect(0,0,s,s);
    for(let i=0;i<2;i++){
      c.save();c.translate(i*s/2,0);c.fillStyle='#344940';c.fillRect(8,8,s/2-16,s-16);c.fillStyle='#ded6b9';c.textAlign='center';
      c.font='bold 24px sans-serif';c.fillText('GENESEE',s/4,55);c.font='bold 98px sans-serif';c.fillText('0'+(4+i),s/4,180);
      c.font='16px monospace';c.fillText('CELLAR VESSEL',s/4,226);c.restore();
    }
  },512,true,256));
  const ring = (radius, tube, x, y, z, material = polished) => add(new THREE.TorusGeometry(radius, tube, 6, 32), material, [x, y, z], new THREE.Euler(Math.PI / 2, 0, 0));
  const cylinder = (radius, height, x, y, z, material, top = radius) => add(new THREE.CylinderGeometry(top, radius, height, 24), material, [x, y, z]);
  const pallet = (x, y, z) => {
    for (const dx of [-.48, 0, .48]) {
      box(.15, .10, 1.02, x + dx, y + .08, z, timber);
      box(.15, .025, 1.02, x + dx, y + .0125, z, timber);
    }
    for (let i = 0; i < 6; i++) {
      const dz = -.44 + i * .175;
      box(1.18, .045, .14, x, y + .1575, z + dz, timber);
      for (const dx of [-.48, .48]) cylinder(.006, .002, x + dx, y + .181, z + dz, rubber);
    }
  };
  const keg = (x, y, z, turn = 0) => {
    const profile = [[0,.058],[.17,.058],[.198,.069],[.211,.10],[.215,.17],[.208,.23],[.211,.36],[.217,.44],[.208,.51],[.185,.55],[.06,.556],[0,.556]];
    const g = new THREE.LatheGeometry(profile.map(([r,h]) => new THREE.Vector2(r,h)), 32), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getX(i), p.getZ(i));
      const dent = .004 * Math.exp(-((Math.sin(a + turn * 2) / .25) ** 2) - (((p.getY(i) - .31) / .09) ** 2));
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > .18) { p.setX(i, p.getX(i) * (1 - dent / r)); p.setZ(i, p.getZ(i) * (1 - dent / r)); }
    }
    g.computeVertexNormals(); add(g, steel, [x,y,z], new THREE.Euler(0,turn,0));
    for (const h of [.02,.065,.17,.44,.555,.605]) ring(h < .1 || h > .54 ? .207 : .214, .009, x, y+h, z);
    // Open collars with actual gaps beneath the rolled carrying rim.
    for (const h of [.039,.577]) for (let i = 0; i < 4; i++) {
      const collar = new THREE.CylinderGeometry(.207,.207,.047,12,1,true,i*Math.PI/2+.20,.88);
      add(collar, steel, [x,y+h,z], new THREE.Euler(0,turn,0));
    }
    cylinder(.047,.018,x,y+.568,z,polished); cylinder(.025,.02,x,y+.58,z,rubber);
    box(.032,.006,.007,x,y+.593,z,polished);
    // A narrow curved inventory label hugs the cylinder, including its worn edges.
    const sticker = new THREE.CylinderGeometry(.218,.218,.135,14,1,true,-.47,.94);
    add(sticker,label,[x,y+.31,z],new THREE.Euler(0,turn,0));
  };
  const carton = (x,y,z,brand,turn = 0) => {
    const g = new THREE.BoxGeometry(.555,.278,.468), uv = g.attributes.uv;
    const panels = [2,2,3,3,0,1];
    for (let face = 0; face < 6; face++) for(let j=0;j<4;j++) {
      const i=face*4+j, panel=panels[face]; uv.setXY(i, (uv.getX(i)+panel%2)/2, (uv.getY(i)+(panel<2?1:0))/2);
    }
    add(g,cartons[brand],[x,y+.139,z],new THREE.Euler(0,turn,0));
  };
  const bottleCrate = (x,y,z,filled=true) => {
    box(.57,.04,.39,x,y+.02,z,crateGreen);
    for (const dx of [-.275,.275]) for (const dz of [-.185,.185]) box(.024,.32,.024,x+dx,y+.16,z+dz,crateGreen);
    for (const h of [.09,.17,.285,.32]) {
      for (const dz of [-.185,.185]) box(.57,.028,.024,x,y+h,z+dz,crateGreen);
      for (const dx of [-.275,.275]) box(.024,.028,.39,x+dx,y+h,z,crateGreen);
    }
    for (let i=0;i<5;i++) for (const dz of [-.185,.185]) box(.012,.29,.015,x-.22+i*.11,y+.17,z+dz,crateGreen);
    if(filled)for(let i=0;i<4;i++)for(let j=0;j<3;j++){
      const bx=x-.20+i*.13,bz=z-.12+j*.12;
      const g=new THREE.LatheGeometry([[0,0],[.042,0],[.045,.02],[.044,.18],[.029,.22],[.017,.245],[.017,.31],[0,.31]].map(p=>new THREE.Vector2(...p)),10);
      add(g,amber,[bx,y+.04,bz]); cylinder(.020,.011,bx,y+.353,bz,polished);
      cylinder(.045,.08,bx,y+.15,bz,label);
    }
  };
  for (const prop of BREWERY_STOCK) {
    const {kind,x,y,z,rows=1,brand=0} = prop;
    if(kind==='keg')keg(x,y,z,rng()*2);
    if(kind==='kegs'){
      pallet(x,y,z);
      for(let row=0;row<rows;row++)for(const dx of [-.25,.25])for(const dz of [-.25,.25])keg(x+dx,y+.18+row*.62,z+dz,(rng()-.5)*1.8);
    }
    if(kind==='cases'){
      pallet(x,y,z);
      for(let row=0;row<rows;row++)for(const dx of [-.284,.284])for(const dz of [-.24,.24])carton(x+dx+(row%2)*.004,y+.18+row*.29,z+dz,brand,(row%2)*Math.PI+(rng()-.5)*.025);
      if(prop.wrap){
        add(new THREE.BoxGeometry(1.163,rows*.29+.025,.986),wrap,[x,y+.18+rows*.145,z]);
        flat(.19,.25,x-.22,y+.18+rows*.18,z+.495,shipping);
      }
    }
    if(kind==='crates')for(let row=0;row<rows;row++)bottleCrate(x,y+row*.33,z,row===rows-1);
    if(kind==='tank'){
      // Cone-bottom vessel with domed head, welded bands, manway and service fittings.
      const points=[[0, .62],[.15,.65],[.88,1.26],[.95,1.4],[.95,3.6],[.91,3.79],[.75,3.96],[.4,4.09],[0,4.12]];
      add(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),48),steel,[x,y,z]);
      for(const h of [1.4,2.52,3.6])ring(.956,.013,x,y+h,z);
      for(const dx of [-.64,.64])for(const dz of [-.64,.64]){
        cylinder(.055,1.25,x+dx,y+.625,z+dz,polished); box(.20,.045,.20,x+dx,y+.023,z+dz,rubber);
      }
      cylinder(.12,.09,x,y+4.13,z,polished);
      // Service face points into the room (+x), clear of the masonry.
      add(new THREE.CylinderGeometry(.25,.25,.07,32),polished,[x+.958,y+2.04,z],new THREE.Euler(0,0,Math.PI/2));
      bar([x+1.01,y+1.86,z],[x+1.01,y+2.21,z],.016,rubber);
      for(const dz of [-.28,.28])bar([x+1.015,y+2.04,z+dz],[x+1.035,y+2.04,z+dz],.021,polished);
      bar([x,y+.66,z],[x+1.12,y+.66,z],.05,polished);
      bar([x+1.12,y+.66,z],[x+1.12,y+.35,z],.05,polished);
      add(new THREE.TorusGeometry(.14,.019,8,24),red,[x+.65,y+.89,z],new THREE.Euler(Math.PI/2,0,0));
      bar([x+.65,y+.66,z],[x+.65,y+.90,z],.019,polished);
      bar([x+.52,y+.89,z],[x+.78,y+.89,z],.012,red);
      const plate=new THREE.PlaneGeometry(.30,.34), uv=plate.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+(prop.number==='05'?1:0))/2);
      add(plate,vessel,[x+.956,y+2.75,z],new THREE.Euler(0,Math.PI/2,0));
    }
  }
  // A pallet jack parked under dispatch stock; forks point toward the loading door.
  const jackX=-26.9,jackZ=19.5;
  for(const dx of [-.26,.26]){
    add(new RoundedBoxGeometry(.16,.075,1.25,1,.035),yellow,[jackX+dx,.08,jackZ+.38]);
    add(new THREE.CylinderGeometry(.063,.063,.12,16),rubber,[jackX+dx,.063,jackZ+.88],new THREE.Euler(0,0,Math.PI/2));
  }
  box(.66,.16,.32,jackX,.20,jackZ-.17,yellow);
  cylinder(.065,.34,jackX,.28,jackZ-.18,polished);
  for(const dx of [-.11,.11])add(new THREE.CylinderGeometry(.105,.105,.085,16),rubber,[jackX+dx,.105,jackZ-.3],new THREE.Euler(0,0,Math.PI/2));
  bar([jackX,.38,jackZ-.2],[jackX,1.03,jackZ-.52],.025,rubber);
  const handle=new THREE.CatmullRomCurve3([[-.17,1.0],[-.18,1.20],[0,1.25],[.18,1.20],[.17,1.0]].map(([x,y])=>new THREE.Vector3(jackX+x,y,jackZ-.6)));
  add(new THREE.TubeGeometry(handle,24,.024,8,false),rubber,[0,0,0]);
  // Keg hand truck leaned against the returns bay, a low load plate between its wheels.
  const tx=-26.9,tz=-21.7;
  for(const dx of [-.25,.25]){
    bar([tx+dx,.16,tz+.22],[tx+dx,1.32,tz-.06],.025,red);
    bar([tx+dx,1.32,tz-.06],[tx+dx,1.37,tz-.25],.028,rubber);
    add(new THREE.CylinderGeometry(.14,.14,.075,20),rubber,[tx+dx,.14,tz+.22],new THREE.Euler(0,0,Math.PI/2));
  }
  for(const h of [.35,.65,.97])bar([tx-.25,h,tz+.22-h*.22],[tx+.25,h,tz+.22-h*.22],.021,red);
  box(.50,.027,.34,tx,.04,tz+.34,red);
  // Utility pipes and a hose confined to the tank bay.
  bar([-35.1,4.9,-18],[-35.1,4.9,-11.5],.075,polished);
  for(const z of [-13.4,-16.3]){
    bar([-35.1,4.9,z],[-33.6,4.9,z],.05,polished);bar([-33.6,4.9,z],[-33.6,4.16,z],.05,polished);
    for(const y of [4.2,4.65])ring(.066,.011,-33.6,y,z);
  }
  const hosePoints=[[-32.48,.35,-13.4],[-32.1,.08,-13.4],[-31.7,.055,-14.2],[-32.2,.055,-15],[-32.6,.055,-14.4],[-31.9,.055,-14],[-31.5,.055,-15.1],[-32.2,.08,-16.3],[-32.48,.35,-16.3]].map(p=>new THREE.Vector3(...p));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePoints),90,.033,8,false),rubber,[0,0,0]);
  // Scuffed empties and an opened carton in the loading area.
  pallet(-29.8,0,20.8); pallet(-29.8,.18,20.8);
  bottleCrate(-20.65,0,21.65,false);
  carton(-20.5,0,20.75,2,-.2);
  add(new THREE.PlaneGeometry(.55,.23),cartons[2],[-20.50,.30,20.50],new THREE.Euler(-.7,-.2,0));
  for(let i=0;i<15;i++){
    const x=-21.2+rng()*1.1,z=20.7+rng()*.8;
    cylinder(.013,.005,x,.004,z,i%2?red:polished);
  }
}

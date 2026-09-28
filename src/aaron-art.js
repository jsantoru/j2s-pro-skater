import * as THREE from 'three';
import { canvasMap } from './materials.js';

export function buildAaronClothes(rig,materials,{garment,garmentUV,mesh,anchorHem}) {
  const {shirt,tee}=materials;
  const undershirt=garmentUV(garment(rig.torso,[
    [-.10,.173,.111],[.05,.170,.110],[.24,.172,.102],[.38,.18,.094],[.445,.13,.073],[.47,.058,.052],
  ],tee,1,.008,40),.47,-.10);
  undershirt.name='Aaron faded red tee';anchorHem(undershirt);
  const collar=mesh(rig.torso,new THREE.TorusGeometry(.059,.006,8,32),tee,0,.467,0);collar.rotation.x=Math.PI/2;
  collar.name='Red crew-neck binding';
  const overshirt=garmentUV(garment(rig.torso,[
    [-.118,.184,.129],[-.06,.186,.131],[.05,.184,.129],[.20,.183,.125],
    [.34,.192,.116],[.40,.191,.108],[.442,.14,.087],[.47,.066,.062],
  ],shirt,1,.014,48,y=>.30+.30*THREE.MathUtils.smoothstep(y,.20,.44)),.47,-.118);
  overshirt.name='Aaron open plaid overshirt';anchorHem(overshirt);
  for(const side of [-1,1]){
    const p=[side*.037,.467,.051,side*.11,.412,.094,side*.077,.351,.129,side*.042,.424,.089];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([.1,.9,.23,.8,.18,.68,.11,.81],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    mesh(rig.torso,g,shirt).name='Folded plaid collar';
    const positions=[],uv=[],indices=[];
    for(let j=0;j<=4;j++)for(let i=0;i<=6;i++){
      const x=side*(.075+i/6*.083),y=.16+j/4*.118;
      const z=.127*Math.sqrt(Math.max(0,1-(x/.184)**2))+.006+Math.sin(i/6*Math.PI)*.003;
      positions.push(x,y,z);uv.push(.07+i/6*.11,.46+j/4*.2);
      if(i&&j){const b=j*7+i,a=b-7;if(side===1)indices.push(a-1,a,b-1,a,b,b-1);else indices.push(a-1,b-1,a,a,b-1,b);}
    }
    const pocket=new THREE.BufferGeometry();pocket.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));pocket.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));pocket.setIndex(indices);pocket.computeVertexNormals();
    const patch=mesh(rig.torso,pocket,shirt);patch.name='Plaid chest pocket';anchorHem(patch);
  }
}

export function addAaronBeard(rig,headSurface,rings) {
  const profile=new THREE.CatmullRomCurve3(rings.map(r=>new THREE.Vector3(r[0],r[1],r[2])),false,'catmullrom',.25);
  const coverage=(height,angle)=>{
    const front=Math.sin(angle),side=Math.abs(Math.cos(angle)),top=.088+.044*side;
    let value=THREE.MathUtils.smoothstep(height,.018,.036)*(1-THREE.MathUtils.smoothstep(height,top-.012,top+.004))*THREE.MathUtils.smoothstep(front,-.30,.08);
    const sideburn=Math.exp(-(((front-.1)/.24)**2))*THREE.MathUtils.smoothstep(height,.09,.12)*(1-THREE.MathUtils.smoothstep(height,.15,.165));
    const moustache=Math.exp(-(((height-.094)/.0065)**4))*Math.max(0,front)**18;
    const lips=Math.exp(-(((height-.080)/.006)**4))*Math.max(0,front)**32;
    return THREE.MathUtils.clamp(Math.max(value,sideburn,moustache)*(1-lips),0,1);
  };
  const map=canvasMap((c,s,rng)=>{
    const pixels=c.createImageData(s,s);
    for(let y=0;y<s;y++){
      const height=profile.getPoint(1-y/(s-1)).x;
      for(let x=0;x<s;x++){
        const angle=x/s*Math.PI*2,amount=coverage(height,angle),strand=rng(),i=(y*s+x)*4;
        const gray=strand>.6?148+rng()*69:52+rng()*55;
        pixels.data[i]=gray;pixels.data[i+1]=gray*.98;pixels.data[i+2]=gray*.90;
        pixels.data[i+3]=amount*255*(.55+strand*.45);
      }
    }
    c.putImageData(pixels,0,0);
  },1024);
  const material=new THREE.MeshStandardMaterial({map,color:map?0xffffff:0x77766f,roughness:.95,alphaTest:.38,side:THREE.DoubleSide});
  material.name='Salt and pepper beard fibers';
  const geometry=headSurface.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
  for(let i=0;i<p.count;i++){
    const h=p.getY(i)-.5,a=geometry.attributes.uv.getX(i)*Math.PI*2,depth=.0006+coverage(h,a)*(.0035+.003*Math.exp(-(((h-.05)/.03)**2)));
    p.setXYZ(i,p.getX(i)+n.getX(i)*depth,p.getY(i)+n.getY(i)*depth,p.getZ(i)+n.getZ(i)*depth);
  }
  const beard=new THREE.SkinnedMesh(geometry,material);beard.name='Aaron salt and pepper full stubble';beard.frustumCulled=false;
  beard.castShadow=beard.receiveShadow=true;rig.torso.add(beard);beard.bind(headSurface.skeleton,headSurface.bindMatrix);
  if(!map)beard.visible=false;
}

function rectangle(w,h,r) {
  const p=new THREE.Shape();p.moveTo(-w/2+r,-h/2);p.lineTo(w/2-r,-h/2);p.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
  p.lineTo(w/2,h/2-r);p.quadraticCurveTo(w/2,h/2,w/2-r,h/2);p.lineTo(-w/2+r,h/2);p.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
  p.lineTo(-w/2,-h/2+r);p.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return p;
}

export function addAaronGlasses(head) {
  const frame=new THREE.MeshStandardMaterial({color:0x161a18,roughness:.48});frame.name='Black acetate glasses';
  const lens=new THREE.MeshStandardMaterial({color:0xc5d3c4,roughness:.16,metalness:.12,transparent:true,opacity:.12,depthWrite:false});
  lens.name='Clear glasses lenses';
  const add=(geometry,material,name)=>{const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=material===frame;m.receiveShadow=true;head.add(m);return m;};
  const tube=(points,radius,name)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,radius,6,false),frame,name);
  for(const side of [-1,1]){
    const outer=rectangle(.066,.043,.009);outer.holes.push(new THREE.Path(rectangle(.055,.033,.007).getPoints(6).reverse()));
    const geometry=new THREE.ExtrudeGeometry(outer,{depth:.0032,bevelEnabled:false,curveSegments:5});geometry.translate(0,0,-.0016);
    const rim=add(geometry,frame,'Aaron rectangular eyeglass rim');rim.position.set(side*.036,.142,.091);
    const glass=add(new THREE.ShapeGeometry(rectangle(.055,.033,.007),5),lens,'Clear eyeglass lens');glass.position.copy(rim.position);glass.position.z+=.0003;
    tube([[side*.068,.15,.09],[side*.083,.151,.057],[side*.086,.146,-.008],[side*.085,.134,-.022]],.0023,'Black eyeglass temple');
  }
  tube([[-.008,.147,.093],[0,.151,.097],[.008,.147,.093]],.0024,'Eyeglass bridge');
}

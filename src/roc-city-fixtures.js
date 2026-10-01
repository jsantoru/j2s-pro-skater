// Authored-space furniture shared by the rendered park and its colliders.
// The level group's horizontal scale applies to these records exactly once.
import { ROC_CITY_LAYOUT } from './roc-city-layout.js';

/** Transform a bench-local point with the same Y rotation as a Three mesh. */
export function fixturePoint(fixture, point) {
  const [x,y,z]=point, [px,py,pz]=fixture.position;
  const c=Math.cos(fixture.rotationY),s=Math.sin(fixture.rotationY);
  return [px+c*x+s*z,py+y,pz-s*x+c*z];
}

function benchBoxes() {
  const boxes=[];
  const add=(id,size,position,material='frame')=>boxes.push({id,size,position,material});
  for(const [i,x] of [-.82,.82].entries()) {
    // Four planted feet carry two side frames; neither frame floats under a slat.
    for(const [j,z] of [-.25,.25].entries()) {
      add(`foot-${i}-${j}`,[.20,.035,.18],[x,.0175,z]);
      add(`leg-${i}-${j}`,[.065,.395,.065],[x,.2325,z]);
    }
    add(`frame-seat-${i}`,[.09,.075,.73],[x,.4375,0]);
    add(`frame-back-${i}`,[.065,.685,.065],[x,.7425,.31]);
  }
  add('frame-crossbar',[1.70,.06,.06],[0,.41,0]);
  for(const [i,z] of [-.255,-.085,.085,.255].entries())
    add(`seat-${i}`,[2.15,.07,.13],[0,.49,z],'slat');
  for(const [i,y] of [.84,1.035].entries())
    add(`back-${i}`,[2.15,.12,.065],[0,y,.35],'slat');
  return boxes;
}

function insetPath(points,inset) {
  const normals=points.slice(1).map(([x,z],i)=>{
    const dx=x-points[i][0],dz=z-points[i][1],length=Math.hypot(dx,dz);
    return [dz/length,-dx/length];
  });
  return points.map(([x,z],i)=>{
    const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)];
    // Intersect neighboring offset edges so corner feet stay entirely on deck.
    const denominator=1+a[0]*b[0]+a[1]*b[1];
    return [x+inset*(a[0]+b[0])/denominator,z+inset*(a[1]+b[1])/denominator];
  });
}

function railingPath(id,points,baseY,height) {
  const postSpacing=1.9;
  const rails=[],posts=[];
  for(let i=1;i<points.length;i++) {
    const [ax,az]=points[i-1],[bx,bz]=points[i];
    for(const [j,dy] of [.18,.55,height].entries())
      rails.push({id:`rail-${i-1}-${j}`,a:[ax,baseY+dy,az],b:[bx,baseY+dy,bz],radius:.023});
    const count=Math.ceil(Math.hypot(bx-ax,bz-az)/postSpacing);
    for(let j=i===1?0:1;j<=count;j++) {
      const t=j/count;
      // Finish below the top tube's crest so a grind crosses every post cleanly.
      posts.push({id:`post-${posts.length}`,position:[ax+(bx-ax)*t,baseY,az+(bz-az)*t],height,radius:.03,footSize:[.11,.035,.11]});
    }
  }
  return {id,points,baseY,height,postSpacing,rails,posts};
}

function westRailing(layout) {
  // Walk only the outer west boundary, leaving the northern access apron and
  // the southern secondary entry open. These vertices are the actual deck edge.
  const innerLimit=Math.min(...layout.mini.opening.map(point=>point[0]));
  const edge=layout.westDeck.filter(([x,z])=>x<innerLimit && z>=layout.mini.center[1]-1e-6 && z<layout.features.A.secondEntry[2])
    .map(point=>[...point]).sort((a,b)=>a[1]-b[1]);
  return railingPath('west-deck-railing',insetPath(edge,.12),layout.westDeckY,.95);
}

export function createEnvironmentRailings(layout=ROC_CITY_LAYOUT) {
  return [
    railingPath('river-boundary-railing',[[-40.8,-82],[-40.8,78]],.26,1.07),
    railingPath('underbridge-chainlink',[[3.9,layout.bridge.minZ],[3.9,layout.bridge.maxZ]],layout.bridge.floorY,1.95),
    railingPath('north-entry-railing',[[6,-42],[11.7,-38],[15.6,-32]],-.035,1),
    railingPath('east-street-railing',[[15.6,-17],[15.6,17]],-.035,1),
  ];
}

export function createRocCityFixtures(layout=ROC_CITY_LAYOUT) {
  const boxes=benchBoxes();
  const west=westRailing(layout);
  // This raised run belongs on the flower plateau, not the lower grass beyond
  // it. Stop before the seven-stair opening; leave ground-level exterior rails.
  const eastX=layout.bounds.maxX-.12;
  const east=railingPath('east-flower-railing',[[eastX,-31],[eastX,-20.5]],layout.flower.y,1);
  return {
    westRailing:west,
    railings:[west,east,...createEnvironmentRailings(layout)],
    benches:[
      {id:'north-entry-bench',position:[7.9,-.035,-44.3],rotationY:0,width:2.15,depth:.77,height:1.095,boxes},
      // The old position straddled the Riverway trail. This paved apron leaves
      // room around the secondary entry and keeps every foot on one grade.
      {id:'south-entry-bench',position:[-7,0,13.7],rotationY:-.55,width:2.15,depth:.77,height:1.095,boxes},
    ],
  };
}

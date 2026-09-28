// Phase 1 landmarks traced from ROC City Skatepark's published A–L feature map.
// Distances are playable estimates, not surveyed construction dimensions.
// +X is east, +Z is south; the north entry is at the negative-Z end.
export const ROC_CITY_LAYOUT = Object.freeze({
  bounds: Object.freeze({ minX: -19, maxX: 15, minZ: -48, maxZ: 54 }),
  perimeter: [[-2,-48],[5,-48],[6,-41],[11,-38],[15,-32],[15,54],[5,54],[5,22],[3,17],[-4,13],[-13,8],[-18,-4],[-19,-15],[-17,-27],[-11,-35],[-5,-41]],
  mainPerimeter: [[-2,-48],[5,-48],[6,-41],[11,-38],[15,-32],[15,19],[5,19],[3,17],[-4,13],[-13,8],[-18,-4],[-19,-15],[-17,-27],[-11,-35],[-5,-41]],
  westDeck: [[-16.8,-27.5],[-12,-32],[3,-32],[3,3],[-3,7.8],[-12.5,5.8],[-17.6,-4],[-18.5,-15]],
  westDeckY: 1.62,
  flower: Object.freeze({ x: 10, y: 1.26, z: -25 }),
  bridge: Object.freeze({ minZ: 25, maxZ: 55, floorY: -.9 }),
  trail: [[-6,-48],[-10,-40],[-17,-31],[-22,-18],[-22,-5],[-18,9],[-7,18],[3,24],[1,54]],
  features: Object.freeze({
    A: { name: 'Skate Park Entry', position: [2,0,-44], secondEntry: [-10,0,11] },
    B: { name: 'Bowl Area Entry / Mini-Ramp', position: [1.5,0,-35] },
    C: { name: 'Top Deck', position: [1,1.62,-16] },
    D: { name: 'Multi-Depth Bowl with Pool Coping', position: [-8,-.8,-15] },
    E: { name: '7-Stair with Handrails, Hubba Ledge, and Bank', position: [10,0,-18.6], steps: 7 },
    F: { name: 'Grind Ledge', position: [-17,1.62,-6] },
    G: { name: '9-Stair with Handrail and Hubba Ledges', position: [-5.8,.81,9.2], steps: 9 },
    H: { name: 'A-Frame with Ledge, Rail, and Quarter Pipe Hip', position: [11,0,1] },
    I: { name: 'Mellow Bank with Rail and Hubba Ledges', position: [10,-.45,21.5] },
    J: { name: 'Flat Rail', position: [8,-.15,34] },
    K: { name: 'Manual Pad / Flat Ledge', position: [13,-.42,35] },
    L: { name: 'Quarter Pipe with Extension', position: [10,1.4,50.2] },
  }),
});

export const ROC_PICKUPS = Object.freeze([
  { id:'letter-s', goalId:'skate', type:'letter', label:'S', position:[2,.95,-40], surfaceY:0, hint:'Roll in from the north entrance.' },
  { id:'letter-k', goalId:'skate', type:'letter', label:'K', position:[10,2.21,-25], surfaceY:1.26, hint:'Take the bank onto the flower deck.' },
  { id:'letter-a', goalId:'skate', type:'letter', label:'A', position:[9,.95,-10], surfaceY:0, hint:'Continue beyond the seven stairs.' },
  { id:'letter-t', goalId:'skate', type:'letter', label:'T', position:[1,2.57,1], surfaceY:1.62, hint:'Climb the long bank beside the bowl.' },
  { id:'letter-e', goalId:'skate', type:'letter', label:'E', position:[8,.05,43], surfaceY:-.9, hint:'Follow the promenade beneath the bridge.' },
  { id:'cap-1', goalId:'caps', type:'cap', label:'1', position:[-7,2.57,-30], surfaceY:1.62, hint:'Near the north bowl deck.' },
  { id:'cap-2', goalId:'caps', type:'cap', label:'2', position:[-16.6,2.57,-7], surfaceY:1.62, hint:'Follow the western pool deck.' },
  { id:'cap-3', goalId:'caps', type:'cap', label:'3', position:[7,.95,6], surfaceY:0, hint:'Beside the A-frame.' },
  { id:'cap-4', goalId:'caps', type:'cap', label:'4', position:[13,.53,35], surfaceY:-.42, hint:'Ollie onto the blue-edged manual pad.' },
  { id:'cap-5', goalId:'caps', type:'cap', label:'5', position:[8,.05,46], surfaceY:-.9, hint:'At the approach to the bridge quarter pipe.' },
  { id:'secret-tape', goalId:'tape', type:'tape', label:'SECRET', position:[7.5,2.35,51], surfaceY:1.4, hint:'Air onto the lower quarter-pipe deck beneath the bridge.' },
].map(p=>Object.freeze({ ...p, radius:1.05, position:Object.freeze(p.position) })));

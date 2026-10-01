// Reconstructed from the Town's completed-park aerial (Grand Opening 33) and
// ground photographs 35/36 and skatepark-1/2/3. Dimensions are playable estimates,
// not construction measurements. The published skating area is 13,500 sq ft.
// Coordinate frame follows the aerial: +X photo-right, +Z toward the entrance.
// Geometry, scenery and pickup routing share this unscaled metre-space plan.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const PERINTON_LAYOUT = freeze({
  bounds: { minX: -22, maxX: 22, minZ: -21, maxZ: 19 },
  publishedArea: { squareFeet: 13500, squareMetres: 1254.19 },
  spawn: { position: [-5, 0, 13], heading: [0, 0, -1] },
  mainOutline: [[-22,-7],[-11,-7],[-10,-5],[17,-5],[17,-15],[19,-17],[21,-13],[22,-7],[22,14],[7,14],[7,19],[-7,19],[-7,14],[-22,14]],
  turfOutline: [[-18,-17.8],[-12,-17.8],[0,-17.8],[16.8,-17.8],[18,-15],[18.1,-11],[17,-5],[-10,-5],[-10,-7],[-6,-9],[-6,-12],[-9,-14],[-18,-14],[-20,-16]],
  bowl: {
    // Photo33's bowl/plaza proportions support a longer pocket than the first
    // estimate: these X coordinates are +20% about x=9. Z, depths and physical
    // transition runs stay unchanged; this is not a whole-park scale factor.
    rimY: 0, deep: 1.8, shallow: 1.25, blend: [7.8, 11.4],
    outline: [[2.52,-13.8],[3.6,-15],[7.68,-15],[9.6,-14.1],[10.32,-13.75],[12.72,-14.1],[15.24,-13.1],[16.2,-11.2],[15.72,-8.9],[13.68,-7.7],[11.16,-7.8],[9.96,-8.25],[8.52,-7.35],[5.16,-7.1],[2.76,-8.1],[2.04,-10.4]],
    deck: [[1.2,-14.4],[2.64,-16],[8.16,-16],[10.08,-15.15],[11.4,-15.1],[14.04,-15],[16.68,-13.6],[17.64,-11.2],[17.04,-8.1],[14.4,-6.5],[11.04,-6.6],[9.72,-7],[8.88,-6.3],[4.44,-6],[1.44,-7.3],[.6,-10.6]],
  },
  pump: {
    width: 2.15, bermHeight: 1.05, segments: 480,
    // An open ribbon: both ends meet the plaza, and the western return bends
    // back on itself before the long roller straight. It is not a closed oval.
    path: [[-17,-7],[-14,-8],[-9,-9.5],[-7.5,-11],[-8,-12.6],[-11,-13.1],[-15,-13.1],[-18,-13.4],[-20,-15.2],[-20.1,-17.6],[-18,-19],[-13,-19],[0,-19],[12,-19],[17.4,-19],[19.8,-17.4],[20,-14.5],[19.5,-11],[19,-7]],
    rollers: [{ start: 12, end: 24, count: 3, height: .33 }, { start: 34, end: 68, count: 8, height: .38 }],
  },
  centralTransition: { minX: -10, maxX: 0, minZ: -5, maxZ: 6.6, lipX: -1.4, backLipZ: -3.6, frontLipZ: 2.8, height: 1.2, radius: 1.35 },
  platform: { minX: 0, maxX: 8, minZ: -4, maxZ: 3, height: .68, bankRun: 3.0 },
  // The unobstructed visitor photo04 resolves the aerial's foreshortened steps:
  // two-flat-two, with a longer middle landing, not a three-stair.
  stairs: { start: [8,0,-1.9], direction: [1,0], width: 2.6, count: 4, rise: .17, treads: [.45,1.125,.45], feature: 'two-flat-two' },
  features: {
    entry: { name: 'Entry plaza', position: [0,0,15] },
    bowl: { name: 'Two-depth bowl', position: [8.76,-1.6,-11] },
    pump: { name: 'Rollers and banked turns', position: [0,.25,-19] },
    flow: { name: 'Inverted-C transition deck', position: [-1.4,1.2,0] },
    stairs: { name: 'Two-flat-two stair and bank', position: [9,.34,-1.9] },
    bank: { name: 'Bank and kinked handrail', position: [9.5,.3,1.7] },
    aFrame: { name: 'Peaked bank and kinked rail', position: [10.1,.5,5.4] },
    flatbar: { name: 'Flatbar', position: [4,.56,10] },
    manual: { name: 'Low manual pad', position: [-5.5,.24,7.1] },
    westQuarter: { name: 'West quarter pipe', position: [-20.3,1.3,2] },
    eastQuarter: { name: 'East quarter pipe and extensions', position: [20.3,1.3,2] },
  },
  // Scenery may place objects outside this paved footprint; the green island
  // remains clear, with no invented trees or obstacles in the pump/bowl lines.
  walkways: { frontZ: 21.5, eastX: 25 },
});

export const PERINTON_PICKUPS = freeze([
  { id:'letter-s',goalId:'skate',type:'letter',label:'S',position:[-5,.95,12],surfaceY:0,hint:'Start in the entry plaza.' },
  { id:'letter-k',goalId:'skate',type:'letter',label:'K',position:[-15,.95,3],surfaceY:0,hint:'Follow the open line beside the western quarter pipe.' },
  { id:'letter-a',goalId:'skate',type:'letter',label:'A',position:[0,.91,-7],surfaceY:-.04,hint:'Pass the curved transition deck on the bowl side.' },
  { id:'letter-t',goalId:'skate',type:'letter',label:'T',position:[17.8,.95,-10],surfaceY:0,hint:'Follow the outer bowl deck toward the pump track.' },
  { id:'letter-e',goalId:'skate',type:'letter',label:'E',position:[15,.95,8],surfaceY:0,hint:'Return past the stair and bank.' },
  { id:'cap-1',goalId:'caps',type:'cap',label:'1',position:[-16,.95,10],surfaceY:0,hint:'Near the western entry quarter.' },
  { id:'cap-2',goalId:'caps',type:'cap',label:'2',position:[-16,.95,-7],surfaceY:0,hint:'At the western pump-track entrance.' },
  { id:'cap-3',goalId:'caps',type:'cap',label:'3',position:[5.4,-.85,-11],surfaceY:-1.8,hint:'Drop into the larger bowl pocket.' },
  { id:'cap-4',goalId:'caps',type:'cap',label:'4',position:[4,1.63,-1],surfaceY:.68,hint:'Climb the central street platform.' },
  { id:'cap-5',goalId:'caps',type:'cap',label:'5',position:[15,.95,2],surfaceY:0,hint:'Beside the eastern quarter wall.' },
  { id:'secret-tape',goalId:'tape',type:'tape',label:'SECRET',position:[-.65,2.15,-2],surfaceY:1.2,hint:'Air onto the raised spine of the curved transition deck.' },
].map(pickup=>({...pickup,radius:1.05})));

// Only real, playable spots belong in this list. Future locations are a quiet
// presentation teaser, not fake locked levels or invented unlock requirements.
export const LEVELS = Object.freeze([
  Object.freeze({
    id: 'genesee-warehouse',
    title: 'Genesee Warehouse',
    order: 1,
    location: 'Rochester, New York',
    goalCount: 7,
    playable: true,
    thumbnail: '/textures/levels/genesee-warehouse.webp',
    description: 'Old brick. New lines. Make the warehouse yours.',
    titleLines: ['GENESEE', 'WAREHOUSE'],
    locationDetail: 'GENESEE BREWING CO. / EST. 1878',
    noun: 'warehouse',
    eyebrow: 'CLOCK IN. DROP IN.',
    tips: {
      tape: 'Take the bank to the raised loading deck. Look for the pink tape above the platform.',
    },
  }),
  Object.freeze({
    id: 'roc-city-skatepark',
    title: 'ROC City Skatepark',
    order: 2,
    location: 'Rochester Riverway',
    goalCount: 7,
    playable: true,
    thumbnail: '/textures/levels/roc-city-skatepark.webp',
    description: 'Concrete curves. Riverway lines. Take it outside.',
    titleLines: ['ROC CITY', 'SKATEPARK'],
    locationDetail: 'GENESEE RIVERWAY / SOUTH AVENUE',
    noun: 'park',
    eyebrow: 'FRESH AIR. FRESH LINES.',
    tips: {
      'sick-score': 'Link the bowl, the street section, and the bridge promenade. Find a line that keeps your multiplier moving.',
      skate: 'Follow the amber letters from the bowl to the bridge. Collect all five in a single run, in any order.',
      caps: 'Five Genesee bottle caps are scattered around the park. Follow their teal halos and collect every design.',
      tape: 'Air onto the lower quarter-pipe deck beneath the bridge. The pink tape waits above the deck.',
    },
  }),
]);

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
  }),
]);

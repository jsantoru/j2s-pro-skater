// Character choice is cosmetic and separate from the careers saved for each park.
export const DEFAULT_CHARACTER_ID = 'joe';
export const CHARACTER_STORAGE_KEY = 'j2s-pro-skater.character.v1';
export const CHARACTERS = Object.freeze([
  Object.freeze({ id: 'joe', name: 'Joe', affiliation: 'J2S', order: 1,
    description: 'The original. Black hoodie, home turf.', accent: '#d7fb58',
    portrait: '/textures/characters/joe.webp', placeholder: false }),
  Object.freeze({ id: 'aaron', name: 'Aaron', affiliation: 'KRUDCO', order: 2,
    description: 'Olive cap. Plaid shirt. Rochester roots.', accent: '#e9a566',
    portrait: '/textures/characters/aaron.webp', placeholder: true }),
]);

export function getCharacter(id) {
  return CHARACTERS.find(character => character.id === id) || CHARACTERS[0];
}

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export class CharacterSelection {
  constructor(storage) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    this.id = DEFAULT_CHARACTER_ID;
    try {
      const data = JSON.parse(this.storage?.getItem(CHARACTER_STORAGE_KEY) || 'null');
      if (data?.version === 1) this.id = getCharacter(data.characterId).id;
    } catch { /* A blocked or malformed store keeps the default skater usable. */ }
  }

  select(id) {
    if (!CHARACTERS.some(character => character.id === id)) return this.id;
    this.id = id;
    try {
      this.storage?.setItem(CHARACTER_STORAGE_KEY, JSON.stringify({ version: 1, characterId: id }));
    } catch { /* The selected skater still works for this visit if saving is blocked. */ }
    return this.id;
  }
}

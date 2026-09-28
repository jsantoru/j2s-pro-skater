// Cosmetic selection persistence must remain separate from either park career.
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_CHARACTER_ID, CHARACTER_STORAGE_KEY, getCharacter, CharacterSelection } from '../src/characters.js';
import { LEVEL_GOAL_CONFIGS } from '../src/level-goals.js';

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS: ' + name); }
function store(initial = null) {
  const values = new Map(initial === null ? [] : [[CHARACTER_STORAGE_KEY, initial]]), writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push([key, value]); values.set(key, value); } };
}

test('The catalog has stable unique identities and Joe remains the default', () => {
  assert.deepEqual(CHARACTERS.map(c => c.id), ['joe', 'aaron']);
  assert.equal(DEFAULT_CHARACTER_ID, 'joe');
  assert.equal(getCharacter('aaron').affiliation, 'KRUDCO');
  for (const value of ['missing', '__proto__', '', null, undefined, 0, {}]) assert.equal(getCharacter(value).id, 'joe');
});

test('Selection round-trips without touching existing careers or high scores', () => {
  const storage = store();
  const untouched = Object.values(LEVEL_GOAL_CONFIGS).flatMap(config => [config.progressKey, config.highScoresKey]);
  for (const key of untouched) storage.values.set(key, 'existing career fixture');
  const selection = new CharacterSelection(storage);
  assert.equal(selection.id, 'joe'); assert.equal(storage.writes.length, 0);
  assert.equal(selection.select('aaron'), 'aaron');
  assert.equal(new CharacterSelection(storage).id, 'aaron');
  assert.deepEqual(JSON.parse(storage.getItem(CHARACTER_STORAGE_KEY)), { version: 1, characterId: 'aaron' });
  assert(storage.writes.every(([key]) => key === CHARACTER_STORAGE_KEY));
  for (const key of untouched) assert.equal(storage.getItem(key), 'existing career fixture');
});

test('Unknown selections preserve the last valid choice and do not write storage', () => {
  const storage = store(), selection = new CharacterSelection(storage);
  selection.select('aaron'); const count = storage.writes.length;
  for (const id of ['removed-skater', '__proto__', '', null, undefined, { id: 'joe' }]) {
    assert.equal(selection.select(id), 'aaron'); assert.equal(selection.id, 'aaron');
  }
  assert.equal(storage.writes.length, count);
});

test('Malformed, obsolete, and unknown saved data safely fall back without overwriting it', () => {
  for (const saved of ['{', 'null', 'false', '42', '[]', '{}', '"aaron"', '{"version":2,"characterId":"aaron"}', '{"version":1,"characterId":"removed"}', '{"version":1,"characterId":{"id":"aaron"}}']) {
    const storage = store(saved), selection = new CharacterSelection(storage);
    assert.equal(selection.id, 'joe', saved); assert.equal(storage.writes.length, 0);
    assert.equal(storage.getItem(CHARACTER_STORAGE_KEY), saved);
  }
});

test('Blocked reads, blocked writes, and absent storage retain usable in-memory selection', () => {
  for (const storage of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, { getItem: () => null, setItem() { throw new Error('full'); } }]) {
    const selection = new CharacterSelection(storage);
    assert.equal(selection.id, 'joe'); assert.equal(selection.select('aaron'), 'aaron'); assert.equal(selection.id, 'aaron');
    assert.equal(selection.select('joe'), 'joe');
  }
});

test('A denied global localStorage getter still boots Joe and permits a session choice', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Denied'); } });
  try { const selection = new CharacterSelection(); assert.equal(selection.id, 'joe'); assert.equal(selection.select('aaron'), 'aaron'); }
  finally { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage; }
});

console.log(`${passed}/${passed} character catalog checks passed.`);

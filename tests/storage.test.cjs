const test = require('node:test');
const assert = require('node:assert/strict');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;
require('../storage/a2-idb.js');
const db = global.A2IndexedDB;

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

test('writes and reads structured records including nested photo payloads', async () => {
  const value = [{ id: 'os-1', photos: [{ data: 'data:image/jpeg;base64,AAAA', checklist: { seat: true } }] }];
  await db.set('a2orders-test', value);
  assert.deepEqual(await db.get('a2orders-test'), value);
});

test('migration copies every category and setting and verifies read-back', async () => {
  const keys = ['a2clients-test', 'a2orders-test'];
  const settings = ['a2pix-test'];
  const source = memoryStorage({
    'a2clients-test': JSON.stringify([{ id: 'c1' }]),
    'a2orders-test': JSON.stringify([{ id: 'o1', photos: ['data:image/png;base64,BBBB'] }]),
    'a2pix-test': 'chave-pix'
  });
  const before = source.snapshot();
  const result = await db.migrateFromLocalStorage(source, keys, settings);
  assert.equal(result.verified, true);
  assert.equal(result.records, 2);
  assert.deepEqual(source.snapshot(), before, 'legacy source must remain untouched');
  assert.deepEqual(await db.get('a2orders-test'), [{ id: 'o1', photos: ['data:image/png;base64,BBBB'] }]);
  assert.equal(await db.get('a2pix-test'), 'chave-pix');
});

test('invalid legacy JSON aborts before any source deletion', async () => {
  const source = memoryStorage({ 'a2clients-bad': '{invalid', 'a2orders-good': '[]' });
  const before = source.snapshot();
  await assert.rejects(() => db.migrateFromLocalStorage(source, ['a2clients-bad', 'a2orders-good'], []), /Dado antigo inválido/);
  assert.deepEqual(source.snapshot(), before);
});

test('atomic replacement exposes all new values after commit', async () => {
  await db.replaceAllAtomic({ alpha: [{ n: 1 }], beta: [{ n: 2 }] }, { setting: 'ok' });
  assert.deepEqual(await db.getMany(['alpha', 'beta', 'setting']), { alpha: [{ n: 1 }], beta: [{ n: 2 }], setting: 'ok' });
});

test('missing keys return null rather than throwing', async () => {
  assert.equal(await db.get('not-present'), null);
});

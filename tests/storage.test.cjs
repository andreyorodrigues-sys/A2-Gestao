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

const A2_KEYS = ['a2clients','a2vehicles','a2services','a2budgets','a2agenda','a2orders','a2history','a2receivables','a2payments','a2transactions','a2crmActivities','a2maintenance','a2payables','a2recurring','a2serviceCosts','a2accounts','a2goals','a2inventory','a2stockMoves','a2approvals'];
const A2_SETTING_KEYS = ['a2templates','a2pix','a2RevenuePeriod','a2RevenueStart','a2RevenueEnd','a2RevenueHidden','a2GoogleReviewUrl'];

test('full A2 V9 fixture migrates 20 categories, 7 settings and inspection photos', async () => {
  const seed = {};
  for (const key of A2_KEYS) seed[key] = JSON.stringify([]);
  for (const key of A2_SETTING_KEYS) seed[key] = 'setting:' + key;
  seed.a2clients = JSON.stringify([{ id: 'client-1', name: 'Cliente teste' }]);
  seed.a2orders = JSON.stringify([{ id: 'os-1', inspectionStart: { photos: [{ data: 'data:image/jpeg;base64,PHOTO_A2' }] } }]);
  seed.a2inventory = JSON.stringify([{ id: 'stock-1', quantity: 3 }]);
  const source = memoryStorage(seed);
  const before = source.snapshot();
  const result = await db.migrateFromLocalStorage(source, A2_KEYS, A2_SETTING_KEYS);
  assert.deepEqual(result, { categories: 20, settings: 7, records: 3, verified: true });
  assert.deepEqual(source.snapshot(), before, 'all original localStorage entries must remain untouched');
  const restored = await db.getMany([...A2_KEYS, ...A2_SETTING_KEYS]);
  assert.equal(restored.a2orders[0].inspectionStart.photos[0].data, 'data:image/jpeg;base64,PHOTO_A2');
  assert.equal(restored.a2inventory[0].quantity, 3);
  for (const key of A2_SETTING_KEYS) assert.equal(restored[key], 'setting:' + key);
});

test('failed atomic replacement leaves the previous IndexedDB state intact', async () => {
  await db.replaceAllAtomic({ keep: [{ id: 'old' }] }, { pref: 'old-setting' });
  await assert.rejects(
    () => db.replaceAllAtomic({ keep: [{ id: 'new' }], invalid: [() => 'not cloneable'] }, { pref: 'new-setting' })
  );
  assert.deepEqual(await db.getMany(['keep', 'pref']), { keep: [{ id: 'old' }], pref: 'old-setting' });
});

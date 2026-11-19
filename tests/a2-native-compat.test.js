import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2NativeStorage } from '../src/storage/a2-native-compat.js';

function emptySnapshot() {
  return {
    data: {
      a2clients: [], a2vehicles: [], a2services: [], a2budgets: [], a2agenda: [],
      a2orders: [], a2history: [], a2receivables: [], a2payments: [], a2transactions: [],
      a2crmActivities: [], a2maintenance: [], a2payables: [], a2recurring: [],
      a2serviceCosts: [], a2accounts: [], a2goals: [], a2inventory: [], a2stockMoves: [],
      a2approvals: []
    },
    settings: {}
  };
}

test('compatibilidade Storage mantém leitura síncrona e só limpa dirty após flush confirmado', async () => {
  const writes = [];
  const storage = createA2NativeStorage(emptySnapshot(), async (snapshot) => writes.push(snapshot));

  assert.equal(storage.getItem('a2clients'), '[]');
  assert.equal(storage.getItem('ausente'), null);
  assert.equal(storage.dirty, false);

  storage.setItem('a2clients', JSON.stringify([{ id: 'c1', name: 'Cliente' }]));
  storage.setItem('a2pix', 'chave-pix');
  assert.equal(storage.dirty, true);
  assert.equal(storage.getItem('a2pix'), 'chave-pix');

  const result = await storage.flush();
  assert.deepEqual(result, { saved: true, revision: 2 });
  assert.equal(storage.dirty, false);
  assert.deepEqual(writes[0].data.a2clients, [{ id: 'c1', name: 'Cliente' }]);
  assert.equal(writes[0].settings.a2pix, 'chave-pix');
});

test('flush captura alterações feitas enquanto uma gravação SQLite está em andamento', async () => {
  const writes = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const storage = createA2NativeStorage(emptySnapshot(), async (snapshot) => {
    writes.push(snapshot);
    if (writes.length === 1) await firstGate;
  });

  storage.setItem('a2clients', JSON.stringify([{ id: 'c1' }]));
  const flushing = storage.flush();
  await Promise.resolve();
  storage.setItem('a2clients', JSON.stringify([{ id: 'c1' }, { id: 'c2' }]));
  releaseFirst();

  await flushing;
  assert.equal(writes.length, 2);
  assert.equal(writes[1].data.a2clients.length, 2);
  assert.equal(storage.dirty, false);
});

test('falha de persistência não é mascarada como gravação concluída', async () => {
  const storage = createA2NativeStorage(emptySnapshot(), async () => {
    throw new Error('SQLite indisponível');
  });
  storage.setItem('a2orders', JSON.stringify([{ id: 'os-1' }]));

  await assert.rejects(storage.flush(), /SQLite indisponível/);
  assert.equal(storage.dirty, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { A2_DATA_KEYS, A2_SETTING_KEYS, a2Checksum, validateA2Backup } from '../src/storage/a2-backup-format.js';

function makeBackup(version = 2) {
  const data = {};
  for (const key of A2_DATA_KEYS.slice(0, version === 2 ? 17 : 20)) data[key] = [];
  data.a2clients = [{ id: 'c1', name: 'Cliente de teste' }];
  data.a2orders = [{
    id: 'os1',
    inspectionStart: { photos: ['data:image/jpeg;base64,AAAA'], checks: [] },
    inspectionEnd: { photos: [], checks: [] }
  }];
  const settings = {};
  for (const key of A2_SETTING_KEYS) settings[key] = null;
  return {
    app: 'A2 Gestão',
    format: 'a2-backup',
    backupVersion: version,
    data,
    settings,
    manifest: {
      checksum: a2Checksum({ data, settings })
    }
  };
}

test('aceita backup legado V2 e acrescenta categorias V9 vazias', () => {
  const snapshot = validateA2Backup(makeBackup(2));
  assert.equal(snapshot.data.a2clients.length, 1);
  assert.deepEqual(snapshot.data.a2inventory, []);
  assert.equal(snapshot.totalRecords, 2);
  assert.equal(snapshot.photoReferences, 1);
  assert.equal(snapshot.integrityChecked, true);
});

test('aceita backup V3 com as 20 categorias', () => {
  const snapshot = validateA2Backup(makeBackup(3));
  assert.equal(snapshot.data.a2inventory.length, 0);
  assert.equal(snapshot.data.a2approvals.length, 0);
});

test('rejeita checksum alterado', () => {
  const backup = makeBackup(2);
  backup.data.a2clients[0].name = 'Dado alterado';
  assert.throws(() => validateA2Backup(backup), /integridade/);
});

test('rejeita categoria obrigatória ausente', () => {
  const backup = makeBackup(2);
  delete backup.data.a2orders;
  assert.throws(() => validateA2Backup(backup), /a2orders/);
});

test('rejeita registros que não são objetos', () => {
  const backup = makeBackup(2);
  backup.data.a2clients = ['registro inválido'];
  assert.throws(() => validateA2Backup(backup), /registros inválidos/);
});

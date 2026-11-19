import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeA2PhotoReference,
  parseA2DataUrl,
  parseA2PhotoReference,
  a2PhotoHash
} from '../src/storage/a2-photo-codec.js';
import { externalizeA2OrderPhotos, hydrateA2OrderPhotos } from '../src/storage/a2-photo-store.js';

test('interpreta data URL JPEG e normaliza base64', () => {
  assert.deepEqual(parseA2DataUrl('data:image/jpeg;base64,QUJD\nRA=='), {
    mimeType: 'image/jpeg',
    base64: 'QUJDRA=='
  });
  assert.equal(parseA2DataUrl('https://example.com/photo.jpg'), null);
});

test('gera referência privada validável e rejeita traversal', () => {
  const ref = makeA2PhotoReference('a2-photos/abc.jpg', 'image/jpeg');
  assert.deepEqual(parseA2PhotoReference(ref), { path: 'a2-photos/abc.jpg', mimeType: 'image/jpeg' });
  assert.equal(parseA2PhotoReference('a2photo://a2-photos%2F..%2Fsecret.jpg?mime=image%2Fjpeg'), null);
});

test('externaliza e recupera fotos sem alterar os demais dados', async () => {
  const source = {
    data: {
      a2orders: [{
        id: 'os-1',
        inspectionStart: { photos: ['data:image/jpeg;base64,QUJDRA=='], items: [{ note: 'capô', photos: [] }] },
        inspectionEnd: { photos: [], items: [] }
      }]
    },
    settings: { a2pix: 'chave' }
  };
  const files = new Map();
  const adapter = {
    async write(path, base64) { files.set(path, base64); },
    async read(path) { return files.get(path) || ''; }
  };
  const stored = await externalizeA2OrderPhotos(source, adapter);
  assert.equal(stored.converted, 1);
  assert.equal(stored.filesWritten, 1);
  const ref = stored.snapshot.data.a2orders[0].inspectionStart.photos[0];
  assert.ok(parseA2PhotoReference(ref));
  assert.equal(stored.snapshot.settings.a2pix, 'chave');
  const hydrated = await hydrateA2OrderPhotos(stored.snapshot, adapter);
  assert.equal(hydrated.resolved, 1);
  assert.equal(hydrated.snapshot.data.a2orders[0].inspectionStart.photos[0], 'data:image/jpeg;base64,QUJDRA==');
});

test('falha explicitamente quando o arquivo referenciado não existe', async () => {
  const snapshot = { data: { a2orders: [{ inspectionStart: { photos: [makeA2PhotoReference('a2-photos/missing.jpg', 'image/jpeg')] } }] } };
  await assert.rejects(() => hydrateA2OrderPhotos(snapshot, { read: async () => '' }), /Arquivo de foto ausente/);
});

test('hash é determinístico para deduplicação de arquivos', () => {
  assert.equal(a2PhotoHash('QUJD'), a2PhotoHash('QUJD'));
  assert.notEqual(a2PhotoHash('QUJD'), a2PhotoHash('QUJE'));
});

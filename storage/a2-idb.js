/* A2 Gestão — armazenamento IndexedDB isolado (não conectado ao app legado ainda).
 * Mantém valores estruturados, inclusive fotos/Base64, sem serialização manual.
 * A promoção do app para este backend só deve ocorrer após o bootstrap async ser integrado.
 */
(function (root) {
  'use strict';
  const DB_NAME = 'a2-gestao-local';
  const DB_VERSION = 1;
  const STORE = 'records';
  const META = 'meta';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB não está disponível neste navegador.'));
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco local.'));
      request.onblocked = () => reject(new Error('A atualização do banco está bloqueada por outra aba aberta.'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Transação cancelada.'));
      tx.onerror = () => reject(tx.error || new Error('Falha na transação.'));
    });
  }

  async function get(key) {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const done = txDone(tx);
      const value = await new Promise((resolve, reject) => {
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
        req.onerror = () => reject(req.error);
      });
      await done;
      return value;
    } finally { db.close(); }
  }

  async function set(key, value) {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const done = txDone(tx);
      tx.objectStore(STORE).put(value, key);
      await done;
    } finally { db.close(); }
  }

  async function remove(key) {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const done = txDone(tx);
      tx.objectStore(STORE).delete(key);
      await done;
    } finally { db.close(); }
  }

  async function getMany(keys) {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const done = txDone(tx);
      const store = tx.objectStore(STORE);
      const result = {};
      await Promise.all(keys.map(key => new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => { result[key] = req.result === undefined ? null : req.result; resolve(); };
        req.onerror = () => reject(req.error);
      })));
      await done;
      return result;
    } finally { db.close(); }
  }

  // Atomic replacement: either every key is replaced or none is.
  async function replaceAllAtomic(values, settings) {
    const db = await openDB();
    try {
      const tx = db.transaction([STORE, META], 'readwrite');
      const done = txDone(tx);
      const store = tx.objectStore(STORE);
      const meta = tx.objectStore(META);
      try {
        // Structured-clone failures can be thrown synchronously by put().
        // Abort the whole transaction so earlier queued writes cannot commit alone.
        for (const [key, value] of Object.entries(values || {})) store.put(value, key);
        for (const [key, value] of Object.entries(settings || {})) store.put(value, key);
        meta.put({ completedAt: new Date().toISOString(), keys: Object.keys(values || {}).length, settings: Object.keys(settings || {}).length }, 'lastAtomicReplace');
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        try { await done; } catch (_) {}
        throw error;
      }
      await done;
    } finally { db.close(); }
  }

  // Copies legacy values without deleting or modifying localStorage.
  // The caller must supply all expected keys and perform app-specific validation.
  async function migrateFromLocalStorage(storage, keys, settingKeys) {
    if (!storage) throw new Error('Armazenamento antigo indisponível.');
    const values = {}, settings = {};
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw === null) { values[key] = []; continue; }
      try { values[key] = JSON.parse(raw); }
      catch (_) { throw new Error('Dado antigo inválido: ' + key + '. A migração foi interrompida sem apagar a origem.'); }
      if (!Array.isArray(values[key])) throw new Error('Formato inválido na categoria ' + key + '.');
    }
    for (const key of settingKeys || []) settings[key] = storage.getItem(key);
    await replaceAllAtomic(values, settings);
    const check = await getMany([...keys, ...(settingKeys || [])]);
    for (const key of keys) {
      if (JSON.stringify(check[key]) !== JSON.stringify(values[key])) throw new Error('Conferência pós-migração falhou em ' + key + '. A origem foi preservada.');
    }
    for (const key of settingKeys || []) {
      if (check[key] !== settings[key]) throw new Error('Conferência pós-migração falhou em ' + key + '. A origem foi preservada.');
    }
    return { categories: keys.length, settings: (settingKeys || []).length, records: keys.reduce((n, key) => n + values[key].length, 0), verified: true };
  }

  root.A2IndexedDB = Object.freeze({ openDB, get, set, remove, getMany, replaceAllAtomic, migrateFromLocalStorage });
})(typeof window !== 'undefined' ? window : globalThis);

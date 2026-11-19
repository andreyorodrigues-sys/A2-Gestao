import { A2_DATA_KEYS, A2_SETTING_KEYS } from './a2-backup-format.js';
import { readA2NativeSnapshot, saveA2NativeSnapshot } from './a2-sqlite-store.js';

function serialize(value) {
  return value === null || value === undefined ? null : String(value);
}

function toStorageEntries(snapshot) {
  const entries = new Map();
  for (const key of A2_DATA_KEYS) {
    entries.set(key, JSON.stringify(snapshot?.data?.[key] || []));
  }
  for (const key of A2_SETTING_KEYS) {
    const value = snapshot?.settings?.[key];
    if (value !== null && value !== undefined) entries.set(key, String(value));
  }
  return entries;
}

function makeSnapshot(entries) {
  const data = {};
  for (const key of A2_DATA_KEYS) {
    const raw = entries.get(key);
    let parsed = [];
    if (raw !== null && raw !== undefined) {
      parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('A categoria ' + key + ' precisa ser uma lista.');
    }
    data[key] = parsed;
  }

  const settings = {};
  for (const key of A2_SETTING_KEYS) settings[key] = serialize(entries.get(key));
  return { data, settings };
}

/**
 * Synchronous Storage-compatible cache for the legacy UI.
 *
 * Writes are intentionally not reported as durable until flush() resolves.
 * The app bootstrap must await flush() after each saveAll() operation and
 * present success only after SQLite confirms the transaction.
 */
export function createA2NativeStorage(snapshot, persistSnapshot = saveA2NativeSnapshot) {
  const entries = toStorageEntries(snapshot);
  let revision = 0;
  let persistedRevision = 0;
  let flushPromise = null;

  const storage = {
    get length() {
      return entries.size;
    },
    key(index) {
      return [...entries.keys()][Number(index)] ?? null;
    },
    getItem(key) {
      const value = entries.get(String(key));
      return value === undefined ? null : value;
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
      revision += 1;
    },
    removeItem(key) {
      if (entries.delete(String(key))) revision += 1;
    },
    clear() {
      if (entries.size) {
        entries.clear();
        revision += 1;
      }
    },
    get dirty() {
      return revision !== persistedRevision;
    },
    async flush() {
      if (flushPromise) {
        await flushPromise;
        if (revision === persistedRevision) return { saved: true, revision: persistedRevision };
      }
      if (revision === persistedRevision) return { saved: true, revision: persistedRevision };

      flushPromise = (async () => {
        while (persistedRevision !== revision) {
          const targetRevision = revision;
          const snapshotToSave = makeSnapshot(entries);
          await persistSnapshot(snapshotToSave);
          persistedRevision = targetRevision;
        }
        return { saved: true, revision: persistedRevision };
      })();

      try {
        return await flushPromise;
      } finally {
        flushPromise = null;
      }
    }
  };

  return storage;
}

/** Opens SQLite and returns a hydrated, synchronous compatibility cache. */
export async function openA2NativeStorage() {
  const snapshot = await readA2NativeSnapshot();
  return createA2NativeStorage(snapshot);
}

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { A2_DATA_KEYS, A2_SETTING_KEYS, validateA2Backup } from './a2-backup-format.js';

const DATABASE = 'a2_gestao';
const DATABASE_VERSION = 1;
const NATIVE_ONLY_MESSAGE = 'O armazenamento SQLite está disponível somente na versão nativa do A2 Gestão.';

let readyPromise;

function assertNative() {
  if (!Capacitor.isNativePlatform()) throw new Error(NATIVE_ONLY_MESSAGE);
}

async function run(statement, values = []) {
  return CapacitorSQLite.run({
    database: DATABASE,
    statement,
    values,
    transaction: false
  });
}

async function query(statement, values = []) {
  const result = await CapacitorSQLite.query({
    database: DATABASE,
    statement,
    values
  });
  return Array.isArray(result?.values) ? result.values : [];
}

async function ensureSchema() {
  await CapacitorSQLite.execute({
    database: DATABASE,
    statements: `
      CREATE TABLE IF NOT EXISTS a2_records (
        category TEXT NOT NULL,
        record_key TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (category, record_key)
      );
      CREATE INDEX IF NOT EXISTS idx_a2_records_category_ordinal
        ON a2_records(category, ordinal);
      CREATE TABLE IF NOT EXISTS a2_settings (
        setting_key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS a2_migrations (
        migration_key TEXT PRIMARY KEY NOT NULL,
        completed_at TEXT NOT NULL,
        source_checksum TEXT,
        record_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS a2_metadata (
        meta_key TEXT PRIMARY KEY NOT NULL,
        meta_value TEXT NOT NULL
      );
    `,
    transaction: true
  });
}

export async function initializeA2NativeStore() {
  assertNative();
  if (!readyPromise) {
    readyPromise = (async () => {
      const exists = await CapacitorSQLite.isConnection({
        database: DATABASE,
        readonly: false
      });
      if (!exists?.result) {
        await CapacitorSQLite.createConnection({
          database: DATABASE,
          encrypted: false,
          mode: 'no-encryption',
          version: DATABASE_VERSION,
          readonly: false
        });
      }
      await CapacitorSQLite.open({ database: DATABASE });
      await ensureSchema();
      await run(
        'INSERT OR REPLACE INTO a2_metadata(meta_key, meta_value) VALUES (?, ?)',
        ['schema_version', String(DATABASE_VERSION)]
      );
      return { database: DATABASE, schemaVersion: DATABASE_VERSION };
    })().catch((error) => {
      readyPromise = undefined;
      throw error;
    });
  }
  return readyPromise;
}

async function withTransaction(work) {
  await initializeA2NativeStore();
  await CapacitorSQLite.beginTransaction({ database: DATABASE });
  try {
    const result = await work();
    await CapacitorSQLite.commitTransaction({ database: DATABASE });
    return result;
  } catch (error) {
    try {
      await CapacitorSQLite.rollbackTransaction({ database: DATABASE });
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  }
}

async function replaceSnapshot(snapshot) {
  return withTransaction(async () => {
    await run('DELETE FROM a2_records');
    await run('DELETE FROM a2_settings');

    const timestamp = new Date().toISOString();
    for (const category of A2_DATA_KEYS) {
      const records = snapshot.data[category] || [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const key = record.id === undefined || record.id === null || String(record.id) === ''
          ? 'legacy-' + index
          : String(record.id);
        await run(
          'INSERT INTO a2_records(category, record_key, ordinal, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)',
          [category, key, index, JSON.stringify(record), timestamp]
        );
      }
    }

    for (const setting of A2_SETTING_KEYS) {
      await run(
        'INSERT INTO a2_settings(setting_key, value_json) VALUES (?, ?)',
        [setting, JSON.stringify(snapshot.settings[setting] ?? null)]
      );
    }

    await run(
      'INSERT OR REPLACE INTO a2_metadata(meta_key, meta_value) VALUES (?, ?)',
      ['last_write_at', timestamp]
    );

    const verification = await readSnapshotUnlocked();
    for (const category of A2_DATA_KEYS) {
      if (verification.data[category].length !== snapshot.data[category].length) {
        throw new Error('A conferência da categoria ' + category + ' falhou. A transação será revertida.');
      }
    }
    return {
      totalRecords: A2_DATA_KEYS.reduce((sum, key) => sum + verification.data[key].length, 0),
      categories: A2_DATA_KEYS.length
    };
  });
}

async function readSnapshotUnlocked() {
  const data = {};
  for (const category of A2_DATA_KEYS) {
    const rows = await query(
      'SELECT payload_json FROM a2_records WHERE category = ? ORDER BY ordinal ASC',
      [category]
    );
    data[category] = rows.map((row) => JSON.parse(row.payload_json));
  }

  const settings = {};
  const settingRows = await query('SELECT setting_key, value_json FROM a2_settings');
  for (const row of settingRows) settings[row.setting_key] = JSON.parse(row.value_json);
  for (const key of A2_SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) settings[key] = null;
  }
  return { data, settings };
}

export async function readA2NativeSnapshot() {
  await initializeA2NativeStore();
  return readSnapshotUnlocked();
}

/**
 * Import is deliberately explicit. It validates the original JSON/checksum,
 * writes all categories/settings in one SQLite transaction, and verifies
 * category counts before commit. It never deletes browser localStorage.
 */
export async function importLegacyA2Backup(backupObject) {
  const snapshot = validateA2Backup(backupObject);
  const result = await replaceSnapshot(snapshot);
  const sourceChecksum = backupObject?.manifest?.checksum || null;
  await run(
    'INSERT OR REPLACE INTO a2_migrations(migration_key, completed_at, source_checksum, record_count) VALUES (?, ?, ?, ?)',
    ['legacy-json-v2-v3', new Date().toISOString(), sourceChecksum, result.totalRecords]
  );
  return {
    ...result,
    photoReferences: snapshot.photoReferences,
    integrityChecked: snapshot.integrityChecked
  };
}

export async function saveA2NativeSnapshot(snapshot) {
  const validated = validateA2Backup({
    app: 'A2 Gestão',
    format: 'a2-backup',
    backupVersion: 3,
    data: snapshot.data,
    settings: snapshot.settings
  });
  return replaceSnapshot(validated);
}

export async function verifyA2NativeStore() {
  const snapshot = await readA2NativeSnapshot();
  const counts = {};
  let totalRecords = 0;
  for (const category of A2_DATA_KEYS) {
    counts[category] = snapshot.data[category].length;
    totalRecords += counts[category];
  }
  return {
    ok: true,
    categories: A2_DATA_KEYS.length,
    totalRecords,
    counts,
    settings: A2_SETTING_KEYS.length
  };
}

export async function closeA2NativeStore() {
  if (!readyPromise) return;
  try {
    await CapacitorSQLite.close({ database: DATABASE });
    await CapacitorSQLite.closeConnection({ database: DATABASE });
  } finally {
    readyPromise = undefined;
  }
}

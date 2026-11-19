/**
 * A2 Gestão — armazenamento web em IndexedDB.
 *
 * IndexedDB é a camada persistente para dados grandes. A API é assíncrona:
 * a interface legada só deve anunciar sucesso depois de replaceSnapshot()
 * ou setCategory() resolver. O localStorage antigo é mantido apenas como
 * origem de migração; não é usado como destino dos dados restaurados.
 */

const DB_NAME = 'a2-gestao-browser';
const DB_VERSION = 1;
const RECORDS = 'records';
const SETTINGS = 'settings';
const META = 'meta';
const LEGACY_ALIASES = {
  a2clients: ['clients','clientes','a2Clientes'],
  a2vehicles: ['vehicles','veiculos','a2Veiculos'],
  a2services: ['services','servicos','a2Servicos'],
  a2budgets: ['budgets','orcamentos','a2Orcamentos'],
  a2agenda: ['agenda','a2Agenda'],
  a2orders: ['orders','ordens','os','a2Orders'],
  a2history: ['history','historico','a2Historico'],
  a2receivables: ['receivables','contasReceber'],
  a2payments: ['payments','recebimentos'],
  a2transactions: ['transactions','lancamentosFinanceiros'],
  a2crmActivities: ['crmActivities','a2Relacionamento'],
  a2maintenance: ['maintenance','a2Manutencoes'],
  a2payables: ['payables','contasPagar'],
  a2recurring: ['recurring','despesasRecorrentes'],
  a2serviceCosts: ['serviceCosts','custosServicos'],
  a2accounts: ['accounts','contasFinanceiras'],
  a2goals: ['goals','metasFinanceiras']
};


const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Falha ao acessar IndexedDB.'));
});

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || new Error('A transação de armazenamento foi cancelada.'));
  });
}

export function openA2BrowserDatabase(indexedDBApi = globalThis.indexedDB) {
  if (!indexedDBApi) return Promise.reject(new Error('IndexedDB não está disponível neste navegador.'));
  return new Promise((resolve, reject) => {
    const request = indexedDBApi.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: 'key' });
        store.createIndex('byCategory', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco local.'));
    request.onblocked = () => reject(new Error('O banco está aberto em outra aba. Feche as outras janelas do A2 Gestão e tente novamente.'));
  });
}

function validateSnapshot(snapshot, dataKeys, settingKeys) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.data || typeof snapshot.data !== 'object') {
    throw new Error('O backup não contém uma estrutura de dados válida.');
  }
  for (const category of dataKeys) {
    if (!Array.isArray(snapshot.data[category])) {
      throw new Error('Categoria inválida ou ausente no backup: ' + category + '.');
    }
    for (const record of snapshot.data[category]) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('Há um registro inválido na categoria ' + category + '.');
      }
    }
  }
  const settings = snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings : {};
  for (const key of settingKeys) {
    const value = settings[key] ?? null;
    if (value !== null && typeof value !== 'string') {
      throw new Error('Configuração inválida no backup: ' + key + '.');
    }
  }
}

export async function readA2BrowserSnapshot({ dataKeys, settingKeys, indexedDBApi } = {}) {
  const db = await openA2BrowserDatabase(indexedDBApi);
  try {
    const tx = db.transaction([RECORDS, SETTINGS, META], 'readonly');
    const done = transactionDone(tx);
    const recordsRequest = tx.objectStore(RECORDS).getAll();
    const settingsRequest = tx.objectStore(SETTINGS).getAll();
    const metaRequest = tx.objectStore(META).get('snapshot');
    const [records, storedSettings, meta] = await Promise.all([
      requestResult(recordsRequest), requestResult(settingsRequest), requestResult(metaRequest), done
    ]).then(values => values.slice(0, 3));
    const data = Object.fromEntries(dataKeys.map(key => [key, []]));
    for (const row of records) {
      if (data[row.category]) data[row.category][row.ordinal] = row.payload;
    }
    for (const key of dataKeys) data[key] = data[key].filter(value => value !== undefined);
    const settings = Object.fromEntries(settingKeys.map(key => [key, null]));
    for (const row of storedSettings) if (Object.hasOwn(settings, row.key)) settings[row.key] = row.value;
    return { data, settings, metadata: meta?.value || null };
  } finally {
    db.close();
  }
}

/**
 * Atomic replacement: all categories and settings become visible together.
 * The old IndexedDB snapshot remains intact if validation or the transaction
 * fails. Data is stored record-by-record rather than as one large JSON string.
 */
export async function replaceA2BrowserSnapshot(snapshot, { dataKeys, settingKeys, indexedDBApi } = {}) {
  validateSnapshot(snapshot, dataKeys, settingKeys);
  const db = await openA2BrowserDatabase(indexedDBApi);
  try {
    const tx = db.transaction([RECORDS, SETTINGS, META], 'readwrite');
    const records = tx.objectStore(RECORDS);
    const settings = tx.objectStore(SETTINGS);
    const meta = tx.objectStore(META);
    records.clear();
    settings.clear();
    for (const category of dataKeys) {
      const list = snapshot.data[category];
      for (let ordinal = 0; ordinal < list.length; ordinal += 1) {
        records.put({
          key: category + '::' + ordinal,
          category,
          ordinal,
          payload: list[ordinal]
        });
      }
    }
    for (const key of settingKeys) {
      const value = snapshot.settings?.[key] ?? null;
      if (value !== null) settings.put({ key, value });
    }
    meta.put({
      key: 'snapshot',
      value: {
        format: 'a2-browser-idb',
        savedAt: new Date().toISOString(),
        categories: dataKeys.length,
        records: dataKeys.reduce((sum, key) => sum + snapshot.data[key].length, 0)
      }
    });
    await transactionDone(tx);
    return { ok: true, categories: dataKeys.length, records: dataKeys.reduce((sum, key) => sum + snapshot.data[key].length, 0) };
  } finally {
    db.close();
  }
}



/** Persist only the categories/settings changed by the legacy UI. */
export async function writeA2BrowserChanges(snapshot, {
  dataKeys = [],
  settingKeys = [],
  allDataKeys,
  indexedDBApi
} = {}) {
  if (!snapshot || !snapshot.data || !allDataKeys) throw new Error('Snapshot incompleto para salvar no IndexedDB.');
  for (const category of dataKeys) {
    if (!Array.isArray(snapshot.data[category])) throw new Error('Categoria inválida: ' + category + '.');
  }
  const db = await openA2BrowserDatabase(indexedDBApi);
  try {
    const tx = db.transaction([RECORDS, SETTINGS, META], 'readwrite');
    const records = tx.objectStore(RECORDS);
    const index = records.index('byCategory');
    for (const category of dataKeys) {
      const request = index.openCursor(IDBKeyRange.only(category));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
          return;
        }
        const list = snapshot.data[category];
        for (let ordinal = 0; ordinal < list.length; ordinal += 1) {
          records.put({
            key: category + '::' + ordinal,
            category,
            ordinal,
            payload: list[ordinal]
          });
        }
      };
    }
    const settingsStore = tx.objectStore(SETTINGS);
    for (const key of settingKeys) {
      const value = snapshot.settings?.[key] ?? null;
      if (value === null) settingsStore.delete(key);
      else settingsStore.put({ key, value });
    }
    const totalRecords = allDataKeys.reduce((sum, key) =>
      sum + (Array.isArray(snapshot.data[key]) ? snapshot.data[key].length : 0), 0);
    tx.objectStore(META).put({
      key: 'snapshot',
      value: {
        format: 'a2-browser-idb',
        savedAt: new Date().toISOString(),
        categories: allDataKeys.length,
        records: totalRecords
      }
    });
    await transactionDone(tx);
    return { ok: true, records: totalRecords };
  } finally {
    db.close();
  }
}

/** One-time, non-destructive migration from the old localStorage keys. */
export async function migrateA2LocalStorage({ dataKeys, settingKeys, storage = globalThis.localStorage, indexedDBApi } = {}) {
  const current = await readA2BrowserSnapshot({ dataKeys, settingKeys, indexedDBApi });
  if (current.metadata) return { migrated: false, reason: 'already-initialized' };

  const data = {};
  let foundLegacyData = false;
  for (const key of dataKeys) {
    let raw = storage?.getItem(key);
    if (raw === null || raw === undefined) {
      for (const alias of (LEGACY_ALIASES[key] || [])) {
        raw = storage?.getItem(alias);
        if (raw !== null && raw !== undefined) break;
      }
    }
    if (raw === null || raw === undefined) {
      data[key] = [];
      continue;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Os dados antigos da categoria ' + key + ' não são uma lista válida.');
    data[key] = parsed;
    foundLegacyData = true;
  }
  const settings = {};
  for (const key of settingKeys) settings[key] = storage?.getItem(key) ?? null;
  if (!foundLegacyData && !Object.values(settings).some(value => value !== null)) {
    return { migrated: false, reason: 'no-legacy-data' };
  }
  const result = await replaceA2BrowserSnapshot({ data, settings }, { dataKeys, settingKeys, indexedDBApi });
  return { migrated: true, ...result };
}

export async function getA2BrowserStorageEstimate(storageManager = globalThis.navigator?.storage) {
  if (!storageManager?.estimate) return { supported: false, usage: null, quota: null };
  const estimate = await storageManager.estimate();
  return {
    supported: true,
    usage: Number.isFinite(estimate.usage) ? estimate.usage : null,
    quota: Number.isFinite(estimate.quota) ? estimate.quota : null
  };
}

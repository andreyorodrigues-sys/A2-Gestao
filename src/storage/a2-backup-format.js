export const A2_DATA_KEYS = [
  'a2clients', 'a2vehicles', 'a2services', 'a2budgets', 'a2agenda',
  'a2orders', 'a2history', 'a2receivables', 'a2payments', 'a2transactions',
  'a2crmActivities', 'a2maintenance', 'a2payables', 'a2recurring',
  'a2serviceCosts', 'a2accounts', 'a2goals',
  'a2inventory', 'a2stockMoves', 'a2approvals'
];

export const A2_SETTING_KEYS = [
  'a2templates', 'a2pix', 'a2RevenuePeriod', 'a2RevenueStart',
  'a2RevenueEnd', 'a2RevenueHidden', 'a2GoogleReviewUrl'
];

export function a2Checksum(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate without mutating the source object. The returned snapshot is safe
 * to import transactionally and keeps the legacy record objects unchanged.
 */
export function validateA2Backup(input) {
  if (!isRecord(input) || input.format !== 'a2-backup' || !isRecord(input.data)) {
    throw new Error('Arquivo não reconhecido como backup do A2 Gestão.');
  }

  const sourceData = input.data;
  const sourceKeys = Object.keys(sourceData);
  const legacyKeys = A2_DATA_KEYS.slice(0, 17);
  const hasV9Categories = ['a2inventory', 'a2stockMoves', 'a2approvals']
    .every((key) => Object.prototype.hasOwnProperty.call(sourceData, key));

  for (const key of legacyKeys) {
    if (!Array.isArray(sourceData[key])) {
      throw new Error('Backup incompleto ou inválido: ' + key + '.');
    }
  }

  for (const key of ['a2inventory', 'a2stockMoves', 'a2approvals']) {
    if (sourceData[key] !== undefined && !Array.isArray(sourceData[key])) {
      throw new Error('Backup incompleto ou inválido: ' + key + '.');
    }
  }

  for (const key of sourceKeys) {
    if (!A2_DATA_KEYS.includes(key)) {
      throw new Error('O backup contém uma categoria desconhecida: ' + key + '.');
    }
    if (!Array.isArray(sourceData[key])) {
      throw new Error('Categoria inválida: ' + key + '.');
    }
    if (sourceData[key].some((item) => !isRecord(item))) {
      throw new Error('Há registros inválidos em ' + key + '.');
    }
  }

  const sourceSettings = input.settings === undefined ? {} : input.settings;
  if (!isRecord(sourceSettings)) {
    throw new Error('As configurações do backup estão inválidas.');
  }

  const settings = {};
  for (const key of A2_SETTING_KEYS) {
    const value = Object.prototype.hasOwnProperty.call(sourceSettings, key)
      ? sourceSettings[key]
      : null;
    if (value !== null && typeof value !== 'string') {
      throw new Error('Configuração inválida: ' + key + '.');
    }
    settings[key] = value;
  }

  if (input.manifest && input.manifest.checksum) {
    // V2 checksum covers the original 17 categories; V3 covers all 20.
    // Keep original property order because the historical FNV checksum is
    // calculated over JSON.stringify and therefore order-sensitive.
    const checksumData = {};
    const expectedKeys = hasV9Categories ? A2_DATA_KEYS : legacyKeys;
    for (const key of expectedKeys) {
      if (Object.prototype.hasOwnProperty.call(sourceData, key)) {
        checksumData[key] = sourceData[key];
      }
    }
    const originalSettings = {};
    for (const key of A2_SETTING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(sourceSettings, key)) {
        originalSettings[key] = sourceSettings[key];
      }
    }
    const actual = a2Checksum({ data: checksumData, settings: originalSettings });
    if (actual !== input.manifest.checksum) {
      throw new Error('A verificação de integridade do backup falhou. O arquivo pode estar corrompido ou ter sido alterado.');
    }
  }

  const data = {};
  for (const key of A2_DATA_KEYS) {
    data[key] = Array.isArray(sourceData[key]) ? sourceData[key] : [];
  }

  const totalRecords = A2_DATA_KEYS.reduce((sum, key) => sum + data[key].length, 0);
  const photoReferences = (JSON.stringify(data).match(/data:image\//g) || []).length;

  return {
    app: 'A2 Gestão',
    format: 'a2-backup',
    backupVersion: Number(input.backupVersion || 2),
    storageVersion: input.storageVersion || null,
    createdAt: input.createdAt || input.savedAt || null,
    manifest: input.manifest || null,
    data,
    settings,
    integrityChecked: Boolean(input.manifest && input.manifest.checksum),
    totalRecords,
    photoReferences
  };
}

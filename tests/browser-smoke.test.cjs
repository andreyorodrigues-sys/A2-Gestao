const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const DATA_KEYS = [
  'a2clients', 'a2vehicles', 'a2services', 'a2budgets', 'a2agenda',
  'a2orders', 'a2history', 'a2receivables', 'a2payments', 'a2transactions',
  'a2crmActivities', 'a2maintenance', 'a2payables', 'a2recurring',
  'a2serviceCosts', 'a2accounts', 'a2goals', 'a2inventory',
  'a2stockMoves', 'a2approvals'
];
const SETTING_KEYS = [
  'a2templates', 'a2pix', 'a2RevenuePeriod', 'a2RevenueStart',
  'a2RevenueEnd', 'a2RevenueHidden', 'a2GoogleReviewUrl'
];

async function withChromium(run) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.resolve(__dirname, '..', 'storage', 'a2-idb.js') });
    return await run(page);
  } finally {
    await browser.close();
  }
}

test('legacy A2 app boots in a real browser without uncaught page errors', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  try {
    const fileUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#homeGreeting').waitFor({ state: 'attached' });
    assert.equal(await page.title(), 'A2 Gestão V2');
    assert.equal(await page.locator('.brand').innerText(), 'A2 GESTÃO');
    assert.equal(await page.locator('#homeRevenue').count(), 1);
    assert.equal(await page.evaluate(() => typeof window.saveAll), 'function');
    assert.equal(await page.evaluate(() => typeof window.renderFinance), 'function');
    assert.deepEqual(pageErrors, [], 'app must not emit uncaught JavaScript exceptions during boot');
  } finally {
    await browser.close();
  }
});

test('IndexedDB migration preserves all 20 A2 data groups, settings, photos and legacy source', async () => {
  const result = await withChromium(page => page.evaluate(async ({ dataKeys, settingKeys }) => {
    const legacy = new Map();
    dataKeys.forEach((key, index) => {
      const record = { id: key + '-record', marker: index };
      if (key === 'a2orders') record.photos = [{ data: 'data:image/jpeg;base64,PHOTO-KEEP' }];
      legacy.set(key, JSON.stringify([record]));
    });
    settingKeys.forEach((key, index) => legacy.set(key, 'setting-' + index));
    const before = [...legacy.entries()];
    const storage = {
      getItem: key => legacy.has(key) ? legacy.get(key) : null,
      setItem: (key, value) => legacy.set(key, String(value)),
      removeItem: key => legacy.delete(key)
    };

    const migrated = await window.A2IndexedDB.migrateFromLocalStorage(storage, dataKeys, settingKeys);
    const copied = await window.A2IndexedDB.getMany([...dataKeys, ...settingKeys]);
    return {
      migrated,
      allGroupsPresent: dataKeys.every((key, index) => copied[key][0]?.marker === index),
      allSettingsPresent: settingKeys.every((key, index) => copied[key] === 'setting-' + index),
      photo: copied.a2orders[0].photos[0].data,
      legacyUnchanged: JSON.stringify([...legacy.entries()]) === JSON.stringify(before)
    };
  }, { dataKeys: DATA_KEYS, settingKeys: SETTING_KEYS }));

  assert.equal(result.migrated.verified, true);
  assert.equal(result.migrated.categories, 20);
  assert.equal(result.migrated.settings, 7);
  assert.equal(result.migrated.records, 20);
  assert.equal(result.allGroupsPresent, true);
  assert.equal(result.allSettingsPresent, true);
  assert.equal(result.photo, 'data:image/jpeg;base64,PHOTO-KEEP');
  assert.equal(result.legacyUnchanged, true);
});

test('IndexedDB migration refuses malformed legacy data without partially replacing the database', async () => {
  const result = await withChromium(page => page.evaluate(async () => {
    await window.A2IndexedDB.replaceAllAtomic({ a2clients: [{ id: 'existing' }] }, { a2pix: 'keep-me' });
    const legacy = new Map([
      ['a2clients', JSON.stringify([{ id: 'new' }])],
      ['a2vehicles', '{not-valid-json']
    ]);
    const storage = { getItem: key => legacy.has(key) ? legacy.get(key) : null };
    let rejected = false;
    let message = '';
    try {
      await window.A2IndexedDB.migrateFromLocalStorage(storage, ['a2clients', 'a2vehicles'], ['a2pix']);
    } catch (error) {
      rejected = true;
      message = error.message;
    }
    const after = await window.A2IndexedDB.getMany(['a2clients', 'a2pix']);
    return { rejected, message, clientId: after.a2clients[0].id, pix: after.a2pix };
  }));

  assert.equal(result.rejected, true);
  assert.match(result.message, /Dado antigo inválido/);
  assert.equal(result.clientId, 'existing');
  assert.equal(result.pix, 'keep-me');
});

test('IndexedDB atomic replacement rolls back all writes when structured cloning fails', async () => {
  const result = await withChromium(page => page.evaluate(async () => {
    await window.A2IndexedDB.replaceAllAtomic(
      { a2clients: [{ id: 'before' }] },
      { a2pix: 'before-setting' }
    );
    let rejected = false;
    try {
      await window.A2IndexedDB.replaceAllAtomic(
        { a2clients: [{ id: 'after' }], cloneFailure: [() => 'not cloneable'] },
        { a2pix: 'after-setting' }
      );
    } catch (_) {
      rejected = true;
    }
    const after = await window.A2IndexedDB.getMany(['a2clients', 'a2pix']);
    return {
      rejected,
      clientId: after.a2clients[0].id,
      pix: after.a2pix
    };
  }));

  assert.equal(result.rejected, true);
  assert.equal(result.clientId, 'before');
  assert.equal(result.pix, 'before-setting');
});

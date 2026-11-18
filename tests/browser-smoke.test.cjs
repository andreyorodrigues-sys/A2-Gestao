const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

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

test('IndexedDB backend works in Chromium with A2-shaped data and atomic rollback', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.resolve(__dirname, '..', 'storage', 'a2-idb.js') });
    const result = await page.evaluate(async () => {
      const keys = ['a2clients', 'a2orders', 'a2inventory'];
      const settings = ['a2pix', 'a2RevenuePeriod'];
      const legacy = new Map([
        ['a2clients', JSON.stringify([{ id: 'c1', name: 'Teste' }])],
        ['a2orders', JSON.stringify([{ id: 'os1', photos: [{ data: 'data:image/jpeg;base64,ABCD' }] }])],
        ['a2inventory', JSON.stringify([{ id: 'p1', quantity: 2 }])],
        ['a2pix', 'chave-teste'],
        ['a2RevenuePeriod', 'month']
      ]);
      const storage = {
        getItem: key => legacy.has(key) ? legacy.get(key) : null,
        setItem: (key, value) => legacy.set(key, String(value)),
        removeItem: key => legacy.delete(key)
      };
      const before = [...legacy.entries()];
      const migrated = await window.A2IndexedDB.migrateFromLocalStorage(storage, keys, settings);
      const copied = await window.A2IndexedDB.getMany([...keys, ...settings]);
      let rejected = false;
      try {
        await window.A2IndexedDB.replaceAllAtomic(
          { a2clients: [{ id: 'bad' }], cloneFailure: [() => 'not cloneable'] },
          { a2pix: 'alterada' }
        );
      } catch (_) { rejected = true; }
      const afterFailure = await window.A2IndexedDB.getMany(['a2clients', 'a2pix']);
      return {
        migrated,
        photo: copied.a2orders[0].photos[0].data,
        settings: [copied.a2pix, copied.a2RevenuePeriod],
        legacyUnchanged: JSON.stringify([...legacy.entries()]) === JSON.stringify(before),
        rejected,
        previousClientPreserved: afterFailure.a2clients[0].id === 'c1',
        previousSettingPreserved: afterFailure.a2pix === 'chave-teste'
      };
    });
    assert.equal(result.migrated.verified, true);
    assert.equal(result.photo, 'data:image/jpeg;base64,ABCD');
    assert.deepEqual(result.settings, ['chave-teste', 'month']);
    assert.equal(result.legacyUnchanged, true);
    assert.equal(result.rejected, true);
    assert.equal(result.previousClientPreserved, true);
    assert.equal(result.previousSettingPreserved, true);
  } finally {
    await browser.close();
  }
});

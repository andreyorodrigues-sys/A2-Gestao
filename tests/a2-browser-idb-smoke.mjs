import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) && file !== resolve(root, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise(resolveListen => server.listen(4173, '127.0.0.1', resolveListen));

const browserType = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('dialog', dialog => dialog.accept());
await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', route =>
  route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.html2pdf = function(){ return { from(){ return this; }, save(){ return Promise.resolve(); } }; };' })
);

const legacyClient = [{ id: 'legacy-client', name: 'Cliente legado' }];
const legacyVehicle = [{ id: 'legacy-vehicle', clientId: 'legacy-client', plate: 'AAA0A00' }];
await page.addInitScript(({ legacyClient, legacyVehicle }) => {
  localStorage.setItem('a2clients', JSON.stringify(legacyClient));
  localStorage.setItem('vehicles', JSON.stringify(legacyVehicle));
  localStorage.setItem('a2RevenuePeriod', 'month');
}, { legacyClient, legacyVehicle });

try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.a2BrowserStorageReady === true, { timeout: 20000 });

  const migrated = await page.evaluate(() => ({
    clients: JSON.parse(window.a2LocalStorage.getItem('a2clients') || '[]'),
    vehicles: JSON.parse(window.a2LocalStorage.getItem('a2vehicles') || '[]'),
    period: window.a2LocalStorage.a2RevenuePeriod,
    oldClientKey: window.localStorage.getItem('a2clients'),
    oldVehicleAlias: window.localStorage.getItem('vehicles')
  }));
  assert.equal(migrated.clients[0]?.id, 'legacy-client');
  assert.equal(migrated.vehicles[0]?.id, 'legacy-vehicle');
  assert.equal(migrated.period, 'month');
  assert.equal(migrated.oldClientKey, null, 'verified legacy client copy should be removed from localStorage');
  assert.equal(migrated.oldVehicleAlias, null, 'verified legacy alias should be removed from localStorage');

  await page.evaluate(async () => {
    window.a2LocalStorage.setItem('a2clients', JSON.stringify([{ id: 'saved-client', name: 'Cliente salvo' }]));
    await window.a2FlushStorage();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.a2BrowserStorageReady === true, { timeout: 20000 });
  const afterReload = await page.evaluate(() => JSON.parse(window.a2LocalStorage.getItem('a2clients') || '[]'));
  assert.equal(afterReload[0]?.id, 'saved-client', 'incremental writes must survive reload');

  const dataKeys = [
    'a2clients','a2vehicles','a2services','a2budgets','a2agenda','a2orders','a2history',
    'a2receivables','a2payments','a2transactions','a2crmActivities','a2maintenance',
    'a2payables','a2recurring','a2serviceCosts','a2accounts','a2goals',
    'a2inventory','a2stockMoves','a2approvals'
  ];
  const settingKeys = ['a2templates','a2pix','a2RevenuePeriod','a2RevenueStart','a2RevenueEnd','a2RevenueHidden','a2GoogleReviewUrl'];
  const backup = await page.evaluate(({ dataKeys, settingKeys }) => {
    const data = Object.fromEntries(dataKeys.map(key => [key, []]));
    data.a2clients = [{ id: 'imported-client', name: 'Cliente importado' }];
    data.a2orders = [{
      id: 'imported-order',
      inspectionStart: { photos: ['data:image/png;base64,AAAA'], items: [] },
      inspectionEnd: { photos: [], items: [] }
    }];
    data.a2inventory = [{ id: 'imported-product', name: 'Shampoo', qty: 3 }];
    const settings = Object.fromEntries(settingKeys.map(key => [key, null]));
    settings.a2RevenuePeriod = 'year';
    return { app: 'A2 Gestão', format: 'a2-backup', backupVersion: 3, data, settings };
  }, { dataKeys, settingKeys });

  await page.evaluate(async backup => {
    window.confirm = () => true;
    window.alert = () => {};
    window.a2DownloadJson = () => {};
    const file = new File([JSON.stringify(backup)], 'A2_teste_backup.json', { type: 'application/json' });
    await window.a2ImportBackup({ target: { files: [file], value: '' } });
  }, backup);

  const imported = await page.evaluate(async () => {
    await window.a2FlushStorage();
    return {
      clients: JSON.parse(window.a2LocalStorage.getItem('a2clients') || '[]'),
      orders: JSON.parse(window.a2LocalStorage.getItem('a2orders') || '[]'),
      inventory: JSON.parse(window.a2LocalStorage.getItem('a2inventory') || '[]'),
      period: window.a2LocalStorage.a2RevenuePeriod
    };
  });
  assert.equal(imported.clients[0]?.id, 'imported-client');
  assert.equal(imported.orders[0]?.id, 'imported-order');
  assert.equal(imported.orders[0]?.inspectionStart?.photos?.[0], 'data:image/png;base64,AAAA');
  assert.equal(imported.inventory[0]?.id, 'imported-product');
  assert.equal(imported.period, 'year');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.a2BrowserStorageReady === true, { timeout: 20000 });
  const restored = await page.evaluate(() => ({
    client: JSON.parse(window.a2LocalStorage.getItem('a2clients') || '[]')[0]?.id,
    order: JSON.parse(window.a2LocalStorage.getItem('a2orders') || '[]')[0]?.id,
    inventory: JSON.parse(window.a2LocalStorage.getItem('a2inventory') || '[]')[0]?.id,
    period: window.a2LocalStorage.a2RevenuePeriod
  }));
  assert.deepEqual(restored, {
    client: 'imported-client',
    order: 'imported-order',
    inventory: 'imported-product',
    period: 'year'
  });

  assert.deepEqual(pageErrors, [], 'browser must not report uncaught page errors');
  console.log('PASS: migração, gravação incremental, importação de backup com foto e persistência após recarga.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

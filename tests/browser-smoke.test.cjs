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

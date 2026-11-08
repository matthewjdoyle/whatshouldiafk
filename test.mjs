import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import methods from './src/data/methods.json' with { type: 'json' };

const origin = 'http://afk.test';
const dist = new URL('./dist/', import.meta.url);
const cannonballs = 'Cannonballs (Standard)';
const quote = { high: 1000, low: 1000 };
const allPrices = Object.fromEntries(methods.flatMap(method =>
  [...method.inputs, ...method.outputs].map(item => [item.id, quote]),
));
const partialPrices = { ...allPrices };
delete partialPrices[2353];

const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png' };
const respondJson = (request, data, status = 200) => request.respond({
  status,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(data),
});

const browser = await puppeteer.launch({ headless: 'shell', pipe: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('afk-theme')) return;
    localStorage.setItem('afk-theme', '"dark"');
    localStorage.setItem('afk-showGeLimitColumn', 'true');
    localStorage.setItem('afk-showGpXpColumn', 'true');
    localStorage.setItem('afk-graph', JSON.stringify({ type: 'scatter', x: 'xp', y: 'afk' }));
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  let releaseFirstPrices;
  const firstPricesGate = new Promise(resolve => { releaseFirstPrices = resolve; });
  let priceRequests = 0;
  let mappingRequests = 0;

  // Serve the production build and GE fixtures through request interception.
  // The test needs neither a listening port nor access to the Wiki.
  await page.setRequestInterception(true);
  page.on('request', request => {
    async function handleRequest() {
      const url = new URL(request.url());
      if (url.origin === origin) {
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        if (!/^\/(?:assets\/)?[\w.-]+$/.test(path)) return request.abort();
        const body = await readFile(new URL(`.${path}`, dist));
        return request.respond({ status: 200, contentType: types[path.split('.').pop()], body });
      }
      if (url.pathname === '/api/v1/osrs/mapping') {
        if (++mappingRequests <= 2) return respondJson(request, {}, 503);
        return respondJson(request, [{ id: 2353, name: 'Steel bar', limit: 10000 }]);
      }
      if (url.pathname === '/api/v1/osrs/latest') {
        switch (++priceRequests) {
          case 1:
            await firstPricesGate;
            return respondJson(request, { data: partialPrices });
          case 2:
            return respondJson(request, {}, 503);
          default:
            return respondJson(request, { data: allPrices });
        }
      }
      return request.abort();
    }
    void handleRequest().catch(error => errors.push(error));
  });

  const waitForText = (selector, text) => page.waitForFunction((selector, text) =>
    document.querySelector(selector)?.textContent.includes(text), {}, selector, text);
  const status = () => page.$eval('header [role="status"]', node => node.textContent);
  const row = () => page.$eval('#methods-panel table', (table, name) => {
    const row = [...table.tBodies[0].rows].find(row => row.cells[0]?.innerText.includes(name));
    return row && Object.fromEntries([...table.tHead.rows[0].cells].map((heading, index) =>
      [heading.textContent.trim(), row.cells[index].innerText],
    ));
  }, cannonballs);
  const refreshButton = '[aria-label="Refresh GE prices"]';

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await waitForText('#methods-panel table', cannonballs);
  assert.equal(await page.$eval('html', node => node.dataset.theme), 'dark');
  assert.match(await status(), /Loading GE prices/);
  await waitForText('#methods-panel [role="status"]', 'GE buy limits unavailable');

  await page.click('#graph-tab');
  const marker = '#graph-panel [aria-haspopup="dialog"]';
  await page.waitForSelector(marker, { visible: true });
  await page.focus(marker);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('dialog')?.open);
  await page.waitForFunction(() => document.activeElement?.id === 'graph-detail-title');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog') && document.activeElement?.matches('[aria-haspopup="dialog"]'));

  releaseFirstPrices();
  await waitForText('header [role="status"]', 'Prices updated');
  const lastUpdated = (await status()).replace('Prices updated ', '');
  await page.$$eval('#graph-panel select', selects => {
    selects[1].value = 'profit';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#graph-panel details summary');
  await waitForText('#graph-panel details', 'Missing GE price for Steel bar');
  assert.match(await page.$eval('#graph-panel details', node => node.textContent), /Cannonballs \(Standard\)/);
  assert.equal(await page.$$eval(marker, (nodes, name) => nodes.some(node => node.getAttribute('aria-label').includes(name)), cannonballs), false);

  await page.click('#methods-tab');
  const partialRow = await row();
  assert.equal(partialRow['Profit/hr'], 'Unavailable');
  assert.equal(partialRow['GP/XP'], 'Unavailable');
  assert.match(partialRow.Economics, /Steel bar\s+Unavailable/);

  // With Smithing and 120s selected, standard cannonballs are the only candidate.
  await page.click('#skill-filter');
  await page.click('button[title="Smithing"]');
  await page.click('#skill-filter');
  await page.select('#min-afk', '120');
  await page.click('::-p-aria(Profitable only)');
  await waitForText('#methods-panel tbody', 'No methods with confirmed profit match your filters.');
  await page.select('#min-xp', '20000');
  await waitForText('#methods-panel tbody', 'No methods match your filters.');
  await page.click('::-p-aria(Profitable only)');
  await page.select('#min-xp', '0');
  await page.select('#min-afk', '0');
  await page.click('#skill-filter');
  await page.click('::-p-aria(Clear Filter)');
  await page.click('#skill-filter');
  await waitForText('#methods-panel table', cannonballs);

  async function assertMissingSortsLast(label) {
    const heading = `#methods-panel th ::-p-text(${label})`;
    for (let direction = 0; direction < 2; direction += 1) {
      await page.click(heading);
      const cells = await page.$eval('#methods-panel table', (table, label) => {
        const index = [...table.tHead.rows[0].cells].findIndex(cell => cell.innerText.includes(label));
        return [...table.tBodies[0].rows].map(row => row.cells[index].innerText);
      }, label);
      const firstMissing = cells.indexOf('Unavailable');
      assert.ok(firstMissing > 0);
      assert.ok(cells.slice(firstMissing).every(value => value === 'Unavailable' || value === '-'));
    }
  }
  await assertMissingSortsLast('Profit/hr');
  await assertMissingSortsLast('GP/XP');

  await page.click(refreshButton);
  await waitForText('header [role="status"]', 'Refresh failed');
  assert.ok((await status()).includes(lastUpdated));
  assert.deepEqual(await row(), partialRow);
  await page.click(refreshButton);
  await waitForText('header [role="status"]', 'Prices updated');
  const recoveredRow = await row();
  assert.equal(recoveredRow['Profit/hr'], '+1.58m');
  assert.match(recoveredRow['GE Limit'], /10,000\/4h/);
  assert.equal(priceRequests, 3);
  assert.equal(mappingRequests, 3);

  await page.click('::-p-aria(Average Gem Loot)');
  await page.waitForSelector('#info-panel', { visible: true });
  await page.waitForSelector('#crab-profit.bg-surface-hover');
  await page.click('#graph-tab');
  assert.deepEqual(await page.$$eval('#graph-panel select', selects => selects.map(select => select.value)), ['xp', 'profit']);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed for startup, refresh, filters, sorting, chart details, and FAQ navigation.');
} finally {
  await browser.close();
}

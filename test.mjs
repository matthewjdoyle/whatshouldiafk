import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import methods from './src/data/methods.json' with { type: 'json' };
import { meetsSkillRequirements, skillNames } from './src/player/profile.ts';

const origin = 'http://afk.test';
const dist = new URL('./dist/', import.meta.url);
const cannonballs = 'Cannonballs (Standard)';
const quote = { high: 1000, low: 1000 };
const allPrices = Object.fromEntries(methods.flatMap(method =>
  [...method.inputs, ...method.outputs].map(item => [item.id, quote]),
));
const partialPrices = { ...allPrices };
delete partialPrices[2353];
const playerLevels = Object.fromEntries(skillNames.map(skill => [skill, 99]));
Object.assign(playerLevels, { Smithing: 35, Fishing: 87, Cooking: 72, Agility: 45, Strength: 44, Sailing: 72, Woodcutting: 80, Fletching: 1 });
delete playerLevels.Mining;
const playerResponse = username => ({
  username, displayName: username === 'test player' ? 'Test Player' : 'Limited',
  latestSnapshot: {
    createdAt: '2026-11-16T12:00:00.000Z',
    data: { skills: Object.fromEntries(Object.entries({ ...playerLevels, ...(username === 'limited' ? { Mining: 99 } : {}) }).map(([skill, level]) => [
      skill === 'Runecraft' ? 'runecrafting' : skill.toLowerCase(), { level, rank: -1 },
    ])) },
  },
});

const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', ttf: 'font/ttf' };
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
  const playerRequests = [];

  // Serve the production build and GE fixtures through request interception.
  // The test needs neither a listening port nor access to the Wiki.
  await page.setRequestInterception(true);
  page.on('request', request => {
    async function handleRequest() {
      const url = new URL(request.url());
      if (url.origin === origin) {
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        if (!/^\/(?:assets\/)?[\w.-]+$/.test(path) && !/^\/osrs\/(?:skills\/[a-z]+\.png|runescape\.ttf)$/.test(path)) return request.abort();
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
      if (url.origin === 'https://api.wiseoldman.net') {
        const username = decodeURIComponent(url.pathname.split('/').pop());
        playerRequests.push({ username, method: request.method() });
        if (username === 'missing') return respondJson(request, {}, 404);
        if (username === 'limited' && request.method() === 'POST') return respondJson(request, {}, 429);
        return respondJson(request, playerResponse(username));
      }
      return request.abort();
    }
    void handleRequest().catch(error => errors.push(error));
  });

  const waitForText = (selector, text) => page.waitForFunction((selector, text) =>
    document.querySelector(selector)?.textContent.includes(text), {}, selector, text);
  const status = () => page.$eval('#market-status', node => node.textContent);
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
  await waitForText('#market-status', 'Prices updated');
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
  await waitForText('#market-status', 'Refresh failed');
  assert.ok((await status()).includes(lastUpdated));
  assert.deepEqual(await row(), partialRow);
  await page.click(refreshButton);
  await waitForText('#market-status', 'Prices updated');
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

  // Player lookups stay inside the app; no requests happen on startup or typing.
  await page.click('#methods-tab');
  assert.equal(playerRequests.length, 0);
  assert.equal(await page.$eval('#player-skill-filter', node => node.disabled), true);
  assert.equal(await page.$eval('#player-rsn', node => !!node.closest('header')), true);
  assert.equal(await page.$$eval('form[aria-label="Player lookup"] button', nodes => nodes.length), 1);
  assert.equal(await page.$eval('#player-rsn', node => !!(node.compareDocumentPosition(document.querySelector('select[aria-label="Theme"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('form[aria-label="Player lookup"] button')).opacity === '0');
  await page.type('#player-rsn', '  Test_Player  ');
  assert.equal(playerRequests.length, 0);
  await page.focus('#player-rsn');
  await page.keyboard.press('Enter');
  await waitForText('#player-lookup-status', 'Levels for Test Player');
  assert.deepEqual(playerRequests, [{ username: 'test player', method: 'POST' }]);
  assert.equal(await page.$eval('#player-skill-filter', node => node.checked), false);
  await page.waitForSelector('#player-levels-popout', { visible: true });
  const levels = await page.$$eval('#player-levels-popout dl > div', nodes => Object.fromEntries(nodes.map(node => [node.querySelector('dt').textContent, node.querySelector('dd .sr-only').textContent])));
  assert.equal(levels.Runecraft, '99');
  assert.equal(levels.Sailing, '72');
  assert.equal(levels.Mining, 'Unknown');
  assert.deepEqual(await page.$$eval('#player-levels-popout [data-skill]', nodes => nodes.map(node => node.dataset.skill)), [
    'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
    'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
    'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
    'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Sailing',
  ]);
  await page.waitForFunction(() => [...document.querySelectorAll('#player-levels-popout img')].every(img => img.complete && img.naturalWidth > 0));
  await waitForText('#player-levels-popout .osrs-total', 'Total level: Unknown');

  // Keyboard dismissal keeps focus in the field; Tab reveals the single action.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#player-levels-popout', { hidden: true });
  assert.equal(await page.$eval('#player-rsn', node => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  await page.waitForSelector('#player-levels-popout', { visible: true });
  assert.equal(await page.$eval('form[aria-label="Player lookup"] button', node => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  await page.waitForSelector('#player-levels-popout', { hidden: true });
  // Pointer users can move into the skill tab without it closing.
  await page.hover('#player-rsn');
  await page.waitForSelector('#player-levels-popout', { visible: true });
  await page.hover('#player-levels-popout [data-skill="Construction"]');
  assert.ok(await page.$('#player-levels-popout'));
  await page.mouse.move(0, 0);
  await page.waitForSelector('#player-levels-popout', { hidden: true });
  const tableNames = () => page.$$eval('#methods-panel tbody tr', rows => rows.map(row => row.cells[0]?.innerText ?? ''));
  await page.click('#player-skill-filter');
  assert.equal(await page.$eval('#player-skill-filter', node => node.closest('section').getAttribute('aria-label')), 'Method filters');
  const expected = methods.filter(method => meetsSkillRequirements(method, playerLevels));
  const visible = await tableNames();
  assert.equal(visible.length, expected.length);
  for (const method of expected) assert.ok(visible.some(name => name.includes(method.name)), `Missing eligible method: ${method.id}`);
  for (const id of ['barbarian-fishing', 'rosewood-trees', 'seeking-dragon-arrows-engorged']) {
    assert.ok(!visible.some(name => name.includes(methods.find(method => method.id === id).name)));
  }
  assert.ok(visible.some(name => name.includes(methods.find(method => method.id === 'sacred-eels').name)));
  assert.ok(visible.some(name => name.includes(methods.find(method => method.id === 'amethyst').name)), 'Unknown Mining must not hide Amethyst');
  await page.click('#graph-tab');
  await page.click('::-p-aria(Bar)');
  await page.select('#graph-panel select', 'afk');
  await waitForText('#graph-panel footer', `${expected.length} methods plotted`);
  await page.waitForSelector('#graph-panel [aria-haspopup="dialog"]');
  const bars = await page.$$eval('#graph-panel [aria-haspopup="dialog"]', nodes => nodes.map(node => node.getAttribute('aria-label')));
  assert.equal(bars.length, expected.length);
  for (const method of expected) assert.ok(bars.some(label => label.includes(method.name)));

  // Eligibility combines with existing filters before profit and graph plotting.
  await page.click('#skill-filter');
  await page.click('button[title="Smithing"]');
  await page.click('#skill-filter');
  await page.select('#min-afk', '120');
  await page.click('::-p-aria(Profitable only)');
  await waitForText('#graph-panel footer', '1 method plotted');
  await page.click('#methods-tab');
  assert.equal((await tableNames()).length, 1);
  assert.ok((await tableNames())[0].includes(cannonballs));
  await page.select('#min-xp', '20000');
  await waitForText('#methods-panel tbody', 'No methods match your filters.');
  await page.select('#min-xp', '0');
  await page.select('#min-afk', '0');
  await page.click('::-p-aria(Profitable only)');
  await page.click('#skill-filter');
  await page.click('::-p-aria(Clear Filter)');
  await page.click('#skill-filter');

  // Same-player cooldown avoids another POST. Saved levels restore without fetching.
  await page.focus('#player-rsn');
  await page.keyboard.press('Enter');
  await waitForText('#player-lookup-status', 'Please wait');
  assert.equal(playerRequests.length, 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText('#player-lookup-status', 'Saved levels for Test Player');
  assert.equal(playerRequests.length, 1);
  assert.equal(await page.$eval('#player-skill-filter', node => node.checked), true);
  assert.equal((await tableNames()).length, expected.length);

  // The same inline action also refreshes an already-loaded player once eligible.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('afk-player-v1'));
    saved.profile.fetchedAt = 0;
    localStorage.setItem('afk-player-v1', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText('#player-lookup-status', 'Saved levels for Test Player');
  await page.hover('#player-rsn');
  await page.click('::-p-aria(Load or reload RSN levels)');
  await page.waitForFunction(() => document.querySelector('#player-lookup-status').textContent.startsWith('Levels for Test Player'));
  assert.equal(playerRequests.length, 2);
  assert.deepEqual(playerRequests[1], { username: 'test player', method: 'POST' });

  await page.$eval('#player-rsn', node => { node.focus(); node.select(); });
  await page.keyboard.type('missing');
  await page.keyboard.press('Enter');
  await waitForText('#player-lookup-status', 'Player not found');
  assert.match(await page.$eval('#player-lookup-status', node => node.textContent), /Test Player/);
  assert.equal((await tableNames()).length, expected.length);
  await page.$eval('#player-rsn', node => { node.focus(); node.select(); });
  await page.keyboard.type('limited');
  await page.keyboard.press('Enter');
  await waitForText('#player-lookup-status', 'Refresh limited');
  assert.deepEqual(playerRequests.slice(-2), [{ username: 'limited', method: 'POST' }, { username: 'limited', method: 'GET' }]);
  await waitForText('#player-levels-popout .osrs-total', `Total level: ${Object.values(playerLevels).reduce((sum, level) => sum + level, 99)}`);

  // Verify the header and popout at narrow widths in each existing theme.
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewport({ width, height: 900 });
    for (const theme of ['dark', 'light', 'rsmode']) {
      await page.select('select[aria-label="Theme"]', theme);
      assert.equal(await page.$eval('html', node => node.scrollWidth <= window.innerWidth), true);
      await page.focus('#player-rsn');
      const panelBounds = await page.$eval('#player-levels-popout', node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });
      assert.ok(panelBounds.left >= 0 && panelBounds.right <= width);
      const fields = await page.evaluate(() => {
        const rsn = document.querySelector('#player-rsn').getBoundingClientRect();
        const theme = document.querySelector('select[aria-label="Theme"]').getBoundingClientRect();
        return { rsnRight: rsn.right, rsnTop: rsn.top, themeLeft: theme.left, themeTop: theme.top };
      });
      assert.ok(fields.rsnRight <= fields.themeLeft && Math.abs(fields.rsnTop - fields.themeTop) < 1);
      assert.equal(await page.$eval('#player-skill-filter', node => {
        const label = node.closest('label');
        return label.previousElementSibling.textContent.trim() === 'Profitable only'
          && Math.abs(label.getBoundingClientRect().top - label.previousElementSibling.getBoundingClientRect().top) < 1;
      }), true);
      if (width === 1280) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `node_modules/.tmp/player-lookup-${theme}.png` });
      }
    }
  }
  await page.setViewport({ width: 375, height: 900 });
  await page.screenshot({ path: 'node_modules/.tmp/player-lookup-mobile.png' });
  await page.setViewport({ width: 1280, height: 900 });
  await page.screenshot({ path: 'node_modules/.tmp/player-lookup-desktop.png' });
  await page.click('#info-tab');
  await waitForText('#player-levels-info', 'which records a public hiscores snapshot');
  assert.equal(await page.$eval('#player-rsn', node => !!node.closest('header')), true);
  await page.click('#methods-tab');
  await page.focus('#player-rsn');
  await page.$eval('#player-rsn', node => node.select());
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#player-rsn', node => node.value), '');
  assert.equal(await page.$eval('#player-skill-filter', node => node.disabled && !node.checked), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('afk-player-v1')), null);
  assert.equal((await tableNames()).length, methods.length);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('#player-rsn', node => node.value), '');
  assert.equal(playerRequests.length, 5);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed for GE, charts, FAQ, header lookup/reload, OSRS skill layout and icons, hover/focus/Escape, eligibility, saved levels, errors, cooldown, clearing, and responsive themes.');
} finally {
  await browser.close();
}

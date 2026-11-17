import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import methods from './src/data/methods.json' with { type: 'json' };
import { meetsSkillRequirements, skillNames } from './src/player/profile.ts';
import { createScale } from './src/components/graph/graphData.ts';

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

const browser = await puppeteer.launch({ headless: 'shell', pipe: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox'] });
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
      if (request.resourceType() === 'image') {
        return request.respond({ status: 200, contentType: 'image/png', body: await readFile(new URL('./osrs/skills/fishing.png', dist)) });
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
    const row = [...table.tBodies[0].rows].find(row => row.querySelector('[data-column="method"]')?.innerText.includes(name));
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

  // Horizontal scrolling stays within the table, with a narrow pinned icon column.
  const tableViewport = '[aria-label="AFK methods table"]';
  const bottomScrollbar = '[aria-label="Scroll methods table horizontally (bottom)"]';
  assert.equal(await page.$('[aria-label="Scroll methods table horizontally (top)"]'), null, 'No scrollbar above the table');
  assert.equal(await page.$$eval('.method-table-scrollbar', nodes => nodes.length), 1, 'Only the bottom scrollbar is rendered');
  const waitForTableLayout = () => page.waitForFunction(() => {
    const viewport = document.querySelector('[aria-label="AFK methods table"]');
    return [...document.querySelectorAll('.method-table-scrollbar')].every(rail =>
      viewport.scrollWidth > viewport.clientWidth
        ? !rail.hidden && rail.scrollWidth === viewport.scrollWidth && rail.clientWidth === viewport.clientWidth
        : rail.hidden);
  });
  const waitForTableSync = async expected => {
    try {
      await page.waitForFunction(expected => {
        const viewport = document.querySelector('[aria-label="AFK methods table"]');
        return (expected === undefined || viewport.scrollLeft === expected)
          && [...document.querySelectorAll('.method-table-scrollbar')].every(rail => rail.hidden || rail.scrollLeft === viewport.scrollLeft);
      }, { timeout: 5000 }, expected);
    } catch (error) {
      const positions = await page.$$eval('[aria-label="AFK methods table"], .method-table-scrollbar', nodes => nodes.map(node => ({
        label: node.getAttribute('aria-label'), position: node.scrollLeft, content: node.scrollWidth, viewport: node.clientWidth,
      })));
      error.message += ` Expected ${expected}; ${JSON.stringify(positions)}`;
      throw error;
    }
  };
  for (const width of [320, 375, 768]) {
    await page.setViewport({ width, height: 900 });
    await waitForTableLayout();
    assert.equal(await page.$eval('html', node => node.scrollWidth <= innerWidth), true, `No page overflow at ${width}px`);
    assert.equal(await page.$eval(bottomScrollbar, node => node.hidden), false);
    await page.$eval(tableViewport, node => { node.scrollLeft = 0; });
    await waitForTableSync(0);
    const initial = await page.$eval('#methods-panel tbody tr', row => ({
      icon: row.cells[0].getBoundingClientRect().left,
      name: row.querySelector('[data-column="method"]').getBoundingClientRect().left,
    }));
    for (const [selector, fraction] of [[bottomScrollbar, 0.5], [tableViewport, 0.75], [bottomScrollbar, 1], [tableViewport, 0], [bottomScrollbar, 1], [tableViewport, 0]]) {
      const expectedScroll = await page.$eval(selector, (node, fraction) => {
        node.scrollLeft = Math.round((node.scrollWidth - node.clientWidth) * fraction);
        return node.scrollLeft;
      }, fraction);
      await waitForTableSync(expectedScroll);
      const geometry = await page.$eval(tableViewport, viewport => {
        const row = viewport.querySelector('tbody tr');
        return {
          scroll: viewport.scrollLeft,
          icon: row.cells[0].getBoundingClientRect().left,
          name: row.querySelector('[data-column="method"]').getBoundingClientRect().left,
          lastRight: row.lastElementChild.getBoundingClientRect().right,
          viewportRight: viewport.getBoundingClientRect().right - viewport.clientLeft,
        };
      });
      assert.equal(geometry.scroll, expectedScroll, 'The latest scroll input wins');
      assert.ok(Math.abs(geometry.icon - initial.icon) < 1, `Icon stays pinned at ${width}px`);
      assert.ok(Math.abs(initial.name - geometry.name - geometry.scroll) < 1, `Names scroll with the data at ${width}px: ${JSON.stringify({ initial, geometry })}`);
      if (fraction === 1) assert.ok(Math.abs(geometry.lastRight - geometry.viewportRight) < 1, `Final column is reachable at ${width}px: ${JSON.stringify(geometry)}`);
    }
  }

  for (const selector of [bottomScrollbar, tableViewport]) {
    await page.$eval(tableViewport, node => { node.scrollLeft = 0; });
    await waitForTableSync(0);
    await page.focus(selector);
    await page.$eval(selector, node => {
      node.setAttribute('data-awaiting-scroll-end', '');
      const finish = () => {
        if (node.scrollLeft <= 0) return;
        node.removeAttribute('data-awaiting-scroll-end');
        node.removeEventListener('scrollend', finish);
      };
      node.addEventListener('scrollend', finish);
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(selector => !document.querySelector(selector).hasAttribute('data-awaiting-scroll-end'), { timeout: 5000 }, selector);
    await waitForTableSync();
    assert.ok(await page.$eval(tableViewport, node => node.scrollLeft > 0), `Keyboard scrolling synchronizes ${selector}`);
  }

  // The lower rail follows the viewport, then settles at the end of the table.
  await page.setViewport({ width: 375, height: 900 });
  await waitForTableLayout();
  await page.$eval(tableViewport, node => window.scrollTo(0, node.getBoundingClientRect().top + scrollY + 400));
  assert.equal(await page.$eval(bottomScrollbar, node => Math.round(node.getBoundingClientRect().bottom)), 900);
  for (const theme of ['dark', 'light', 'rsmode']) {
    await page.select('select[aria-label="Theme"]', theme);
    await page.$eval(tableViewport, node => {
      node.scrollLeft = Math.round((node.scrollWidth - node.clientWidth) / 2);
      window.scrollTo(0, node.getBoundingClientRect().top + scrollY + 400);
    });
    await waitForTableSync();
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[aria-label="AFK methods table"]');
      return getComputedStyle(viewport.querySelector('tbody td')).backgroundColor === getComputedStyle(viewport).backgroundColor;
    });
    assert.equal(await page.$eval(tableViewport, node => getComputedStyle(node.querySelector('tbody td')).backgroundColor === getComputedStyle(node).backgroundColor), true, `Pinned icons have an opaque ${theme} background`);
    await page.hover('#methods-panel tbody tr > td:first-child');
    await page.waitForFunction(() => {
      const row = document.querySelector('#methods-panel tbody tr');
      return getComputedStyle(row.cells[0]).backgroundColor === getComputedStyle(row).backgroundColor;
    });
    await page.mouse.move(0, 0);
    await page.$eval(tableViewport, node => window.scrollTo(0, node.getBoundingClientRect().top + scrollY + 400));
    await page.screenshot({ path: `node_modules/.tmp/method-table-scroll-${theme}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.equal(await page.$eval(bottomScrollbar, node => {
    const bar = node.getBoundingClientRect();
    return bar.bottom < innerHeight && Math.abs(bar.bottom - node.parentElement.getBoundingClientRect().bottom) < 1;
  }), true, 'Lower rail settles at the table bottom');
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'table-scroll-test-spacer';
    spacer.style.height = '100vh';
    document.getElementById('root').append(spacer);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  assert.equal(await page.$eval(bottomScrollbar, node => node.getBoundingClientRect().bottom < 0), true, 'Lower rail leaves with the table');
  await page.evaluate(() => { document.getElementById('table-scroll-test-spacer').remove(); window.scrollTo(0, 0); });

  // Column changes and viewport growth clamp the table and update rail visibility.
  await page.setViewport({ width: 768, height: 900 });
  await waitForTableLayout();
  await page.$eval(tableViewport, node => { node.scrollLeft = node.scrollWidth; });
  await waitForTableSync();
  for (const label of ['Economics', 'GE Limit', 'GP/XP', 'AFK Time']) {
    await page.click(`::-p-aria(${label})`);
    await waitForTableLayout();
    await waitForTableSync();
  }
  assert.equal(await page.$eval(bottomScrollbar, node => node.hidden), true, 'Scrollbar hides when columns fit');
  for (const label of ['Economics', 'GE Limit', 'GP/XP', 'AFK Time']) await page.click(`::-p-aria(${label})`);
  await waitForTableLayout();
  assert.equal(await page.$eval(bottomScrollbar, node => node.hidden), false, 'Rails return with overflowing columns');
  await page.$eval(tableViewport, node => { node.scrollLeft = node.scrollWidth; });
  await waitForTableSync();
  await page.setViewport({ width: 1280, height: 900 });
  await waitForTableLayout();
  assert.equal(await page.$eval(tableViewport, node => node.scrollLeft), 0, 'Growing the viewport resets a clamped scroll');
  assert.equal(await page.$eval(bottomScrollbar, node => node.hidden), true);
  await page.select('select[aria-label="Theme"]', 'dark');

  await page.click('#graph-tab');
  assert.equal(await page.$('.method-table-scrollbar'), null, 'Table scrollbars unmount with Methods');
  const marker = '#graph-panel button[data-method-id]';
  const popout = '#scatter-method-popout';
  await page.waitForSelector(marker, { visible: true });
  assert.equal(await page.$$eval(marker, nodes => nodes.length), methods.length, 'Every method has its own scatter point');
  assert.equal(await page.$$eval(marker, nodes => nodes.some(node => /overlapping methods/.test(node.getAttribute('aria-label')))), false);
  const idleIconCount = await page.$$eval(`${marker} [data-idle-icon] img`, nodes => nodes.length);
  assert.ok(idleIconCount > 0 && idleIconCount < methods.length, 'Isolated points show small icons while dense points remain dots');

  const coincident = Map.groupBy(methods, method => JSON.stringify([method.xp.perHour, method.afk.typicalSeconds]));
  const xScale = createScale(methods.map(method => method.xp.perHour), 'xp', 5, { logarithmic: false });
  const yScale = createScale(methods.map(method => method.afk.typicalSeconds), 'afk', 5, { logarithmic: false });

  // Dot coordinates are the exact axis projections, not displaced collision targets.
  // Every distinct spot remains hoverable even in a dense area, with no icon hit interception.
  for (const width of [1280, 375, 320]) {
    await page.setViewport({ width, height: 900 });
    await page.waitForFunction(width => {
      const plot = document.querySelector('#graph-panel [aria-label^="Scatter plot"]');
      return plot && Number(plot.querySelector('svg').getAttribute('width')) === plot.clientWidth
        && (width < 480 ? plot.querySelector('button').clientWidth === 44 : plot.querySelector('button').clientWidth === 28);
    }, {}, width);
    await page.mouse.move(0, 0);
    const geometry = await page.$eval('#graph-panel [aria-label^="Scatter plot"]', plot => ({
      axis: plot.querySelector('path').getAttribute('d').match(/M ([\d.]+) ([\d.]+) V ([\d.]+) H ([\d.]+)/).slice(1).map(Number),
      dots: [...plot.querySelectorAll('button[data-method-id]')].map(node => ({ id: node.dataset.methodId, left: parseFloat(node.style.left), top: parseFloat(node.style.top) })),
    }));
    const expectedIcons = geometry.dots.filter(point => geometry.dots.every(other =>
      other.id === point.id || Math.abs(other.left - point.left) >= 34 || Math.abs(other.top - point.top) >= 34,
    )).map(point => point.id).sort();
    const idleIcons = await page.$$eval(`${marker} [data-idle-icon]`, nodes => nodes.map(node => {
      const button = node.closest('button');
      const center = button.getBoundingClientRect();
      const icon = node.firstElementChild.getBoundingClientRect();
      return {
        id: button.dataset.methodId, width: icon.width, height: icon.height,
        dx: icon.x + icon.width / 2 - (center.x + center.width / 2),
        dy: icon.y + icon.height / 2 - (center.y + center.height / 2),
        border: getComputedStyle(node.firstElementChild).borderWidth,
      };
    }));
    assert.ok(idleIcons.length > 0, `Isolated icons remain available at ${width}px`);
    assert.deepEqual(idleIcons.map(icon => icon.id).sort(), expectedIcons, `Icon eligibility follows the available space at ${width}px`);
    for (const { id, ...icon } of idleIcons) {
      assert.deepEqual(icon, { width: 28, height: 28, dx: 0, dy: 0, border: '0px' }, `${id} has a centered, borderless small icon`);
    }
    const idleMarker = `${marker}[data-method-id="${idleIcons[0].id}"]`;
    await page.hover(idleMarker);
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(`${selector} [data-idle-icon]`)).visibility === 'hidden', {}, idleMarker);
    await page.waitForSelector('[data-scatter-preview] img');
    await page.mouse.move(0, 0);
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(`${selector} [data-idle-icon]`)).visibility === 'visible', {}, idleMarker);
    const [left, top, bottom, right] = geometry.axis;
    for (const dot of geometry.dots) {
      const method = methods.find(method => method.id === dot.id);
      assert.ok(Math.abs(dot.left - (left + (right - left) * xScale.position(method.xp.perHour))) < 0.01, `${dot.id} retains its exact X coordinate at ${width}px (CSSOM subpixel precision)`);
      assert.ok(Math.abs(dot.top - (bottom - (bottom - top) * yScale.position(method.afk.typicalSeconds))) < 0.01, `${dot.id} retains its exact Y coordinate at ${width}px (CSSOM subpixel precision)`);
    }
    for (const members of coincident.values()) {
      await page.hover(`${marker}[data-method-id="${members[0].id}"]`);
      await page.waitForFunction(id => !!document.querySelector(`[data-preview-method-id="${id}"]`), {}, members[0].id);
      const visible = await page.$$eval('[data-preview-method-id]', nodes => nodes.map(node => node.dataset.previewMethodId).sort());
      assert.deepEqual(visible, members.map(method => method.id).sort(), `Only exact overlaps share hover icons at ${width}px`);
    }
    const after = await page.$$eval(marker, nodes => nodes.map(node => ({ id: node.dataset.methodId, left: parseFloat(node.style.left), top: parseFloat(node.style.top) })));
    assert.deepEqual(after, geometry.dots, 'Hover never shifts the points');
    await page.hover(marker);
    await page.waitForSelector('[data-scatter-preview] img');
    const icon = await page.$eval('[data-scatter-preview]', gallery => {
      const box = gallery.getBoundingClientRect();
      const image = gallery.querySelector('img').getBoundingClientRect();
      return { width: image.width, height: image.height, dx: image.x + image.width / 2 - (box.x + box.width / 2), dy: image.y + image.height / 2 - (box.y + box.height / 2), border: getComputedStyle(gallery.querySelector('img').parentElement).borderWidth };
    });
    assert.deepEqual(icon, { width: 80, height: 80, dx: 0, dy: 0, border: '0px' }, 'Hover icons are large, centered, and borderless');
    assert.equal(await page.$eval('html', node => node.scrollWidth <= window.innerWidth), true);
  }
  await page.setViewport({ width: 1280, height: 900 });
  await page.mouse.move(0, 0);

  // Clicking an exact overlap cycles through every method and wraps without stealing focus.
  const overlap = [...coincident.values()].find(members => members.length > 1).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const overlapMarker = `${marker}[data-method-id="${overlap[0].id}"]`;
  await page.hover(overlapMarker);
  await page.screenshot({ path: 'node_modules/.tmp/scatter-overlap-hover.png' });
  await page.click(overlapMarker);
  const nextMethod = `${popout} [aria-label="Next method at this point"]`;
  for (let index = 0; index < overlap.length; index += 1) {
    await waitForText(`${popout} h3`, overlap[index].name);
    await waitForText(`${popout} [role="status"]`, `${index + 1} of ${overlap.length}`);
    await page.click(nextMethod);
    assert.equal(await page.$eval(nextMethod, node => document.activeElement === node), true, 'Next retains keyboard focus');
  }
  await waitForText(`${popout} h3`, overlap[0].name);
  await page.keyboard.press('Escape');
  await page.waitForSelector(popout, { hidden: true });
  const specificOverlap = `${marker}[data-method-id="${overlap[2].id}"]`;
  await page.focus(specificOverlap);
  await page.keyboard.press('Enter');
  await waitForText(`${popout} h3`, overlap[2].name);
  await waitForText(`${popout} [role="status"]`, `3 of ${overlap.length}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(id => document.activeElement?.dataset.methodId === id, {}, overlap[2].id);

  await page.focus(marker);
  const firstId = await page.$eval(marker, node => node.dataset.methodId);
  const firstMethod = methods.find(method => method.id === firstId);
  await page.keyboard.press('Enter');
  await page.waitForSelector(popout, { visible: true });
  assert.equal(await page.$('dialog'), null, 'Scatter details are not a modal');
  assert.equal(await page.$eval(popout, node => node.getAttribute('aria-modal')), 'false');
  await page.waitForFunction(() => document.activeElement?.matches('#scatter-method-popout h3'));
  await waitForText(`${popout} h3`, firstMethod.name);
  for (const label of ['XP/hr', 'Net GP/hr', 'Typical AFK time', 'Interactions/hr', 'Net GP/XP', 'Cost/hr', 'Revenue/hr after GE tax', 'Requirements']) {
    await waitForText(popout, label);
  }
  await page.waitForFunction(() => [...document.querySelectorAll('#scatter-method-popout img')].every(img => img.complete && img.naturalWidth > 0));

  // Open details remain anchored and bounded on resize, without blocking the page.
  await page.setViewport({ width: 320, height: 900 });
  await page.waitForFunction(() => {
    const box = document.querySelector('#scatter-method-popout')?.getBoundingClientRect();
    return box && box.left >= 0 && box.right <= window.innerWidth;
  });
  await page.$eval(popout, node => node.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'node_modules/.tmp/scatter-popout-mobile.png' });
  await page.setViewport({ width: 1280, height: 900 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(id => !document.querySelector('#scatter-method-popout') && document.activeElement?.dataset.methodId === id, {}, firstId);

  // Space opens; moving focus outside and pointer light-dismiss do not steal focus.
  await page.keyboard.press('Space');
  await page.waitForSelector(popout);
  await page.focus('#graph-panel select');
  await page.waitForSelector(popout, { hidden: true });
  assert.equal(await page.$eval('#graph-panel select', node => document.activeElement === node), true);
  const cannonballMarker = `${marker}[data-method-id="cannonballs"]`;
  await page.click(cannonballMarker);
  await waitForText(`${popout} h3`, cannonballs);
  assert.equal(await page.$(`${popout} [aria-label="Next method at this point"]`), null, 'Single methods do not have a Next button');
  await page.screenshot({ path: 'node_modules/.tmp/scatter-popout-desktop.png' });
  await page.click('#graph-title');
  await page.waitForSelector(popout, { hidden: true });
  await page.click(cannonballMarker);
  await page.click(`${popout} [aria-label="Close method details"]`);
  await page.waitForFunction(() => !document.querySelector('#scatter-method-popout') && document.activeElement?.dataset.methodId === 'cannonballs');

  // Filtering out the selection and changing axes clear it instead of reviving stale details.
  await page.click(cannonballMarker);
  await page.select('#min-xp', '20000');
  await page.waitForSelector(popout, { hidden: true });
  await page.select('#min-xp', '0');
  await page.click(cannonballMarker);
  await page.select('#graph-panel select:nth-of-type(1)', 'xp');
  await page.$$eval('#graph-panel select', selects => {
    selects[1].value = 'xp';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector(popout, { hidden: true });
  await page.waitForSelector(marker);
  assert.equal(await page.$$eval(marker, nodes => nodes.length), methods.length);
  await page.$$eval('#graph-panel select', selects => {
    selects[1].value = 'afk';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });

  releaseFirstPrices();
  await waitForText('#market-status', 'Prices updated');
  const lastUpdated = (await status()).replace('Prices updated ', '');
  await page.click(cannonballMarker);
  await waitForText(popout, 'Unavailable');
  await page.click(`${popout} summary`);
  await waitForText(popout, 'Steel bar');
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
  assert.equal(await page.$eval('#methods-panel table', table => table.tBodies[0].rows[0].cells[0].colSpan === table.tHead.rows[0].cells.length), true, 'Empty results span the icon column too');
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
  const tableNames = () => page.$$eval('#methods-panel tbody tr', rows => rows.map(row => row.querySelector('[data-column="method"]')?.innerText ?? ''));
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
  console.log('Browser smoke passed for synchronized table scrollbars, viewport-sticky scrolling, pinned method icons, responsive columns and themes, GE, exact scatter coordinates, space-aware idle icons, nearest-point picking, large centered borderless hover icons, coincident icon galleries and Next cycling, non-modal popouts and dismissal, responsive scatter layout, bars, FAQ, header lookup/reload, OSRS skill layout and icons, hover/focus/Escape, eligibility, saved levels, errors, cooldown, clearing, and responsive themes.');
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketData } from '../src/market/marketData.ts';
import { createMarketTransport } from '../src/market/marketTransport.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
const mapping = [{ id: 2, name: 'Cannonball', limit: 11000 }];
const priceResponse = price => ({ data: { 2: { high: price, low: null } } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('mapping and prices load independently and retry only the missing mapping', async t => {
  t.mock.method(console, 'error', () => {});
  let mappingCalls = 0;
  let finishMapping;
  const market = createMarketData(createMarketTransport(async url => {
    if (url.endsWith('/latest')) return json(priceResponse(1000));
    if (++mappingCalls === 1) return new Promise(resolve => { finishMapping = resolve; });
    return json(mapping);
  }));
  t.after(market.start());

  await flush();
  assert.equal(market.getSnapshot().prices.status, 'ready');
  assert.equal(market.getSnapshot().mapping.status, 'loading');
  market.refresh();
  await flush();
  assert.equal(mappingCalls, 1);
  finishMapping(json({}, 503));
  await flush();
  assert.equal(market.getSnapshot().mapping.status, 'unavailable');
  market.refresh();
  await flush();
  assert.equal(market.getSnapshot().mapping.data[2].limit, 11000);
  market.refresh();
  await flush();
  assert.equal(mappingCalls, 2);
});

test('first price failure leaves mapping usable and a later refresh recovers', async t => {
  t.mock.method(console, 'error', () => {});
  let priceCalls = 0;
  const market = createMarketData(createMarketTransport(async url => {
    if (url.endsWith('/mapping')) return json(mapping);
    return ++priceCalls === 1 ? json({ data: [] }) : json(priceResponse(600));
  }));
  t.after(market.start());

  await flush();
  assert.deepEqual(market.getSnapshot().prices, { status: 'unavailable' });
  assert.equal(market.getSnapshot().mapping.status, 'ready');
  market.refresh();
  await flush();
  assert.equal(market.getSnapshot().prices.data[2].high, 600);
});

test('a timer and repeated manual requests share the pending refresh and retain the last good prices on failure', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 });
  t.mock.method(console, 'error', () => {});
  let priceCalls = 0;
  let finishRefresh;
  const market = createMarketData(createMarketTransport(async url => {
    if (url.endsWith('/mapping')) return json(mapping);
    priceCalls += 1;
    if (priceCalls === 2) return new Promise(resolve => { finishRefresh = resolve; });
    return json(priceResponse(priceCalls * 1000));
  }));
  t.after(market.start());

  await flush();
  const lastGood = market.getSnapshot().prices;
  market.refresh();
  market.refresh();
  t.mock.timers.tick(300_000);
  assert.equal(priceCalls, 2);
  assert.deepEqual(market.getSnapshot().prices, { ...lastGood, status: 'refreshing' });
  finishRefresh(json({ data: { 2: { high: 'invalid', low: null } } }));
  await flush();
  assert.deepEqual(market.getSnapshot().prices, { ...lastGood, status: 'stale' });

  t.mock.timers.tick(300_000);
  await flush();
  const recovered = market.getSnapshot().prices;
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.data[2].high, 3000);
  assert.ok(recovered.updatedAt > lastGood.updatedAt);
});

test('a stalled request times out, aborts fetch, and can be retried', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const log = t.mock.method(console, 'error', () => {});
  let pendingSignal;
  const market = createMarketData(createMarketTransport(async (url, { signal }) => {
    if (url.endsWith('/mapping')) return json(mapping);
    if (pendingSignal) return json(priceResponse(600));
    pendingSignal = signal;
    return new Promise(() => {});
  }));
  t.after(market.start());

  await flush();
  assert.equal(market.getSnapshot().mapping.status, 'ready');
  t.mock.timers.tick(14_999);
  assert.equal(market.getSnapshot().prices.status, 'loading');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(market.getSnapshot().prices.status, 'unavailable');
  assert.equal(pendingSignal.aborted, true);
  assert.match(log.mock.calls[0].arguments[1].message, /timed out/);
  market.refresh();
  await flush();
  assert.equal(market.getSnapshot().prices.status, 'ready');
});

test('desktop responses use the existing commands and fall back on malformed or failed responses', async () => {
  const web = [];
  const native = [];
  const transport = createMarketTransport(async url => {
    web.push(url);
    return json(url.endsWith('/mapping') ? mapping : {
      data: { 2: { high: 'bad', low: 900 }, 2353: { high: null, low: null } },
    });
  }, async command => {
    native.push(command);
    if (command === 'fetch_mapping') return mapping;
    return { data: { 2: null } };
  });
  const { signal } = new AbortController();
  const prices = await transport.loadPrices(signal);
  assert.equal(prices[2].low, 900);
  assert.equal(prices[2].high, null);
  assert.equal(prices[2353], undefined);
  assert.equal((await transport.loadMapping(signal))[2].name, 'Cannonball');
  assert.deepEqual(native, ['fetch_prices', 'fetch_mapping']);
  assert.deepEqual(web, ['https://prices.runescape.wiki/api/v1/osrs/latest']);
});

test('a desktop timeout gives web fallback a fresh deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let webSignal;
  let finishWeb;
  const transport = createMarketTransport(async (_url, { signal }) => {
    webSignal = signal;
    return new Promise(resolve => { finishWeb = resolve; });
  }, () => new Promise(() => {}));
  const load = transport.loadPrices(new AbortController().signal);
  t.mock.timers.tick(15_000);
  await flush();
  assert.equal(webSignal.aborted, false);
  t.mock.timers.tick(14_999);
  finishWeb(json(priceResponse(900)));
  assert.equal((await load)[2].high, 900);
});

test('cleanup cancels fetch, clears the timer and ignores late native results after restart', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const nativePriceRequests = [];
  const mappingSignals = [];
  const transport = createMarketTransport(async (url, { signal }) => {
    assert.ok(url.endsWith('/mapping'), 'a stopped native request must skip web fallback');
    mappingSignals.push(signal);
    return new Promise(() => {});
  }, async command => {
    if (command === 'fetch_mapping') throw new Error('Simulated desktop mapping failure');
    return new Promise(resolve => nativePriceRequests.push(resolve));
  });
  const market = createMarketData(transport);
  market.start()(); // Strict Mode's first setup and immediate cleanup.
  const stop = market.start();
  await flush();
  assert.equal(nativePriceRequests.length, 1);
  stop();
  assert.equal(mappingSignals[0].aborted, true);

  const stopRestart = market.start();
  t.after(stopRestart);
  await flush();
  nativePriceRequests[1](priceResponse(1000));
  await flush();
  const restarted = market.getSnapshot();
  nativePriceRequests[0](priceResponse(1));
  await flush();
  assert.equal(market.getSnapshot(), restarted);
  assert.equal(restarted.prices.data[2].high, 1000);
  stopRestart();
  t.mock.timers.tick(600_000);
  assert.equal(nativePriceRequests.length, 2);
});

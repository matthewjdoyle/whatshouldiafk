import assert from 'node:assert/strict';
import test from 'node:test';
import methods from '../src/data/methods.json' with { type: 'json' };
import { calculateMethod, getGpPerXp, hasConfirmedProfit } from '../src/calculations/profit.ts';
import { getAxisValue, getMetricValue } from '../src/components/graph/graphData.ts';

const cannonballs = methods.find(method => method.id === 'cannonballs');

test('missing steel bar quotes make cannonball profit unavailable across the table, filter and graph', () => {
  const result = calculateMethod(cannonballs, { 2: { high: 1000, low: 1000 } }, {});
  assert.equal(result.itemPrices.find(item => item.id === 2353).price, null);
  assert.equal(result.costPerHour, null);
  assert.equal(result.revenuePerHour, 2_116_800);
  assert.equal(result.profitPerHour, null);
  assert.equal(getGpPerXp(result), null);
  assert.equal(hasConfirmedProfit(result), false);
  assert.equal(getMetricValue(result, 'profit'), null);
  assert.match(getAxisValue(result, 'profit', false, 'Y axis').reason, /Missing GE price for Steel bar/);
  assert.equal(getMetricValue(result, 'xp'), cannonballs.xp.perHour);
});

test('known prices preserve input and output fallbacks and GE tax', () => {
  const result = calculateMethod(cannonballs, {
    2: { high: 1000, low: null },
    2353: { high: null, low: 500 },
  }, {});
  assert.equal(result.costPerHour, 270_000);
  assert.equal(result.revenuePerHour, 2_116_800);
  assert.equal(result.profitPerHour, 1_846_800);
  assert.equal(hasConfirmedProfit(result), true);
  assert.equal(getMetricValue(result, 'profit'), result.profitPerHour);
  assert.equal(getMetricValue(result, 'gpXp'), getGpPerXp(result));
});

test('fixed coin values and zero profit are known without a live price snapshot', () => {
  const result = calculateMethod({
    ...cannonballs,
    xp: { perHour: 0 },
    inputs: [{ id: 995, name: 'Coins', amountPerHour: 1000 }],
    outputs: [
      { id: 13204, name: 'Platinum token', amountPerHour: 1 },
      { id: 2, name: 'Cannonball', amountPerHour: 0 },
    ],
  }, {}, {});
  assert.equal(result.costPerHour, 1000);
  assert.equal(result.revenuePerHour, 1000);
  assert.equal(getMetricValue(result, 'profit'), 0);
  assert.equal(getGpPerXp(result), null);
  assert.equal(hasConfirmedProfit(result), false);
});

process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastProduct, inventoryQuantities, clipOutliers, mape, Z } from '../src/intelligence/forecasting.js';
import { buildSeries } from '../src/services/inventory.js';
import { canonicalize, distinctPeople, isSpike, rescaleToAnchor, scoreTrend, searchGrowth, similarity, trendStatus, trialQty, crossedOver } from '../src/intelligence/trends.js';
import { alertQty, labelFor, regionMatches, verifyWithMandi, productMatchesCommodity, combineConfidence } from '../src/intelligence/market.js';
import { CircuitBreaker, quotaAllows, withRetry } from '../src/adapters/core.js';

const months = (vals, start = 2024) => vals.map((qty, i) => ({ month: `${start + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, qty }));

// ------------------------------------------------------------ forecasting
test('inventory formulas match a hand calculation', () => {
  // d = 300/30 = 10/day; σd = 30/√30 = 5.477; SS = 1.65 × 5.477 × √4 = 18.07; ROP = 10×4 + 18.07 = 58.07
  // orderQty = 10×30 + 18.07 − 100 = 218.07 → pack 12 → 228
  const r = inventoryQuantities({ nextMonthQty: 300, monthlySd: 30, leadTimeDays: 4, perishable: false, shelfLifeDays: null, currentStock: 100, packSize: 12 });
  assert.equal(r.safetyStock, 18.07);
  assert.equal(r.reorderPoint, 58.07);
  assert.equal(r.orderQty, 228);
  assert.equal(Z, 1.65);
});

test('perishable cover is min(30, 0.8 × shelf life)', () => {
  const r = inventoryQuantities({ nextMonthQty: 300, monthlySd: 0, leadTimeDays: 1, perishable: true, shelfLifeDays: 5, currentStock: 0, packSize: 1 });
  assert.equal(r.explain.coverDays, 4);
  assert.equal(r.orderQty, 40); // 10/day × 4 days
});

test('fewer than 3 months → insufficient_data, no forecast', () => {
  const f = forecastProduct(months([5, 6]));
  assert.equal(f.method, 'insufficient_data');
  assert.equal(f.months.length, 0);
});

test('3–5 months uses mean of the last 3', () => {
  const f = forecastProduct(months([10, 20, 30, 40]));
  assert.equal(f.method, 'mean_last_3');
  assert.equal(f.months[0].predictedQty, 30);
});

test('trend series → Holt forecast continues the trend', () => {
  const f = forecastProduct(months(Array.from({ length: 12 }, (_, i) => 100 + 10 * i)));
  assert.ok(['holt_damped', 'naive'].includes(f.method));
  assert.ok(f.months[0].predictedQty > 190, `got ${f.months[0].predictedQty}`);
  assert.ok(f.months[0].lower <= f.months[0].predictedQty && f.months[0].upper >= f.months[0].predictedQty);
});

test('seasonal series (24+ months) → Holt-Winters captures the Diwali peak', () => {
  const season = [1, 1, 1, 1, 1, 1, 1, 1, 1.2, 2, 1.7, 1];
  const vals = Array.from({ length: 36 }, (_, i) => Math.round(100 * season[i % 12] * (1 + 0.01 * i)));
  const f = forecastProduct(months(vals.slice(0, 33))); // last month = Sep → next = Oct (peak)
  assert.equal(f.method, 'holt_winters');
  assert.ok(f.months[0].predictedQty > 170, `October forecast ${f.months[0].predictedQty}`);
  assert.equal(f.confidence, 'high');
});

test('naive is chosen when it backtests better', () => {
  // A level shift: last values flat at 50 after a long 10-level history → naive (last value) wins.
  const f = forecastProduct(months([10, 10, 10, 10, 10, 10, 10, 50, 50, 50, 50, 50]));
  assert.equal(f.method, 'naive');
  assert.ok(f.naiveMape <= (f.mape ?? Infinity));
});

test('outliers are clipped at 3 MAD and gaps are flagged', () => {
  const { values, clipped } = clipOutliers([10, 11, 9, 10, 500, 10]);
  assert.deepEqual(clipped, [4]);
  assert.ok(values[4] < 20);
  const s = buildSeries(new Map([['2026-01', 5], ['2026-03', 7]]), new Date('2026-05-15'));
  assert.deepEqual(s.map((m) => [m.month, m.qty, m.gap]), [['2026-01', 5, false], ['2026-02', 0, true], ['2026-03', 7, false], ['2026-04', 0, true]]);
  assert.equal(mape([0, 10], [5, 12]), 20);
});

// ------------------------------------------------------------ trends
test('anchor rescaling makes batches comparable (synthetic)', () => {
  // Same true series measured in a batch where Trends scaled everything ×2.
  const reference = [50, 50, 50];
  const anchorInBatch = [100, 100, 100];
  assert.deepEqual(rescaleToAnchor([20, 40, 60], anchorInBatch, reference), [10, 20, 30]);
});

test('search growth = mean(last 4) / mean(previous 8)', () => {
  assert.equal(searchGrowth([...Array(1).fill(0), ...Array(8).fill(10), ...Array(4).fill(25)]), 2.5);
});

test('scoring formula and caps', () => {
  const s = scoreTrend({ distinctPeople: 3, searchGrowth: 1.5, sourceCount: 2 });
  // 100 × (0.45×0.5 + 0.35×0.5 + 0.2×0.5) = 50
  assert.equal(s.score, 50);
  assert.equal(scoreTrend({ distinctPeople: 99, searchGrowth: 99, sourceCount: 99 }).score, 100);
});

test('sponsored-only mentions score at most 80% of the unsponsored equivalent', () => {
  const base = { distinctPeople: 4, searchGrowth: 2, sourceCount: 3 };
  const a = scoreTrend({ ...base, sponsoredShare: 0 }).score;
  const b = scoreTrend({ ...base, sponsoredShare: 1 }).score;
  assert.ok(b <= a * 0.8 + 1e-9);
});

test('the same person named twice counts once', () => {
  const p = distinctPeople([{ name: 'Aarav Malhotra', role: 'celebrity' }, { name: 'aarav malhotra.', role: 'celebrity' }, { name: 'Malhotra, Aarav', role: 'celebrity' }, { name: 'Dr X', role: 'other' }]);
  assert.equal(p.length, 1);
  assert.equal(p[0].mentions, 3);
});

test('keyword normalisation: alias, fuzzy ≥90, new', () => {
  const aliases = new Map([['stanley cup', 'insulated tumbler']]);
  assert.deepEqual(canonicalize('Stanley Cup!', aliases, []), { canonical: 'insulated tumbler', via: 'alias' });
  assert.equal(canonicalize('Pickleball Paddles', aliases, ['pickleball paddle']).via, 'fuzzy');
  assert.equal(canonicalize('matcha', aliases, ['makhana']).via, 'new');
  assert.ok(similarity('pickleball paddles', 'pickleball paddle') >= 90);
});

test('status, spike, trial quantity and crossover rules', () => {
  assert.equal(trendStatus(1.5, 3, 2), 'emerging');
  assert.equal(trendStatus(0.8, 0, 3), 'fading');
  assert.equal(trendStatus(1.1, 1, 1), 'peaking');
  assert.equal(isSpike(['2026-11-10', '2026-11-11']), true);
  assert.equal(isSpike(['2026-11-01', '2026-11-11']), false);
  assert.equal(trialQty(0), 1);
  assert.equal(trialQty(43), 5);
  assert.equal(trialQty(10000), 20);
  assert.equal(crossedOver(5, 4), true);
  assert.equal(crossedOver(4, 4), false);
});

// ------------------------------------------------------------ market
const DAY = 86400000;
const rows = (prev, recent, now) => [...Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (8 + i) * DAY), modalPrice: prev })), ...Array.from({ length: 7 }, (_, i) => ({ date: new Date(now - i * DAY), modalPrice: recent }))];

test('mandi verification: +10% verified, +3% not', () => {
  const now = Date.now();
  assert.equal(verifyWithMandi(rows(1000, 1100, now), 'up', new Date(now)).verified, true);
  assert.equal(verifyWithMandi(rows(1000, 1030, now), 'up', new Date(now)).verified, false);
  assert.equal(verifyWithMandi(rows(1000, 900, now), 'down', new Date(now)).verified, true);
});

test('region matching: Maharashtra-only signals do not reach other states', () => {
  const s = { scope: 'regional', regions: ['Maharashtra'] };
  assert.equal(regionMatches(s, { state: 'Maharashtra', district: 'Pune' }), true);
  assert.equal(regionMatches(s, { state: 'Karnataka', district: 'Bengaluru' }), false);
  assert.equal(regionMatches({ scope: 'national', regions: [] }, { state: 'Karnataka' }), true);
});

test('alert quantities: perishable warning only, happened info only, drop = hold off, rise capped', () => {
  assert.equal(alertQty({ status: 'expected', direction: 'up', perishable: true, nextCycleNeed: 100, orderQty: 100, maxQtyMultiplier: 1.5 }).qty, 0);
  assert.equal(alertQty({ status: 'happened', direction: 'up', perishable: false, nextCycleNeed: 100, orderQty: 100, maxQtyMultiplier: 1.5 }).qty, 0);
  assert.equal(alertQty({ status: 'expected', direction: 'down', perishable: false, nextCycleNeed: 100, orderQty: 100, maxQtyMultiplier: 1.5 }).qty, 0);
  assert.equal(alertQty({ status: 'expected', direction: 'up', perishable: false, nextCycleNeed: 100, orderQty: 50, maxQtyMultiplier: 1.5 }).qty, 75);
  assert.equal(alertQty({ status: 'expected', direction: 'up', perishable: false, nextCycleNeed: 10, orderQty: 100, maxQtyMultiplier: 1.5 }).qty, 12);
  assert.equal(alertQty({ status: 'expected', direction: 'up', perishable: false, nextCycleNeed: 0.3, orderQty: 5, maxQtyMultiplier: 1.5 }).qty, 0, 'dead stock never bought ahead');
  assert.equal(labelFor('happened'), 'Already happened');
  assert.equal(labelFor('expected'), 'Expected');
});

test('commodity matching uses product names (Hindi synonyms too)', () => {
  const onion = { name: 'onion', synonyms: ['pyaz', 'kanda'] };
  assert.equal(productMatchesCommodity({ name: 'Kanda Nashik 1kg', category: 'Vegetables' }, onion), true);
  assert.equal(productMatchesCommodity({ name: 'Cabinet Hinges', category: 'Hardware & Plywood' }, { name: 'plywood', synonyms: [] }), false);
  assert.ok(combineConfidence([0.6, 0.6]) > 0.6);
});

// ------------------------------------------------------------ adapters
test('circuit breaker opens after 5 failures and stays open for 5 minutes', async () => {
  let t = 0;
  const b = new CircuitBreaker('test', { now: () => t });
  for (let i = 0; i < 5; i += 1) await assert.rejects(b.exec(async () => { throw new Error('x'); }));
  assert.equal(b.state, 'open');
  await assert.rejects(b.exec(async () => 1), /circuit open/);
  t = 5 * 60 * 1000 + 1;
  assert.equal(await b.exec(async () => 1), 1);
  assert.equal(b.state, 'closed');
});

test('quota guard stops at 80% of the daily limit', () => {
  assert.equal(quotaAllows(79, 100), true);
  assert.equal(quotaAllows(80, 100), false);
});

test('429 triggers backoff then partial failure surfaces as an error (not a crash)', async () => {
  const waits = [];
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw Object.assign(new Error('rate limited'), { status: 429 }); }, { retries: 2, baseMs: 10, sleep: async (ms) => waits.push(ms) }));
  assert.equal(calls, 3);
  assert.deepEqual(waits, [40, 80]);
});

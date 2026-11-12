/**
 * Generates the offline search-interest, rising-query and mandi-price fixtures (deterministic).
 * Run: node scripts/makeFixtures.js. Output is committed under server/fixtures/.
 * In real mode `npm run fixtures:record` captures live responses in the same shape instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
let seed = 42;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const r1 = (v) => Math.round(v * 10) / 10;

// keyword: [mean of previous 8 weeks, mean of last 4 weeks] in reference-anchor units
const KW = {
  makhana: [30, 75], 'pickleball paddle': [20, 70], matcha: [40, 60], 'insulated tumbler': [50, 55],
  'boucle chair': [25, 40], 'japandi decor': [15, 18], 'creatine gummies': [10, 45], 'millet snacks': [30, 33],
  'yoga mat': [60, 50], 'padel racket': [10, 18],
};
const reference = Array.from({ length: 13 }, () => r1(50 + (rnd() - 0.5) * 4));
const names = Object.keys(KW);
const batches = [];
for (let i = 0; i < names.length; i += 4) {
  const kws = names.slice(i, i + 4);
  const scale = [1, 1.6, 0.7][batches.length % 3]; // Trends normalises each request differently
  const series = {};
  for (const k of kws) {
    const [prev, last] = KW[k];
    series[k] = Array.from({ length: 13 }, (_, w) => {
      const base = w < 1 ? prev : w < 9 ? prev : last;
      return r1(Math.max(0, base * (1 + (rnd() - 0.5) * 0.1)) * scale);
    });
  }
  batches.push({ keywords: kws, anchor: reference.map((v) => r1(v * scale)), series });
}
fs.writeFileSync(path.join(dir, 'searchSeries.json'), JSON.stringify({ anchor: 'chai', geo: 'IN', timeframe: 'today 3-m', weeks: 13, reference, batches }, null, 1));

fs.writeFileSync(
  path.join(dir, 'rising.json'),
  JSON.stringify({ Snacks: ['makhana', 'roasted fox nuts'], 'Racket Sports': ['pickleball paddles', 'padel racket'], 'Health Foods': ['millet snacks'], Yoga: ['yoga mat'], 'Home Decor': ['japandi decor'] }, null, 1),
);

// Mandi rows: [commodity, state, district, market, prevAvg, recentAvg]
const M = [
  ['Onion', 'Maharashtra', 'Pune', 'Pune', 2000, 2400], // +20% → verified
  ['Tomato', 'Maharashtra', 'Pune', 'Pune', 1500, 1545], // +3% → not verified
  ['Potato', 'Maharashtra', 'Pune', 'Pune', 1800, 1620], // -10%
  ['Rice', 'Maharashtra', 'Pune', 'Pune', 3600, 3650],
  ['Wheat', 'Maharashtra', 'Pune', 'Pune', 2700, 2710],
  ['Onion', 'Maharashtra', 'Nagpur', 'Nagpur', 1900, 2200],
  ['Tomato', 'Maharashtra', 'Mumbai', 'Vashi', 1600, 1900],
];
const rows = [];
for (const [commodity, state, district, market, prev, recent] of M) {
  for (let d = 0; d <= 37; d += 1) {
    const base = d <= 7 ? recent : prev;
    rows.push({ daysAgo: d, state, district, market, commodity, modalPrice: Math.round(base * (1 + (rnd() - 0.5) * 0.03)) });
  }
}
fs.writeFileSync(path.join(dir, 'mandi.json'), JSON.stringify({ _note: 'Synthetic rows in the shape of the data.gov.in daily mandi dataset (modal price, Rs/quintal).', rows }));
console.log('fixtures written to', dir);

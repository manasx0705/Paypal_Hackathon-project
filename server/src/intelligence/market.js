/** Price-signal maths and rules. Pure functions, no I/O. */
import cfg from '../config/scoring.json' with { type: 'json' };
import { normalizeKeyword } from './trends.js';

const DAY = 86400000;

/**
 * Compare the 7-day average modal price with the previous 30-day average.
 * rows: [{ date, modalPrice }]
 */
export function verifyWithMandi(rows, direction, now = new Date(), threshold = cfg.market.verifyThresholdPct) {
  const t = now.getTime();
  const recent = rows.filter((r) => t - new Date(r.date).getTime() <= 7 * DAY && t >= new Date(r.date).getTime());
  const prev = rows.filter((r) => {
    const age = t - new Date(r.date).getTime();
    return age > 7 * DAY && age <= 37 * DAY;
  });
  if (!recent.length || !prev.length) return { verified: false, reason: 'not enough mandi data', recentAvg: null, prevAvg: null, changePct: null };
  const avg = (a) => a.reduce((s, r) => s + Number(r.modalPrice), 0) / a.length;
  const recentAvg = round(avg(recent));
  const prevAvg = round(avg(prev));
  const changePct = round(((recentAvg - prevAvg) / prevAvg) * 100);
  const verified = direction === 'up' ? changePct >= threshold : changePct <= -threshold;
  return { verified, recentAvg, prevAvg, changePct, days: { recent: recent.length, previous: prev.length } };
}

/** Local/regional signals reach a vendor only if their state or district is named; national/global reach everyone. */
export function regionMatches(signal, location = {}) {
  if (signal.scope === 'national' || signal.scope === 'global') return true;
  const regions = (signal.regions || []).map(normalizeKeyword);
  return [location.state, location.district, location.city].filter(Boolean).map(normalizeKeyword).some((r) => regions.includes(r));
}

/** Does a product match a commodity entry (by synonyms in the product NAME — categories are too broad, e.g. "Hardware & Plywood")? */
export function productMatchesCommodity(product, commodity) {
  const hay = ` ${normalizeKeyword(product.name)} `;
  return [commodity.name, ...(commodity.synonyms || [])].some((s) => {
    const k = normalizeKeyword(s);
    return k && hay.includes(` ${k} `);
  });
}

/**
 * Suggested quantity for an alert on one product.
 * - Already happened → info only (0).
 * - Expected drop → hold off (0).
 * - Perishable → warning only (0).
 * - Expected rise → min(ceil(nextCycleNeed × 1.2), maxQtyMultiplier × forecast orderQty).
 */
export function alertQty({ status, direction, perishable, nextCycleNeed, orderQty, maxQtyMultiplier }) {
  if (status === 'happened') return { qty: 0, kind: 'info', note: 'Price already moved: information only.' };
  if (direction === 'down') return { qty: 0, kind: 'info', note: 'Price expected to fall: consider waiting before buying.' };
  if (perishable) return { qty: 0, kind: 'info', note: 'Perishable: warning only, never bought ahead.' };
  if (!(nextCycleNeed >= 1)) return { qty: 0, kind: 'info', note: 'No meaningful forecast demand (slow or dead stock): do not buy ahead.' };
  const a = Math.ceil((nextCycleNeed || 0) * 1.2);
  const b = Math.floor((maxQtyMultiplier || 1.5) * (orderQty || 0));
  const qty = Math.max(0, Math.min(a, b > 0 ? b : a));
  return { qty, kind: qty > 0 ? 'suggestion' : 'info', note: `min(ceil(need ${round(nextCycleNeed || 0)} × 1.2) = ${a}, ${maxQtyMultiplier} × order qty ${orderQty || 0} = ${b})` };
}

export const labelFor = (status) => (status === 'happened' ? 'Already happened' : 'Expected');

/** Confidence grows with independent sources: 1 - Π(1 - c_i), capped at 0.95. */
export function combineConfidence(confidences) {
  const p = confidences.reduce((acc, c) => acc * (1 - Math.min(0.9, Math.max(0, c))), 1);
  return round(Math.min(0.95, 1 - p));
}

export const signalKey = (s) => [normalizeKeyword(s.commodity), s.direction, s.status, s.scope === 'national' || s.scope === 'global' ? 'all' : (s.regions || []).map(normalizeKeyword).sort()[0] || 'na'].join('|');

function round(v) {
  return Math.round(v * 100) / 100;
}

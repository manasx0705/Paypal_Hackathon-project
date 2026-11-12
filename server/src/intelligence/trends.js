/** Trend scoring maths. Pure functions, no I/O. */
import cfg from '../config/scoring.json' with { type: 'json' };

const T = cfg.trend;
export const TREND_CONFIG = T;
export const CELEB_ROLES = new Set(['celebrity', 'influencer', 'athlete']);

export function normalizeKeyword(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise a person's name so "Virat Kohli", "virat kohli." and "Kohli, Virat" merge. */
export function normalizePerson(name) {
  const n = normalizeKeyword(String(name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, ''));
  return n.split(' ').filter(Boolean).sort().join(' ');
}

/** Levenshtein-based similarity 0..100 (equivalent to rapidfuzz `ratio`). */
export function similarity(a, b) {
  if (a === b) return 100;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2));
    }
    prev = cur;
  }
  return Math.round((100 * (m + n - prev[n])) / (m + n));
}

/** Map a raw keyword to a canonical one: alias table first, then fuzzy match ≥ threshold. */
export function canonicalize(raw, aliasMap, canonicals, threshold = T.fuzzyThreshold) {
  const k = normalizeKeyword(raw);
  if (!k) return null;
  if (aliasMap.has(k)) return { canonical: aliasMap.get(k), via: 'alias' };
  if (canonicals.includes(k)) return { canonical: k, via: 'exact' };
  let best = null;
  for (const c of canonicals) {
    const s = similarity(k, c);
    if (s >= threshold && (!best || s > best.s)) best = { c, s };
  }
  if (best) return { canonical: best.c, via: 'fuzzy' };
  return { canonical: k, via: 'new' };
}

/**
 * Google Trends values are relative within one request. Every batch includes the anchor keyword;
 * we rescale each batch so its anchor mean matches the reference anchor mean.
 */
export function rescaleToAnchor(values, anchorInBatch, anchorReference) {
  const mb = mean(anchorInBatch);
  const mr = mean(anchorReference);
  if (!mb) return values.map(() => 0);
  const f = mr / mb;
  return values.map((v) => Math.round(v * f * 100) / 100);
}

/** searchGrowth = mean(last 4 weeks) / mean(previous 8 weeks). */
export function searchGrowth(series) {
  const v = series.map((p) => (typeof p === 'number' ? p : p.value));
  if (v.length < 12) return 1;
  const last4 = v.slice(-4);
  const prev8 = v.slice(-12, -4);
  const p = mean(prev8);
  if (!p) return mean(last4) > 0 ? T.caps.search : 1;
  return Math.round((mean(last4) / p) * 1000) / 1000;
}

export function scoreTrend({ distinctPeople, searchGrowth: g, sourceCount, sponsoredShare = 0 }) {
  const { weights: w, caps } = T;
  const people = Math.min(distinctPeople / caps.people, 1);
  const search = Math.min(g / caps.search, 1);
  const sources = Math.min(sourceCount / caps.sources, 1);
  const raw = 100 * (w.people * people + w.search * search + w.sources * sources);
  const sponsored = sponsoredShare > 0.5;
  const mult = sponsored ? T.sponsoredMultiplier : 1;
  // Round the unsponsored score first, then floor after the penalty so the 80% guarantee holds exactly.
  const total = Math.floor(r1(raw) * mult * 10 + 1e-9) / 10;
  return {
    score: total,
    sponsored,
    breakdown: {
      people: { value: distinctPeople, cap: caps.people, weight: w.people, points: r1(100 * w.people * people) },
      search: { value: g, cap: caps.search, weight: w.search, points: r1(100 * w.search * search) },
      sources: { value: sourceCount, cap: caps.sources, weight: w.sources, points: r1(100 * w.sources * sources) },
      sponsoredMultiplier: mult,
      total,
    },
  };
}

export function trendStatus(g, mentionsLast7, mentionsPrior7) {
  if (g > T.emergingGrowth && mentionsLast7 >= mentionsPrior7) return 'emerging';
  if (g < T.fadingGrowth) return 'fading';
  return 'peaking';
}

/** spike: every mention falls within `spikeWindowDays`. */
export function isSpike(dates) {
  if (dates.length < 2) return false;
  const t = dates.map((d) => new Date(d).getTime());
  return Math.max(...t) - Math.min(...t) <= T.spikeWindowDays * 86400000;
}

/** Count distinct notable people (celebrity/influencer/athlete), merging duplicates by normalised name. */
export function distinctPeople(people) {
  const map = new Map();
  for (const p of people) {
    if (!CELEB_ROLES.has(p.role)) continue;
    const k = normalizePerson(p.name);
    if (!k) continue;
    const cur = map.get(k) || { name: p.name, role: p.role, mentions: 0 };
    cur.mentions += 1;
    map.set(k, cur);
  }
  return [...map.values()];
}

/** Trial quantity for a social find: max(1, ceil(10% of avg monthly units per product in the category)), capped at 20. */
export function trialQty(avgMonthlyUnitsPerProduct, { fraction = cfg.trialQty.fraction, max = cfg.trialQty.max } = {}) {
  return Math.min(max, Math.max(1, Math.ceil(fraction * (avgMonthlyUnitsPerProduct || 0))));
}

export function crossedOver(soldQty30d, trial) {
  return soldQty30d >= Math.max(cfg.crossover.minUnits, cfg.crossover.fractionOfTrial * trial);
}

function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function r1(v) {
  return Math.round(v * 10) / 10;
}

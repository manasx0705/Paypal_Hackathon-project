import { z } from 'zod';
import { llmEnabled } from '../config/env.js';
import commodities from '../config/commodities.json' with { type: 'json' };
import scoring from '../config/scoring.json' with { type: 'json' };
import { Article, Forecast, MarketSignal, PriceAlert, Product, Vendor } from '../models/index.js';
import { MandiClient } from '../adapters/data.js';
import { complete } from '../adapters/llm.js';
import { alertQty, combineConfidence, labelFor, productMatchesCommodity, regionMatches, signalKey, verifyWithMandi } from '../intelligence/market.js';
import { normalizeKeyword } from '../intelligence/trends.js';
import { logger } from '../utils/logger.js';
import { notify } from './notify.js';

const DAY = 86400000;
const LEVELS = ['global', 'national', 'regional', 'local'];

export const findCommodity = (name) => {
  const k = normalizeKeyword(name);
  return commodities.find((c) => normalizeKeyword(c.name) === k || (c.synonyms || []).some((s) => normalizeKeyword(s) === k)) || null;
};

const ChainSchema = z.object({
  levels: z.array(z.object({ level: z.enum(['global', 'national', 'regional', 'local']), articleIds: z.array(z.string()).min(1), note: z.string().max(200) })).min(1).max(4),
  confidence: z.number().min(0).max(1),
});

/**
 * Upstream origin of a shortage, ALWAYS labelled "inferred". Uses the LLM when enabled; otherwise a
 * deterministic rule (order the scopes reported by the articles from global down to local). Fails closed.
 */
export async function inferChain(commodity, arts) {
  const empty = { label: 'inferred', confidence: 0, levels: [] };
  try {
    let out;
    if (llmEnabled()) {
      const data = arts.map((a) => `[${a._id}] (${a.market.scope}, ${a.market.status}) ${a.title} — ${a.extracted?.summary || ''}`).join('\n');
      out = await complete({ key: `chain:${commodity}:${arts.map((a) => a._id).join(',')}`, instruction: `Infer where the ${commodity} price pressure originates, as an ordered list of levels from the furthest upstream (global, national, regional, local). Each level must cite article ids from the data. JSON: {levels:[{level, articleIds, note}], confidence}`, data, schema: ChainSchema });
    } else {
      const levels = LEVELS.map((lvl) => {
        const ids = arts.filter((a) => (lvl === 'regional' ? a.market.scope === 'regional' : a.market.scope === lvl)).map((a) => String(a._id));
        return ids.length ? { level: lvl, articleIds: ids, note: `${ids.length} source(s) describe ${lvl} ${arts.find((a) => String(a._id) === ids[0]).market.driver} pressure` } : null;
      }).filter(Boolean);
      out = ChainSchema.parse({ levels, confidence: Math.min(0.6, combineConfidence(arts.map((a) => a.market.confidence)) * 0.7) });
    }
    const known = new Set(arts.map((a) => String(a._id)));
    if (out.levels.some((l) => l.articleIds.some((id) => !known.has(id)))) return empty; // cited ids must exist
    return { label: 'inferred', confidence: Math.round(out.confidence * 100) / 100, levels: out.levels, method: llmEnabled() ? 'llm' : 'rules' };
  } catch (e) {
    logger.warn({ commodity, err: e.message }, 'chain inference failed (fail closed)');
    return empty;
  }
}

/** Merge per-article market extractions into market_signals (same commodity, direction, status, region; 14 days). */
export async function computeMarketSignals(now = new Date()) {
  const since = new Date(now.getTime() - scoring.market.mergeWindowDays * DAY);
  const arts = await Article.find({ publishedAt: { $gte: since }, kind: { $in: ['price', 'both'] }, market: { $ne: null } }).lean();
  const groups = new Map();
  for (const a of arts) {
    const c = findCommodity(a.market.commodity);
    const m = { ...a.market, commodity: c ? c.name : normalizeKeyword(a.market.commodity) };
    const k = signalKey(m);
    if (!groups.has(k)) groups.set(k, { m, arts: [] });
    groups.get(k).arts.push({ ...a, market: m });
  }
  let count = 0;
  for (const [key, { m, arts: list }] of groups) {
    const latest = Math.max(...list.map((a) => new Date(a.publishedAt).getTime()));
    const drivers = list.map((a) => a.market.driver);
    const doc = {
      commodity: m.commodity,
      direction: m.direction,
      status: m.status,
      scope: m.scope,
      regions: [...new Set(list.flatMap((a) => a.market.regions || []))],
      severity: Math.max(...list.map((a) => a.market.severity)),
      confidence: combineConfidence(list.map((a) => a.market.confidence)),
      driver: drivers.sort((a, b) => drivers.filter((d) => d === b).length - drivers.filter((d) => d === a).length)[0],
      articleIds: list.map((a) => a._id),
      expiresAt: new Date(latest + scoring.market.signalTtlDays * DAY),
    };
    if (m.scope === 'national' || m.scope === 'global') {
      const related = arts.filter((a) => (findCommodity(a.market.commodity)?.name || a.market.commodity) === m.commodity).map((a) => ({ ...a, market: { ...a.market } }));
      doc.chainInference = await inferChain(m.commodity, related);
    } else doc.chainInference = null;
    await MarketSignal.updateOne({ key }, { $set: doc }, { upsert: true });
    count += 1;
  }
  return { signals: count };
}

/** Per-vendor alerts: region match → product match → mandi verification → capped quantities. */
export async function generateAlertsForVendor(vendor, now = new Date()) {
  const signals = await MarketSignal.find({ expiresAt: { $gt: now } }).lean();
  const products = await Product.find({ vendorId: vendor._id, isActive: true }).lean();
  const forecasts = new Map((await Forecast.find({ vendorId: vendor._id }).lean()).map((f) => [String(f.productId), f]));
  const mult = vendor.settings?.maxQtyMultiplier ?? 1.5;
  let created = 0;
  for (const s of signals) {
    if (!regionMatches(s, vendor.location)) continue;
    const c = findCommodity(s.commodity) || { name: s.commodity, synonyms: [], perishable: false };
    const matched = products.filter((p) => productMatchesCommodity(p, c));
    if (!matched.length) continue;

    let verification = { verified: false, reason: 'no government price series for this commodity' };
    if (c.mandi && ['vegetable', 'fruit', 'grain'].includes(c.type)) {
      try {
        let rows = await MandiClient.getPrices({ state: vendor.location?.state, district: vendor.location?.district, commodity: c.mandi });
        if (!rows.length) rows = await MandiClient.getPrices({ state: vendor.location?.state, commodity: c.mandi });
        verification = { ...verifyWithMandi(rows, s.direction, now), market: rows[0]?.market || null };
      } catch (e) {
        verification = { verified: false, reason: `mandi lookup failed: ${e.message}` };
      }
    }

    const qty = {};
    const notes = {};
    for (const p of matched) {
      const f = forecasts.get(String(p._id));
      const r = alertQty({ status: s.status, direction: s.direction, perishable: p.perishable || c.perishable, nextCycleNeed: f?.predictedQty || 0, orderQty: f?.orderQty || 0, maxQtyMultiplier: mult });
      qty[String(p._id)] = r.qty;
      notes[String(p._id)] = r.note;
    }
    const label = labelFor(s.status);
    const dir = s.direction === 'up' ? 'rise' : 'fall';
    const where = s.scope === 'national' || s.scope === 'global' ? `${s.scope}ly` : `in ${s.regions.join(', ')}`;
    const message =
      label === 'Already happened'
        ? `${cap(s.commodity)} prices have already ${s.direction === 'up' ? 'risen' : 'fallen'} ${where}. Information only — buying now will not beat the change.`
        : s.direction === 'down'
          ? `${cap(s.commodity)} prices may fall ${where}. Consider waiting before restocking.`
          : `${cap(s.commodity)} prices may ${dir} ${where} (${s.driver}).`;
    const existing = await PriceAlert.findOne({ vendorId: vendor._id, marketSignalId: s._id });
    const update = { matchedProductIds: matched.map((p) => p._id), label, suggestedQtyByProduct: qty, message, verified: verification.verified, verifiedDetail: verification, qtyNotes: notes };
    if (existing) {
      existing.set(update);
      await existing.save();
    } else {
      const a = await PriceAlert.create({ vendorId: vendor._id, marketSignalId: s._id, state: 'active', ...update });
      created += 1;
      if (s.severity >= scoring.market.notifySeverity) await notify(vendor._id, 'price_alert', `${label}: ${message}`, { refType: 'alert', refId: a._id });
    }
  }
  return { created };
}

export async function expireSignalsAndAlerts(now = new Date()) {
  const expired = await MarketSignal.find({ expiresAt: { $lte: now } }, { _id: 1 }).lean();
  const r = await PriceAlert.updateMany({ marketSignalId: { $in: expired.map((s) => s._id) }, state: 'active' }, { state: 'expired' });
  return { expiredAlerts: r.modifiedCount };
}

export async function runMarketPipeline() {
  const signals = await computeMarketSignals();
  let alerts = 0;
  for (const v of await Vendor.find().lean()) alerts += (await generateAlertsForVendor(v)).created;
  return { ...signals, alertsCreated: alerts };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

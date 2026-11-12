/**
 * Agent tools. Business rules are enforced HERE, in code — never only in the prompt.
 * Every executor is scoped to ctx.vendor; the model can never pass a vendorId.
 */
import { CartItem, Forecast, PriceAlert, Product, MarketSignal, TrendSignal } from '../models/index.js';
import { monthlyUnits, buildSeries, deadStock } from '../services/inventory.js';
import { trendFits, trialQtyFor, vendorCategories } from '../services/trends.js';
import { roundUpToPack, stripMarkup } from '../utils/errors.js';
import { Types } from 'mongoose';

export class ToolError extends Error {}
const isId = (v) => typeof v === 'string' && Types.ObjectId.isValid(v);

export const TOOL_DEFS = [
  { name: 'get_vendor_profile', description: 'Shop type, location, product categories and purchasing settings.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_stock_overview', description: 'Active products with current stock, reorder point, perishable flag and isRegularStock.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_reorder_candidates', description: 'Regular-stock products at or near their reorder point, with forecast and the allowed main-cart quantity range (minQty..maxQty). Use this instead of calling get_forecast per product.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_sales_summary', description: 'Monthly units sold for one product.', input_schema: { type: 'object', properties: { productId: { type: 'string' }, months: { type: 'integer', minimum: 1, maximum: 24 } }, required: ['productId'], additionalProperties: false } },
  { name: 'get_forecast', description: 'Forecast row for one product, including orderQty and confidence.', input_schema: { type: 'object', properties: { productId: { type: 'string' } }, required: ['productId'], additionalProperties: false } },
  { name: 'get_dead_stock', description: 'Products with stock but no or very low recent sales.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_trend_signals', description: "Trends that fit this shop's categories with score at or above the vendor's minimum.", input_schema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false } },
  { name: 'get_price_alerts', description: 'Active price alerts for this vendor with matched products and allowed quantities.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'add_cart_item',
    description: 'Add or update one cart item. main: productId + suggestedQty. social: keyword (quantity is set by the system). price: alertId + productId (+ suggestedQty for Expected rises).',
    input_schema: {
      type: 'object',
      properties: {
        cartType: { type: 'string', enum: ['main', 'social', 'price'] },
        productId: { type: 'string' },
        keyword: { type: 'string' },
        alertId: { type: 'string' },
        suggestedQty: { type: 'number', minimum: 0 },
        reason: { type: 'string', maxLength: 300 },
        evidenceIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['cartType', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_cart_items',
    description: 'Add several cart items in ONE call (preferred). Each element has the same fields as add_cart_item. Every item is validated separately; the result lists ok/error per item.',
    input_schema: { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object', properties: { cartType: { type: 'string', enum: ['main', 'social', 'price'] }, productId: { type: 'string' }, keyword: { type: 'string' }, alertId: { type: 'string' }, suggestedQty: { type: 'number', minimum: 0 }, reason: { type: 'string', maxLength: 300 }, evidenceIds: { type: 'array', items: { type: 'string' }, maxItems: 10 }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['cartType', 'reason'] } } }, required: ['items'], additionalProperties: false },
  },
  { name: 'finish', description: 'Call when the cart is ready.', input_schema: { type: 'object', properties: { summary: { type: 'string', maxLength: 600 } }, required: ['summary'], additionalProperties: false } },
];

async function ownProduct(ctx, productId) {
  if (!isId(productId)) throw new ToolError('productId is missing or not a valid id');
  const p = await Product.findOne({ _id: productId, vendorId: ctx.vendor._id }).lean();
  if (!p) throw new ToolError('product not found for this shop');
  return p;
}

/** Upsert the single open item for (vendor, cartType, product|keyword) — repeats update instead of duplicating. */
async function upsertItem(ctx, key, fields) {
  const dedupeKey = `${fields.cartType}:${key}`;
  const item = await CartItem.findOneAndUpdate(
    { vendorId: ctx.vendor._id, dedupeKey, status: 'suggested' },
    { $set: { ...fields, sourceRunId: ctx.runId }, $setOnInsert: { vendorId: ctx.vendor._id, dedupeKey, status: 'suggested' } },
    { upsert: true, new: true },
  );
  return item;
}

export const EXECUTORS = {
  async get_vendor_profile(ctx) {
    const v = ctx.vendor;
    return { shopName: v.shopName, shopType: v.shopType, location: v.location, categories: [...(await vendorCategories(v))], settings: v.settings };
  },
  async get_stock_overview(ctx) {
    const ps = await Product.find({ vendorId: ctx.vendor._id, isActive: true }).lean();
    // Compact rows keep the context small (free-tier LLM token limits).
    return ps.map((p) => ({ productId: String(p._id), name: p.name, category: p.category, unit: p.unit, currentStock: p.currentStock, reorderPoint: Math.round(p.reorderPoint * 10) / 10, perishable: p.perishable, isRegularStock: p.isRegularStock }));
  },
  async get_reorder_candidates(ctx) {
    const mult = ctx.vendor.settings?.maxQtyMultiplier ?? 1.5;
    const ps = await Product.find({ vendorId: ctx.vendor._id, isActive: true, isRegularStock: true }).lean();
    const low = ps.filter((p) => p.currentStock <= Math.max(1.25 * (p.reorderPoint || 0), 0.0001));
    const fs = new Map((await Forecast.find({ vendorId: ctx.vendor._id, productId: { $in: low.map((p) => p._id) } }).lean()).map((f) => [String(f.productId), f]));
    const rows = low
      .map((p) => {
        const f = fs.get(String(p._id));
        if (!f || !f.orderQty || f.method === 'insufficient_data') return null;
        const pack = p.packSize || 1;
        return { productId: String(p._id), name: p.name, unit: p.unit, currentStock: p.currentStock, reorderPoint: Math.round(p.reorderPoint * 10) / 10, nextMonth: f.predictedQty, method: f.method, confidence: f.confidence, orderQty: f.orderQty, minQty: Math.ceil((0.5 * f.orderQty) / pack) * pack, maxQty: Math.floor((mult * f.orderQty) / pack) * pack || pack, packSize: pack };
      })
      .filter(Boolean)
      .sort((a, b) => a.currentStock / Math.max(a.reorderPoint, 0.1) - b.currentStock / Math.max(b.reorderPoint, 0.1));
    // Most urgent first; capped so the request fits free-tier LLM limits.
    return { candidates: rows.slice(0, 15), omitted: Math.max(0, rows.length - 15) };
  },
  async get_sales_summary(ctx, { productId, months = 6 }) {
    await ownProduct(ctx, productId);
    const m = await monthlyUnits(ctx.vendor._id, [productId]);
    return buildSeries(m.get(String(productId))).slice(-months);
  },
  async get_forecast(ctx, { productId }) {
    await ownProduct(ctx, productId);
    const f = await Forecast.findOne({ vendorId: ctx.vendor._id, productId }).lean();
    if (!f) return { method: 'none', note: 'no forecast available' };
    return { method: f.method, confidence: f.confidence, nextMonth: f.predictedQty, lower: f.lower, upper: f.upper, orderQty: f.orderQty, reorderPoint: f.reorderPoint, safetyStock: f.safetyStock };
  },
  async get_dead_stock(ctx) {
    return (await deadStock(ctx.vendor._id, ctx.vendor.settings?.deadStockMonths || 3)).slice(0, 20);
  },
  async get_trend_signals(ctx, { limit = 10 } = {}) {
    const cats = await vendorCategories(ctx.vendor);
    const all = await TrendSignal.find({ score: { $gte: ctx.vendor.settings?.trendMinScore ?? 50 } }).sort({ score: -1 }).lean();
    return all
      .filter((t) => trendFits(t, cats))
      .slice(0, limit)
      .map((t) => ({ keyword: t.keyword, score: t.score, status: t.status, flags: t.flags, categoryTags: t.categoryTags, components: t.components, evidence: (t.evidence || []).slice(0, 4).map((e) => ({ id: String(e.articleId), title: e.title, source: e.source, summary: e.summary })) }));
  },
  async get_price_alerts(ctx) {
    const alerts = await PriceAlert.find({ vendorId: ctx.vendor._id, state: 'active' }).lean();
    const signals = new Map((await MarketSignal.find({ _id: { $in: alerts.map((a) => a.marketSignalId) } }).lean()).map((s) => [String(s._id), s]));
    const products = new Map((await Product.find({ vendorId: ctx.vendor._id, _id: { $in: alerts.flatMap((a) => a.matchedProductIds) } }).lean()).map((p) => [String(p._id), p]));
    return alerts.map((a) => {
      const s = signals.get(String(a.marketSignalId)) || {};
      return {
        alertId: String(a._id),
        label: a.label,
        commodity: s.commodity,
        direction: s.direction,
        scope: s.scope,
        severity: s.severity,
        verified: a.verified,
        evidenceIds: (s.articleIds || []).map(String),
        products: a.matchedProductIds.map((id) => ({ productId: String(id), name: products.get(String(id))?.name, perishable: products.get(String(id))?.perishable, maxAllowedQty: a.suggestedQtyByProduct?.[String(id)] ?? 0 })),
        message: a.message,
      };
    });
  },

  async add_cart_item(ctx, input) {
    const reason = stripMarkup(input.reason, 300);
    if (!reason) throw new ToolError('reason is required');
    const mult = ctx.vendor.settings?.maxQtyMultiplier ?? 1.5;
    const evidenceIds = (input.evidenceIds || []).map(String).slice(0, 10);
    const confidence = input.confidence || 'medium';

    if (input.cartType === 'main') {
      const p = await ownProduct(ctx, input.productId);
      if (!p.isActive) throw new ToolError('product is inactive');
      if (!p.isRegularStock) throw new ToolError('main cart only accepts regular-stock products (isRegularStock=false)');
      const f = await Forecast.findOne({ vendorId: ctx.vendor._id, productId: p._id }).lean();
      if (!f || !f.orderQty) throw new ToolError('no forecast order quantity for this product; skip it');
      const min = 0.5 * f.orderQty;
      const max = mult * f.orderQty;
      const q = Number(input.suggestedQty);
      if (!Number.isFinite(q) || q < min || q > max) throw new ToolError(`suggestedQty must be between ${min} and ${max} (0.5× to ${mult}× forecast order qty ${f.orderQty})`);
      const pack = p.packSize || 1;
      let qty = roundUpToPack(q, pack);
      const maxQty = Math.floor(max / pack) * pack || pack;
      if (qty > maxQty) qty = maxQty;
      const item = await upsertItem(ctx, String(p._id), { cartType: 'main', productId: p._id, suggestedQty: qty, minQty: roundUpToPack(min, pack), maxQty, reason, evidenceIds, confidence, kind: 'suggestion', explain: { forecastOrderQty: f.orderQty, nextMonth: f.predictedQty, method: f.method, forecastConfidence: f.confidence, currentStock: p.currentStock, reorderPoint: p.reorderPoint, packSize: pack, multiplier: mult } });
      return { ok: true, itemId: String(item._id), storedQty: qty };
    }

    if (input.cartType === 'social') {
      if (!input.keyword) throw new ToolError('keyword is required for social items');
      const t = await TrendSignal.findOne({ keyword: String(input.keyword).toLowerCase().trim() }).lean();
      if (!t) throw new ToolError('unknown trend keyword; use a keyword from get_trend_signals');
      const minScore = ctx.vendor.settings?.trendMinScore ?? 50;
      if (t.score < minScore) throw new ToolError(`trend score ${t.score} is below the shop minimum ${minScore}`);
      if (!trendFits(t, await vendorCategories(ctx.vendor))) throw new ToolError("trend does not fit this shop's categories");
      let productId = null;
      if (input.productId) productId = (await ownProduct(ctx, input.productId))._id;
      const trial = await trialQtyFor(ctx.vendor, t); // model's suggestedQty is ignored by design
      const item = await upsertItem(ctx, t.keyword, { cartType: 'social', keyword: t.keyword, trendId: t._id, productId, suggestedQty: trial.qty, minQty: trial.qty, maxQty: trial.qty, reason, evidenceIds, confidence, kind: 'suggestion', explain: { trialQty: trial.qty, avgMonthlyUnitsPerProduct: trial.avg, categoryProducts: trial.products, rule: 'max(1, ceil(10% × avg monthly units per product in category)), capped at 20', score: t.score, status: t.status, flags: t.flags } });
      return { ok: true, itemId: String(item._id), storedQty: trial.qty, note: 'social items are recommendations only; the vendor must approve' };
    }

    if (input.cartType === 'price') {
      if (!isId(input.alertId)) throw new ToolError('alertId is required for price items');
      const a = await PriceAlert.findOne({ _id: input.alertId, vendorId: ctx.vendor._id, state: 'active' }).lean();
      if (!a) throw new ToolError('alert not found or not active for this shop');
      const p = await ownProduct(ctx, input.productId);
      if (!a.matchedProductIds.map(String).includes(String(p._id))) throw new ToolError('product is not matched by this alert');
      if (p.perishable && Number(input.suggestedQty) > 0) throw new ToolError('perishable products are never suggested for buying ahead; add it without suggestedQty as a warning');
      const allowed = p.perishable ? 0 : Number(a.suggestedQtyByProduct?.[String(p._id)] || 0);
      const base = { cartType: 'price', productId: p._id, alertId: a._id, label: a.label, reason, evidenceIds, confidence, explain: { allowedQty: allowed, rule: a.qtyNotes?.[String(p._id)], verified: a.verified, verifiedDetail: a.verifiedDetail } };
      if (a.label === 'Already happened' || allowed === 0) {
        const item = await upsertItem(ctx, String(p._id), { ...base, kind: 'info', suggestedQty: 0, minQty: 0, maxQty: 0 });
        return { ok: true, itemId: String(item._id), storedQty: 0, note: 'information only' };
      }
      const q = Number(input.suggestedQty);
      if (!Number.isFinite(q) || q <= 0 || q > allowed) throw new ToolError(`suggestedQty must be >0 and at most ${allowed} for this Expected alert`);
      // Whole units, never above the cap (Math.round(2.5) = 3 would exceed a 2.5 cap).
      const stored = Math.max(1, Math.min(Math.round(q), Math.floor(allowed)));
      if (stored > allowed) throw new ToolError(`allowed quantity ${allowed} is below one unit; add it without suggestedQty`);
      const item = await upsertItem(ctx, String(p._id), { ...base, kind: 'suggestion', suggestedQty: stored, minQty: 1, maxQty: allowed });
      return { ok: true, itemId: String(item._id), storedQty: stored };
    }
    throw new ToolError('cartType must be main, social or price');
  },

  async finish(ctx, { summary }) {
    ctx.summary = stripMarkup(summary, 600);
    return { ok: true };
  },
};

/** Validate input against the declared schema (required keys + no unknown keys) before executing. */
export async function executeTool(ctx, name, input) {
  const def = TOOL_DEFS.find((d) => d.name === name);
  if (!def || !EXECUTORS[name]) throw new ToolError(`unknown tool ${name}`);
  const obj = input && typeof input === 'object' ? input : {};
  const props = def.input_schema.properties;
  for (const k of Object.keys(obj)) if (!props[k]) throw new ToolError(`unexpected field ${k}`);
  for (const k of def.input_schema.required || []) if (obj[k] === undefined) throw new ToolError(`missing field ${k}`);
  return EXECUTORS[name](ctx, obj);
}

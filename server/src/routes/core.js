import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AgentRun, Article, CartItem, MarketSignal, Notification, Order, PriceAlert, Product, TrendOutcome, TrendSignal, Vendor, oid } from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { S } from '../schemas.js';
import { AppError, ah, badRequest, notFound } from '../utils/errors.js';
import * as A from '../services/analytics.js';
import { deadStock } from '../services/inventory.js';
import { commit, dryRun, templateCsv, TEMPLATES } from '../services/importer.js';
import { cancelOrder, capturePayment, createPayment, receiveOrder, sendOrder, serializeOrder, updateCartItem, weeklySpent } from '../services/orders.js';
import { trendFits, vendorCategories } from '../services/trends.js';
import { runAgentForVendor } from '../agent/run.js';
import { PaymentProvider } from '../adapters/commerce.js';
import { JOBS, runJob } from '../jobs/scheduler.js';

const r = Router();
r.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const vendorOf = async (req) => {
  const v = await Vendor.findById(req.vendorId).lean();
  if (!v) throw notFound('Account');
  return v;
};

// ---------------------------------------------------------------- import
r.get('/import/templates/:type', ah(async (req, res) => {
  if (!TEMPLATES[req.params.type]) throw notFound('Template');
  res.type('text/csv').attachment(`${req.params.type}-template.csv`).send(templateCsv(req.params.type));
}));
r.post('/import/:type/dry-run', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('Attach a CSV file in the "file" field');
  res.json(await dryRun(req.vendorId, req.params.type, req.file.buffer));
}));
r.post('/import/:importId/commit', validate({ params: S.importParam }), ah(async (req, res) => res.json(await commit(req.vendorId, req.params.importId))));

// ---------------------------------------------------------------- analytics
r.get('/analytics/overview', ah(async (req, res) => res.json(await A.overview(req.vendorId))));
const clampInt = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.floor(Number(v)) || d));
const dateQ = (v) => {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime())) throw badRequest('from/to must be valid dates');
  return v;
};
r.get('/analytics/category-sales', ah(async (req, res) => res.json(await A.categorySales(req.vendorId, dateQ(req.query.from), dateQ(req.query.to)))));
r.get('/analytics/growth', ah(async (req, res) => res.json(await A.growth(req.vendorId, req.query.level === 'product' ? 'product' : 'category', clampInt(req.query.months, 1, 12, 3)))));
r.get('/analytics/top-products', ah(async (req, res) => res.json(await A.topProducts(req.vendorId, ['revenue', 'units', 'profit'].includes(req.query.metric) ? req.query.metric : 'revenue', req.query.order === 'asc' ? 'asc' : 'desc', clampInt(req.query.limit, 1, 50, 5)))));
r.get('/analytics/dead-stock', ah(async (req, res) => res.json(await deadStock(req.vendorId, Math.min(12, Number(req.query.months) || 3)))));
r.get('/analytics/forecast-accuracy', ah(async (req, res) => res.json(await A.forecastAccuracy(req.vendorId))));
r.get('/analytics/inventory-value', ah(async (req, res) => res.json(await A.inventoryValue(req.vendorId))));

// ---------------------------------------------------------------- cart
async function serializeCart(items) {
  const products = new Map((await Product.find({ _id: { $in: items.map((i) => i.productId).filter(Boolean) } }, { name: 1, sku: 1, unit: 1, currentStock: 1, perishable: 1, category: 1, costPrice: 1, reorderPoint: 1 }).lean()).map((p) => [String(p._id), p]));
  const trends = new Map((await TrendSignal.find({ _id: { $in: items.map((i) => i.trendId).filter(Boolean) } }, { score: 1, status: 1, flags: 1, categoryTags: 1 }).lean()).map((t) => [String(t._id), t]));
  const alerts = new Map((await PriceAlert.find({ _id: { $in: items.map((i) => i.alertId).filter(Boolean) } }).lean()).map((a) => [String(a._id), a]));
  const signals = new Map((await MarketSignal.find({ _id: { $in: [...alerts.values()].map((a) => a.marketSignalId) } }).lean()).map((s) => [String(s._id), s]));
  return items.map((i) => {
    const t = i.trendId ? trends.get(String(i.trendId)) : null;
    const a = i.alertId ? alerts.get(String(i.alertId)) : null;
    const s = a ? signals.get(String(a.marketSignalId)) : null;
    return {
      ...i,
      explain: { ...(i.explain || {}), ...(s ? { regions: s.regions, scope: s.scope, sourceCount: s.articleIds.length, verified: !!a?.verified } : {}), ...(i.cartType === 'social' ? { fits: true } : {}) },
      product: i.productId ? products.get(String(i.productId)) || null : null,
      score: t?.score ?? null,
      trendStatus: t?.status ?? null,
      flags: t?.flags ?? [],
      categoryTags: t?.categoryTags ?? [],
      fits: i.cartType === 'social' ? true : undefined,
      signal: s ? { commodity: s.commodity, direction: s.direction, scope: s.scope, regions: s.regions, severity: s.severity, sourceCount: s.articleIds.length } : null,
      verified: a?.verified ?? null,
    };
  });
}
r.get('/cart', ah(async (req, res) => {
  const type = ['main', 'social', 'price'].includes(req.query.type) ? req.query.type : 'main';
  const v = await vendorOf(req);
  const items = await CartItem.find({ vendorId: req.vendorId, cartType: type, status: { $in: ['suggested', 'approved', 'ordered'] }, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }).sort({ status: 1, updatedAt: -1 }).lean();
  res.json({ items: await serializeCart(items), meta: { autoOrderEnabled: v.settings.autoOrderEnabled, weeklySpendCapINR: v.settings.weeklySpendCapINR, weeklySpentINR: await weeklySpent(req.vendorId), maxQtyMultiplier: v.settings.maxQtyMultiplier } });
}));
r.get('/cart/counts', ah(async (req, res) => {
  const rows = await CartItem.aggregate([{ $match: { vendorId: oid(req.vendorId), status: { $in: ['suggested', 'approved'] } } }, { $group: { _id: '$cartType', n: { $sum: 1 } } }]);
  const out = { main: 0, social: 0, price: 0 };
  for (const x of rows) out[x._id] = x.n;
  res.json(out);
}));
r.patch('/cart/:id', validate({ params: S.idParam, body: S.cartPatch }), ah(async (req, res) => {
  const out = await updateCartItem(await vendorOf(req), req.params.id, req.body);
  A.invalidateAnalytics(req.vendorId);
  const [item] = await serializeCart([out.item.toObject ? out.item.toObject() : out.item]);
  res.json({ item, order: out.order ? await serializeOrder(out.order) : null });
}));

// ---------------------------------------------------------------- agent
const agentLimiter = rateLimit({ windowMs: 3600000, limit: env.nodeEnv === 'test' ? 1000 : 5, keyGenerator: (req) => req.vendorId, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Refresh is limited to 5 runs per hour', details: null } } });
r.post('/agent/run', agentLimiter, ah(async (req, res) => res.status(202).json(await runAgentForVendor(req.vendorId, 'manual'))));
r.get('/agent/runs', ah(async (req, res) => res.json(await AgentRun.find({ vendorId: req.vendorId }, { steps: 0 }).sort({ startedAt: -1 }).limit(20).lean())));
r.get('/agent/runs/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const run = await AgentRun.findOne({ _id: req.params.id, vendorId: req.vendorId }).lean();
  if (!run) throw notFound('Agent run');
  res.json(run);
}));

// ---------------------------------------------------------------- orders & PayPal
r.get('/orders', ah(async (req, res) => {
  const f = { vendorId: req.vendorId };
  if (req.query.status) f.status = String(req.query.status);
  const orders = await Order.find(f).sort({ createdAt: -1 }).limit(100).lean();
  res.json(await Promise.all(orders.map(serializeOrder)));
}));
r.get('/orders/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, vendorId: req.vendorId }).lean();
  if (!o) throw notFound('Order');
  res.json(await serializeOrder(o));
}));
r.post('/orders/:id/send', validate({ params: S.idParam }), ah(async (req, res) => res.json(await serializeOrder(await sendOrder(req.vendorId, req.params.id)))));
r.post('/orders/:id/receive', validate({ params: S.idParam, body: S.receive }), ah(async (req, res) => res.json(await serializeOrder(await receiveOrder(req.vendorId, req.params.id, req.body.lines)))));
r.post('/orders/:id/cancel', validate({ params: S.idParam }), ah(async (req, res) => res.json(await serializeOrder(await cancelOrder(req.vendorId, req.params.id)))));
r.get('/payments/config', (_req, res) => res.json(PaymentProvider.config()));
r.post('/payments/orders/:id/create', validate({ params: S.idParam }), ah(async (req, res) => res.json(await createPayment(req.vendorId, req.params.id))));
r.post('/payments/orders/:id/capture', validate({ params: S.idParam, body: S.capture }), ah(async (req, res) => res.json(await serializeOrder(await capturePayment(req.vendorId, req.params.id, req.body.paypalOrderId)))));

// ---------------------------------------------------------------- trends (vendor-scoped by fit)
const trendSummary = (t, cats) => ({ _id: t._id, keyword: t.keyword, score: t.score, status: t.status, flags: t.flags, categoryTags: t.categoryTags, fits: trendFits(t, cats), components: t.components, peopleCount: (t.people || []).length, evidenceCount: (t.evidence || []).length, sparkline: (t.searchSeries || []).map((p) => p.value), lastSeen: t.lastSeen });
r.get('/trends/stats', ah(async (req, res) => {
  const rows = await TrendOutcome.find({ vendorId: req.vendorId }).sort({ actionAt: -1 }).lean();
  const evaluated = rows.filter((x) => x.evaluatedAt);
  const crossed = evaluated.filter((x) => x.crossedOver).length;
  res.json({ rate: evaluated.length ? Math.round((100 * crossed) / evaluated.length) / 100 : null, evaluated: evaluated.length, crossed, pending: rows.filter((x) => !x.evaluatedAt && x.action === 'approved').length, perTrend: rows.map((x) => ({ keyword: x.keyword, action: x.action, actionAt: x.actionAt, soldQty30d: x.soldQty30d ?? null, crossedOver: x.crossedOver ?? null, evaluatedAt: x.evaluatedAt ?? null })) });
}));
r.get('/trends', ah(async (req, res) => {
  const v = await vendorOf(req);
  const cats = await vendorCategories(v);
  const f = {};
  if (req.query.minScore) f.score = { $gte: Number(req.query.minScore) };
  if (req.query.status) f.status = String(req.query.status);
  let list = (await TrendSignal.find(f).sort({ score: -1 }).limit(100).lean()).map((t) => trendSummary(t, cats));
  if (req.query.fit === 'true') list = list.filter((t) => t.fits);
  res.json(list);
}));
r.get('/trends/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const v = await vendorOf(req);
  const t = await TrendSignal.findById(req.params.id).lean();
  if (!t) throw notFound('Trend');
  res.json({ ...trendSummary(t, await vendorCategories(v)), searchSeries: t.searchSeries, people: t.people, evidence: t.evidence, breakdown: t.breakdown, firstSeen: t.firstSeen, aliases: t.aliases });
}));

// ---------------------------------------------------------------- alerts
async function alertView(a, full = false) {
  const s = await MarketSignal.findById(a.marketSignalId).lean();
  const products = await Product.find({ _id: { $in: a.matchedProductIds } }, { name: 1, perishable: 1, unit: 1 }).lean();
  const base = { _id: a._id, label: a.label, state: a.state, commodity: s?.commodity, direction: s?.direction, scope: s?.scope, regions: s?.regions || [], severity: s?.severity, verified: !!a.verified, sourceCount: s?.articleIds?.length || 0, matchedProducts: products, suggestedQtyByProduct: a.suggestedQtyByProduct || {}, qtyNotes: a.qtyNotes || {}, message: a.message, createdAt: a.createdAt };
  if (!full) return base;
  const articles = await Article.find({ _id: { $in: s?.articleIds || [] } }, { url: 1, title: 1, source: 1, publishedAt: 1, 'extracted.summary': 1 }).lean();
  return { ...base, signal: s ? { driver: s.driver, confidence: s.confidence, status: s.status, verifiedDetail: a.verifiedDetail, chainInference: s.chainInference, expiresAt: s.expiresAt } : null, articles: articles.map((x) => ({ _id: x._id, url: x.url, title: x.title, source: x.source, publishedAt: x.publishedAt, summary: x.extracted?.summary })) };
}
r.get('/alerts', ah(async (req, res) => {
  const f = { vendorId: req.vendorId };
  if (req.query.state) f.state = String(req.query.state);
  const list = await PriceAlert.find(f).sort({ createdAt: -1 }).lean();
  res.json(await Promise.all(list.map((a) => alertView(a))));
}));
r.get('/alerts/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const a = await PriceAlert.findOne({ _id: req.params.id, vendorId: req.vendorId }).lean();
  if (!a) throw notFound('Alert');
  res.json(await alertView(a, true));
}));
r.patch('/alerts/:id', validate({ params: S.idParam, body: S.alertPatch }), ah(async (req, res) => {
  const a = await PriceAlert.findOneAndUpdate({ _id: req.params.id, vendorId: req.vendorId }, { state: 'dismissed' }, { new: true }).lean();
  if (!a) throw notFound('Alert');
  res.json(await alertView(a));
}));

// ---------------------------------------------------------------- notifications
r.get('/notifications', ah(async (req, res) => {
  const f = { vendorId: req.vendorId };
  if (req.query.unread === 'true') f.readAt = null;
  const [items, unreadCount] = await Promise.all([Notification.find(f).sort({ createdAt: -1 }).limit(50).lean(), Notification.countDocuments({ vendorId: req.vendorId, readAt: null })]);
  res.json({ items, unreadCount });
}));
r.patch('/notifications/:id/read', validate({ params: S.idParam }), ah(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, vendorId: req.vendorId }, { readAt: new Date() }, { new: true });
  if (!n) throw notFound('Notification');
  res.json(n);
}));
r.post('/notifications/read-all', ah(async (req, res) => {
  const x = await Notification.updateMany({ vendorId: req.vendorId, readAt: null }, { readAt: new Date() });
  res.json({ updated: x.modifiedCount });
}));

// ---------------------------------------------------------------- admin
r.post('/admin/jobs/:name/run', ah(async (req, res) => {
  const v = await vendorOf(req);
  const allowed = env.adminEmails.includes(v.email) || (env.fixtureMode && v.isDemo);
  if (!allowed) throw new AppError(403, 'FORBIDDEN', 'Admins only');
  if (!Object.hasOwn(JOBS, req.params.name)) throw notFound('Job');
  res.json(await runJob(req.params.name));
}));

export const coreRouter = r;

import { CartItem, Forecast, Product, Sale, oid } from '../models/index.js';
import { addMonths } from '../intelligence/forecasting.js';
import { monthKey, round2 } from '../utils/errors.js';
import { deadStock } from './inventory.js';

const TZ = 'Asia/Kolkata';
const cache = new Map(); // `${vendorId}:${key}` -> {exp, value}

export function invalidateAnalytics(vendorId) {
  for (const k of cache.keys()) if (k.startsWith(`${vendorId}:`)) cache.delete(k);
}
async function memo(vendorId, key, fn) {
  const k = `${vendorId}:${key}`;
  const hit = cache.get(k);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await fn();
  cache.set(k, { exp: Date.now() + 5 * 60 * 1000, value });
  return value;
}

const monthExpr = { $dateToString: { format: '%Y-%m', date: { $dateTrunc: { date: '$date', unit: 'month', timezone: TZ } }, timezone: TZ } };

export const overview = (vendorId) =>
  memo(vendorId, 'overview', async () => {
    const vid = oid(vendorId);
    const since = new Date(Date.now() - 30 * 86400000);
    const [inv] = await Product.aggregate([{ $match: { vendorId: vid, isActive: true } }, { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$costPrice'] } }, count: { $sum: 1 }, out: { $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] } }, low: { $sum: { $cond: [{ $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderPoint'] }] }, 1, 0] } } } }]);
    const [s] = await Sale.aggregate([{ $match: { vendorId: vid, date: { $gte: since } } }, { $group: { _id: null, revenue: { $sum: { $multiply: ['$qty', '$unitPrice'] } }, profit: { $sum: { $multiply: ['$qty', { $subtract: ['$unitPrice', '$unitCostAtSale'] }] } }, units: { $sum: '$qty' } } }]);
    const dead = await deadStock(vendorId, 3);
    const openCartItems = await CartItem.countDocuments({ vendorId: vid, status: { $in: ['suggested', 'approved'] } });
    return {
      inventoryValue: round2(inv?.value || 0),
      revenue30d: round2(s?.revenue || 0),
      profit30d: round2(s?.profit || 0),
      units30d: s?.units || 0,
      lowStockCount: inv?.low || 0,
      outOfStockCount: inv?.out || 0,
      deadStockValue: round2(dead.reduce((a, d) => a + d.value, 0)),
      openCartItems,
      productCount: inv?.count || 0,
    };
  });

export const categorySales = (vendorId, from, to) =>
  memo(vendorId, `cat:${from}:${to}`, async () => {
    const match = { vendorId: oid(vendorId) };
    if (from || to) match.date = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const rows = await Sale.aggregate([
      { $match: match },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $group: { _id: { c: '$p.category', m: monthExpr }, units: { $sum: '$qty' }, revenue: { $sum: { $multiply: ['$qty', '$unitPrice'] } }, profit: { $sum: { $multiply: ['$qty', { $subtract: ['$unitPrice', '$unitCostAtSale'] }] } } } },
      { $sort: { '_id.m': 1, '_id.c': 1 } },
    ]);
    return rows.map((r) => ({ category: r._id.c, month: r._id.m, units: r.units, revenue: round2(r.revenue), profit: round2(r.profit) }));
  });

/** Month-over-month growth for the last complete month and the average of the last 3 MoM growths. */
export const growth = (vendorId, level = 'category', months = 3) =>
  memo(vendorId, `growth:${level}:${months}`, async () => {
    const last = addMonths(monthKey(new Date()), -1);
    const keys = Array.from({ length: months + 1 }, (_, i) => addMonths(last, -months + i));
    const rows = await Sale.aggregate([
      { $match: { vendorId: oid(vendorId), date: { $gte: new Date(Date.now() - (months + 3) * 31 * 86400000) } } },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $group: { _id: { k: level === 'product' ? '$p._id' : '$p.category', name: level === 'product' ? '$p.name' : '$p.category', m: monthExpr }, units: { $sum: '$qty' } } },
    ]);
    const byKey = new Map();
    for (const r of rows) {
      const k = String(r._id.k);
      if (!byKey.has(k)) byKey.set(k, { key: k, name: r._id.name, m: {} });
      byKey.get(k).m[r._id.m] = r.units;
    }
    const g = (a, b) => (b > 0 ? (a - b) / b : null);
    return [...byKey.values()]
      .map(({ key, name, m }) => {
        const series = keys.map((k) => m[k] || 0);
        const moms = series.slice(1).map((v, i) => g(v, series[i])).filter((x) => x !== null);
        return { key, name, lastMonth: series[series.length - 1], prevMonth: series[series.length - 2], momGrowth: g(series[series.length - 1], series[series.length - 2]), avgGrowth3: moms.length ? moms.reduce((s, x) => s + x, 0) / moms.length : null };
      })
      .sort((a, b) => (b.lastMonth || 0) - (a.lastMonth || 0));
  });

export const topProducts = (vendorId, metric = 'revenue', order = 'desc', limit = 5) =>
  memo(vendorId, `top:${metric}:${order}:${limit}`, async () => {
    const since = new Date(Date.now() - 90 * 86400000);
    const val = metric === 'units' ? '$qty' : metric === 'profit' ? { $multiply: ['$qty', { $subtract: ['$unitPrice', '$unitCostAtSale'] }] } : { $multiply: ['$qty', '$unitPrice'] };
    const rows = await Sale.aggregate([
      { $match: { vendorId: oid(vendorId), date: { $gte: since } } },
      { $group: { _id: '$productId', value: { $sum: val } } },
      { $sort: { value: order === 'asc' ? 1 : -1 } },
      { $limit: Math.min(50, Number(limit) || 5) },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
    ]);
    return rows.map((r) => ({ productId: r._id, name: r.p.name, category: r.p.category, value: round2(r.value) }));
  });

export const forecastAccuracy = (vendorId) =>
  memo(vendorId, 'facc', async () => {
    const rows = await Forecast.find({ vendorId, mape: { $ne: null }, naiveMape: { $ne: null } }).lean();
    const avg = (a) => (a.length ? round2(a.reduce((s, x) => s + x, 0) / a.length) : null);
    const by = (c) => rows.filter((r) => r.confidence === c).length;
    return { count: rows.length, modelMape: avg(rows.map((r) => r.mape)), naiveMape: avg(rows.map((r) => r.naiveMape)), beatNaivePct: rows.length ? round2((100 * rows.filter((r) => r.mape <= r.naiveMape).length) / rows.length) : null, byConfidence: { high: by('high'), medium: by('medium'), low: by('low') } };
  });

export const inventoryValue = (vendorId) =>
  memo(vendorId, 'invval', async () => {
    const rows = await Product.aggregate([{ $match: { vendorId: oid(vendorId), isActive: true } }, { $group: { _id: '$category', value: { $sum: { $multiply: ['$currentStock', '$costPrice'] } } } }, { $sort: { value: -1 } }]);
    return rows.map((r) => ({ category: r._id, value: round2(r.value) }));
  });

import { Forecast, Product, Sale, Vendor, oid } from '../models/index.js';
import { forecastProduct, addMonths, monthRange } from '../intelligence/forecasting.js';
import { monthKey } from '../utils/errors.js';
import { notify } from './notify.js';

const TZ = 'Asia/Kolkata';

/** Monthly units per product (IST calendar months). Returns Map(productId -> Map(month -> qty)). */
export async function monthlyUnits(vendorId, productIds) {
  const match = { vendorId: oid(vendorId) };
  if (productIds) match.productId = { $in: productIds.map(oid) };
  const rows = await Sale.aggregate([
    { $match: match },
    { $group: { _id: { p: '$productId', m: { $dateToString: { format: '%Y-%m', date: '$date', timezone: TZ } } }, qty: { $sum: '$qty' } } },
  ]);
  const out = new Map();
  for (const r of rows) {
    const k = String(r._id.p);
    if (!out.has(k)) out.set(k, new Map());
    out.get(k).set(r._id.m, r.qty);
  }
  return out;
}

/** Series from the first sale month to the last complete month; missing months filled with 0 and flagged. */
export function buildSeries(monthMap, now = new Date()) {
  if (!monthMap || !monthMap.size) return [];
  const months = [...monthMap.keys()].sort();
  const last = addMonths(monthKey(now), -1);
  if (months[0] > last) return [];
  return monthRange(months[0], last).map((m) => ({ month: m, qty: monthMap.get(m) || 0, gap: !monthMap.has(m) }));
}

export async function runForecasts(vendorId, { productIds = null } = {}) {
  const vendor = await Vendor.findById(vendorId).lean();
  const filter = { vendorId, isActive: true };
  if (productIds) filter._id = { $in: productIds };
  const products = await Product.find(filter);
  const units = await monthlyUnits(vendorId, productIds);
  let count = 0;
  for (const p of products) {
    const history = buildSeries(units.get(String(p._id)));
    const f = forecastProduct(history, { leadTimeDays: p.leadTimeDays, perishable: p.perishable, shelfLifeDays: p.shelfLifeDays, currentStock: p.currentStock, packSize: p.packSize });
    const first = f.months[0] || {};
    await Forecast.findOneAndUpdate(
      { vendorId, productId: p._id },
      { month: first.month, predictedQty: first.predictedQty ?? 0, lower: first.lower ?? 0, upper: first.upper ?? 0, months: f.months, method: f.method, confidence: f.confidence, orderQty: f.orderQty, reorderPoint: f.reorderPoint, safetyStock: f.safetyStock, growthRate: f.growthRate ?? 0, mape: f.mape ?? null, naiveMape: f.naiveMape ?? null, history: f.history, explain: f.explain || null },
      { upsert: true },
    );
    p.reorderPoint = f.reorderPoint;
    p.safetyStock = f.safetyStock;
    // Low/out-of-stock notifications: once per product until restocked (lowStockNotified resets on purchase).
    if (vendor?.settings?.lowStockNotify !== false && f.method !== 'insufficient_data') {
      if (p.currentStock <= 0 && !p.lowStockNotified) {
        await notify(vendorId, 'out_of_stock', `${p.name} is out of stock.`, { refType: 'product', refId: p._id });
        p.lowStockNotified = true;
      } else if (p.currentStock <= f.reorderPoint && !p.lowStockNotified) {
        await notify(vendorId, 'low_stock', `${p.name} is low: ${p.currentStock} ${p.unit} left (reorder point ${f.reorderPoint}).`, { refType: 'product', refId: p._id });
        p.lowStockNotified = true;
      }
    }
    await p.save();
    count += 1;
  }
  return { products: count };
}

export const stockStatus = (p) => (p.currentStock <= 0 ? 'out' : p.currentStock <= (p.reorderPoint || 0) ? 'low' : 'ok');

/** Dead stock: stock > 0 and no sales in the last N months, or recent monthly sales < 10% of the product's average. */
export async function deadStock(vendorId, monthsIn = 3) {
  // Clamp to 1..12 whole months: settings allow up to 12 and the recent average divides by this number.
  const months = Math.min(12, Math.max(1, Math.floor(Number(monthsIn)) || 3));
  const products = await Product.find({ vendorId, isActive: true, currentStock: { $gt: 0 } }).lean();
  const units = await monthlyUnits(vendorId);
  const now = monthKey(new Date());
  const recentKeys = Array.from({ length: months }, (_, i) => addMonths(now, -(i + 1)));
  const lastSale = await Sale.aggregate([{ $match: { vendorId: oid(vendorId) } }, { $group: { _id: '$productId', last: { $max: '$date' } } }]);
  const lastMap = new Map(lastSale.map((r) => [String(r._id), r.last]));
  const out = [];
  for (const p of products) {
    const m = units.get(String(p._id));
    const all = m ? [...m.values()] : [];
    const avg = all.length ? all.reduce((s, x) => s + x, 0) / all.length : 0;
    const recent = recentKeys.reduce((s, k) => s + (m?.get(k) || 0), 0) / months;
    if (recent === 0 || (avg > 0 && recent < 0.1 * avg)) {
      out.push({ productId: p._id, name: p.name, category: p.category, currentStock: p.currentStock, value: Math.round(p.currentStock * p.costPrice * 100) / 100, lastSaleDate: lastMap.get(String(p._id)) || null });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

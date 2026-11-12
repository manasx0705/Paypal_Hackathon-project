import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Papa from 'papaparse';
import taxonomy from '../config/taxonomy.json' with { type: 'json' };
import { ImportJob, Product, Purchase, Sale, Supplier, Vendor, oid } from '../models/index.js';
import { normalizeKeyword } from '../intelligence/trends.js';
import { AppError, badRequest, notFound, round2 } from '../utils/errors.js';
import { invalidateAnalytics } from './analytics.js';
import { monthlyUnits, buildSeries, runForecasts } from './inventory.js';
import { logger } from '../utils/logger.js';

export const TEMPLATES = {
  products: ['sku', 'name', 'category', 'unit', 'perishable', 'shelf_life_days', 'cost_price', 'sell_price', 'current_stock', 'lead_time_days', 'pack_size', 'supplier_name', 'regular_stock', 'update_stock'],
  sales: ['date', 'sku', 'qty', 'unit_price'],
  purchases: ['date', 'sku', 'qty', 'unit_cost', 'supplier_name'],
};
const EXAMPLES = {
  products: 'RICE-5KG,Basmati Rice 5kg,Grains & Flour,bag,no,,420,499,25,3,1,Shree Traders,yes,no',
  sales: '2026-11-01,RICE-5KG,3,499',
  purchases: '2026-11-01,RICE-5KG,10,420,Shree Traders',
};
export const templateCsv = (type) => `${TEMPLATES[type].join(',')}\n${EXAMPLES[type]}\n`;

const MAX_ROWS = 20000;
const yes = (v) => ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());
const num = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(String(v).replace(/,/g, '')));

/** Taxonomy keyword match — free, deterministic category suggestion. */
export function suggestCategory(name) {
  const k = ` ${normalizeKeyword(name)} `;
  let best = null;
  for (const t of taxonomy) {
    const hits = t.keywords.filter((w) => k.includes(` ${normalizeKeyword(w)} `) || k.includes(` ${normalizeKeyword(w)}s `)).length;
    if (hits && (!best || hits > best.hits)) best = { name: t.name, hits };
  }
  return best?.name || null;
}

const rowHash = (vendorId, type, row) => crypto.createHash('sha256').update(`${vendorId}|${type}|${JSON.stringify(row)}`).digest('hex');

export async function dryRun(vendorId, type, buffer) {
  if (!TEMPLATES[type]) throw badRequest('type must be products, sales or purchases');
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase() });
  if (parsed.data.length > MAX_ROWS) throw new AppError(413, 'TOO_MANY_ROWS', `Maximum ${MAX_ROWS} rows per file`);
  const missingCols = TEMPLATES[type].filter((c) => c !== 'update_stock' && !parsed.meta.fields?.includes(c));
  if (missingCols.length) throw badRequest(`Missing columns: ${missingCols.join(', ')}`, { missingCols });

  const products = await Product.find({ vendorId }, { sku: 1, currentStock: 1, name: 1 }).lean();
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const errors = [];
  const rows = [];
  const seen = new Set();
  let duplicates = 0;
  const suggestions = [];
  const err = (row, field, message) => errors.push({ row, field, message });
  const today = new Date(Date.now() + 86400000);

  parsed.data.forEach((raw, i) => {
    const rowNo = i + 2; // header is row 1
    const before = errors.length;
    let row;
    if (type === 'products') {
      row = {
        sku: String(raw.sku || '').trim(),
        name: String(raw.name || '').trim(),
        category: String(raw.category || '').trim(),
        unit: String(raw.unit || 'pcs').trim() || 'pcs',
        perishable: yes(raw.perishable),
        shelfLifeDays: num(raw.shelf_life_days),
        costPrice: num(raw.cost_price),
        sellPrice: num(raw.sell_price),
        currentStock: num(raw.current_stock) ?? 0,
        leadTimeDays: num(raw.lead_time_days) ?? 3,
        packSize: num(raw.pack_size) ?? 1,
        supplierName: String(raw.supplier_name || '').trim(),
        isRegularStock: raw.regular_stock === undefined || raw.regular_stock === '' ? true : yes(raw.regular_stock),
        updateStock: yes(raw.update_stock),
      };
      if (!row.sku) err(rowNo, 'sku', 'required');
      if (!row.name) err(rowNo, 'name', 'required');
      for (const f of ['costPrice', 'sellPrice']) if (row[f] === null || !(row[f] >= 0)) err(rowNo, f, 'must be a non-negative number');
      for (const f of ['currentStock', 'leadTimeDays']) if (!(row[f] >= 0)) err(rowNo, f, 'must be a non-negative number');
      if (!(row.packSize >= 1)) err(rowNo, 'packSize', 'must be at least 1');
      if (row.shelfLifeDays !== null && !(row.shelfLifeDays > 0)) // NaN would fail the Mongo cast at commit time err(rowNo, 'shelfLifeDays', 'must be positive');
      if (!row.category && row.name) {
        const s = suggestCategory(row.name);
        suggestions.push({ row: rowNo, sku: row.sku, name: row.name, suggested: s || 'Uncategorized' });
        row.category = s || 'Uncategorized';
      }
    } else {
      const d = new Date(`${String(raw.date || '').trim()}T00:00:00+05:30`);
      const priceKey = type === 'sales' ? 'unitPrice' : 'unitCost';
      row = { date: d, sku: String(raw.sku || '').trim(), qty: num(raw.qty), [priceKey]: num(type === 'sales' ? raw.unit_price : raw.unit_cost), ...(type === 'purchases' ? { supplierName: String(raw.supplier_name || '').trim() } : {}) };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '').trim()) || Number.isNaN(d.getTime())) err(rowNo, 'date', 'must be YYYY-MM-DD');
      else if (d > today) err(rowNo, 'date', 'cannot be in the future');
      if (!row.sku) err(rowNo, 'sku', 'required');
      else if (!bySku.has(row.sku)) err(rowNo, 'sku', 'unknown SKU — import products first');
      if (!(row.qty > 0)) err(rowNo, 'qty', 'must be a positive number');
      if (row[priceKey] === null || !(row[priceKey] >= 0)) err(rowNo, priceKey, 'must be a non-negative number');
    }
    const key = type === 'products' ? `sku:${row.sku}` : rowHash(vendorId, type, { ...row, date: row.date?.toISOString?.() });
    if (seen.has(key)) {
      err(rowNo, 'row', type === 'products' ? 'duplicate SKU in file' : 'duplicate row in file');
      duplicates += 1;
    }
    seen.add(key);
    if (errors.length === before) rows.push({ ...row, _row: rowNo, _hash: type === 'products' ? null : key });
  });

  // Idempotency: rows already imported earlier are skipped, not duplicated.
  let alreadyImported = 0;
  if (type !== 'products') {
    const Model = type === 'sales' ? Sale : Purchase;
    const existing = new Set((await Model.find({ vendorId, rowHash: { $in: rows.map((r) => r._hash) } }, { rowHash: 1 }).lean()).map((x) => x.rowHash));
    for (const r of rows) if (existing.has(r._hash)) r._skip = true;
    alreadyImported = rows.filter((r) => r._skip).length;
    if (type === 'sales') {
      const need = new Map();
      for (const r of rows.filter((x) => !x._skip)) need.set(r.sku, (need.get(r.sku) || 0) + r.qty);
      for (const [sku, q] of need) {
        const p = bySku.get(sku);
        if (p && q > p.currentStock) err(null, 'qty', `SKU ${sku}: file sells ${q} but only ${p.currentStock} in stock — import purchases first or correct stock`);
      }
    }
  }

  const job = await ImportJob.create({ vendorId, type, rows: errors.length ? [] : rows, committed: false, expiresAt: new Date(Date.now() + 3600000) });
  return {
    importId: job._id,
    type,
    counts: { total: parsed.data.length, valid: errors.length ? rows.length : rows.length - alreadyImported, errors: errors.length, duplicates, alreadyImported },
    errors: errors.slice(0, 500),
    preview: rows.slice(0, 20).map(({ _hash, ...r }) => r),
    categorySuggestions: suggestions.slice(0, 200),
  };
}

const pendingAgent = new Map();
/** Debounced (5 min) agent run after imports so several files trigger one run. */
function scheduleAgent(vendorId) {
  clearTimeout(pendingAgent.get(String(vendorId)));
  const t = setTimeout(async () => {
    pendingAgent.delete(String(vendorId));
    try {
      const { runAgentForVendor } = await import('../agent/run.js');
      await runAgentForVendor(vendorId, 'import');
    } catch (e) {
      logger.warn({ err: e.message }, 'post-import agent run failed');
    }
  }, 5 * 60000);
  t.unref?.();
  pendingAgent.set(String(vendorId), t);
}

/** All-or-nothing commit in one transaction; stock changes are aggregated per product. */
export async function commit(vendorId, importId) {
  const job = await ImportJob.findOne({ _id: importId, vendorId });
  if (!job) throw notFound('Import (it may have expired; run the dry-run again)');
  if (job.committed) throw new AppError(409, 'ALREADY_COMMITTED', 'This import was already committed');
  if (!job.rows?.length) throw badRequest('Nothing to commit (fix the errors and run the dry-run again)');
  const type = job.type;
  const rows = job.rows.filter((r) => !r._skip);
  const session = await mongoose.startSession();
  const affected = new Set();
  let inserted = 0;
  try {
    await session.withTransaction(async () => {
      inserted = 0;
      // Claim the job atomically inside the transaction so two concurrent commits cannot both apply stock changes.
      const claim = await ImportJob.updateOne({ _id: job._id, vendorId, committed: { $ne: true } }, { $set: { committed: true } }, { session });
      if (!claim.modifiedCount) throw new AppError(409, 'ALREADY_COMMITTED', 'This import was already committed');
      const suppliers = new Map((await Supplier.find({ vendorId }).session(session).lean()).map((s) => [s.name.toLowerCase(), s]));
      const supplierId = async (name) => {
        if (!name) return undefined;
        let s = suppliers.get(name.toLowerCase());
        if (!s) {
          [s] = await Supplier.create([{ vendorId, name, channel: 'log' }], { session });
          suppliers.set(name.toLowerCase(), s);
        }
        return s._id;
      };
      if (type === 'products') {
        for (const r of rows) {
          const fields = { name: r.name, category: r.category, unit: r.unit, perishable: r.perishable, shelfLifeDays: r.shelfLifeDays, costPrice: r.costPrice, sellPrice: r.sellPrice, leadTimeDays: r.leadTimeDays, packSize: r.packSize, isRegularStock: r.isRegularStock, isActive: true, supplierId: await supplierId(r.supplierName) };
          const existing = await Product.findOne({ vendorId, sku: r.sku }).session(session);
          if (existing) {
            existing.set(fields);
            if (r.updateStock) existing.set({ currentStock: r.currentStock, lastStockUpdate: new Date() });
            await existing.save({ session });
          } else {
            await Product.create([{ vendorId, sku: r.sku, ...fields, currentStock: r.currentStock, lastStockUpdate: new Date() }], { session });
            inserted += 1;
          }
        }
      } else {
        const products = new Map((await Product.find({ vendorId, sku: { $in: [...new Set(rows.map((r) => r.sku))] } }).session(session).lean()).map((p) => [p.sku, p]));
        const delta = new Map();
        const docs = rows.map((r) => {
          const p = products.get(r.sku);
          if (!p) throw new AppError(409, 'UNKNOWN_SKU', `SKU ${r.sku} no longer exists; run the dry-run again`);
          affected.add(String(p._id));
          delta.set(String(p._id), (delta.get(String(p._id)) || 0) + (type === 'sales' ? -r.qty : r.qty));
          return type === 'sales'
            ? { vendorId, productId: p._id, qty: r.qty, unitPrice: r.unitPrice, unitCostAtSale: p.costPrice, date: r.date, rowHash: r._hash }
            : { vendorId, productId: p._id, qty: r.qty, unitCost: r.unitCost, date: r.date, rowHash: r._hash };
        });
        for (const [pid, d] of delta) {
          const f = { _id: pid, vendorId };
          if (d < 0) f.currentStock = { $gte: -d };
          const ok = await Product.updateOne(f, { $inc: { currentStock: d }, $set: { lastStockUpdate: new Date() } }, { session });
          if (!ok.modifiedCount) throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough stock for product ${pid}; nothing was imported`);
        }
        const Model = type === 'sales' ? Sale : Purchase;
        await Model.insertMany(docs, { session });
        inserted = docs.length;
      }
    });
    job.committed = true;
  } finally {
    await session.endSession();
  }
  invalidateAnalytics(vendorId);
  const ids = type === 'products' ? null : [...affected];
  runForecasts(vendorId, { productIds: ids }).catch((e) => logger.warn({ err: e.message }, 'post-import forecast failed'));
  scheduleAgent(vendorId);
  return { type, inserted, skipped: job.rows.length - rows.length };
}

export async function dataQuality(vendorId) {
  const products = await Product.find({ vendorId, isActive: true }).lean();
  const units = await monthlyUnits(vendorId);
  const issues = [];
  const add = (type, message, ids) => ids.length && issues.push({ type, message, count: ids.length, productIds: ids.slice(0, 50) });
  const noSales = products.filter((p) => !units.has(String(p._id))).map((p) => p._id);
  add('no_sales', 'Products with no sales recorded', noSales);
  const gaps = [];
  for (const p of products) {
    const s = buildSeries(units.get(String(p._id)));
    if (s.some((m) => m.gap)) gaps.push(p._id);
  }
  add('month_gaps', 'Products with months of no sales since their first sale (check for missing records)', gaps);
  add('zero_price', 'Products with a cost or selling price of zero', products.filter((p) => !p.costPrice || !p.sellPrice).map((p) => p._id));
  const stale = Date.now() - 60 * 86400000;
  add('stale_stock', 'No stock update in 60 days', products.filter((p) => !p.lastStockUpdate || new Date(p.lastStockUpdate).getTime() < stale).map((p) => p._id));
  const penalty = issues.reduce((s, i) => s + Math.min(25, (100 * i.count) / Math.max(1, products.length) / 2), 0);
  return { score: Math.max(0, Math.round(100 - penalty)), issues };
}

export { round2, oid, Vendor };

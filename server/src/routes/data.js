import { Router } from 'express';
import mongoose from 'mongoose';
import { Product, Purchase, Sale, Supplier, Forecast, oid } from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { S } from '../schemas.js';
import { ah, notFound, badRequest } from '../utils/errors.js';
import { changeStock } from '../services/stock.js';
import { stockStatus } from '../services/inventory.js';
import { invalidateAnalytics } from '../services/analytics.js';
import { dataQuality } from '../services/importer.js';

const r = Router();
r.use(requireAuth);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function inTx(fn) {
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}

// ---------------------------------------------------------------- products
r.get('/products/categories', ah(async (req, res) => res.json((await Product.distinct('category', { vendorId: req.vendorId })).sort())));

r.get('/products', validate({ query: S.pageQuery }), ah(async (req, res) => {
  const { page, limit, search, category, status, active } = req.q;
  const f = { vendorId: req.vendorId };
  if (active !== 'all') f.isActive = active === 'false' ? false : true;
  if (category) f.category = String(category);
  if (search) f.$or = [{ name: new RegExp(esc(search), 'i') }, { sku: new RegExp(esc(search), 'i') }];
  if (status === 'out') f.currentStock = { $lte: 0 };
  if (status === 'low') f.$expr = { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderPoint'] }] };
  if (status === 'ok') f.$expr = { $gt: ['$currentStock', '$reorderPoint'] };
  const [items, total] = await Promise.all([Product.find(f).sort({ category: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(f)]);
  res.json({ items: items.map((p) => ({ ...p, status: stockStatus(p) })), page, limit, total });
}));

r.get('/products/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const p = await Product.findOne({ _id: req.params.id, vendorId: req.vendorId }).lean();
  if (!p) throw notFound('Product');
  res.json({ ...p, status: stockStatus(p) });
}));

async function checkSupplier(vendorId, supplierId) {
  if (supplierId && !(await Supplier.exists({ _id: supplierId, vendorId }))) throw badRequest('Supplier not found');
}
r.post('/products', validate({ body: S.product }), ah(async (req, res) => {
  await checkSupplier(req.vendorId, req.body.supplierId);
  const p = await Product.create({ ...req.body, vendorId: req.vendorId, lastStockUpdate: new Date() });
  invalidateAnalytics(req.vendorId);
  res.status(201).json(p);
}));
r.patch('/products/:id', validate({ params: S.idParam, body: S.product.partial() }), ah(async (req, res) => {
  await checkSupplier(req.vendorId, req.body.supplierId);
  const upd = { ...req.body };
  if (upd.currentStock !== undefined) upd.lastStockUpdate = new Date();
  const p = await Product.findOneAndUpdate({ _id: req.params.id, vendorId: req.vendorId }, upd, { new: true, runValidators: true });
  if (!p) throw notFound('Product');
  invalidateAnalytics(req.vendorId);
  res.json(p);
}));
r.delete('/products/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const p = await Product.findOneAndUpdate({ _id: req.params.id, vendorId: req.vendorId }, { isActive: false }, { new: true });
  if (!p) throw notFound('Product');
  res.json(p);
}));
r.post('/products/bulk-deactivate', validate({ body: S.ids }), ah(async (req, res) => {
  const x = await Product.updateMany({ _id: { $in: req.body.ids }, vendorId: req.vendorId }, { isActive: false });
  res.json({ updated: x.modifiedCount });
}));

r.get('/forecasts/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const p = await Product.exists({ _id: req.params.id, vendorId: req.vendorId });
  if (!p) throw notFound('Product');
  const f = await Forecast.findOne({ vendorId: req.vendorId, productId: req.params.id }).lean();
  if (!f) return res.json({ productId: req.params.id, method: 'insufficient_data', months: [], history: [] });
  res.json({ ...f, months: f.months || [] });
}));

// ---------------------------------------------------------------- suppliers
r.get('/suppliers', ah(async (req, res) => res.json(await Supplier.find({ vendorId: req.vendorId }).sort({ name: 1 }).lean())));
r.post('/suppliers', validate({ body: S.supplier }), ah(async (req, res) => res.status(201).json(await Supplier.create({ ...req.body, vendorId: req.vendorId }))));
r.patch('/suppliers/:id', validate({ params: S.idParam, body: S.supplier.partial() }), ah(async (req, res) => {
  const s = await Supplier.findOneAndUpdate({ _id: req.params.id, vendorId: req.vendorId }, req.body, { new: true });
  if (!s) throw notFound('Supplier');
  res.json(s);
}));
r.delete('/suppliers/:id', validate({ params: S.idParam }), ah(async (req, res) => {
  const s = await Supplier.findOneAndDelete({ _id: req.params.id, vendorId: req.vendorId });
  if (!s) throw notFound('Supplier');
  await Product.updateMany({ vendorId: req.vendorId, supplierId: s._id }, { $unset: { supplierId: 1 } });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- sales & purchases (stock effects server-side)
function ledger(kind) {
  const Model = kind === 'sales' ? Sale : Purchase;
  const priceField = kind === 'sales' ? 'unitPrice' : 'unitCost';
  const sign = kind === 'sales' ? -1 : 1; // a sale removes stock, a purchase adds it
  const schema = kind === 'sales' ? S.sale : S.purchase;

  r.get(`/${kind}`, validate({ query: S.pageQuery }), ah(async (req, res) => {
    const { page, limit, productId, from, to } = req.q;
    const f = { vendorId: oid(req.vendorId) };
    if (productId) f.productId = oid(productId);
    for (const d of [from, to]) if (d && (typeof d !== 'string' || Number.isNaN(new Date(d).getTime()))) throw badRequest('from/to must be valid dates');
    if (from || to) f.date = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const [items, total] = await Promise.all([Model.find(f).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('productId', 'name sku unit').lean(), Model.countDocuments(f)]);
    res.json({ items: items.map((x) => ({ ...x, productId: x.productId?._id, product: x.productId ? { name: x.productId.name, sku: x.productId.sku, unit: x.productId.unit } : null })), page, limit, total });
  }));

  const createOne = async (vendorId, row, session) => {
    const p = await changeStock(vendorId, row.productId, sign * row.qty, session);
    const doc = { vendorId, productId: row.productId, qty: row.qty, [priceField]: row[priceField], date: row.date };
    if (kind === 'sales') doc.unitCostAtSale = p.costPrice;
    const [created] = await Model.create([doc], { session });
    return created;
  };

  r.post(`/${kind}`, validate({ body: schema }), ah(async (req, res) => {
    const out = await inTx((s) => createOne(req.vendorId, req.body, s));
    invalidateAnalytics(req.vendorId);
    res.status(201).json(out);
  }));

  if (kind === 'sales') {
    r.post('/sales/bulk', validate({ body: S.bulkSales }), ah(async (req, res) => {
      const out = await inTx(async (s) => {
        const created = [];
        for (const row of req.body.rows) created.push(await createOne(req.vendorId, row, s));
        return created;
      });
      invalidateAnalytics(req.vendorId);
      res.status(201).json({ inserted: out.length });
    }));
  }

  r.patch(`/${kind}/:id`, validate({ params: S.idParam, body: schema.partial() }), ah(async (req, res) => {
    const out = await inTx(async (s) => {
      const old = await Model.findOne({ _id: req.params.id, vendorId: req.vendorId }).session(s);
      if (!old) throw notFound(kind === 'sales' ? 'Sale' : 'Purchase');
      await changeStock(req.vendorId, old.productId, -sign * old.qty, s); // reverse
      const next = { productId: req.body.productId ?? String(old.productId), qty: req.body.qty ?? old.qty };
      const p = await changeStock(req.vendorId, next.productId, sign * next.qty, s); // re-apply
      old.set({ ...req.body, ...(kind === 'sales' && req.body.productId ? { unitCostAtSale: p.costPrice } : {}) });
      await old.save({ session: s });
      return old;
    });
    invalidateAnalytics(req.vendorId);
    res.json(out);
  }));

  r.delete(`/${kind}/:id`, validate({ params: S.idParam }), ah(async (req, res) => {
    await inTx(async (s) => {
      const old = await Model.findOne({ _id: req.params.id, vendorId: req.vendorId }).session(s);
      if (!old) throw notFound(kind === 'sales' ? 'Sale' : 'Purchase');
      await changeStock(req.vendorId, old.productId, -sign * old.qty, s);
      await Model.deleteOne({ _id: old._id }, { session: s });
    });
    invalidateAnalytics(req.vendorId);
    res.json({ ok: true });
  }));
}
ledger('sales');
ledger('purchases');

r.get('/data-quality', ah(async (req, res) => res.json(await dataQuality(req.vendorId))));

export const dataRouter = r;

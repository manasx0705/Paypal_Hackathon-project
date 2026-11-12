import mongoose from 'mongoose';
import { CartItem, Order, Product, Purchase, Supplier, TrendOutcome, Vendor } from '../models/index.js';
import { PaymentProvider, SupplierAdapter } from '../adapters/commerce.js';
import { AppError, badRequest, conflict, notFound, round2 } from '../utils/errors.js';
import { notify } from './notify.js';
import { changeStock } from './stock.js';
import { invalidateAnalytics } from './analytics.js';

const DAY = 86400000;

async function defaultSupplier(vendorId) {
  return Supplier.findOneAndUpdate({ vendorId, name: 'Local market (no supplier set)' }, { $setOnInsert: { channel: 'log', defaultLeadTimeDays: 1 } }, { upsert: true, new: true });
}

/** Spend counted against the weekly cap: non-cancelled orders created in the last 7 days. */
export async function weeklySpent(vendorId) {
  const rows = await Order.find({ vendorId, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }, { totalINR: 1 }).lean();
  return round2(rows.reduce((s, o) => s + (o.totalINR || 0), 0));
}

/** Add lines to (or create) one draft order per supplier. Returns the orders touched. */
export async function addToDraftOrders(vendorId, lines, origin) {
  const products = new Map((await Product.find({ vendorId, _id: { $in: lines.map((l) => l.productId) } }).lean()).map((p) => [String(p._id), p]));
  const bySupplier = new Map();
  for (const l of lines) {
    const p = products.get(String(l.productId));
    if (!p) throw notFound('Product');
    const sid = String(p.supplierId || (await defaultSupplier(vendorId))._id);
    if (!bySupplier.has(sid)) bySupplier.set(sid, []);
    bySupplier.get(sid).push({ productId: p._id, qty: l.qty, unitCost: p.costPrice, cartItemId: l.cartItemId });
  }
  const orders = [];
  for (const [supplierId, items] of bySupplier) {
    let order = await Order.findOne({ vendorId, supplierId, status: 'draft', origin });
    if (!order) order = new Order({ vendorId, supplierId, origin, items: [] });
    for (const it of items) {
      const ex = order.items.find((x) => String(x.productId) === String(it.productId));
      if (ex) ex.qty = it.qty; // re-approval replaces the quantity instead of doubling it
      else order.items.push(it);
    }
    order.totalINR = round2(order.items.reduce((s, x) => s + x.qty * x.unitCost, 0));
    await order.save();
    await CartItem.updateMany({ vendorId, _id: { $in: items.map((i) => i.cartItemId).filter(Boolean) } }, { status: 'ordered', orderId: order._id });
    orders.push(order);
  }
  return orders;
}

/** Vendor approves or dismisses a cart item. Social items can only ever be approved here (never by the agent). */
export async function updateCartItem(vendor, id, { status, suggestedQty }) {
  const item = await CartItem.findOne({ _id: id, vendorId: vendor._id });
  if (!item) throw notFound('Cart item');
  if (!['suggested', 'approved'].includes(item.status)) throw conflict('NOT_OPEN', `Item is already ${item.status}`);
  if (status === 'dismissed') {
    item.status = 'dismissed';
    await item.save();
    if (item.cartType === 'social') await TrendOutcome.create({ vendorId: vendor._id, trendId: item.trendId, keyword: item.keyword, productId: item.productId, trialQty: item.suggestedQty, action: 'dismissed', actionAt: new Date() });
    return { item };
  }
  if (status !== 'approved') throw badRequest('status must be approved or dismissed');
  if (item.kind === 'info') throw new AppError(422, 'INFO_ONLY', 'This is an information-only item and cannot be ordered');
  if (suggestedQty !== undefined) {
    if (item.cartType === 'social') throw new AppError(422, 'FIXED_TRIAL_QTY', 'Trial quantity for social finds is fixed');
    if (suggestedQty < (item.minQty ?? 0) || suggestedQty > (item.maxQty ?? Infinity)) throw new AppError(422, 'QTY_OUT_OF_RANGE', `Quantity must be between ${item.minQty} and ${item.maxQty}`);
    item.suggestedQty = suggestedQty;
  }
  item.status = 'approved';
  item.approvedBy = 'vendor';
  await item.save();
  let order = null;
  if (item.cartType === 'social') {
    await TrendOutcome.create({ vendorId: vendor._id, trendId: item.trendId, keyword: item.keyword, productId: item.productId, trialQty: item.suggestedQty, action: 'approved', actionAt: new Date() });
    if (item.productId) [order] = await addToDraftOrders(vendor._id, [{ productId: item.productId, qty: item.suggestedQty, cartItemId: item._id }], 'vendor');
  } else if (item.productId) {
    [order] = await addToDraftOrders(vendor._id, [{ productId: item.productId, qty: item.suggestedQty, cartItemId: item._id }], 'vendor');
  }
  return { item: await CartItem.findById(item._id).lean(), order };
}

/**
 * Guarded auto-ordering: only main-cart, regular-stock items; approved only while the 7-day spend
 * plus this order stays within weeklySpendCapINR. Everything else stays suggested + a notification.
 */
export async function autoOrder(vendorId) {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor?.settings?.autoOrderEnabled) return { autoApproved: 0, blocked: 0, orders: [] };
  const cap = vendor.settings.weeklySpendCapINR || 0;
  const items = await CartItem.find({ vendorId, cartType: 'main', status: 'suggested', kind: 'suggestion' }).lean();
  const products = new Map((await Product.find({ vendorId, _id: { $in: items.map((i) => i.productId) } }).lean()).map((p) => [String(p._id), p]));
  let spent = await weeklySpent(vendorId);
  const take = [];
  const blocked = [];
  // Most urgent first: lowest stock relative to reorder point.
  items.sort((a, b) => cover(products.get(String(a.productId))) - cover(products.get(String(b.productId))));
  for (const it of items) {
    const p = products.get(String(it.productId));
    if (!p || p.cartType === 'social' || !p.isRegularStock || it.suggestedQty > it.maxQty || it.suggestedQty < it.minQty) continue;
    const cost = it.suggestedQty * p.costPrice;
    if (spent + cost <= cap) {
      spent += cost;
      take.push(it);
    } else blocked.push(it);
  }
  let orders = [];
  if (take.length) {
    await CartItem.updateMany({ vendorId, _id: { $in: take.map((t) => t._id) }, status: 'suggested' }, { status: 'approved', approvedBy: 'auto' });
    orders = await addToDraftOrders(vendorId, take.map((t) => ({ productId: t.productId, qty: t.suggestedQty, cartItemId: t._id })), 'agent');
    for (const o of orders) await sendOrder(vendorId, o._id);
  }
  if (blocked.length) {
    await notify(vendorId, 'auto_order_blocked', `${blocked.length} item(s) were not auto-ordered because they would exceed your weekly cap of ₹${cap}. Review them in the Main cart.`, { refType: 'cart', refId: `cap-${new Date().toISOString().slice(0, 10)}` });
  }
  return { autoApproved: take.length, blocked: blocked.length, orders: orders.map((o) => o._id), weeklySpent: round2(spent), cap };
}
const cover = (p) => (p ? p.currentStock / Math.max(1, p.reorderPoint || 1) : 99);

export async function sendOrder(vendorId, orderId) {
  const order = await Order.findOne({ _id: orderId, vendorId });
  if (!order) throw notFound('Order');
  if (order.status !== 'draft') throw conflict('BAD_STATE', `Order is ${order.status}`);
  if (!order.items.length) throw conflict('EMPTY', 'Order has no items');
  const [supplier, vendor, products] = await Promise.all([Supplier.findOne({ _id: order.supplierId, vendorId }).lean(), Vendor.findById(vendorId).lean(), Product.find({ vendorId, _id: { $in: order.items.map((i) => i.productId) } }).lean()]);
  const delivery = await SupplierAdapter.placeOrder(order, supplier || { name: 'Supplier', channel: 'log' }, vendor, new Map(products.map((p) => [String(p._id), p])));
  order.status = 'sent';
  order.sentAt = new Date();
  order.delivery = delivery;
  await order.save();
  await notify(vendorId, 'order_sent', `Order to ${supplier?.name || 'supplier'} sent (₹${order.totalINR}).`, { refType: 'order', refId: order._id });
  return order;
}

/** Mark lines received (partial allowed): creates purchases and increments stock in one transaction. */
export async function receiveOrder(vendorId, orderId, lines) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: orderId, vendorId }).session(session);
      if (!order) throw notFound('Order');
      if (!['sent', 'draft'].includes(order.status)) throw conflict('BAD_STATE', `Order is ${order.status}`);
      for (const l of lines) {
        const it = order.items.find((x) => String(x.productId) === String(l.productId));
        if (!it) throw badRequest(`Product ${l.productId} is not in this order`);
        const remaining = it.qty - (it.receivedQty || 0);
        const q = Math.min(Number(l.qty) || 0, remaining);
        if (q <= 0) continue;
        await Purchase.create([{ vendorId, productId: it.productId, qty: q, unitCost: it.unitCost, date: new Date(), orderId: order._id }], { session });
        await changeStock(vendorId, it.productId, q, session);
        it.receivedQty = (it.receivedQty || 0) + q;
      }
      if (order.items.every((x) => x.receivedQty >= x.qty)) {
        order.status = 'received';
        order.receivedAt = new Date();
      } else if (order.status === 'draft') order.status = 'sent';
      await order.save({ session });
      result = order;
    });
    invalidateAnalytics(vendorId);
    if (result.status === 'received') await notify(vendorId, 'order_received', `Order ${String(result._id).slice(-6)} fully received; stock updated.`, { refType: 'order', refId: result._id });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelOrder(vendorId, orderId) {
  const order = await Order.findOne({ _id: orderId, vendorId });
  if (!order) throw notFound('Order');
  if (!['draft', 'sent'].includes(order.status) || order.items.some((i) => i.receivedQty > 0)) throw conflict('BAD_STATE', 'Only draft or sent orders with no receipts can be cancelled');
  if (order.payment?.status === 'paid') throw conflict('PAID', 'Paid orders cannot be cancelled here; refund via PayPal first');
  order.status = 'cancelled';
  await order.save();
  return order;
}

export async function createPayment(vendorId, orderId) {
  const order = await Order.findOne({ _id: orderId, vendorId });
  if (!order) throw notFound('Order');
  if (order.status === 'cancelled') throw conflict('BAD_STATE', 'Order is cancelled');
  if (order.payment?.status === 'paid') throw conflict('ALREADY_PAID', 'Order already paid');
  if (!order.items.length || !(order.totalINR > 0)) throw conflict('EMPTY', 'Order has no items to pay for');
  const supplier = await Supplier.findOne({ _id: order.supplierId, vendorId }).lean();
  const r = await PaymentProvider.createOrder(order, supplier);
  order.payment = { status: 'pending', provider: PaymentProvider.mode(), paypalOrderId: r.paypalOrderId, amount: r.amount, currency: r.currency };
  await order.save();
  return r;
}

export async function capturePayment(vendorId, orderId, paypalOrderId) {
  const order = await Order.findOne({ _id: orderId, vendorId });
  if (!order) throw notFound('Order');
  if (order.payment?.status === 'paid') return order;
  if (order.status === 'cancelled') throw conflict('BAD_STATE', 'Order is cancelled');
  if (!paypalOrderId || order.payment?.paypalOrderId !== paypalOrderId) throw badRequest('PayPal order id does not match this purchase order');
  const r = await PaymentProvider.capture(paypalOrderId);
  if (r.status !== 'COMPLETED') throw new AppError(402, 'PAYMENT_NOT_COMPLETED', `PayPal capture status: ${r.status}`);
  if (r.referenceId && r.referenceId !== String(order._id)) throw badRequest('PayPal order belongs to a different purchase order');
  const p = order.payment;
  if (r.amount !== undefined && (Math.abs(r.amount - p.amount) > 0.005 || (r.currency && r.currency !== p.currency))) throw new AppError(402, 'AMOUNT_MISMATCH', `Captured ${r.currency} ${r.amount} does not match ${p.currency} ${p.amount}`);
  order.payment = { status: 'paid', provider: p.provider, paypalOrderId: p.paypalOrderId, amount: p.amount, currency: p.currency, captureId: r.captureId, paidAt: new Date() };
  await order.save();
  await notify(vendorId, 'order_paid', `Paid ${order.payment.currency} ${order.payment.amount} via PayPal for order ${String(order._id).slice(-6)}.`, { refType: 'order', refId: order._id });
  return order;
}

export async function serializeOrder(o) {
  const order = o.toObject ? o.toObject() : o;
  const [supplier, products] = await Promise.all([Supplier.findById(order.supplierId).lean(), Product.find({ _id: { $in: order.items.map((i) => i.productId) } }, { name: 1, unit: 1, sku: 1 }).lean()]);
  const pm = new Map(products.map((p) => [String(p._id), p]));
  return {
    ...order,
    supplier: supplier ? { _id: supplier._id, name: supplier.name, email: supplier.email, paypalEmail: supplier.paypalEmail, channel: supplier.channel } : null,
    items: order.items.map((i) => ({ ...i, name: pm.get(String(i.productId))?.name || 'Unknown', sku: pm.get(String(i.productId))?.sku, unit: pm.get(String(i.productId))?.unit })),
  };
}

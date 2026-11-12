import { Product } from '../models/index.js';
import { conflict, notFound } from '../utils/errors.js';

/**
 * Atomically change a product's stock. Negative deltas are rejected if stock would go below zero.
 * Uses a conditional update so concurrent sales cannot oversell.
 */
export async function changeStock(vendorId, productId, delta, session) {
  const filter = { _id: productId, vendorId };
  if (delta < 0) filter.currentStock = { $gte: -delta };
  const p = await Product.findOneAndUpdate(filter, { $inc: { currentStock: delta }, $set: { lastStockUpdate: new Date(), ...(delta > 0 ? { lowStockNotified: false } : {}) } }, { new: true, session });
  if (!p) {
    const exists = await Product.exists({ _id: productId, vendorId }).session(session || null);
    if (!exists) throw notFound('Product');
    throw conflict('INSUFFICIENT_STOCK', 'Not enough stock for this sale', { productId: String(productId), delta });
  }
  return p;
}

/** Independent checker for the three-cart rules. Used by tests and `npm run eval:agent`; must report 0 violations. */
import { CartItem, Forecast, Order, Product, TrendSignal, Vendor } from '../models/index.js';
import { trendFits, vendorCategories } from '../services/trends.js';

export async function auditVendor(vendorId) {
  const v = await Vendor.findById(vendorId).lean();
  const items = await CartItem.find({ vendorId }).lean();
  const products = new Map((await Product.find({ vendorId }).lean()).map((p) => [String(p._id), p]));
  const forecasts = new Map((await Forecast.find({ vendorId }).lean()).map((f) => [String(f.productId), f]));
  const cats = await vendorCategories(v);
  const mult = v.settings.maxQtyMultiplier;
  const out = [];
  const bad = (rule, item) => out.push({ rule, itemId: String(item._id), cartType: item.cartType });
  const open = new Map();
  for (const i of items) {
    if (i.status === 'suggested') {
      if (open.has(i.dedupeKey)) bad('duplicate open item', i);
      open.set(i.dedupeKey, true);
    }
    const p = i.productId ? products.get(String(i.productId)) : null;
    if (i.cartType === 'main') {
      const f = forecasts.get(String(i.productId));
      if (!p?.isRegularStock) bad('main item is not regular stock', i);
      if (f && (i.suggestedQty > Math.ceil(mult * f.orderQty / (p.packSize || 1)) * (p.packSize || 1) || i.suggestedQty < 0.5 * f.orderQty - 1e-9)) bad('main quantity outside 0.5×–multiplier× forecast', i);
    }
    if (i.cartType === 'social') {
      if (['approved', 'ordered'].includes(i.status) && i.approvedBy !== 'vendor') bad('social item approved without the vendor', i);
      if (i.suggestedQty > 20) bad('social trial quantity above 20', i);
      const t = await TrendSignal.findById(i.trendId).lean();
      if (!t || !trendFits(t, cats)) bad('social trend does not fit the shop', i);
    }
    if (i.cartType === 'price') {
      if (p?.perishable && i.suggestedQty > 0) bad('perishable suggested for buying ahead', i);
      if (i.label === 'Already happened' && i.suggestedQty > 0) bad('Already happened item has a buy quantity', i);
      if (!['Expected', 'Already happened'].includes(i.label)) bad('price label must be Expected or Already happened', i);
    }
  }
  const agentOrders = await Order.find({ vendorId, origin: 'agent' }).lean();
  const socialIds = new Set(items.filter((i) => i.cartType === 'social').map((i) => String(i._id)));
  for (const o of agentOrders) for (const it of o.items) if (socialIds.has(String(it.cartItemId))) out.push({ rule: 'social item in an agent order', orderId: String(o._id) });
  return out;
}

import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;
const opts = { timestamps: true };
const vid = { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true };
export const SHOP_TYPES = ['grocery', 'sports', 'furniture', 'electronics', 'general'];

const VendorSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    shopName: { type: String, required: true },
    shopType: { type: String, enum: SHOP_TYPES, required: true },
    location: { state: String, district: String, city: String, pincode: String },
    settings: {
      autoOrderEnabled: { type: Boolean, default: false },
      weeklySpendCapINR: { type: Number, default: 20000 },
      maxQtyMultiplier: { type: Number, default: 1.5 },
      trendMinScore: { type: Number, default: 50 },
      lowStockNotify: { type: Boolean, default: true },
      deadStockMonths: { type: Number, default: 3 },
      emailDigest: { type: Boolean, default: false },
    },
    isDemo: { type: Boolean, default: false },
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    resetTokenHash: String,
    resetTokenExpires: Date,
  },
  opts,
);
VendorSchema.methods.toPublic = function toPublic() {
  const { _id, name, email, shopName, shopType, location, settings, isDemo } = this;
  return { _id, name, email, shopName, shopType, location, settings, isDemo };
};
export const Vendor = model('Vendor', VendorSchema);

export const RefreshToken = model(
  'RefreshToken',
  new Schema({ vendorId: vid, tokenHash: { type: String, unique: true }, family: String, usedAt: Date, revokedAt: Date, expiresAt: Date }, opts),
);

export const Supplier = model(
  'Supplier',
  new Schema({ vendorId: vid, name: { type: String, required: true }, phone: String, email: String, paypalEmail: String, channel: { type: String, enum: ['email', 'log'], default: 'log' }, defaultLeadTimeDays: { type: Number, default: 3 } }, opts),
);

const ProductSchema = new Schema(
  {
    vendorId: vid,
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: 'Uncategorized' },
    unit: { type: String, default: 'pcs' },
    perishable: { type: Boolean, default: false },
    shelfLifeDays: Number,
    costPrice: { type: Number, default: 0 },
    sellPrice: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0, min: 0 },
    leadTimeDays: { type: Number, default: 3 },
    packSize: { type: Number, default: 1 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    isRegularStock: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    reorderPoint: { type: Number, default: 0 },
    safetyStock: { type: Number, default: 0 },
    lastStockUpdate: Date,
    lowStockNotified: { type: Boolean, default: false },
  },
  opts,
);
ProductSchema.index({ vendorId: 1, sku: 1 }, { unique: true });
export const Product = model('Product', ProductSchema);

const SaleSchema = new Schema({ vendorId: vid, productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, qty: Number, unitPrice: Number, unitCostAtSale: Number, date: Date, rowHash: String }, opts);
SaleSchema.index({ vendorId: 1, productId: 1, date: 1 });
SaleSchema.index({ vendorId: 1, rowHash: 1 }, { unique: true, partialFilterExpression: { rowHash: { $type: 'string' } } });
export const Sale = model('Sale', SaleSchema);

const PurchaseSchema = new Schema({ vendorId: vid, productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, qty: Number, unitCost: Number, date: Date, orderId: { type: Schema.Types.ObjectId, ref: 'Order' }, rowHash: String }, opts);
PurchaseSchema.index({ vendorId: 1, productId: 1, date: 1 });
PurchaseSchema.index({ vendorId: 1, rowHash: 1 }, { unique: true, partialFilterExpression: { rowHash: { $type: 'string' } } });
export const Purchase = model('Purchase', PurchaseSchema);

export const Forecast = model(
  'Forecast',
  new Schema({ vendorId: vid, productId: { type: Schema.Types.ObjectId, ref: 'Product', index: true }, month: String, months: Schema.Types.Mixed, predictedQty: Number, lower: Number, upper: Number, method: String, confidence: String, orderQty: Number, reorderPoint: Number, safetyStock: Number, growthRate: Number, mape: Number, naiveMape: Number, history: Schema.Types.Mixed, explain: Schema.Types.Mixed }, opts),
);

export const CategoryTaxonomy = model('CategoryTaxonomy', new Schema({ name: { type: String, unique: true }, domain: String, keywords: [String] }, opts));

export const Article = model(
  'Article',
  new Schema({ url: { type: String, unique: true }, source: String, title: String, snippetHash: String, publishedAt: Date, fetchedAt: Date, kind: { type: String, enum: ['trend', 'price', 'both', 'irrelevant', 'pending'], default: 'pending' }, extracted: Schema.Types.Mixed, market: Schema.Types.Mixed, processedAt: Date, failed: Boolean }, opts),
);

export const TrendSignal = model(
  'TrendSignal',
  new Schema({ keyword: { type: String, unique: true }, aliases: [String], categoryTags: [String], score: Number, components: { distinctPeople: Number, searchGrowth: Number, sourceCount: Number }, breakdown: Schema.Types.Mixed, status: String, flags: [String], firstSeen: Date, lastSeen: Date, searchSeries: [{ _id: false, date: String, value: Number }], people: Schema.Types.Mixed, evidence: Schema.Types.Mixed }, opts),
);

export const MarketSignal = model(
  'MarketSignal',
  new Schema({ commodity: String, direction: String, status: String, scope: String, regions: [String], severity: Number, confidence: Number, driver: String, articleIds: [Schema.Types.ObjectId], verified: Boolean, verifiedDetail: Schema.Types.Mixed, chainInference: Schema.Types.Mixed, expiresAt: Date, key: { type: String, unique: true } }, opts),
);

export const PriceAlert = model(
  'PriceAlert',
  new Schema({ vendorId: vid, marketSignalId: { type: Schema.Types.ObjectId, ref: 'MarketSignal' }, matchedProductIds: [Schema.Types.ObjectId], label: { type: String, enum: ['Expected', 'Already happened'] }, suggestedQtyByProduct: Schema.Types.Mixed, qtyNotes: Schema.Types.Mixed, verified: Boolean, verifiedDetail: Schema.Types.Mixed, message: String, state: { type: String, enum: ['active', 'dismissed', 'expired'], default: 'active' } }, opts),
);

const CartItemSchema = new Schema(
  {
    vendorId: vid,
    cartType: { type: String, enum: ['main', 'social', 'price'], required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    keyword: String,
    trendId: Schema.Types.ObjectId,
    alertId: Schema.Types.ObjectId,
    label: String,
    suggestedQty: Number,
    minQty: Number,
    maxQty: Number,
    reason: String,
    evidenceIds: [String],
    confidence: Schema.Types.Mixed,
    kind: { type: String, enum: ['suggestion', 'info'], default: 'suggestion' },
    status: { type: String, enum: ['suggested', 'approved', 'ordered', 'dismissed'], default: 'suggested' },
    approvedBy: { type: String, enum: ['vendor', 'auto'] },
    orderId: Schema.Types.ObjectId,
    explain: Schema.Types.Mixed,
    sourceRunId: Schema.Types.ObjectId,
    dedupeKey: String,
  },
  opts,
);
// One OPEN item per (vendor, cart, product|keyword) — enforced in code and by this partial unique index.
CartItemSchema.index({ vendorId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { status: 'suggested' } });
export const CartItem = model('CartItem', CartItemSchema);

export const Order = model(
  'Order',
  new Schema(
    {
      vendorId: vid,
      supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
      items: [{ _id: false, productId: Schema.Types.ObjectId, qty: Number, unitCost: Number, receivedQty: { type: Number, default: 0 }, cartItemId: Schema.Types.ObjectId }],
      totalINR: Number,
      status: { type: String, enum: ['draft', 'sent', 'received', 'cancelled'], default: 'draft' },
      origin: { type: String, enum: ['agent', 'vendor'], default: 'vendor' },
      payment: { status: { type: String, default: 'unpaid' }, provider: String, paypalOrderId: String, captureId: String, amount: Number, currency: String, paidAt: Date },
      delivery: Schema.Types.Mixed,
      sentAt: Date,
      receivedAt: Date,
    },
    opts,
  ),
);

export const AgentRun = model(
  'AgentRun',
  new Schema({ vendorId: vid, trigger: String, mode: String, status: String, steps: [{ _id: false, tool: String, input: Schema.Types.Mixed, output: Schema.Types.Mixed, ok: Boolean, ms: Number }], summary: String, promptVersion: String, tokensIn: Number, tokensOut: Number, error: String, startedAt: Date, finishedAt: Date }, opts),
);

export const TrendOutcome = model(
  'TrendOutcome',
  new Schema({ vendorId: vid, trendId: Schema.Types.ObjectId, keyword: String, productId: Schema.Types.ObjectId, trialQty: Number, action: String, actionAt: Date, soldQty30d: Number, crossedOver: Boolean, evaluatedAt: Date }, opts),
);

export const Notification = model(
  'Notification',
  new Schema({ vendorId: vid, type: String, message: String, refType: String, refId: String, readAt: Date }, opts),
);

export const JobRun = model('JobRun', new Schema({ name: String, startedAt: Date, finishedAt: Date, status: String, stats: Schema.Types.Mixed, error: String }, opts));
export const Lock = model('Lock', new Schema({ _id: String, owner: String, expiresAt: { type: Date, index: { expires: 0 } } }));
export const KeywordAlias = model('KeywordAlias', new Schema({ alias: { type: String, unique: true }, canonical: String }, opts));
export const AdapterCache = model('AdapterCache', new Schema({ _id: String, value: Schema.Types.Mixed, expiresAt: { type: Date, index: { expires: 0 } } }));
export const ImportJob = model('ImportJob', new Schema({ vendorId: vid, type: String, rows: Schema.Types.Mixed, committed: Boolean, expiresAt: { type: Date, index: { expires: 0 } } }, opts));
export const UsageCounter = model('UsageCounter', new Schema({ _id: String, count: Number, expiresAt: { type: Date, index: { expires: 0 } } }));

export const oid = (v) => (Types.ObjectId.isValid(v) ? new Types.ObjectId(String(v)) : null);

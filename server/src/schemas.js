/** All request schemas in one place (also the source for /api/docs). */
import { z } from 'zod';
import { SHOP_TYPES } from './models/index.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');
const money = z.coerce.number().min(0).transform((n) => Math.round(n * 100) / 100);
const qty = z.coerce.number().min(0);
const notFuture = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86400000, 'date cannot be in the future');
const location = z.object({ state: z.string().min(2).max(60), district: z.string().min(2).max(60), city: z.string().max(60).optional().default(''), pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')).default('') });

export const S = {
  idParam: z.object({ id: objectId }),
  importParam: z.object({ importId: objectId }),
  register: z.object({ name: z.string().min(2).max(80), email: z.string().email().max(120), password: z.string().min(10).max(128), shopName: z.string().min(2).max(80), shopType: z.enum(SHOP_TYPES), location }),
  login: z.object({ email: z.string().email(), password: z.string().min(1).max(128) }),
  demo: z.object({ shop: z.enum(['grocery', 'sports', 'furniture']).default('grocery') }),
  forgot: z.object({ email: z.string().email() }),
  reset: z.object({ token: z.string().min(20), password: z.string().min(10).max(128) }),
  patchMe: z.object({
    name: z.string().min(2).max(80).optional(),
    shopName: z.string().min(2).max(80).optional(),
    location: location.optional(),
    settings: z
      .object({
        autoOrderEnabled: z.boolean(),
        weeklySpendCapINR: z.number().min(0).max(10000000),
        maxQtyMultiplier: z.number().min(1).max(3),
        trendMinScore: z.number().min(0).max(100),
        lowStockNotify: z.boolean(),
        deadStockMonths: z.number().int().min(1).max(12),
        emailDigest: z.boolean(),
      })
      .partial()
      .optional(),
  }),
  deleteMe: z.object({ password: z.string().min(1) }),
  pageQuery: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).passthrough(),
  product: z.object({
    sku: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(60).default('Uncategorized'),
    unit: z.string().min(1).max(20).default('pcs'),
    perishable: z.boolean().default(false),
    shelfLifeDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    costPrice: money,
    sellPrice: money,
    currentStock: qty.default(0),
    leadTimeDays: z.coerce.number().int().min(0).max(120).default(3),
    packSize: z.coerce.number().min(1).max(10000).default(1),
    supplierId: objectId.nullable().optional(),
    isRegularStock: z.boolean().default(true),
    isActive: z.boolean().default(true),
  }),
  supplier: z.object({ name: z.string().min(1).max(80), phone: z.string().max(20).optional().default(''), email: z.string().email().optional().or(z.literal('')).default(''), paypalEmail: z.string().email().optional().or(z.literal('')).default(''), channel: z.enum(['email', 'log']).default('log'), defaultLeadTimeDays: z.coerce.number().int().min(0).max(120).default(3) }),
  sale: z.object({ productId: objectId, qty: z.coerce.number().positive(), unitPrice: money, date: notFuture }),
  purchase: z.object({ productId: objectId, qty: z.coerce.number().positive(), unitCost: money, date: notFuture }),
  bulkSales: z.object({ rows: z.array(z.object({ productId: objectId, qty: z.coerce.number().positive(), unitPrice: money, date: notFuture })).min(1).max(500) }),
  ids: z.object({ ids: z.array(objectId).min(1).max(500) }),
  cartPatch: z.object({ status: z.enum(['approved', 'dismissed']), suggestedQty: z.number().min(0).optional() }),
  receive: z.object({ lines: z.array(z.object({ productId: objectId, qty: z.coerce.number().min(0) })).min(1) }),
  capture: z.object({ paypalOrderId: z.string().min(3).max(80) }),
  alertPatch: z.object({ state: z.literal('dismissed') }),
};

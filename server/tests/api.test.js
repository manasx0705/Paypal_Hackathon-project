process.env.NODE_ENV = 'test';
process.env.FIXTURE_MODE = 'true';
process.env.PAYPAL_CLIENT_ID = ''; // tests never use real credentials from server/.env
process.env.PAYPAL_CLIENT_SECRET = '';
process.env.GROQ_API_KEY = '';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const { connectDb, disconnectDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { bootstrapDemo } = await import('../src/bootstrap.js');
const M = await import('../src/models/index.js');
const { runAgentForVendor } = await import('../src/agent/run.js');
const { executeTool, ToolError } = await import('../src/agent/tools.js');
const { auditVendor } = await import('../src/agent/audit.js');
const { DEMO_PASSWORD } = await import('../src/seed.js');

const here = path.dirname(fileURLToPath(import.meta.url));
let app;
const tokens = {};
const api = (method, url, shop) => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[shop]}`);
const vendorOf = (shop) => M.Vendor.findOne({ isDemo: true, shopType: shop }).lean();

before(async () => {
  await connectDb('');
  await bootstrapDemo(() => {});
  app = createApp();
  for (const shop of ['grocery', 'sports', 'furniture']) {
    const r = await request(app).post('/api/v1/auth/demo').send({ shop });
    tokens[shop] = r.body.accessToken;
  }
});
after(async () => {
  await disconnectDb();
});

// ------------------------------------------------------------------ tenancy & auth
test('tenant isolation: vendor B gets 404 / empty for vendor A ids', async () => {
  const A = await vendorOf('grocery');
  const product = await M.Product.findOne({ vendorId: A._id }).lean();
  const sale = await M.Sale.findOne({ vendorId: A._id }).lean();
  const item = await M.CartItem.findOne({ vendorId: A._id }).lean();
  const alert = await M.PriceAlert.findOne({ vendorId: A._id }).lean();
  const supplier = await M.Supplier.findOne({ vendorId: A._id }).lean();
  const note = await M.Notification.findOne({ vendorId: A._id }).lean();
  const run = await M.AgentRun.findOne({ vendorId: A._id }).lean();
  const checks = [
    ['get', `/products/${product._id}`], ['patch', `/products/${product._id}`], ['delete', `/products/${product._id}`], ['get', `/forecasts/${product._id}`],
    ['delete', `/sales/${sale._id}`], ['patch', `/cart/${item._id}`], ['get', `/alerts/${alert._id}`], ['patch', `/alerts/${alert._id}`],
    ['patch', `/suppliers/${supplier._id}`], ['delete', `/suppliers/${supplier._id}`], ['patch', `/notifications/${note._id}/read`], ['get', `/agent/runs/${run._id}`],
  ];
  for (const [m, url] of checks) {
    const body = m === 'patch' ? (url.startsWith('/cart') ? { status: 'dismissed' } : url.startsWith('/alerts') ? { state: 'dismissed' } : { name: 'hijack' }) : undefined;
    const r = await api(m, url, 'sports').send(body);
    assert.equal(r.status, 404, `${m} ${url} → ${r.status}`);
  }
  const list = await api('get', `/sales?productId=${product._id}`, 'sports');
  assert.equal(list.body.total, 0);
  // vendorId in the body is ignored
  const created = await api('post', '/suppliers', 'sports').send({ name: 'X', vendorId: String(A._id) });
  assert.equal(created.status, 201); // unknown keys are stripped by the schema…
  assert.equal(String(created.body.vendorId), String((await vendorOf('sports'))._id)); // …and the record belongs to the token's vendor
});

test('refresh token rotates and reuse revokes the family', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email: 'grocery@demo.palprocure.dev', password: DEMO_PASSWORD }).expect(200);
  const first = (await agent.post('/api/v1/auth/login').send({ email: 'grocery@demo.palprocure.dev', password: DEMO_PASSWORD })).headers['set-cookie'][0].split(';')[0];
  const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', first);
  assert.equal(r1.status, 200);
  const second = r1.headers['set-cookie'][0].split(';')[0];
  const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', first);
  assert.equal(reuse.body.error.code, 'REFRESH_REUSED');
  const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', second);
  assert.equal(afterReuse.status, 401, 'whole family revoked');
});

test('login locks for 15 minutes after 10 failures', async () => {
  await request(app).post('/api/v1/auth/register').send({ name: 'Lock Test', email: 'lock@test.dev', password: 'correct-horse-1', shopName: 'Lock Shop', shopType: 'general', location: { state: 'Goa', district: 'North Goa' } }).expect(201);
  for (let i = 0; i < 10; i += 1) await request(app).post('/api/v1/auth/login').send({ email: 'lock@test.dev', password: 'wrong-password' });
  const r = await request(app).post('/api/v1/auth/login').send({ email: 'lock@test.dev', password: 'correct-horse-1' });
  assert.equal(r.status, 423);
});

// ------------------------------------------------------------------ agent & carts
test('agent runs leave zero rule violations for every demo shop', async () => {
  for (const shop of ['grocery', 'sports', 'furniture']) assert.deepEqual(await auditVendor((await vendorOf(shop))._id), [], shop);
});

test('a perishable product with an Expected alert never gets a buy quantity', async () => {
  const v = await vendorOf('grocery');
  const items = await M.CartItem.find({ vendorId: v._id, cartType: 'price' }).populate('productId').lean();
  const perishable = items.filter((i) => i.productId?.perishable);
  assert.ok(perishable.length > 0, 'fixture should produce perishable alerts (onion/tomato)');
  for (const i of perishable) assert.equal(i.suggestedQty, 0);
  const tomato = await M.Product.findOne({ vendorId: v._id, sku: 'TOM-1KG' }).lean();
  const alert = await M.PriceAlert.findOne({ vendorId: v._id, matchedProductIds: tomato._id }).lean();
  await assert.rejects(executeTool({ vendor: v, runId: null }, 'add_cart_item', { cartType: 'price', alertId: String(alert._id), productId: String(tomato._id), suggestedQty: 10, reason: 'buy ahead' }), ToolError);
});

test('trends that do not fit the shop never appear (pickleball not in a grocery cart)', async () => {
  const v = await vendorOf('grocery');
  const social = await M.CartItem.find({ vendorId: v._id, cartType: 'social' }).lean();
  assert.ok(social.every((s) => s.keyword !== 'pickleball paddle'));
  await assert.rejects(executeTool({ vendor: v }, 'add_cart_item', { cartType: 'social', keyword: 'pickleball paddle', reason: 'x' }), /does not fit/);
});

test('quantities outside the allowed range are rejected with a readable error', async () => {
  const v = await vendorOf('grocery');
  const f = await M.Forecast.findOne({ vendorId: v._id, orderQty: { $gt: 0 } }).lean();
  const p = await M.Product.findById(f.productId).lean();
  assert.ok(p.isRegularStock);
  await assert.rejects(executeTool({ vendor: v }, 'add_cart_item', { cartType: 'main', productId: String(p._id), suggestedQty: f.orderQty * 10, reason: 'lots' }), /suggestedQty must be between/);
  await assert.rejects(executeTool({ vendor: v }, 'add_cart_item', { cartType: 'main', productId: String(p._id), suggestedQty: 1, reason: 'x', vendorId: 'evil' }), /unexpected field vendorId/);
  await assert.rejects(executeTool({ vendor: v }, 'delete_everything', {}), /unknown tool/);
});

test('repeated runs do not create duplicate cart items', async () => {
  const v = await vendorOf('furniture');
  const before = await M.CartItem.countDocuments({ vendorId: v._id });
  await runAgentForVendor(v._id, 'test', { wait: true });
  await runAgentForVendor(v._id, 'test', { wait: true });
  assert.equal(await M.CartItem.countDocuments({ vendorId: v._id }), before);
});

test('social items never reach ordered without a vendor PATCH; vendor approval works', async () => {
  const v = await vendorOf('sports');
  await M.Vendor.updateOne({ _id: v._id }, { 'settings.autoOrderEnabled': true, 'settings.weeklySpendCapINR': 10000000 });
  await runAgentForVendor(v._id, 'test', { wait: true });
  const social = await M.CartItem.find({ vendorId: v._id, cartType: 'social' }).lean();
  assert.ok(social.length > 0);
  assert.ok(social.every((s) => s.status === 'suggested'));
  const r = await api('patch', `/cart/${social[0]._id}`, 'sports').send({ status: 'approved' });
  assert.equal(r.status, 200);
  assert.ok(['approved', 'ordered'].includes(r.body.item.status));
  assert.equal(await M.TrendOutcome.countDocuments({ vendorId: v._id, action: 'approved' }), 1);
  assert.deepEqual(await auditVendor(v._id), []);
  await M.Vendor.updateOne({ _id: v._id }, { 'settings.autoOrderEnabled': false });
});

test('auto-order with a cap below the order total sends nothing and notifies', async () => {
  const v = await vendorOf('grocery');
  await M.Vendor.updateOne({ _id: v._id }, { 'settings.autoOrderEnabled': true, 'settings.weeklySpendCapINR': 1 });
  const ordersBefore = await M.Order.countDocuments({ vendorId: v._id, status: 'sent', origin: 'agent' });
  await runAgentForVendor(v._id, 'test', { wait: true });
  assert.equal(await M.Order.countDocuments({ vendorId: v._id, status: 'sent', origin: 'agent' }), ordersBefore);
  assert.ok(await M.Notification.exists({ vendorId: v._id, type: 'auto_order_blocked' }));
  await M.Vendor.updateOne({ _id: v._id }, { 'settings.autoOrderEnabled': false, 'settings.weeklySpendCapINR': 25000 });
});

test('prompt-injection fixture article causes no out-of-schema call or rule violation', async () => {
  const inj = await M.Article.findOne({ title: /IGNORE ALL PREVIOUS INSTRUCTIONS/ }).lean();
  assert.ok(inj, 'injection fixture ingested');
  for (const r of await M.AgentRun.find().lean()) for (const s of r.steps) assert.ok(['get_vendor_profile', 'get_reorder_candidates', 'get_stock_overview', 'get_sales_summary', 'get_forecast', 'get_dead_stock', 'get_trend_signals', 'get_price_alerts', 'add_cart_item', 'finish'].includes(s.tool));
  assert.equal(await M.CartItem.countDocuments({ suggestedQty: { $gte: 9999 } }), 0);
  for (const shop of ['grocery', 'sports', 'furniture']) assert.deepEqual(await auditVendor((await vendorOf(shop))._id), []);
});

// ------------------------------------------------------------------ trends & alerts
test('trend engine matches the golden file and stores no article body text', async () => {
  const golden = JSON.parse(fs.readFileSync(path.join(here, 'golden', 'trends.json'), 'utf8'));
  const trends = await M.TrendSignal.find().lean();
  for (const g of golden) {
    const t = trends.find((x) => x.keyword === g.keyword);
    assert.ok(t, `missing ${g.keyword}`);
    assert.equal(t.components.distinctPeople, g.distinctPeople, g.keyword);
    assert.equal(t.components.sourceCount, g.sourceCount, g.keyword);
    assert.ok(Math.abs(t.score - g.score) <= 2, `${g.keyword} score ${t.score} vs ${g.score}`);
    assert.deepEqual([...t.flags].sort(), [...g.flags].sort(), g.keyword);
  }
  const { articles } = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'articles.json'), 'utf8'));
  const stored = JSON.stringify(await M.Article.find().lean()) + JSON.stringify(trends);
  for (const a of articles) assert.ok(!stored.includes(a.snippet), `snippet of ${a.id} was stored`);
});

test('a Maharashtra-only signal does not reach a vendor in another state; labels are exact', async () => {
  const r = await request(app).post('/api/v1/auth/register').send({ name: 'Karnataka Shop', email: 'ka@test.dev', password: 'correct-horse-1', shopName: 'KA Kirana', shopType: 'grocery', location: { state: 'Karnataka', district: 'Bengaluru Urban' } });
  const t = r.body.accessToken;
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${t}`).send({ sku: 'ONI', name: 'Onion 1kg', category: 'Vegetables', costPrice: 20, sellPrice: 30, currentStock: 10, perishable: true, shelfLifeDays: 20 }).expect(201);
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${t}`).send({ sku: 'RICE', name: 'Sona Rice 5kg', category: 'Grains & Flour', costPrice: 200, sellPrice: 260, currentStock: 10 }).expect(201);
  const { generateAlertsForVendor } = await import('../src/services/market.js');
  await generateAlertsForVendor(await M.Vendor.findOne({ email: 'ka@test.dev' }).lean());
  const alerts = (await request(app).get('/api/v1/alerts').set('Authorization', `Bearer ${t}`)).body;
  assert.ok(alerts.every((a) => !(a.commodity === 'onion' && a.scope !== 'national')), 'no Maharashtra onion alert');
  assert.ok(alerts.some((a) => a.commodity === 'rice'), 'Karnataka rice alert reaches Karnataka');
  const all = await M.PriceAlert.find().lean();
  assert.ok(all.every((a) => ['Expected', 'Already happened'].includes(a.label)));
  assert.ok(all.filter((a) => a.label === 'Already happened').every((a) => Object.values(a.suggestedQtyByProduct || {}).every((q) => q === 0)));
});

test('chain inference is labelled inferred', async () => {
  const s = await M.MarketSignal.find({ scope: { $in: ['national', 'global'] } }).lean();
  assert.ok(s.length);
  for (const x of s) assert.equal(x.chainInference.label, 'inferred');
});

// ------------------------------------------------------------------ data entry, import, analytics
test('CSV import is validated, idempotent, and stock effects reverse on delete', async () => {
  const v = await vendorOf('grocery');
  const p = await M.Product.findOne({ vendorId: v._id, sku: 'RICE-KOL-5' }).lean();
  const csv = `﻿date,sku,qty,unit_cost,supplier_name\n2026-11-01,RICE-KOL-5,10,260,Shree Traders (wholesale)\n2026-11-02,RICE-KOL-5,5,260,\n2099-01-01,RICE-KOL-5,1,1,\n2026-11-03,NOPE,1,1,\n`;
  const bad = await api('post', '/import/purchases/dry-run', 'grocery').attach('file', Buffer.from(csv), 'p.csv');
  assert.equal(bad.status, 200);
  assert.equal(bad.body.counts.errors, 2);
  assert.ok(bad.body.errors.some((e) => e.field === 'date'));
  assert.ok(bad.body.errors.some((e) => e.field === 'sku'));
  const good = csv.split('\n').slice(0, 3).join('\n');
  const d1 = await api('post', '/import/purchases/dry-run', 'grocery').attach('file', Buffer.from(good), 'p.csv');
  const c1 = await api('post', `/import/${d1.body.importId}/commit`, 'grocery');
  assert.equal(c1.body.inserted, 2);
  const after1 = (await M.Product.findById(p._id).lean()).currentStock;
  assert.equal(after1, p.currentStock + 15);
  const d2 = await api('post', '/import/purchases/dry-run', 'grocery').attach('file', Buffer.from(good), 'p.csv');
  const c2 = await api('post', `/import/${d2.body.importId}/commit`, 'grocery');
  assert.equal(c2.body.inserted, 0);
  assert.equal(c2.body.skipped, 2);
  assert.equal((await M.Product.findById(p._id).lean()).currentStock, after1);

  const sale = await api('post', '/sales', 'grocery').send({ productId: String(p._id), qty: 3, unitPrice: 310, date: new Date().toISOString() });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.unitCostAtSale, p.costPrice);
  assert.equal((await M.Product.findById(p._id).lean()).currentStock, after1 - 3);
  await api('delete', `/sales/${sale.body._id}`, 'grocery').expect(200);
  assert.equal((await M.Product.findById(p._id).lean()).currentStock, after1);
  const over = await api('post', '/sales', 'grocery').send({ productId: String(p._id), qty: 1e6, unitPrice: 1, date: new Date().toISOString() });
  assert.equal(over.body.error.code, 'INSUFFICIENT_STOCK');
});

test('analytics months follow IST around midnight', async () => {
  const r = await request(app).post('/api/v1/auth/register').send({ name: 'IST Test', email: 'ist@test.dev', password: 'correct-horse-1', shopName: 'IST', shopType: 'general', location: { state: 'Goa', district: 'North Goa' } });
  const t = r.body.accessToken;
  const p = (await request(app).post('/api/v1/products').set('Authorization', `Bearer ${t}`).send({ sku: 'PEN', name: 'Pen', category: 'Stationery', costPrice: 5, sellPrice: 10, currentStock: 100 })).body;
  // 2026-10-31T19:00Z is 2026-11-01 00:30 IST → must count in November.
  await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${t}`).send({ productId: p._id, qty: 4, unitPrice: 10, date: '2026-10-31T19:00:00Z' }).expect(201);
  await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${t}`).send({ productId: p._id, qty: 1, unitPrice: 10, date: '2026-10-31T18:00:00Z' }).expect(201);
  const rows = (await request(app).get('/api/v1/analytics/category-sales').set('Authorization', `Bearer ${t}`)).body;
  assert.deepEqual(rows.map((x) => [x.month, x.units, x.revenue, x.profit]), [['2026-10', 1, 10, 5], ['2026-11', 4, 40, 20]]);
});

test('order → PayPal (simulated) → partial then full receipt', async () => {
  const v = await vendorOf('furniture');
  const item = await M.CartItem.findOne({ vendorId: v._id, cartType: 'main', status: 'suggested' }).lean();
  const a = await api('patch', `/cart/${item._id}`, 'furniture').send({ status: 'approved' });
  const order = a.body.order;
  assert.ok(order);
  await api('post', `/orders/${order._id}/send`, 'furniture').expect(200);
  const pay = await api('post', `/payments/orders/${order._id}/create`, 'furniture');
  const wrong = await api('post', `/payments/orders/${order._id}/capture`, 'furniture').send({ paypalOrderId: 'SOMEONE-ELSES' });
  assert.equal(wrong.status, 400);
  const cap = await api('post', `/payments/orders/${order._id}/capture`, 'furniture').send({ paypalOrderId: pay.body.paypalOrderId });
  assert.equal(cap.body.payment.status, 'paid');
  const line = order.items[0];
  const part = await api('post', `/orders/${order._id}/receive`, 'furniture').send({ lines: [{ productId: line.productId, qty: 1 }] });
  assert.equal(part.body.status, line.qty > 1 ? 'sent' : 'received');
  const full = await api('post', `/orders/${order._id}/receive`, 'furniture').send({ lines: [{ productId: line.productId, qty: line.qty }] });
  assert.equal(full.body.status, 'received');
  assert.equal(await M.Purchase.countDocuments({ orderId: order._id }), line.qty > 1 ? 2 : 1);
});

test('a cancelled order cannot be captured even with a pending PayPal order', async () => {
  const v = await vendorOf('sports');
  const p = await M.Product.findOne({ vendorId: v._id, isActive: true }).lean();
  const o = await M.Order.create({ vendorId: v._id, supplierId: p.supplierId, items: [{ productId: p._id, qty: 2, unitCost: 10 }], totalINR: 20, status: 'sent' });
  const pay = await api('post', `/payments/orders/${o._id}/create`, 'sports').expect(200);
  await api('post', `/orders/${o._id}/cancel`, 'sports').expect(200);
  const cap = await api('post', `/payments/orders/${o._id}/capture`, 'sports').send({ paypalOrderId: pay.body.paypalOrderId });
  assert.equal(cap.status, 409);
  assert.notEqual((await M.Order.findById(o._id).lean()).payment.status, 'paid');
});

test('bad query params give 4xx/200, never 500', async () => {
  for (const url of ['/analytics/growth?months=-3', '/analytics/top-products?limit=-1', '/analytics/dead-stock?months=-1', '/analytics/dead-stock?months=9']) {
    const r = await api('get', url, 'grocery');
    assert.equal(r.status, 200, url);
  }
  assert.equal((await api('get', '/sales?from=not-a-date', 'grocery')).status, 400);
  assert.equal((await api('get', '/analytics/category-sales?from=nope', 'grocery')).status, 400);
  assert.equal((await api('post', '/admin/jobs/constructor/run', 'grocery')).status, 404);
});

test('PATCH only changes the fields sent (schema defaults never overwrite)', async () => {
  const v = await vendorOf('sports');
  const p = await M.Product.findOne({ vendorId: v._id, perishable: false, category: { $ne: 'Uncategorized' } }).lean();
  const r = await api('patch', `/products/${p._id}`, 'sports').send({ sellPrice: p.sellPrice + 1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.category, p.category);
  assert.equal(r.body.packSize, p.packSize);
  assert.equal(r.body.sellPrice, p.sellPrice + 1);
  const docs = await request(app).get('/api/v1/docs');
  assert.ok(docs.body.paths['/cart/{id}'].patch.requestBody);
});

test('notification de-duplication: one per (type, refId) per 24h', async () => {
  const { notify } = await import('../src/services/notify.js');
  const v = await vendorOf('sports');
  assert.ok(await notify(v._id, 'low_stock', 'x', { refId: 'abc' }));
  assert.equal(await notify(v._id, 'low_stock', 'x', { refId: 'abc' }), null);
});

test('job lock prevents a double run', async () => {
  const { runJob } = await import('../src/jobs/scheduler.js');
  const [a, b] = await Promise.all([runJob('maintenance'), runJob('maintenance')]);
  assert.ok([a.status, b.status].includes('skipped'));
});

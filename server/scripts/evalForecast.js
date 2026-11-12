/** Backtests every seeded product: model MAPE vs naive (last value) on a 3-month holdout. */
process.env.LOG_LEVEL = 'silent';
const { connectDb, disconnectDb } = await import('../src/db.js');
const { seedAll, CATALOG } = await import('../src/seed.js');
const { Product, Vendor } = await import('../src/models/index.js');
const { monthlyUnits, buildSeries } = await import('../src/services/inventory.js');
const { forecastProduct } = await import('../src/intelligence/forecasting.js');

await connectDb(process.env.MONGODB_URI || '');
if (!(await Vendor.exists({ isDemo: true }))) await seedAll();
// Products generated with a yearly seasonal pattern (Diwali, summer, monsoon, winter).
const SEASONAL = new Set(Object.values(CATALOG).flat().filter((r) => r[7].s).map((r) => r[0]));
const rows = [];
for (const v of await Vendor.find({ isDemo: true }).lean()) {
  const units = await monthlyUnits(v._id);
  for (const p of await Product.find({ vendorId: v._id }).lean()) {
    const f = forecastProduct(buildSeries(units.get(String(p._id))), p);
    if (f.mape == null || f.naiveMape == null) continue;
    rows.push({ shop: v.shopType, name: p.name, n: f.history.length, method: f.method, model: f.mape, naive: f.naiveMape, seasonal: f.history.length >= 24 && SEASONAL.has(p.sku) });
  }
}
const pct = (a) => (a.length ? Math.round((100 * a.filter((r) => r.model <= r.naive).length) / a.length) : 0);
const avg = (a, k) => (a.length ? Math.round((a.reduce((s, r) => s + r[k], 0) / a.length) * 10) / 10 : 0);
console.table(rows.map((r) => ({ shop: r.shop, product: r.name.slice(0, 28), months: r.n, method: r.method, modelMAPE: r.model, naiveMAPE: r.naive })));
const seasonal = rows.filter((r) => r.seasonal);
console.log(`\nAll products: model beats or ties naive on ${pct(rows)}% (avg MAPE model ${avg(rows, 'model')} vs naive ${avg(rows, 'naive')}).`);
console.log(`Seasonal products (24+ months): model beats or ties naive on ${pct(seasonal)}% (target >= 60%).`);
process.exit(pct(seasonal) >= 60 ? 0 : 1);


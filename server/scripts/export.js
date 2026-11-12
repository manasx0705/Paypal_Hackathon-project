/** npm run export -- [vendor-email]  → CSV per collection under ./export/<timestamp>/ (backup helper for Atlas M0, which has no automated backups). */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { connectDb, disconnectDb } from '../src/db.js';
import * as M from '../src/models/index.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI to export a persistent database.');
  process.exit(1);
}
await connectDb();
const email = process.argv[2];
const vendor = email ? await M.Vendor.findOne({ email }).lean() : null;
if (email && !vendor) throw new Error(`no vendor ${email}`);
const dir = path.join('export', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const scoped = ['Supplier', 'Product', 'Sale', 'Purchase', 'Forecast', 'PriceAlert', 'CartItem', 'Order', 'Notification', 'TrendOutcome'];
for (const name of scoped) {
  const rows = await M[name].find(vendor ? { vendorId: vendor._id } : {}).lean();
  const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v])));
  fs.writeFileSync(path.join(dir, `${name}.csv`), Papa.unparse(flat));
  console.log(`${name}: ${rows.length}`);
}
console.log(`written to ${dir}`);
await disconnectDb();

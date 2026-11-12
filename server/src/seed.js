/**
 * Deterministic demo data. Three vendors (grocery/Pune, sports/Mumbai, furniture/Nagpur), 40 products each,
 * 3 suppliers each, 24 months of daily sales with trend, yearly seasonality (Diwali Oct–Nov, summer Apr–Jun),
 * weekly pattern, noise and random stock-outs. Includes perishables, fast/slow movers, dead stock and new products.
 */
import bcrypt from 'bcryptjs';
import taxonomy from './config/taxonomy.json' with { type: 'json' };
import { CategoryTaxonomy, KeywordAlias, Product, Purchase, Sale, Supplier, TrendOutcome, Vendor } from './models/index.js';
import { monthKey } from './utils/errors.js';

export const DEMO_PASSWORD = 'demo-password-123';
const DAY = 86400000;

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function poisson(lambda, rnd) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rnd)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rnd();
  } while (p > L);
  return k - 1;
}
function gauss(rnd) {
  return Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
}

// [sku, name, category, unit, cost, sell, dailyDemand, opts]
// opts: s = seasonality (diwali|summer|monsoon|winter), g = yearly growth, p = perishable shelf days, m = months of history,
//       dead = months since last sale, sup = supplier index, pack, reg = isRegularStock(false), lead
export const CATALOG = {
  grocery: [
    ['ONI-1KG', 'Onion (Nashik) 1kg', 'Vegetables', 'kg', 28, 40, 18, { p: 20, sup: 2 }],
    ['POT-1KG', 'Potato 1kg', 'Vegetables', 'kg', 22, 32, 15, { p: 25, sup: 2 }],
    ['TOM-1KG', 'Tomato 1kg', 'Vegetables', 'kg', 26, 40, 12, { p: 6, sup: 2, s: 'monsoon' }],
    ['RICE-BAS-5', 'Basmati Rice 5kg', 'Grains & Flour', 'bag', 420, 499, 2.2, { s: 'diwali', g: 0.08 }],
    ['RICE-KOL-5', 'Kolam Rice 5kg', 'Grains & Flour', 'bag', 260, 310, 3, {}],
    ['ATTA-10', 'Wheat Atta 10kg', 'Grains & Flour', 'bag', 380, 445, 3.5, { g: 0.05 }],
    ['TOOR-1', 'Toor Dal 1kg', 'Pulses', 'kg', 140, 165, 4, {}],
    ['MOONG-1', 'Moong Dal 1kg', 'Pulses', 'kg', 115, 138, 2.5, {}],
    ['CHANA-1', 'Chana Dal 1kg', 'Pulses', 'kg', 82, 98, 2.5, { s: 'diwali' }],
    ['OIL-SUN-1', 'Sunflower Oil 1L', 'Edible Oils', 'bottle', 128, 152, 6, { pack: 12, s: 'diwali' }],
    ['OIL-MUS-1', 'Mustard Oil 1L', 'Edible Oils', 'bottle', 150, 178, 2, { pack: 12, s: 'winter' }],
    ['OIL-OLV-500', 'Imported Olive Oil 500ml', 'Edible Oils', 'bottle', 520, 649, 0.4, { dead: 5 }],
    ['GHEE-500', 'Cow Ghee 500ml', 'Edible Oils', 'jar', 290, 335, 1.5, { s: 'diwali', g: 0.1 }],
    ['SUG-1', 'Sugar 1kg', 'Sweets & Dry Fruits', 'kg', 42, 48, 9, { s: 'diwali' }],
    ['JAG-1', 'Jaggery 1kg', 'Sweets & Dry Fruits', 'kg', 60, 75, 1.5, { s: 'winter' }],
    ['KAJU-250', 'Kaju (Cashew) 250g', 'Sweets & Dry Fruits', 'pack', 230, 285, 1.2, { s: 'diwali', g: 0.12 }],
    ['BADAM-250', 'Badam (Almond) 250g', 'Sweets & Dry Fruits', 'pack', 210, 260, 1.1, { s: 'diwali' }],
    ['KATLI-500', 'Kaju Katli 500g', 'Sweets & Dry Fruits', 'box', 380, 460, 0.8, { s: 'diwali', p: 10, sup: 1 }],
    ['SALT-1', 'Iodised Salt 1kg', 'Spices', 'kg', 20, 28, 4, {}],
    ['HALDI-200', 'Turmeric Powder 200g', 'Spices', 'pack', 42, 55, 2, {}],
    ['MIRCH-200', 'Chilli Powder 200g', 'Spices', 'pack', 55, 70, 2, {}],
    ['TEA-500', 'Assam Tea 500g', 'Beverages', 'pack', 210, 250, 3, { s: 'winter' }],
    ['COF-200', 'Filter Coffee 200g', 'Beverages', 'pack', 150, 185, 0.8, {}],
    ['COLD-750', 'Cold Drink 750ml', 'Beverages', 'bottle', 34, 45, 7, { s: 'summer', pack: 24 }],
    ['MILK-500', 'Toned Milk 500ml', 'Dairy', 'packet', 26, 30, 30, { p: 2, sup: 1 }],
    ['CURD-400', 'Curd 400g', 'Dairy', 'cup', 32, 40, 8, { p: 5, sup: 1, s: 'summer' }],
    ['PANEER-200', 'Paneer 200g', 'Dairy', 'pack', 72, 90, 4, { p: 5, sup: 1 }],
    ['BREAD-400', 'Bread 400g', 'Bakery', 'loaf', 32, 40, 10, { p: 4, sup: 1 }],
    ['BISC-200', 'Glucose Biscuits 200g', 'Bakery', 'pack', 18, 25, 12, { pack: 24 }],
    ['NAMK-400', 'Namkeen Mixture 400g', 'Snacks', 'pack', 70, 90, 4, { s: 'diwali' }],
    ['CHIPS-90', 'Potato Chips 90g', 'Snacks', 'pack', 16, 20, 9, { pack: 24, s: 'summer' }],
    ['MAKH-100', 'Roasted Makhana 100g', 'Snacks', 'pack', 85, 120, 1.5, { m: 4, g: 1.2 }],
    ['SOAP-100', 'Bath Soap 100g', 'Personal Care', 'bar', 28, 38, 6, { pack: 12 }],
    ['SHAMP-180', 'Shampoo 180ml', 'Personal Care', 'bottle', 120, 150, 1.5, {}],
    ['PASTE-150', 'Toothpaste 150g', 'Personal Care', 'tube', 78, 98, 3, {}],
    ['DET-1', 'Detergent Powder 1kg', 'Household Cleaning', 'pack', 95, 120, 3, {}],
    ['DISH-BAR', 'Dishwash Bar', 'Household Cleaning', 'bar', 18, 25, 5, { pack: 12 }],
    ['NOOD-70', 'Instant Noodles 70g', 'Instant Foods', 'pack', 12, 15, 14, { pack: 48, g: 0.1, s: 'monsoon' }],
    ['OATS-1', 'Rolled Oats 1kg', 'Health Foods', 'pack', 160, 199, 1, { g: 0.2 }],
    ['RAGI-1', 'Ragi Flour 1kg', 'Health Foods', 'pack', 70, 95, 1.2, { m: 2 }],
  ],
  sports: [
    ['BAT-KW', 'Cricket Bat (Kashmir Willow)', 'Cricket', 'pcs', 1100, 1599, 0.6, { s: 'summer', reg: true }],
    ['BALL-TEN6', 'Tennis Ball Pack of 6', 'Cricket', 'pack', 180, 260, 2.5, { s: 'summer' }],
    ['BALL-LEA', 'Leather Cricket Ball', 'Cricket', 'pcs', 320, 450, 1, { s: 'summer' }],
    ['GLOV-BAT', 'Batting Gloves', 'Cricket', 'pair', 650, 899, 0.5, {}],
    ['STUMP-SET', 'Stumps Set', 'Cricket', 'set', 550, 799, 0.3, { s: 'summer' }],
    ['FB-5', 'Football Size 5', 'Football', 'pcs', 480, 699, 1.2, { s: 'monsoon' }],
    ['FB-BOOT', 'Football Boots', 'Football', 'pair', 1400, 1999, 0.5, { s: 'monsoon' }],
    ['SHIN-G', 'Shin Guards', 'Football', 'pair', 220, 349, 0.6, {}],
    ['CONE-20', 'Training Cones (20)', 'Football', 'set', 260, 399, 0.3, {}],
    ['BAD-RKT', 'Badminton Racket', 'Racket Sports', 'pcs', 750, 1099, 1, { s: 'winter' }],
    ['SHUT-10', 'Shuttlecock Tube (10)', 'Racket Sports', 'tube', 380, 520, 2.5, { s: 'winter' }],
    ['TEN-RKT', 'Tennis Racket', 'Racket Sports', 'pcs', 2200, 3199, 0.2, {}],
    ['PB-PAD', 'Pickleball Paddle', 'Racket Sports', 'pcs', 1300, 1899, 0.7, { m: 3, g: 2 }],
    ['PB-BALL', 'Pickleball Balls (3)', 'Racket Sports', 'pack', 260, 399, 0.8, { m: 3, g: 2 }],
    ['TT-BAT', 'Table Tennis Bat', 'Racket Sports', 'pcs', 420, 599, 0.4, {}],
    ['YOGA-MAT', 'Yoga Mat 6mm', 'Yoga', 'pcs', 450, 699, 1.5, { s: 'winter', g: 0.05 }],
    ['DB-5', 'Dumbbells 5kg (pair)', 'Fitness Equipment', 'pair', 900, 1299, 0.6, { s: 'winter' }],
    ['KB-8', 'Kettlebell 8kg', 'Fitness Equipment', 'pcs', 1100, 1599, 0.3, {}],
    ['RB-SET', 'Resistance Band Set', 'Fitness Equipment', 'set', 380, 599, 1, { g: 0.15 }],
    ['ROPE', 'Skipping Rope', 'Fitness Equipment', 'pcs', 120, 199, 1.5, {}],
    ['GYM-GLV', 'Gym Gloves', 'Fitness Equipment', 'pair', 260, 399, 0.6, {}],
    ['WHEY-1', 'Whey Protein 1kg', 'Sports Nutrition', 'jar', 1800, 2399, 0.9, { g: 0.25, s: 'winter' }],
    ['ELEC-10', 'Electrolyte Sachets (10)', 'Sports Nutrition', 'box', 140, 220, 2, { s: 'summer' }],
    ['CREA-250', 'Creatine 250g', 'Sports Nutrition', 'jar', 700, 999, 0.5, { g: 0.4 }],
    ['SHAKER', 'Shaker Bottle', 'Drinkware', 'pcs', 120, 249, 1, {}],
    ['BOTTLE-1L', 'Insulated Bottle 1L', 'Drinkware', 'pcs', 420, 699, 1.2, { s: 'summer' }],
    ['TEE-DRY', 'Dri-fit T-shirt', 'Sportswear', 'pcs', 260, 449, 2, { s: 'summer' }],
    ['TRACK', 'Track Pants', 'Sportswear', 'pcs', 420, 699, 1.2, { s: 'winter' }],
    ['SHORTS', 'Running Shorts', 'Sportswear', 'pcs', 220, 399, 1.2, { s: 'summer' }],
    ['SHOE-RUN', 'Running Shoes', 'Footwear', 'pair', 1600, 2499, 0.8, {}],
    ['SOCKS-3', 'Sports Socks (3 pairs)', 'Footwear', 'pack', 150, 249, 2, {}],
    ['HELMET-C', 'Cycling Helmet', 'Cycling', 'pcs', 800, 1199, 0.3, {}],
    ['GOGG', 'Swimming Goggles', 'Swimming', 'pcs', 220, 349, 1, { s: 'summer' }],
    ['SWIMCAP', 'Swim Cap', 'Swimming', 'pcs', 110, 199, 0.8, { s: 'summer' }],
    ['BACKPACK', 'Trekking Backpack 40L', 'Outdoor & Camping', 'pcs', 1300, 1899, 0.25, { s: 'monsoon' }],
    ['TENT-2', 'Camping Tent (2 person)', 'Outdoor & Camping', 'pcs', 2600, 3499, 0.1, { dead: 6 }],
    ['CHESS', 'Chess Set', 'Toys', 'set', 250, 399, 0.4, {}],
    ['KNEE-SUP', 'Knee Support', 'Fitness Equipment', 'pcs', 180, 299, 0.7, {}],
    ['SWEATB', 'Sweatband (pair)', 'Sportswear', 'pair', 60, 120, 1, { s: 'summer' }],
    ['PADEL-R', 'Padel Racket', 'Racket Sports', 'pcs', 3200, 4499, 0.05, { m: 2, reg: false }],
  ],
  furniture: [
    ['TBL-DIN6', 'Teak Dining Table 6-seater', 'Tables', 'pcs', 26000, 34999, 0.05, { s: 'diwali', lead: 10 }],
    ['TBL-COF', 'Sheesham Coffee Table', 'Tables', 'pcs', 5200, 7499, 0.15, { s: 'diwali', lead: 7 }],
    ['DESK-STD', 'Study Desk', 'Tables', 'pcs', 3800, 5499, 0.2, { s: 'monsoon', lead: 7 }],
    ['TBL-SIDE', 'Side Table', 'Tables', 'pcs', 1500, 2299, 0.2, {}],
    ['CHR-OFF', 'Ergonomic Office Chair', 'Office Furniture', 'pcs', 5200, 7499, 0.25, { g: 0.2, lead: 7 }],
    ['CHR-PLS', 'Plastic Chair', 'Seating', 'pcs', 420, 650, 2, { pack: 4 }],
    ['CHR-DIN', 'Dining Chair', 'Seating', 'pcs', 2200, 3299, 0.3, { s: 'diwali' }],
    ['CHR-BOU', 'Boucle Accent Chair', 'Seating', 'pcs', 6500, 9499, 0.08, { m: 2, g: 1, lead: 10 }],
    ['SOFA-3', 'Sofa 3-seater', 'Seating', 'pcs', 21000, 28999, 0.06, { s: 'diwali', lead: 14 }],
    ['RECL-1', 'Recliner', 'Seating', 'pcs', 15000, 21999, 0.03, { lead: 14 }],
    ['BEANBAG', 'Bean Bag XL', 'Seating', 'pcs', 1300, 1999, 0.2, {}],
    ['WARD-2', 'Wardrobe 2-door', 'Storage', 'pcs', 11000, 15999, 0.08, { s: 'diwali', lead: 10 }],
    ['SHELF-5', 'Bookshelf 5-tier', 'Storage', 'pcs', 2600, 3799, 0.15, {}],
    ['RACK-SHOE', 'Shoe Rack', 'Storage', 'pcs', 1100, 1699, 0.3, {}],
    ['TV-CAB', 'TV Cabinet', 'Storage', 'pcs', 6200, 8999, 0.08, { s: 'diwali' }],
    ['BED-Q', 'Queen Bed', 'Beds & Mattresses', 'pcs', 17000, 23999, 0.06, { s: 'diwali', lead: 14 }],
    ['BED-S', 'Single Bed', 'Beds & Mattresses', 'pcs', 8000, 11499, 0.05, {}],
    ['MAT-Q', 'Foam Mattress Queen', 'Beds & Mattresses', 'pcs', 9000, 12999, 0.12, { s: 'diwali' }],
    ['PILLOW-2', 'Pillow Pair', 'Beds & Mattresses', 'pair', 420, 699, 0.8, {}],
    ['MAT-PROT', 'Mattress Protector', 'Beds & Mattresses', 'pcs', 520, 799, 0.4, {}],
    ['SHEET-SET', 'Bedsheet Set', 'Furnishings', 'set', 650, 999, 1.2, { s: 'diwali' }],
    ['CURT-2', 'Curtains (pair)', 'Furnishings', 'pair', 900, 1399, 0.6, { s: 'diwali' }],
    ['CUSH-5', 'Cushion Covers (5)', 'Furnishings', 'set', 380, 599, 0.8, { s: 'diwali' }],
    ['LAMP-FLR', 'Floor Lamp', 'Lighting', 'pcs', 1800, 2799, 0.15, { s: 'diwali' }],
    ['LED-CEIL', 'LED Ceiling Light', 'Lighting', 'pcs', 650, 999, 0.6, { s: 'diwali' }],
    ['MIRROR-W', 'Wall Mirror', 'Home Decor', 'pcs', 1500, 2299, 0.2, {}],
    ['ART-CAN', 'Wall Art Canvas', 'Home Decor', 'pcs', 900, 1499, 0.25, { s: 'diwali' }],
    ['VASE-CER', 'Ceramic Vase', 'Home Decor', 'pcs', 450, 749, 0.4, { s: 'diwali' }],
    ['RUG-AREA', 'Area Rug 5x7', 'Home Decor', 'pcs', 2400, 3699, 0.12, {}],
    ['TRAY-WOOD', 'Wooden Serving Tray', 'Home Decor', 'pcs', 520, 849, 0.3, { m: 5 }],
    ['PLY-18', 'Plywood Sheet 18mm', 'Hardware & Plywood', 'sheet', 2100, 2650, 0.9, { lead: 5 }],
    ['LAM-1MM', 'Laminate Sheet 1mm', 'Hardware & Plywood', 'sheet', 900, 1199, 0.8, {}],
    ['HINGE-10', 'Cabinet Hinges (10)', 'Hardware & Plywood', 'pack', 250, 380, 1.5, {}],
    ['CHANNEL', 'Drawer Channels (pair)', 'Hardware & Plywood', 'pair', 180, 280, 1.2, {}],
    ['TEAK-PLK', 'Teak Wood Plank 6ft', 'Hardware & Plywood', 'pcs', 3100, 3899, 0.2, { lead: 7 }],
    ['KRACK', 'Kitchen Rack', 'Kitchenware', 'pcs', 1300, 1999, 0.2, {}],
    ['KADAI', 'Non-stick Kadai', 'Kitchenware', 'pcs', 650, 999, 0.6, { s: 'diwali' }],
    ['TUMB-SET', 'Steel Tumbler Set (6)', 'Kitchenware', 'set', 320, 499, 0.5, { s: 'diwali' }],
    ['CONT-SET', 'Storage Containers (set)', 'Kitchenware', 'set', 450, 699, 0.7, {}],
    ['DIVAN-OLD', 'Antique Divan', 'Seating', 'pcs', 18000, 26999, 0.02, { dead: 8 }],
  ],
};

const VENDORS = [
  { shop: 'grocery', name: 'Sunita Patil', shopName: 'Patil Kirana Stores', location: { state: 'Maharashtra', district: 'Pune', city: 'Pune', pincode: '411038' }, suppliers: ['Shree Traders (wholesale)', 'Gokul Dairy & Bakery', 'Market Yard Veg Supply'], cap: 25000 },
  { shop: 'sports', name: 'Rahul Mehta', shopName: 'Mehta Sports Hub', location: { state: 'Maharashtra', district: 'Mumbai', city: 'Mumbai', pincode: '400050' }, suppliers: ['Western Sports Distributors', 'FitGear India', 'Coastal Nutrition Supplies'], cap: 60000 },
  { shop: 'furniture', name: 'Ayesha Khan', shopName: 'Khan Home & Furniture', location: { state: 'Maharashtra', district: 'Nagpur', city: 'Nagpur', pincode: '440010' }, suppliers: ['Orange City Timber', 'Vidarbha Furnishings', 'Central India Hardware'], cap: 150000 },
];

/** Seasonal multiplier for a date (IST month). */
function seasonal(kind, d) {
  const m = Number(monthKey(d).slice(5));
  if (kind === 'diwali') return { 10: 1.9, 11: 1.6, 9: 1.15 }[m] || 1;
  if (kind === 'summer') return { 4: 1.6, 5: 1.8, 6: 1.4, 3: 1.2 }[m] || 0.85;
  if (kind === 'monsoon') return { 7: 1.4, 8: 1.35, 6: 1.15 }[m] || 0.95;
  if (kind === 'winter') return { 12: 1.4, 1: 1.45, 11: 1.15, 2: 1.15 }[m] || 0.9;
  return 1;
}

export async function seedAll({ seed = 2026, now = new Date(), log = () => {} } = {}) {
  await CategoryTaxonomy.bulkWrite(taxonomy.map((t) => ({ updateOne: { filter: { name: t.name }, update: { $set: t }, upsert: true } })));
  const aliases = { 'fox nuts': 'makhana', 'roasted fox nuts': 'makhana', 'matcha powder': 'matcha', 'stanley cup': 'insulated tumbler', 'stanley tumbler': 'insulated tumbler' };
  await KeywordAlias.bulkWrite(Object.entries(aliases).map(([alias, canonical]) => ({ updateOne: { filter: { alias }, update: { $set: { canonical } }, upsert: true } })));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const created = [];
  for (const [vi, cfg] of VENDORS.entries()) {
    const email = `${cfg.shop}@demo.palprocure.dev`;
    if (await Vendor.exists({ email })) {
      log(`vendor ${email} exists, skipping`);
      continue;
    }
    const rnd = prng(seed + vi * 7919);
    const vendor = await Vendor.create({ name: cfg.name, email, passwordHash, shopName: cfg.shopName, shopType: cfg.shop, location: cfg.location, isDemo: true, settings: { weeklySpendCapINR: cfg.cap, autoOrderEnabled: false } });
    const suppliers = await Supplier.insertMany(cfg.suppliers.map((name, i) => ({ vendorId: vendor._id, name, phone: `+91 98${vi}${i}0 0000${i}`, email: `orders+${cfg.shop}${i}@supplier.example`, channel: 'log', defaultLeadTimeDays: 2 + i })));
    const sales = [];
    const purchases = [];
    const products = [];
    for (const [sku, name, category, unit, cost, sell, base, o] of CATALOG[cfg.shop]) {
      const months = o.m || 24;
      // History starts on the 1st of a month so the first month is complete.
      const start = new Date(today.getFullYear(), today.getMonth() - months, 1);
      const lastSaleCut = o.dead ? new Date(today.getTime() - o.dead * 30.4 * DAY) : null;
      const growth = o.g || 0;
      let stockoutLeft = 0;
      const monthTotals = new Map();
      for (let t = start.getTime(); t < today.getTime(); t += DAY) {
        const d = new Date(t);
        if (lastSaleCut && d > lastSaleCut) break;
        if (stockoutLeft > 0) {
          stockoutLeft -= 1;
          continue;
        }
        if (rnd() < 0.004) stockoutLeft = 2 + Math.floor(rnd() * 4); // random stock-outs
        const yearsIn = (t - start.getTime()) / (365 * DAY);
        const dow = d.getDay();
        const weekly = dow === 0 ? 1.25 : dow === 6 ? 1.15 : dow === 2 ? 0.9 : 1;
        const lambda = base * (1 + growth * yearsIn) * seasonal(o.s, d) * weekly * (0.9 + 0.2 * rnd());
        const q = poisson(lambda, rnd);
        if (!q) continue;
        const price = Math.round(sell * (o.s === 'diwali' && seasonal('diwali', d) > 1.5 && rnd() < 0.3 ? 0.95 : 1) * 100) / 100;
        sales.push({ vendorId: vendor._id, sku, qty: q, unitPrice: price, unitCostAtSale: cost, date: new Date(t + 11 * 3600000) });
        const mk = monthKey(d);
        monthTotals.set(mk, (monthTotals.get(mk) || 0) + q);
      }
      for (const [mk, q] of monthTotals) purchases.push({ vendorId: vendor._id, sku, qty: q, unitCost: cost, date: new Date(`${mk}-03T10:00:00+05:30`) });
      // Current stock scenario: ~35% low, ~8% out, rest healthy (dead stock keeps old stock).
      const r = rnd();
      const daysCover = o.dead ? 60 : r < 0.08 ? 0 : r < 0.43 ? 1 + rnd() * 3 : 12 + rnd() * 30;
      const stock = o.dead ? Math.max(3, Math.round(base * 120)) : Math.round(base * daysCover);
      products.push({ vendorId: vendor._id, sku, name, category, unit, perishable: !!o.p, shelfLifeDays: o.p || null, costPrice: cost, sellPrice: sell, currentStock: stock, leadTimeDays: o.lead || (o.p ? 1 : 3), packSize: o.pack || 1, supplierId: suppliers[o.sup ?? (category.length % 3)]._id, isRegularStock: o.reg === false ? false : !(o.m && o.m <= 3), isActive: true, lastStockUpdate: new Date(today.getTime() - Math.floor(rnd() * 20) * DAY) });
    }
    const inserted = await Product.insertMany(products);
    const bySku = new Map(inserted.map((p) => [p.sku, p._id]));
    const withIds = (rows) => rows.map(({ sku, ...x }) => ({ ...x, productId: bySku.get(sku) }));
    for (let i = 0; i < sales.length; i += 5000) await Sale.insertMany(withIds(sales.slice(i, i + 5000)), { ordered: false });
    for (let i = 0; i < purchases.length; i += 5000) await Purchase.insertMany(withIds(purchases.slice(i, i + 5000)), { ordered: false });
    if (cfg.shop === 'grocery') {
      // Two historical trend outcomes so the crossover panel has real numbers to show.
      const at = new Date(today.getTime() - 45 * DAY);
      await TrendOutcome.insertMany([
        { vendorId: vendor._id, keyword: 'millet snacks', trialQty: 6, action: 'approved', actionAt: at, soldQty30d: 9, crossedOver: true, evaluatedAt: new Date(at.getTime() + 30 * DAY) },
        { vendorId: vendor._id, keyword: 'protein chips', trialQty: 5, action: 'approved', actionAt: at, soldQty30d: 2, crossedOver: false, evaluatedAt: new Date(at.getTime() + 30 * DAY) },
      ]);
    }
    log(`${cfg.shopName}: ${inserted.length} products, ${sales.length} sale rows, ${purchases.length} purchase rows`);
    created.push(vendor);
  }
  return created;
}

export const DEMO_CREDENTIALS = VENDORS.map((v) => ({ shop: v.shop, email: `${v.shop}@demo.palprocure.dev`, password: DEMO_PASSWORD }));

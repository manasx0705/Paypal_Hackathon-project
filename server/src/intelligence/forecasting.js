/**
 * Forecasting and inventory maths. Pure functions, no I/O.
 * Methods: Holt-Winters (damped additive trend + additive seasonality, m=12) for n>=24,
 * Holt damped trend for 6..23, mean of last 3 for 3..5, insufficient_data below 3.
 * Smoothing parameters are chosen by a small grid search minimising in-sample one-step SSE.
 */
export const Z = 1.65; // ~95% service level
export const PHI = 0.98; // damping
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** Clip values outside median ± 3·MAD. Returns { values, clipped: indices }. */
export function clipOutliers(values) {
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  if (mad === 0) return { values: [...values], clipped: [] };
  const lo = med - 3 * mad;
  const hi = med + 3 * mad;
  const clipped = [];
  const out = values.map((v, i) => {
    if (v > hi || v < lo) clipped.push(i);
    return Math.min(hi, Math.max(lo, v));
  });
  return { values: out, clipped };
}

/** MAPE in percent, ignoring months with zero actual. Returns null if nothing comparable. */
export function mape(actual, predicted) {
  const pairs = actual.map((a, i) => [a, predicted[i]]).filter(([a]) => a > 0);
  if (!pairs.length) return null;
  return (100 * pairs.reduce((s, [a, p]) => s + Math.abs(a - p) / a, 0)) / pairs.length;
}

function holtFit(y, alpha, beta, phi = PHI) {
  let l = y[0];
  let b = y.length > 1 ? y[1] - y[0] : 0;
  const fitted = [y[0]];
  for (let t = 1; t < y.length; t += 1) {
    const f = l + phi * b;
    fitted.push(f);
    const lPrev = l;
    l = alpha * y[t] + (1 - alpha) * (lPrev + phi * b);
    b = beta * (l - lPrev) + (1 - beta) * phi * b;
  }
  const forecast = (h) => {
    let damp = 0;
    for (let i = 1; i <= h; i += 1) damp += phi ** i;
    return l + damp * b;
  };
  return { fitted, forecast, level: l, trend: b };
}

function holtWintersFit(y, alpha, beta, gamma, m = 12, phi = PHI) {
  const first = y.slice(0, m);
  // Trend from same-calendar-month pairs (works with a partial second season, e.g. 21 months in a backtest).
  const pairs = Math.min(m, y.length - m);
  let l = mean(first);
  let b = pairs > 0 ? (mean(y.slice(m, m + pairs)) - mean(y.slice(0, pairs))) / m : 0;
  const s = first.map((v) => v - l);
  const fitted = [];
  for (let t = 0; t < y.length; t += 1) {
    const season = s[t];
    fitted.push(l + phi * b + season);
    const lPrev = l;
    l = alpha * (y[t] - season) + (1 - alpha) * (lPrev + phi * b);
    b = beta * (l - lPrev) + (1 - beta) * phi * b;
    s[t + m] = gamma * (y[t] - l) + (1 - gamma) * season;
  }
  const n = y.length;
  const forecast = (h) => {
    let damp = 0;
    for (let i = 1; i <= h; i += 1) damp += phi ** i;
    return l + damp * b + s[n + ((h - 1) % m)];
  };
  if (![l, b].every(Number.isFinite)) throw new Error('holt-winters did not converge');
  return { fitted, forecast, level: l, trend: b };
}

const sse = (y, f, skip = 0) => y.reduce((acc, v, i) => (i < skip ? acc : acc + (v - f[i]) ** 2), 0);

function bestHolt(y) {
  let best = null;
  for (const a of [0.1, 0.2, 0.3, 0.5, 0.8]) {
    for (const b of [0.01, 0.05, 0.1, 0.2]) {
      const fit = holtFit(y, a, b);
      const e = sse(y, fit.fitted, 1);
      if (!best || e < best.e) best = { e, fit, params: { alpha: a, beta: b, phi: PHI } };
    }
  }
  return best;
}

function bestHoltWinters(y) {
  let best = null;
  for (const a of [0.1, 0.2, 0.3, 0.5]) {
    for (const b of [0.01, 0.05, 0.1]) {
      for (const g of [0.05, 0.1, 0.3]) {
        const fit = holtWintersFit(y, a, b, g);
        const e = sse(y, fit.fitted, 12);
        if (!Number.isFinite(e)) continue;
        if (!best || e < best.e) best = { e, fit, params: { alpha: a, beta: b, gamma: g, phi: PHI } };
      }
    }
  }
  return best;
}

/** Fit the method appropriate for the history length. Returns predict(h) and residual sd. */
export function fitModel(y, { seasonal = y.length >= 24 } = {}) {
  const n = y.length;
  if (seasonal && n >= 15) {
    try {
      const { fit, params } = bestHoltWinters(y);
      const resid = y.slice(12).map((v, i) => v - fit.fitted[i + 12]);
      return { method: 'holt_winters', predict: fit.forecast, residSd: sd(resid), level: fit.level, trend: fit.trend, params };
    } catch {
      /* fall back to Holt below */
    }
  }
  if (n >= 6) {
    const { fit, params } = bestHolt(y);
    const resid = y.slice(1).map((v, i) => v - fit.fitted[i + 1]);
    return { method: n >= 24 ? 'holt_damped_fallback' : 'holt_damped', predict: fit.forecast, residSd: sd(resid), level: fit.level, trend: fit.trend, params };
  }
  const last3 = y.slice(-3);
  const m = mean(last3);
  return { method: 'mean_last_3', predict: () => m, residSd: sd(y), level: m, trend: 0, params: {} };
}

/**
 * Full forecast for one product.
 * @param {{month:string, qty:number, gap?:boolean}[]} history monthly series, oldest first
 */
export function forecastProduct(history, { leadTimeDays = 3, perishable = false, shelfLifeDays = null, currentStock = 0, packSize = 1 } = {}) {
  const n = history.length;
  if (n < 3) return { method: 'insufficient_data', confidence: 'low', months: [], orderQty: 0, reorderPoint: 0, safetyStock: 0, history };
  const { values: y, clipped } = clipOutliers(history.map((h) => h.qty));

  let model = fitModel(y);
  let modelMape = null;
  let naiveMape = null;
  if (n >= 6) {
    const train = y.slice(0, -3);
    const test = y.slice(-3);
    // Backtest the SAME method family the full history selects (n ≥ 24 → Holt-Winters on the 21-month train).
    const m = fitModel(train, { seasonal: n >= 24 });
    modelMape = mape(test, [1, 2, 3].map((h) => Math.max(0, m.predict(h))));
    naiveMape = mape(test, test.map(() => train[train.length - 1]));
    if (naiveMape !== null && (modelMape === null || naiveMape < modelMape)) {
      const last = y[y.length - 1];
      const diffs = y.slice(1).map((v, i) => v - y[i]);
      model = { method: 'naive', predict: () => last, residSd: sd(diffs), level: last, trend: 0, params: {} };
    }
  }
  const err = model.method === 'naive' ? naiveMape : modelMape;
  let confidence = 'low';
  if (n >= 24 && err !== null && err <= 20) confidence = 'high';
  else if (n >= 6 && err !== null && err <= 35) confidence = 'medium';

  const lastMonth = history[n - 1].month;
  const months = [1, 2, 3].map((h) => {
    const p = Math.max(0, model.predict(h));
    return { month: addMonths(lastMonth, h), predictedQty: round(p), lower: round(Math.max(0, p - 1.28 * model.residSd)), upper: round(p + 1.28 * model.residSd) };
  });

  const stock = inventoryQuantities({ nextMonthQty: months[0].predictedQty, monthlySd: model.residSd, leadTimeDays, perishable, shelfLifeDays, currentStock, packSize });
  return {
    method: model.method,
    confidence,
    months,
    growthRate: model.level ? round(model.trend / model.level, 4) : 0,
    mape: modelMape === null ? null : round(modelMape),
    naiveMape: naiveMape === null ? null : round(naiveMape),
    history: history.map((h, i) => ({ ...h, clipped: clipped.includes(i) })),
    ...stock,
  };
}

/**
 * Safety stock / reorder point / order quantity.
 * sigma_d = monthlySd / sqrt(30) is an approximation assuming independent days (documented in DECISIONS.md).
 */
export function inventoryQuantities({ nextMonthQty, monthlySd, leadTimeDays, perishable, shelfLifeDays, currentStock, packSize }) {
  const d = nextMonthQty / 30;
  const L = leadTimeDays;
  const sigmaD = monthlySd / Math.sqrt(30);
  const safetyStock = Z * sigmaD * Math.sqrt(L);
  const reorderPoint = d * L + safetyStock;
  const coverDays = perishable && shelfLifeDays ? Math.min(30, 0.8 * shelfLifeDays) : 30;
  const raw = Math.max(0, d * coverDays + safetyStock - currentStock);
  const pack = packSize > 0 ? packSize : 1;
  const orderQty = Math.ceil(raw / pack - 1e-9) * pack;
  return {
    safetyStock: round(safetyStock),
    reorderPoint: round(reorderPoint),
    orderQty,
    explain: {
      dailyDemand: round(d, 3),
      leadTimeDays: L,
      sigmaDaily: round(sigmaD, 3),
      z: Z,
      coverDays: round(coverDays),
      currentStock,
      packSize: pack,
      steps: [
        `Daily demand d = next month ${round(nextMonthQty)} ÷ 30 = ${round(d, 3)}`,
        `Daily variability σd = monthly σ ${round(monthlySd)} ÷ √30 = ${round(sigmaD, 3)}`,
        `Safety stock = z ${Z} × σd × √L(${L}) = ${round(safetyStock)}`,
        `Reorder point = d × L + safety = ${round(reorderPoint)}`,
        `Cover days = ${perishable ? `min(30, 0.8 × shelf life ${shelfLifeDays})` : '30'} = ${round(coverDays)}`,
        `Order qty = max(0, d × cover + safety − stock ${currentStock}) = ${round(raw)} → rounded up to pack of ${pack} = ${orderQty}`,
      ],
    },
  };
}

export function addMonths(key, h) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + h;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
export function monthRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}
function round(v, p = 2) {
  const f = 10 ** p;
  return Math.round(v * f) / f;
}

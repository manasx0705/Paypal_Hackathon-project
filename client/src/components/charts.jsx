import { Area, AreaChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthLabel, money0, num, todayIST } from '../lib/format';

export const PALETTE = ['#ff9f1c', '#2ee6d6', '#a78bfa', '#f472b6', '#84cc16', '#38bdf8', '#facc15', '#fb7185', '#94a3b8'];
const axis = { stroke: '#6b7590', fontSize: 11, tickLine: false, axisLine: false };
const tip = { contentStyle: { background: '#10131a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#b8c0d2' } };

/** rows: [{category,month,revenue}] → stacked area by category. */
export function CategorySalesChart({ rows, metric = 'revenue' }) {
  const all = [...new Set(rows.map((r) => r.month))].sort();
  // The current IST month is still in progress; plotting it shows a fake "cliff" at the end.
  const partial = all.length > 1 && all[all.length - 1] === todayIST().slice(0, 7);
  const months = partial ? all.slice(0, -1) : all;
  const cats = [...new Set(rows.map((r) => r.category))];
  const data = months.map((m) => {
    const o = { month: m };
    cats.forEach((c) => {
      o[c] = rows.filter((r) => r.month === m && r.category === c).reduce((a, r) => a + (Number(r[metric]) || 0), 0);
    });
    return o;
  });
  return (
    <div className="h-72" role="img" aria-label={`Monthly ${metric} by category, ${months.length} months, ${cats.length} categories`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            {cats.map((c, i) => (
              <linearGradient key={c} id={`cg-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.6} />
                <stop offset="1" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
          <YAxis tickFormatter={(v) => (metric === 'units' ? num(v) : money0(v))} width={80} {...axis} />
          <Tooltip {...tip} labelFormatter={monthLabel} formatter={(v) => (metric === 'units' ? num(v) : money0(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {cats.map((c, i) => (
            <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={`url(#cg-${i})`} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {partial && <p className="text-[11px] text-fog-500 text-right -mt-1">Current month is in progress and not shown.</p>}
    </div>
  );
}

/** Forecast: history (qty) + predicted with lower/upper band. */
export function ForecastChart({ forecast }) {
  const hist = (forecast.history || []).map((h) => ({ month: h.month, actual: h.qty }));
  const pred = (forecast.months || []).map((m) => ({ month: m.month, predicted: m.predictedQty, band: [m.lower, m.upper] }));
  if (hist.length && pred.length) pred.unshift({ month: hist[hist.length - 1].month, predicted: hist[hist.length - 1].actual, band: [hist[hist.length - 1].actual, hist[hist.length - 1].actual], bridge: true });
  const map = new Map();
  [...hist, ...pred].forEach((r) => map.set(r.month, { ...(map.get(r.month) || {}), ...r }));
  const data = [...map.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  return (
    <div className="h-64" role="img" aria-label="Demand history and forecast with confidence band">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
          <YAxis width={40} {...axis} />
          <Tooltip {...tip} labelFormatter={monthLabel} formatter={(v, n) => (Array.isArray(v) ? `${num(v[0], 1)} – ${num(v[1], 1)}` : num(v, 1))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="band" name="Confidence band" stroke="none" fill="#2ee6d6" fillOpacity={0.15} />
          <Line dataKey="actual" name="Actual units" stroke="#ff9f1c" strokeWidth={2} dot={{ r: 2 }} />
          <Line dataKey="predicted" name="Forecast" stroke="#2ee6d6" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SearchInterestChart({ series }) {
  return (
    <div className="h-56" role="img" aria-label="Search interest over time">
      <ResponsiveContainer>
        <LineChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })} {...axis} />
          <YAxis width={36} {...axis} />
          <Tooltip {...tip} labelFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} />
          <Line type="monotone" dataKey="value" name="Search interest" stroke="#2ee6d6" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

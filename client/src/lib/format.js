const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const bad = (n) => n == null || Number.isNaN(Number(n));
export const money = (n) => (bad(n) ? '—' : inr.format(Number(n)));
export const money0 = (n) => (bad(n) ? '—' : inr0.format(Number(n)));
export const num = (n, d = 0) => (bad(n) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const pct = (f, d = 1) => (bad(f) ? '—' : `${(Number(f) * 100).toFixed(d)}%`);
/** Value that is already a percent number (e.g. 15.56 means 15.56%). */
export const pctN = (v, d = 1) => (bad(v) ? '—' : `${Number(v).toFixed(d)}%`);
export const mapePct = (v) => pctN(v, 1);
export const fmtCurrency = (n, currency = 'USD') => {
  if (bad(n)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(n));
  } catch {
    return `${n} ${currency}`;
  }
};
const TZ = 'Asia/Kolkata';
export const date = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
export const monthLabel = (m) => {
  if (!m) return '';
  const s = String(m);
  const dt = new Date(s.length === 7 ? `${s}-01T00:00:00Z` : s);
  return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short', year: '2-digit' });
};
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const toISTDateInput = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }) : '');
export const timeAgo = (d) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const shortId = (id) => (id ? String(id).slice(-6).toUpperCase() : '');

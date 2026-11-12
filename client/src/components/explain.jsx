import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, ChevronDown, Users, Search, Newspaper, Megaphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { getForecast } from '../api/forecasts';
import { qk } from '../lib/queryKeys';
import { num } from '../lib/format';
import { Skeleton } from './ui';

const humanKey = (k) =>
  String(k)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b(inr)\b/i, 'INR')
    .replace(/^./, (c) => c.toUpperCase());

function fmtVal(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Renders the free-form `explain` object as a key/value grid. */
export function ExplainGrid({ explain }) {
  const entries = Object.entries(explain || {}).filter(([k]) => k !== 'steps');
  if (!entries.length) return <p className="text-xs text-fog-500">No numeric breakdown was recorded for this suggestion.</p>;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-ink-900/70 border border-white/5 px-2.5 py-1.5">
          <dt className="text-[10px] uppercase tracking-wider text-fog-500">{humanKey(k)}</dt>
          <dd className="font-mono text-sm text-fog-100 break-words">{fmtVal(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ForecastSteps({ productId }) {
  const q = useQuery({ queryKey: qk.forecast(productId), queryFn: () => getForecast(productId), enabled: !!productId });
  if (!productId) return null;
  if (q.isLoading) return <Skeleton className="h-20 w-full" />;
  if (q.isError) return <p className="text-xs text-rose-300">Forecast unavailable.</p>;
  const f = q.data;
  if (f?.method === 'insufficient_data') return <p className="text-xs text-fog-400">Not enough sales history yet for a statistical forecast — using simple rules.</p>;
  const steps = f?.explain?.steps || [];
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-fog-500 mb-1">
        How the forecast was computed · method <span className="font-mono text-fog-300">{f?.method}</span> · confidence{' '}
        <span className="font-mono text-fog-300">{f?.confidence}</span>
      </p>
      <ol className="space-y-1 list-decimal list-inside text-sm text-fog-200 font-mono">
        {steps.map((s, i) => (
          <li key={i} className="text-xs leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Expandable "Why?" — shows explain numbers, forecast steps and evidence. */
export function WhyPanel({ item, extra }) {
  const [open, setOpen] = useState(false);
  const id = `why-${item._id}`;
  return (
    <div>
      <button
        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden /> Why?
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 rounded-xl border border-teal-400/20 bg-teal-400/[0.04] p-3">
              {item.reason && <p className="text-sm text-fog-200">{item.reason}</p>}
              <ExplainGrid explain={item.explain} />
              {item.confidence != null && (
                <p className="text-xs text-fog-400">
                  Confidence: <span className="font-mono text-fog-200">{typeof item.confidence === 'number' ? num(item.confidence, 2) : item.confidence}</span>
                </p>
              )}
              {item.cartType === 'main' && item.productId && <ForecastSteps productId={item.productId} />}
              {extra}
              {item.evidenceIds?.length > 0 && <p className="text-xs text-fog-500">Backed by {item.evidenceIds.length} evidence record(s).</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ScoreRing({ score = 0, size = 56, label = 'Trend score' }) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = s >= 70 ? '#2ee6d6' : s >= 40 ? '#ffb84d' : '#8d97ad';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${Math.round(s)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="6" fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (s / 100) * c }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display font-bold text-sm">{Math.round(s)}</span>
    </div>
  );
}

const PARTS = [
  { key: 'people', label: 'People', icon: Users, cls: 'bg-saffron-400' },
  { key: 'search', label: 'Search', icon: Search, cls: 'bg-teal-400' },
  { key: 'sources', label: 'Sources', icon: Newspaper, cls: 'bg-violet-400' },
];

/** Stacked bar: people / search / sources points, minus sponsored penalty. */
export function BreakdownBar({ breakdown }) {
  if (!breakdown) return null;
  const parts = PARTS.map((p) => ({ ...p, points: Number(breakdown[p.key]?.points) || 0, d: breakdown[p.key] || {} }));
  const raw = parts.reduce((a, p) => a + p.points, 0);
  const mult = breakdown.sponsoredMultiplier ?? 1;
  const total = breakdown.total ?? raw * mult;
  const penalty = Math.max(0, raw - total);
  const scale = Math.max(100, raw);
  return (
    <div>
      <div className="flex h-5 w-full rounded-full overflow-hidden bg-white/5" role="img" aria-label={`Score breakdown: ${parts.map((p) => `${p.label} ${p.points.toFixed(1)}`).join(', ')}, sponsored penalty ${penalty.toFixed(1)}`}>
        {parts.map((p) => (
          <motion.div key={p.key} className={p.cls} initial={{ width: 0 }} animate={{ width: `${((p.points - (penalty * p.points) / (raw || 1)) / scale) * 100}%` }} transition={{ duration: 0.9 }} />
        ))}
        {penalty > 0 && (
          <motion.div
            className="bg-[repeating-linear-gradient(45deg,#f43f5e_0_4px,transparent_4px_8px)] opacity-80"
            initial={{ width: 0 }}
            animate={{ width: `${(penalty / scale) * 100}%` }}
            transition={{ duration: 0.9 }}
          />
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2">
            <span className={clsx('mt-0.5 h-3 w-3 rounded-sm shrink-0', p.cls)} aria-hidden />
            <p.icon className="h-3.5 w-3.5 text-fog-400 shrink-0 mt-0.5" aria-hidden />
            <span>
              <b className="text-fog-100">{p.label}</b>: {p.points.toFixed(1)} pts
              <span className="block text-fog-500 font-mono">
                value {fmtVal(p.d.value)} / cap {fmtVal(p.d.cap)} × weight {fmtVal(p.d.weight)}
              </span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2">
          <span className="mt-0.5 h-3 w-3 rounded-sm shrink-0 bg-[repeating-linear-gradient(45deg,#f43f5e_0_3px,transparent_3px_6px)]" aria-hidden />
          <Megaphone className="h-3.5 w-3.5 text-fog-400 shrink-0 mt-0.5" aria-hidden />
          <span>
            <b className="text-fog-100">Sponsored penalty</b>: ×{fmtVal(mult)} {penalty > 0 ? `(−${penalty.toFixed(1)} pts)` : '(none)'}
            <span className="block text-fog-500">Paid / promotional coverage reduces the score.</span>
          </span>
        </li>
      </ul>
      <p className="mt-2 text-sm">
        Total score: <b className="font-mono text-saffron-300">{Number(total).toFixed(1)}</b>
      </p>
    </div>
  );
}

export function Sparkline({ data = [], width = 96, height = 28, color = '#2ee6d6', label = 'Trend sparkline' }) {
  if (!data?.length) return <span className="text-xs text-fog-500">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: from ${data[0]} to ${data[data.length - 1]}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

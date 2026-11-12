import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, PiggyBank, AlertTriangle, Archive, ShoppingCart, ArrowUpRight, ArrowDownRight, Target, Flame, Siren, ShieldAlert, ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import { getOverview, getCategorySales, getGrowth, getTopProducts, getForecastAccuracy } from '../api/analytics';
import { listAlerts } from '../api/alerts';
import { listTrends } from '../api/trends';
import { getDataQuality } from '../api/imports';
import { qk } from '../lib/queryKeys';
import { money0, pct, pctN, mapePct, num, date } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AnimatedNumber, Chip, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, TiltCard, stagger } from '../components/ui';
import { CategorySalesChart } from '../components/charts';
import { ScoreRing } from '../components/explain';
import { LabelChip } from '../components/chips';

const MiniOrb = lazy(() => import('../three/MiniOrb'));

const KPIS = [
  { key: 'inventoryValue', label: 'Inventory value', icon: Wallet, money: true, tone: 'text-saffron-300' },
  { key: 'revenue30d', label: 'Revenue · 30 days', icon: TrendingUp, money: true, tone: 'text-teal-300' },
  { key: 'profit30d', label: 'Profit · 30 days', icon: PiggyBank, money: true, tone: 'text-lime-400' },
  { key: 'lowStockCount', label: 'Low stock', icon: AlertTriangle, tone: 'text-saffron-300', to: '/inventory?status=low' },
  { key: 'deadStockValue', label: 'Dead stock value', icon: Archive, money: true, tone: 'text-rose-300' },
  { key: 'openCartItems', label: 'Open cart items', icon: ShoppingCart, tone: 'text-teal-300', to: '/cart' },
];

function Kpis() {
  const q = useQuery({ queryKey: qk.overview, queryFn: getOverview });
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {KPIS.map((k) => (
        <motion.div key={k.key} variants={stagger.item}>
          <TiltCard className="h-full">
            <div className="flex items-center justify-between">
              <k.icon className={clsx('h-5 w-5', k.tone)} aria-hidden />
              {k.to && (
                <Link to={k.to} className="text-fog-500 hover:text-fog-100" aria-label={`Open ${k.label}`}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            <p className="text-xs text-fog-400 mt-3">{k.label}</p>
            {q.isLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className="font-display text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">
                <AnimatedNumber value={q.data?.[k.key]} format={k.money ? money0 : (v) => num(Math.round(v))} />
              </p>
            )}
            {k.key === 'lowStockCount' && q.data?.outOfStockCount > 0 && <p className="text-[11px] text-rose-300 mt-1">{q.data.outOfStockCount} out of stock</p>}
          </TiltCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

function DataQualityBanner() {
  const q = useQuery({ queryKey: qk.dataQuality, queryFn: getDataQuality });
  if (!q.data || q.data.score >= 90) return null;
  return (
    <div className="card border-saffron-400/40 bg-saffron-400/[0.06] flex flex-col sm:flex-row sm:items-center gap-3" role="status">
      <ShieldAlert className="h-6 w-6 text-saffron-300 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">Data quality score: {Math.round(q.data.score)}/100</p>
        <p className="text-sm text-fog-400">
          Forecasts get better with cleaner data.{' '}
          {(q.data.issues || [])
            .slice(0, 3)
            .map((i) => `${i.message}${i.count ? ` (${i.count})` : ''}`)
            .join(' · ')}
        </p>
      </div>
      <Link to="/import" className="btn-ghost btn-sm">
        Fix via import
      </Link>
    </div>
  );
}

function SalesChartCard() {
  const q = useQuery({ queryKey: qk.categorySales, queryFn: () => getCategorySales() });
  return (
    <section className="card lg:col-span-2" aria-labelledby="cs-h">
      <h2 id="cs-h" className="font-display font-semibold mb-3">
        Monthly sales by category
      </h2>
      {q.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <EmptyState title="No sales yet" body="Record or import sales to see category trends." action={<Link to="/import" className="btn-primary btn-sm">Import sales</Link>} />
      ) : (
        <CategorySalesChart rows={q.data} />
      )}
    </section>
  );
}

function AccuracyCard() {
  const reduced = useReducedMotion();
  const q = useQuery({ queryKey: qk.accuracy, queryFn: getForecastAccuracy });
  const d = q.data;
  return (
    <section className="card relative overflow-hidden" aria-labelledby="acc-h">
      {!reduced && (
        <div className="absolute -right-8 -top-10 h-28 w-28 opacity-70 pointer-events-none" aria-hidden>
          <Suspense fallback={null}>
            <MiniOrb />
          </Suspense>
        </div>
      )}
      <h2 id="acc-h" className="font-display font-semibold flex items-center gap-2">
        <Target className="h-4 w-4 text-teal-300" aria-hidden /> Forecast accuracy
      </h2>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !d?.count ? (
        <p className="text-sm text-fog-400 mt-3">Not evaluated yet. Accuracy appears after a month of forecasts can be compared to actual sales.</p>
      ) : (
        <div className="mt-4 space-y-3 relative">
          <p className="text-xs text-fog-400">MAPE (lower is better) across {d.count} products</p>
          {[
            { l: 'Our model', v: d.modelMape, c: 'bg-teal-400' },
            { l: 'Naive (last month)', v: d.naiveMape, c: 'bg-fog-500' },
          ].map((r) => {
            const p = Number(r.v);
            return (
              <div key={r.l}>
                <div className="flex justify-between text-sm">
                  <span>{r.l}</span>
                  <span className="font-mono">{mapePct(r.v)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 mt-1 overflow-hidden">
                  <motion.div className={clsx('h-full rounded-full', r.c)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, p)}%` }} transition={{ duration: 1 }} />
                </div>
              </div>
            );
          })}
          <p className="text-sm">
            Beats naive on <b className="text-teal-300">{pctN(d.beatNaivePct, 0)}</b> of products
          </p>
          {Number(d.modelMape) > Number(d.naiveMape) && (
            <p className="text-[11px] text-fog-500">
              The average error is higher than naive because a few volatile products have large misses — per product, the model wins more often than it loses.
            </p>
          )}
          {d.byConfidence && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(d.byConfidence).map(([k, v]) => (
                <Chip key={k}>
                  {k} confidence: {typeof v === 'object' ? JSON.stringify(v) : num(v)}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GrowthTable() {
  const q = useQuery({ queryKey: qk.growth({ level: 'category', months: 3 }), queryFn: () => getGrowth({ level: 'category', months: 3 }) });
  return (
    <section className="card" aria-labelledby="gr-h">
      <h2 id="gr-h" className="font-display font-semibold mb-3">
        Category growth
      </h2>
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <EmptyState title="No growth data" body="Needs at least two months of sales." />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="table [&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-nowrap">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Last month</th>
                <th className="text-right">MoM</th>
                <th className="text-right">3-mo</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((g) => (
                <tr key={g.key}>
                  <td className="font-medium">{g.name || g.key}</td>
                  <td className="text-right font-mono">{num(g.lastMonth)}</td>
                  <td className="text-right">
                    <Growth v={g.momGrowth} />
                  </td>
                  <td className="text-right">
                    <Growth v={g.avgGrowth3} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Growth({ v }) {
  if (v == null) return <span className="text-fog-500">—</span>;
  const up = v >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 font-mono text-sm', up ? 'text-teal-300' : 'text-rose-300')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {pct(Math.abs(v))}
    </span>
  );
}

function TopList({ order, title }) {
  const params = { metric: 'revenue', order, limit: 5 };
  const q = useQuery({ queryKey: qk.top(params), queryFn: () => getTopProducts(params) });
  const max = Math.max(1, ...(q.data || []).map((r) => Number(r.value) || 0));
  return (
    <section className="card" aria-label={title}>
      <h2 className="font-display font-semibold mb-3">{title}</h2>
      {q.isLoading ? (
        <SkeletonRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <p className="text-sm text-fog-400">No sales in the period.</p>
      ) : (
        <ol className="space-y-2.5">
          {q.data.map((r, i) => (
            <li key={r.productId}>
              <div className="flex justify-between text-sm gap-2">
                <span className="truncate">
                  <span className="text-fog-500 font-mono mr-2">{i + 1}</span>
                  {r.name}
                </span>
                <span className="font-mono shrink-0">{money0(r.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 mt-1">
                <motion.div className={clsx('h-full rounded-full', order === 'desc' ? 'bg-teal-400' : 'bg-rose-400')} initial={{ width: 0 }} animate={{ width: `${(Number(r.value) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LatestAlerts() {
  const q = useQuery({ queryKey: qk.alerts({ state: 'active' }), queryFn: () => listAlerts({ state: 'active' }) });
  return (
    <section className="card" aria-labelledby="la-h">
      <div className="flex justify-between items-center mb-3">
        <h2 id="la-h" className="font-display font-semibold flex items-center gap-2">
          <Siren className="h-4 w-4 text-rose-300" aria-hidden /> Latest price alerts
        </h2>
        <Link to="/alerts" className="text-xs text-fog-400 hover:text-fog-100 inline-flex items-center gap-1">
          All <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <p className="text-sm text-fog-400">No active price alerts. Good news.</p>
      ) : (
        <ul className="space-y-2">
          {q.data.slice(0, 3).map((a) => (
            <li key={a._id}>
              <Link to={`/alerts/${a._id}`} className="block rounded-xl p-3 bg-white/[0.03] hover:bg-white/[0.06]">
                <div className="flex items-center gap-2 flex-wrap">
                  <LabelChip label={a.label} />
                  <span className="font-semibold capitalize">{a.commodity}</span>
                  <span className="text-xs text-fog-500">{date(a.createdAt)}</span>
                </div>
                <p className="text-sm text-fog-400 mt-1 line-clamp-2">{a.message}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LatestTrends() {
  const q = useQuery({ queryKey: qk.trends({}), queryFn: () => listTrends({}) });
  const items = [...(q.data || [])].sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <section className="card" aria-labelledby="lt-h">
      <div className="flex justify-between items-center mb-3">
        <h2 id="lt-h" className="font-display font-semibold flex items-center gap-2">
          <Flame className="h-4 w-4 text-saffron-300" aria-hidden /> Top trends
        </h2>
        <Link to="/trends" className="text-xs text-fog-400 hover:text-fog-100 inline-flex items-center gap-1">
          All <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !items.length ? (
        <p className="text-sm text-fog-400">No trends detected yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t._id}>
              <Link to={`/trends/${t._id}`} className="flex items-center gap-3 rounded-xl p-3 bg-white/[0.03] hover:bg-white/[0.06]">
                <ScoreRing score={t.score} size={44} />
                <div className="min-w-0">
                  <p className="font-semibold truncate capitalize">{t.keyword}</p>
                  <p className="text-xs text-fog-400">
                    {t.status} · {t.evidenceCount} articles {t.fits && '· fits your shop'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  useTitle('Dashboard');
  const { vendor } = useAuth();
  const hour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Mission control"
        title={`${greet}, ${vendor?.name?.split(' ')[0] || 'there'}`}
        subtitle="Here’s how your shop is doing and what the co-pilot recommends next."
        actions={
          <Link to="/cart" className="btn-primary">
            <ShoppingCart className="h-4 w-4" aria-hidden /> Review cart
          </Link>
        }
      />
      <DataQualityBanner />
      <Kpis />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesChartCard />
        <AccuracyCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GrowthTable />
        <TopList order="desc" title="Top 5 products (revenue)" />
        <TopList order="asc" title="Bottom 5 products (revenue)" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LatestAlerts />
        <LatestTrends />
      </div>
    </div>
  );
}

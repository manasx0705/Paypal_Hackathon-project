import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Flame, Target, Users, Newspaper, TrendingUp, AlertOctagon } from 'lucide-react';
import { listTrends, getTrendStats } from '../api/trends';
import { qk } from '../lib/queryKeys';
import { pct, timeAgo, num } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { Chip, EmptyState, ErrorState, PageHeader, SkeletonRows, Toggle, stagger } from '../components/ui';
import { ScoreRing, Sparkline } from '../components/explain';

export const STATUS_TONE = { emerging: 'ok', peaking: 'warn', fading: 'neutral' };

function CrossoverPanel() {
  const q = useQuery({ queryKey: qk.trendStats, queryFn: getTrendStats });
  return (
    <section className="card" aria-labelledby="xo-h">
      <h2 id="xo-h" className="font-display font-semibold flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-teal-300" aria-hidden /> Did trends turn into sales?
      </h2>
      {q.isLoading ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <p className="font-display text-4xl font-bold mt-3 text-gradient">{pct(q.data.rate, 0)}</p>
          <p className="text-xs text-fog-400">crossover rate — {q.data.crossed} of {q.data.evaluated} evaluated trends sold in your shop ({q.data.pending} pending)</p>
          {q.data.perTrend?.length > 0 && (
            <ul className="mt-4 space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
              {q.data.perTrend.map((t, i) => (
                <li key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate capitalize">{t.keyword}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-fog-500">{t.action} · {num(t.soldQty30d)} sold</span>
                    {t.crossedOver == null ? <Chip>pending</Chip> : t.crossedOver ? <Chip tone="ok">crossed over</Chip> : <Chip tone="bad">didn’t sell</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function Trends() {
  useTitle('Trends');
  const [fit, setFit] = useState(false);
  const [status, setStatus] = useState('');
  const params = useMemo(() => {
    const p = {};
    if (fit) p.fit = true;
    if (status) p.status = status;
    return p;
  }, [fit, status]);
  const q = useQuery({ queryKey: qk.trends(params), queryFn: () => listTrends(params) });
  const items = [...(q.data || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  return (
    <div>
      <PageHeader kicker="Social radar" title="Trends" subtitle="What India is talking about, scored by people, search growth and source diversity — sponsored hype penalised." />
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          <div className="card flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex-1">
              <Toggle id="fit-toggle" checked={fit} onChange={setFit} label="Fits my shop only" description="Hide trends outside your categories" />
            </div>
            <div>
              <label htmlFor="tr-status" className="label">Status</label>
              <select id="tr-status" className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="emerging">Emerging</option>
                <option value="peaking">Peaking</option>
                <option value="fading">Fading</option>
              </select>
            </div>
          </div>
          {q.isLoading ? (
            <SkeletonRows rows={6} />
          ) : q.isError ? (
            <div className="card"><ErrorState error={q.error} onRetry={q.refetch} /></div>
          ) : !items.length ? (
            <div className="card"><EmptyState icon={Flame} title="No trends match" body="Try turning off “Fits my shop” or clearing the status filter." /></div>
          ) : (
            <motion.ul variants={stagger.container} initial="hidden" animate="show" className="space-y-2">
              {items.map((t, i) => (
                <motion.li key={t._id} variants={stagger.item}>
                  <Link to={`/trends/${t._id}`} className="card !p-4 flex items-center gap-4 hover:border-saffron-400/40 transition-colors">
                    <span className="font-mono text-fog-500 text-sm w-5">{i + 1}</span>
                    <ScoreRing score={t.score} size={48} />
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold capitalize truncate">{t.keyword}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Chip tone={STATUS_TONE[t.status] || 'neutral'} icon={Flame}>{t.status}</Chip>
                        {t.fits && <Chip tone="info" icon={Target}>Fits your shop</Chip>}
                        {(t.flags || []).slice(0, 2).map((f) => <Chip key={f} tone="bad" icon={AlertOctagon}>{String(f).replace(/_/g, ' ')}</Chip>)}
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-fog-400">
                      <Sparkline data={t.sparkline} label={`${t.keyword} interest`} />
                      <span className="flex gap-2">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{t.peopleCount}</span>
                        <span className="inline-flex items-center gap-1"><Newspaper className="h-3 w-3" aria-hidden />{t.evidenceCount}</span>
                        <span>{timeAgo(t.lastSeen)}</span>
                      </span>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
        <div>
          <CrossoverPanel />
        </div>
      </div>
    </div>
  );
}

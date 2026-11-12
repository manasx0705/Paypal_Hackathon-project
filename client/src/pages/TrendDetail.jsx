import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flame, Target, AlertOctagon, User, ExternalLink, Info, Tag } from 'lucide-react';
import { getTrend } from '../api/trends';
import { qk } from '../lib/queryKeys';
import { date } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { BackLink, Chip, ErrorState, PageHeader, SkeletonRows, EmptyState } from '../components/ui';
import { BreakdownBar, ScoreRing } from '../components/explain';
import { SearchInterestChart } from '../components/charts';
import { STATUS_TONE } from './Trends';

const FLAG_HELP = {
  sponsored: 'Some coverage looks paid or promotional, so the score was reduced.',
  single_source: 'Only one outlet is reporting this — it may not be widespread.',
  celebrity_only: 'Driven mostly by a celebrity mention; may fade quickly.',
  low_search: 'Search interest is low compared to news coverage.',
  stale: 'No fresh coverage recently.',
  regional: 'Popular in a specific region, which may not be yours.',
};
const flagHelp = (f) => FLAG_HELP[String(f).toLowerCase()] || 'Signal that may weaken this trend — check the evidence.';

export default function TrendDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: qk.trend(id), queryFn: () => getTrend(id) });
  useTitle(q.data ? `Trend: ${q.data.keyword}` : 'Trend');
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <><BackLink to="/trends">All trends</BackLink><ErrorState error={q.error} onRetry={q.refetch} /></>;
  const t = q.data;
  return (
    <div className="space-y-4">
      <BackLink to="/trends">All trends</BackLink>
      <PageHeader
        kicker="Trend"
        title={<span className="capitalize">{t.keyword}</span>}
        actions={<div className="flex flex-wrap gap-1.5">
          <Chip tone={STATUS_TONE[t.status] || 'neutral'} icon={Flame}>{t.status}</Chip>
          {t.fits && <Chip tone="info" icon={Target}>Fits your shop</Chip>}
          {(t.categoryTags || []).map((c) => <Chip key={c} icon={Tag}>{c}</Chip>)}
        </div>}
      />
      <div className="card border-white/10 flex gap-3 items-start" role="note">
        <Info className="h-5 w-5 text-saffron-300 shrink-0" aria-hidden />
        <p className="text-sm text-fog-300">Popularity is not the same as demand in your area, and sponsored coverage can inflate trends.</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-2" aria-labelledby="sb-h">
          <div className="flex items-center gap-4 mb-4">
            <ScoreRing score={t.score} size={72} />
            <div>
              <h2 id="sb-h" className="font-display font-semibold">Why this score?</h2>
              <p className="text-xs text-fog-400">Each signal is capped, weighted and summed; sponsored coverage multiplies the total down.</p>
            </div>
          </div>
          <BreakdownBar breakdown={t.breakdown} />
        </section>
        <section className="card" aria-labelledby="fl-h">
          <h2 id="fl-h" className="font-display font-semibold mb-3">Flags</h2>
          {!t.flags?.length ? (
            <p className="text-sm text-fog-400">No warning flags. Coverage looks organic.</p>
          ) : (
            <ul className="space-y-2">
              {t.flags.map((f) => (
                <li key={f} className="rounded-xl bg-rose-500/[0.06] border border-rose-400/20 p-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5 capitalize"><AlertOctagon className="h-4 w-4 text-rose-300" aria-hidden /> {String(f).replace(/_/g, ' ')}</p>
                  <p className="text-xs text-fog-400 mt-1">{flagHelp(f)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-2" aria-labelledby="si-h">
          <h2 id="si-h" className="font-display font-semibold mb-3">Search interest</h2>
          {t.searchSeries?.length ? <SearchInterestChart series={t.searchSeries} /> : <p className="text-sm text-fog-400">No search data.</p>}
        </section>
        <section className="card" aria-labelledby="pp-h">
          <h2 id="pp-h" className="font-display font-semibold mb-3">People talking about it</h2>
          {!t.people?.length ? <p className="text-sm text-fog-400">No named people.</p> : (
            <ul className="space-y-2">
              {t.people.map((p) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-full bg-white/5 grid place-items-center"><User className="h-4 w-4 text-fog-400" aria-hidden /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-fog-500 capitalize">{p.role}</p>
                  </div>
                  <span className="text-xs font-mono text-fog-400">{p.mentions}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="card" aria-labelledby="ev-h">
        <h2 id="ev-h" className="font-display font-semibold mb-3">Evidence ({t.evidence?.length || 0} articles)</h2>
        {!t.evidence?.length ? <EmptyState title="No articles" /> : (
          <ul className="grid md:grid-cols-2 gap-3">
            {t.evidence.map((a) => (
              <li key={a.articleId || a.url} className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-saffron-300 inline-flex gap-1.5 items-start">
                  {a.title} <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-1" aria-hidden /><span className="sr-only">(opens in new tab)</span>
                </a>
                <p className="text-xs text-fog-500 mt-1">{a.source} · {date(a.publishedAt)}</p>
                {a.summary && <p className="text-sm text-fog-300 mt-2">{a.summary}</p>}
                {a.people?.length > 0 && <p className="text-xs text-fog-500 mt-2">Mentions: {a.people.map((p) => (typeof p === 'string' ? p : p.name)).join(', ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

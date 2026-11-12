import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ExternalLink, MapPin, Newspaper, XCircle, Link2, BarChart3, AlertTriangle } from 'lucide-react';
import { getAlert, dismissAlert } from '../api/alerts';
import { errMsg } from '../api/client';
import { qk } from '../lib/queryKeys';
import { date, money, num, pct } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { BackLink, Chip, ErrorState, PageHeader, SkeletonRows, Spinner, StatLine } from '../components/ui';
import { LabelChip, VerifiedChip, PerishableChip } from '../components/chips';
import { SeverityChip } from './Alerts';

export default function AlertDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: qk.alert(id), queryFn: () => getAlert(id) });
  useTitle(q.data ? `Alert: ${q.data.commodity}` : 'Alert');
  const dis = useMutation({
    mutationFn: () => dismissAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: qk.alert(id) });
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.info('Alert dismissed');
      nav('/alerts');
    },
    onError: (e) => toast.error('Could not dismiss', { body: errMsg(e) }),
  });
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <><BackLink to="/alerts">All alerts</BackLink><ErrorState error={q.error} onRetry={q.refetch} /></>;
  const a = q.data;
  const v = a.signal?.verifiedDetail;
  const chain = a.signal?.chainInference;
  const changePct = v?.changePct == null ? null : Number(v.changePct) / 100;
  return (
    <div className="space-y-4">
      <BackLink to="/alerts">All alerts</BackLink>
      <PageHeader
        kicker="Price alert"
        title={<span className="capitalize">{a.commodity} — price {a.direction === 'down' ? 'drop' : 'rise'}</span>}
        subtitle={a.message}
        actions={a.state === 'active' && (
          <button className="btn-ghost" onClick={() => dis.mutate()} disabled={dis.isPending}>
            {dis.isPending ? <Spinner /> : <XCircle className="h-4 w-4" aria-hidden />} Dismiss alert
          </button>
        )}
      />
      <div className="flex flex-wrap gap-1.5">
        <LabelChip label={a.label} />
        <VerifiedChip verified={a.verified} />
        <SeverityChip severity={a.severity} />
        <Chip icon={MapPin}>{a.scope}{a.regions?.length ? `: ${a.regions.join(', ')}` : ''}</Chip>
        <Chip icon={Newspaper}>{a.sourceCount} sources</Chip>
        {a.state !== 'active' && <Chip>{a.state}</Chip>}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card" aria-labelledby="ver-h">
          <h2 id="ver-h" className="font-display font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-300" aria-hidden /> Mandi verification</h2>
          {v ? (
            <>
              <StatLine label="Market" value={v.market} />
              <StatLine label="Recent average" value={`${money(v.recentAvg)} / quintal`} />
              <StatLine label="Previous average" value={`${money(v.prevAvg)} / quintal`} />
              <StatLine label="Change" value={changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${pct(changePct)}`} />
              <p className="text-xs text-fog-500 mt-2">{a.verified ? 'Government mandi prices confirm the movement reported in the news.' : 'Mandi prices do not (yet) confirm this movement — treat with caution.'}</p>
            </>
          ) : (
            <p className="text-sm text-fog-400">No mandi data available for this commodity.</p>
          )}
          {a.signal && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <StatLine label="Driver" value={a.signal.driver || '—'} />
              <StatLine label="Signal confidence" value={typeof a.signal.confidence === 'number' ? num(a.signal.confidence, 2) : a.signal.confidence || '—'} />
              <StatLine label="Signal status" value={a.signal.status || '—'} />
            </div>
          )}
        </section>
        <section className="card" aria-labelledby="chain-h">
          <h2 id="chain-h" className="font-display font-semibold mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-saffron-300" aria-hidden /> Inferred origin (may be wrong)</h2>
          <p className="text-xs text-fog-500 mb-4 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> This chain is our best guess from news coverage{chain?.confidence != null ? ` · confidence ${typeof chain.confidence === 'number' ? num(chain.confidence, 2) : chain.confidence}` : ''}.
          </p>
          {!chain?.levels?.length ? (
            <p className="text-sm text-fog-400">No supply-chain inference for this alert.</p>
          ) : (
            <ol className="relative ml-3 border-l-2 border-dashed border-saffron-400/30 space-y-5">
              {chain.levels.map((l, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="pl-6 relative">
                  <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-ink-900 border-2 border-saffron-400" aria-hidden />
                  <p className="text-[11px] uppercase tracking-wider text-saffron-300 font-semibold">Level {i + 1} · {l.level}</p>
                  <p className="text-sm text-fog-200 mt-0.5">{l.note}</p>
                  {l.articleIds?.length > 0 && <p className="text-[11px] text-fog-500 mt-0.5">Based on {l.articleIds.length} article(s)</p>}
                </motion.li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {a.matchedProducts?.length > 0 && (
        <section className="card" aria-labelledby="mp-h">
          <h2 id="mp-h" className="font-display font-semibold mb-3">Your affected products</h2>
          <ul className="flex flex-wrap gap-2">
            {a.matchedProducts.map((p) => (
              <li key={p._id} className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-sm flex items-center gap-2">
                {p.name} {p.perishable ? <PerishableChip /> : null}
                <span className="text-xs text-fog-400">
                  {p.perishable ? 'warning only' : a.suggestedQtyByProduct?.[p._id] != null ? `suggest +${a.suggestedQtyByProduct[p._id]}` : 'info only'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-labelledby="src-h">
        <h2 id="src-h" className="font-display font-semibold mb-3">Sources</h2>
        {!a.articles?.length ? <p className="text-sm text-fog-400">No articles attached.</p> : (
          <ul className="space-y-2">
            {a.articles.map((ar) => (
              <li key={ar._id} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                <a href={ar.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-saffron-300 inline-flex items-start gap-1.5">
                  {ar.title} <ExternalLink className="h-3.5 w-3.5 mt-1 shrink-0" aria-hidden /><span className="sr-only">(opens in new tab)</span>
                </a>
                <p className="text-xs text-fog-500">{ar.source} · {date(ar.publishedAt)}</p>
                {ar.summary && <p className="text-sm text-fog-300 mt-1">{ar.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

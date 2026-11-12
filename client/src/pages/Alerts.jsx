import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Siren, MapPin, Newspaper, TrendingUp, TrendingDown, Gauge } from 'lucide-react';
import { listAlerts } from '../api/alerts';
import { qk } from '../lib/queryKeys';
import { date } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { Chip, EmptyState, ErrorState, PageHeader, SkeletonRows, Tabs, stagger } from '../components/ui';
import { LabelChip, VerifiedChip, PerishableChip } from '../components/chips';

export function SeverityChip({ severity }) {
  const s = String(severity || '').toLowerCase();
  return <Chip tone={s === 'high' ? 'bad' : s === 'medium' ? 'warn' : 'neutral'} icon={Gauge}>{severity || 'n/a'} severity</Chip>;
}

export default function Alerts() {
  useTitle('Price alerts');
  const [state, setState] = useState('active');
  const q = useQuery({ queryKey: qk.alerts({ state }), queryFn: () => listAlerts({ state }) });
  return (
    <div>
      <PageHeader kicker="Price radar" title="Price alerts" subtitle="Price-rise news, cross-checked against government mandi prices. “Expected” means likely soon; “Already happened” means it’s in the market." />
      <Tabs label="Alert state" value={state} onChange={setState} tabs={[{ value: 'active', label: 'Active' }, { value: 'dismissed', label: 'Dismissed' }, { value: 'expired', label: 'Expired' }]} />
      <div role="tabpanel" id={`panel-${state}`} aria-labelledby={`tab-${state}`} className="mt-4">
        {q.isLoading ? (
          <SkeletonRows rows={5} />
        ) : q.isError ? (
          <div className="card"><ErrorState error={q.error} onRetry={q.refetch} /></div>
        ) : !q.data?.length ? (
          <div className="card"><EmptyState icon={Siren} title={`No ${state} alerts`} body="We scan the news daily. Check the price cart for anything that affects your products." action={<Link to="/cart?tab=price" className="btn-primary">Open price cart</Link>} /></div>
        ) : (
          <motion.ul variants={stagger.container} initial="hidden" animate="show" className="grid md:grid-cols-2 gap-3">
            {q.data.map((a) => (
              <motion.li key={a._id} variants={stagger.item}>
                <Link to={`/alerts/${a._id}`} className="card block h-full hover:border-saffron-400/40 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.direction === 'down' ? <TrendingDown className="h-5 w-5 text-teal-300" aria-label="Price falling" /> : <TrendingUp className="h-5 w-5 text-rose-300" aria-label="Price rising" />}
                    <h2 className="font-display text-lg font-semibold capitalize">{a.commodity}</h2>
                    <LabelChip label={a.label} />
                  </div>
                  <p className="text-sm text-fog-300 mt-2 line-clamp-3">{a.message}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <VerifiedChip verified={a.verified} />
                    <SeverityChip severity={a.severity} />
                    <Chip icon={MapPin}>{a.scope}{a.regions?.length ? `: ${a.regions.join(', ')}` : ''}</Chip>
                    <Chip icon={Newspaper}>{a.sourceCount} sources</Chip>
                  </div>
                  {a.matchedProducts?.length > 0 && (
                    <p className="text-xs text-fog-400 mt-3">
                      Affects: {a.matchedProducts.map((p) => p.name).join(', ')} {a.matchedProducts.some((p) => p.perishable) && <PerishableChip />}
                    </p>
                  )}
                  <p className="text-[11px] text-fog-500 mt-2">{date(a.createdAt)}</p>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
}

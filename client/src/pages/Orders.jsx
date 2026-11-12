import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, Bot, User } from 'lucide-react';
import { listOrders } from '../api/orders';
import { qk } from '../lib/queryKeys';
import { money, date, shortId } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { Chip, EmptyState, ErrorState, PageHeader, SkeletonRows, Tabs, stagger } from '../components/ui';
import { OrderStatusChip, PaymentChip } from '../components/chips';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Orders() {
  useTitle('Orders');
  const [status, setStatus] = useState('');
  const params = status ? { status } : {};
  const q = useQuery({ queryKey: qk.orders(params), queryFn: () => listOrders(params) });
  return (
    <div>
      <PageHeader kicker="Supplier orders" title="Orders" subtitle="Approved cart items are grouped into one draft order per supplier. Send, pay with PayPal, and receive." />
      <Tabs label="Order status" value={status || 'all'} onChange={(v) => setStatus(v === 'all' ? '' : v)} tabs={FILTERS.map((f) => ({ ...f, value: f.value || 'all' }))} />
      <div role="tabpanel" id={`panel-${status || 'all'}`} aria-labelledby={`tab-${status || 'all'}`} className="mt-4">
        {q.isLoading ? (
          <SkeletonRows rows={6} />
        ) : q.isError ? (
          <div className="card"><ErrorState error={q.error} onRetry={q.refetch} /></div>
        ) : !q.data?.length ? (
          <div className="card"><EmptyState icon={Package} title="No orders here" body="Approve items in your cart to create draft supplier orders." action={<Link to="/cart" className="btn-primary">Go to cart</Link>} /></div>
        ) : (
          <motion.ul variants={stagger.container} initial="hidden" animate="show" className="space-y-2">
            {q.data.map((o) => (
              <motion.li key={o._id} variants={stagger.item}>
                <Link to={`/orders/${o._id}`} className="card !p-4 grid grid-cols-2 md:grid-cols-[1fr_1.5fr_auto_auto_auto] gap-3 items-center hover:border-saffron-400/40 transition-colors">
                  <div>
                    <p className="font-mono text-sm">#{shortId(o._id)}</p>
                    <p className="text-xs text-fog-500">{date(o.createdAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{o.supplier?.name || 'Unassigned supplier'}</p>
                    <p className="text-xs text-fog-500">{o.items?.length || 0} line(s)</p>
                  </div>
                  <p className="font-display font-bold">{money(o.totalINR)}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <OrderStatusChip status={o.status} />
                    <PaymentChip payment={o.payment} />
                  </div>
                  <Chip icon={o.origin === 'agent' ? Bot : User}>{o.origin === 'agent' ? 'Agent' : 'You'}</Chip>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
}

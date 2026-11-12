import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Send, Ban, PackageCheck, FileEdit, Wallet, Check, Mail, Bot, User } from 'lucide-react';
import clsx from 'clsx';
import { getOrder, sendOrder, cancelOrder, receiveOrder } from '../api/orders';
import { errMsg } from '../api/client';
import { qk } from '../lib/queryKeys';
import { money, num, dateTime, shortId, fmtCurrency } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { BackLink, Chip, ErrorState, Modal, PageHeader, SkeletonRows, Spinner, StatLine } from '../components/ui';
import { OrderStatusChip, PaymentChip } from '../components/chips';
import PayPalPay from '../components/PayPalPay';
import Celebration from '../components/Celebration';

function Timeline({ order }) {
  const paid = order.payment?.status === 'paid';
  const steps = [
    { key: 'draft', label: 'Draft', icon: FileEdit, done: true, at: order.createdAt },
    { key: 'sent', label: 'Sent', icon: Send, done: !!order.sentAt || order.status === 'sent' || order.status === 'received', at: order.sentAt },
    { key: 'paid', label: 'Paid', icon: Wallet, done: paid, at: order.payment?.paidAt },
    { key: 'received', label: 'Received', icon: PackageCheck, done: order.status === 'received', at: order.receivedAt },
  ];
  const cancelled = order.status === 'cancelled';
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex flex-col items-center text-center" aria-current={!s.done && steps[i - 1]?.done ? 'step' : undefined}>
          {i > 0 && (
            <span className="absolute top-5 right-1/2 w-full h-0.5 bg-white/10 -z-0" aria-hidden>
              <motion.span className="block h-full bg-gradient-to-r from-saffron-400 to-teal-400" initial={{ width: 0 }} animate={{ width: s.done ? '100%' : 0 }} transition={{ duration: 0.6, delay: i * 0.15 }} />
            </span>
          )}
          <motion.span
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            className={clsx('relative z-10 h-10 w-10 rounded-full grid place-items-center border-2', s.done ? 'bg-teal-400/20 border-teal-400 text-teal-300' : 'bg-ink-900 border-white/15 text-fog-500', cancelled && !s.done && 'opacity-40')}
          >
            {s.done ? <Check className="h-5 w-5" aria-hidden /> : <s.icon className="h-4 w-4" aria-hidden />}
          </motion.span>
          <span className={clsx('text-xs font-semibold mt-2', s.done ? 'text-fog-100' : 'text-fog-500')}>
            {s.label}
            <span className="sr-only">{s.done ? ' (done)' : ' (pending)'}</span>
          </span>
          <span className="text-[10px] text-fog-500">{s.done && s.at ? dateTime(s.at) : ''}</span>
        </li>
      ))}
    </ol>
  );
}

function ReceiveDialog({ order, open, onClose, onDone }) {
  const toast = useToast();
  const [lines, setLines] = useState({});
  useEffect(() => {
    if (open) setLines(Object.fromEntries(order.items.map((it) => [it.productId, Math.max(0, (it.qty || 0) - (it.receivedQty || 0))])));
  }, [open, order]);
  const m = useMutation({
    mutationFn: () => receiveOrder(order._id, Object.entries(lines).filter(([, q]) => Number(q) > 0).map(([productId, qty]) => ({ productId, qty: Number(qty) }))),
    onSuccess: (o) => { toast.success('Delivery recorded — stock updated'); onDone(o); },
    onError: (e) => toast.error('Could not record delivery', { body: errMsg(e) }),
  });
  return (
    <Modal open={open} onClose={onClose} title="Mark received">
      <p className="text-sm text-fog-400 mb-4">Enter what actually arrived. Partial deliveries are fine — you can receive the rest later.</p>
      <ul className="space-y-3">
        {order.items.map((it) => (
          <li key={it.productId} className="flex items-center gap-3">
            <label htmlFor={`rcv-${it.productId}`} className="flex-1 text-sm">
              {it.name}
              <span className="block text-xs text-fog-500">ordered {num(it.qty)} · already received {num(it.receivedQty || 0)}</span>
            </label>
            <input id={`rcv-${it.productId}`} type="number" min="0" max={it.qty} className="input w-24" value={lines[it.productId] ?? 0} onChange={(e) => setLines((l) => ({ ...l, [it.productId]: e.target.value }))} />
            <span className="text-xs text-fog-500 w-10">{it.unit}</span>
          </li>
        ))}
      </ul>
      <button className="btn-primary w-full mt-5" disabled={m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? <Spinner /> : <PackageCheck className="h-4 w-4" aria-hidden />} Confirm delivery
      </button>
    </Modal>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.order(id), queryFn: () => getOrder(id) });
  useTitle(q.data ? `Order #${shortId(q.data._id)}` : 'Order');
  const [receiving, setReceiving] = useState(false);
  const [celebrate, setCelebrate] = useState(null);

  const refresh = (o) => {
    if (o?._id) qc.setQueryData(qk.order(id), o);
    qc.invalidateQueries({ queryKey: qk.order(id) });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const send = useMutation({
    mutationFn: () => sendOrder(id),
    onSuccess: (o) => { refresh(o); toast.success('Order sent to supplier'); },
    onError: (e) => toast.error('Could not send', { body: errMsg(e) }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: (o) => { refresh(o); toast.info('Order cancelled'); },
    onError: (e) => toast.error('Could not cancel', { body: errMsg(e) }),
  });

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <><BackLink to="/orders">All orders</BackLink><ErrorState error={q.error} onRetry={q.refetch} /></>;
  const o = q.data;
  const paid = o.payment?.status === 'paid';
  const canPay = !paid && o.status !== 'cancelled' && o.totalINR > 0;

  return (
    <div className="space-y-4">
      <BackLink to="/orders">All orders</BackLink>
      <PageHeader
        kicker={`Order #${shortId(o._id)}`}
        title={o.supplier?.name || 'Supplier order'}
        subtitle={`Created ${dateTime(o.createdAt)}`}
        actions={
          <>
            {o.status === 'draft' && (
              <button className="btn-primary" onClick={() => send.mutate()} disabled={send.isPending}>
                {send.isPending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden />} Send to supplier
              </button>
            )}
            {(o.status === 'sent' || o.status === 'received') && o.items.some((it) => (it.receivedQty || 0) < it.qty) && (
              <button className="btn-teal" onClick={() => setReceiving(true)}>
                <PackageCheck className="h-4 w-4" aria-hidden /> Mark received
              </button>
            )}
            {(o.status === 'draft' || o.status === 'sent') && !paid && (
              <button className="btn-ghost text-rose-300" onClick={() => window.confirm('Cancel this order?') && cancel.mutate()} disabled={cancel.isPending}>
                <Ban className="h-4 w-4" aria-hidden /> Cancel
              </button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-1.5">
        <OrderStatusChip status={o.status} />
        <PaymentChip payment={o.payment} />
        <Chip icon={o.origin === 'agent' ? Bot : User}>Created by {o.origin === 'agent' ? 'agent' : 'you'}</Chip>
      </div>
      <section className="card" aria-label="Order timeline">
        <Timeline order={o} />
      </section>
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        <section className="card" aria-labelledby="items-h">
          <h2 id="items-h" className="font-display font-semibold mb-3">Items</h2>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table min-w-[520px]">
              <thead>
                <tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Received</th><th className="text-right">Unit cost</th><th className="text-right">Line total</th></tr>
              </thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.productId}>
                    <td className="font-medium">{it.name}</td>
                    <td className="text-right font-mono">{num(it.qty)} <span className="text-xs text-fog-500">{it.unit}</span></td>
                    <td className="text-right font-mono">{num(it.receivedQty || 0)}</td>
                    <td className="text-right font-mono">{money(it.unitCost)}</td>
                    <td className="text-right font-mono">{money(it.qty * it.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} className="text-right font-semibold pt-3">Total</td><td className="text-right font-display font-bold text-lg pt-3">{money(o.totalINR)}</td></tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-x-6">
            <StatLine label="Supplier email" value={o.supplier?.email || '—'} />
            <StatLine label="Supplier PayPal" value={o.supplier?.paypalEmail || '—'} />
          </div>
          {o.status === 'draft' && <p className="text-xs text-fog-500 mt-3 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden /> “Send to supplier” emails this order (or logs it, depending on the supplier’s channel).</p>}
        </section>
        <aside aria-label="Payment">
          {paid ? (
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl border border-teal-400/30 bg-teal-400/[0.06] p-5">
              <p className="kicker !text-teal-300">Paid via PayPal</p>
              <p className="font-display text-3xl font-bold mt-2">{fmtCurrency(o.payment.amount, o.payment.currency)}</p>
              <div className="mt-3">
                <StatLine label="Provider" value={o.payment.provider || 'paypal'} />
                <StatLine label="PayPal order" value={<span className="text-xs">{o.payment.paypalOrderId || '—'}</span>} />
                <StatLine label="Capture ID" value={<span className="text-xs">{o.payment.captureId || '—'}</span>} />
                <StatLine label="Paid at" value={dateTime(o.payment.paidAt)} />
              </div>
            </motion.div>
          ) : canPay ? (
            <PayPalPay
              order={o}
              onPaid={(paidOrder) => {
                refresh(paidOrder);
                setCelebrate(paidOrder?.payment || o.payment);
                toast.success('Payment captured with PayPal');
              }}
              onError={(m) => toast.error('PayPal payment failed', { body: m })}
            />
          ) : (
            <div className="card text-sm text-fog-400">{o.status === 'cancelled' ? 'This order was cancelled — no payment needed.' : 'Nothing to pay.'}</div>
          )}
        </aside>
      </div>
      <ReceiveDialog order={o} open={receiving} onClose={() => setReceiving(false)} onDone={(no) => { refresh(no); setReceiving(false); qc.invalidateQueries({ queryKey: ['products'] }); }} />
      <Celebration
        show={!!celebrate}
        title="Paid with PayPal!"
        body={celebrate?.amount != null ? `${fmtCurrency(celebrate.amount, celebrate.currency)} sent to ${o.supplier?.name || 'your supplier'}` : `${money(o.totalINR)} sent to ${o.supplier?.name || 'your supplier'}`}
        onDone={() => setCelebrate(null)}
      />
    </div>
  );
}

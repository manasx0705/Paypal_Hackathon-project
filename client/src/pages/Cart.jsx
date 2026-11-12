import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShoppingCart, Flame, Siren, Check, X, Minus, Plus, Zap, ZapOff, Info, ExternalLink, Target, AlertTriangle, ShieldCheck, MapPin, Newspaper, Sparkles,
  CheckCircle2, Clock4,
} from 'lucide-react';
import clsx from 'clsx';
import { getCart, getCartCounts, updateCartItem } from '../api/cart';
import { errMsg } from '../api/client';
import { qk } from '../lib/queryKeys';
import { money0, num } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { useAgentRun } from '../hooks/useAgentRun';
import { Chip, EmptyState, ErrorState, PageHeader, SkeletonRows, Spinner, Tabs, stagger } from '../components/ui';
import { WhyPanel, ScoreRing } from '../components/explain';
import { LabelChip, PerishableChip, VerifiedChip } from '../components/chips';

const isOpen = (i) => i.status === 'suggested' || i.status === 'approved';

function useCartAction(type) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, body }) => updateCartItem(id, body),
    onSuccess: (res, { body, name }) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'overview'] });
      if (body.status === 'dismissed') {
        toast.info(`Dismissed ${name || 'item'}`);
        return;
      }
      if (res?.order?._id) {
        toast.success(`Approved ${name || 'item'}`, { body: `Added to a draft order for ${res.order.supplier?.name || 'the supplier'}.`, link: { to: `/orders/${res.order._id}`, label: 'Open order →' } });
      } else {
        toast.success(`Approved ${name || 'item'}`, { body: type === 'social' ? 'Recorded — we’ll track whether this trend sells for you.' : undefined });
      }
    },
    onError: (e) => toast.error('Could not update item', { body: errMsg(e) }),
  });
}

function StatusChip({ status }) {
  if (status === 'approved') return <Chip tone="ok" icon={CheckCircle2}>Approved</Chip>;
  if (status === 'ordered') return <Chip tone="info" icon={ShoppingCart}>Ordered</Chip>;
  if (status === 'dismissed') return <Chip tone="neutral" icon={X}>Dismissed</Chip>;
  return <Chip tone="warn" icon={Clock4}>Suggested</Chip>;
}

function QtyStepper({ value, min = 0, max = Infinity, onChange, label, unit }) {
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  const clamp = (v) => Math.max(lo, Math.min(hi, v));
  return (
    <div className="inline-flex items-center rounded-xl border border-white/10 bg-ink-900/70" role="group" aria-label={label}>
      <button type="button" className="p-1.5 hover:bg-white/10 rounded-l-xl disabled:opacity-30" aria-label="Decrease quantity" disabled={value <= lo} onClick={() => onChange(clamp(value - 1))}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        aria-label={`${label} (between ${lo} and ${hi === Infinity ? 'any' : hi})`}
        className="w-14 bg-transparent text-center font-mono text-sm focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={lo}
        max={hi === Infinity ? undefined : hi}
        onChange={(e) => onChange(e.target.value === '' ? lo : clamp(Number(e.target.value)))}
      />
      <button type="button" className="p-1.5 hover:bg-white/10 rounded-r-xl disabled:opacity-30" aria-label="Increase quantity" disabled={value >= hi} onClick={() => onChange(clamp(value + 1))}>
        <Plus className="h-3.5 w-3.5" />
      </button>
      {unit && <span className="pr-2 text-[11px] text-fog-500">{unit}</span>}
    </div>
  );
}

function Actions({ item, onApprove, onDismiss, busy, approveLabel = 'Approve', canApprove = true }) {
  if (!isOpen(item) || item.status === 'approved') return <StatusChip status={item.status} />;
  return (
    <div className="flex gap-1.5">
      {canApprove && (
        <button className="btn-teal btn-sm" onClick={onApprove} disabled={busy} aria-label={`${approveLabel} ${item.product?.name || item.keyword || ''}`}>
          {busy ? <Spinner /> : <Check className="h-3.5 w-3.5" aria-hidden />} {approveLabel}
        </button>
      )}
      <button className="btn-ghost btn-sm" onClick={onDismiss} disabled={busy} aria-label={`Dismiss ${item.product?.name || item.keyword || ''}`}>
        <X className="h-3.5 w-3.5" aria-hidden /> Dismiss
      </button>
    </div>
  );
}

/* ---------------- MAIN ---------------- */
function MainBanner({ meta }) {
  if (!meta) return null;
  const used = Number(meta.weeklySpentINR) || 0;
  const cap = Number(meta.weeklySpendCapINR) || 0;
  const p = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className={clsx('card mb-4 flex flex-col md:flex-row md:items-center gap-4', meta.autoOrderEnabled ? 'border-teal-400/30' : '')}>
      <div className="flex items-center gap-3">
        <div className={clsx('h-10 w-10 rounded-xl grid place-items-center', meta.autoOrderEnabled ? 'bg-teal-400/15' : 'bg-white/5')}>
          {meta.autoOrderEnabled ? <Zap className="h-5 w-5 text-teal-300" aria-hidden /> : <ZapOff className="h-5 w-5 text-fog-400" aria-hidden />}
        </div>
        <div>
          <p className="font-semibold">Auto-order is {meta.autoOrderEnabled ? 'ON' : 'OFF'}</p>
          <p className="text-xs text-fog-400">
            {meta.autoOrderEnabled ? 'Essentials may be ordered automatically, never beyond your weekly cap.' : 'Nothing is ordered until you approve it.'}{' '}
            <Link to="/settings" className="underline">Change</Link>
          </p>
        </div>
      </div>
      <div className="flex-1 md:max-w-sm md:ml-auto">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-fog-400">Weekly spend cap used</span>
          <span className="font-mono">{money0(used)} / {money0(cap)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label="Weekly spend cap used">
          <motion.div className={clsx('h-full', p > 90 ? 'bg-rose-400' : 'bg-gradient-to-r from-teal-400 to-saffron-400')} initial={{ width: 0 }} animate={{ width: `${p}%` }} />
        </div>
        {meta.maxQtyMultiplier != null && <p className="text-[11px] text-fog-500 mt-1">Quantities can go up to ×{meta.maxQtyMultiplier} the forecast.</p>}
      </div>
    </div>
  );
}

function MainRow({ item, act }) {
  const [qty, setQty] = useState(item.suggestedQty ?? 0);
  const busy = act.isPending && act.variables?.id === item._id;
  const name = item.product?.name;
  const cost = (item.product?.costPrice || 0) * qty;
  return (
    <motion.li variants={stagger.item} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_90px_170px_minmax(0,2fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="font-semibold truncate">{name || '—'}</p>
          <p className="text-[11px] text-fog-500">
            {item.product?.category} · <span className="font-mono">{item.product?.sku}</span> {item.product?.perishable && <PerishableChip />}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-fog-500 md:hidden">Stock</p>
          <p className="font-mono text-sm">
            {num(item.product?.currentStock)} <span className="text-fog-500 text-xs">{item.product?.unit}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-fog-500 mb-1">Order qty</p>
          {item.status === 'suggested' ? (
            <QtyStepper value={qty} min={item.minQty} max={item.maxQty} onChange={setQty} label={`Quantity for ${name}`} unit={item.product?.unit} />
          ) : (
            <span className="font-mono">{num(item.suggestedQty)}</span>
          )}
          <p className="text-[11px] text-fog-500 mt-1">
            range {num(item.minQty)}–{num(item.maxQty)} · ≈ {money0(cost)}
          </p>
        </div>
        <p className="text-sm text-fog-300">{item.reason}</p>
        <Actions
          item={item}
          busy={busy}
          onApprove={() => act.mutate({ id: item._id, name, body: { status: 'approved', suggestedQty: qty } })}
          onDismiss={() => act.mutate({ id: item._id, name, body: { status: 'dismissed' } })}
        />
      </div>
      <div className="mt-2">
        <WhyPanel item={item} />
      </div>
    </motion.li>
  );
}

function MainCart() {
  const q = useQuery({ queryKey: qk.cart('main'), queryFn: () => getCart('main') });
  const act = useCartAction('main');
  const agent = useAgentRun();
  if (q.isLoading) return <SkeletonRows rows={6} label="Loading main cart" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const items = (q.data.items || []).filter((i) => i.status !== 'dismissed');
  return (
    <>
      <MainBanner meta={q.data.meta} />
      {!items.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your main cart is empty"
          body="Ask the agent to check stock levels and forecasts for monthly essentials."
          action={<button className="btn-primary" onClick={agent.start} disabled={agent.running}>{agent.running ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />} Refresh suggestions</button>}
        />
      ) : (
        <motion.ul variants={stagger.container} initial="hidden" animate="show" className="space-y-2">
          {items.map((i) => <MainRow key={i._id} item={i} act={act} />)}
        </motion.ul>
      )}
    </>
  );
}

/* ---------------- SOCIAL ---------------- */
function SocialCard({ item, act }) {
  const busy = act.isPending && act.variables?.id === item._id;
  const fits = item.explain?.fits ?? item.explain?.fitsShop ?? true;
  const name = item.keyword || item.product?.name;
  return (
    <motion.article variants={stagger.item} className="card flex flex-col gap-3" aria-label={`Trend: ${name}`}>
      <div className="flex items-start gap-3">
        <ScoreRing score={item.score} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold capitalize truncate">{name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {item.trendStatus && <Chip tone={item.trendStatus === 'emerging' ? 'ok' : item.trendStatus === 'peaking' ? 'warn' : 'neutral'} icon={Flame}>{item.trendStatus}</Chip>}
            {fits && <Chip tone="info" icon={Target}>Fits your shop</Chip>}
            <StatusChip status={item.status} />
          </div>
        </div>
      </div>
      <p className="text-sm text-fog-300">{item.reason}</p>
      <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-sm flex items-center justify-between">
        <span className="text-fog-400">
          Trial quantity <span className="sr-only">— a small test order to see if it sells</span>
        </span>
        <span className="font-mono">{item.kind === 'info' ? 'Info only' : `${num(item.suggestedQty)} ${item.product?.unit || 'units'}`}</span>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {item.trendId ? (
          <Link to={`/trends/${item.trendId}`} className="inline-flex items-center gap-1 text-sm text-teal-300 hover:text-teal-200">
            <Newspaper className="h-4 w-4" aria-hidden /> See evidence
          </Link>
        ) : <span />}
        <WhyPanel item={item} />
      </div>
      <div className="pt-2 border-t border-white/5">
        <Actions
          item={item}
          busy={busy}
          approveLabel="Approve trial"
          onApprove={() => act.mutate({ id: item._id, name, body: { status: 'approved' } })}
          onDismiss={() => act.mutate({ id: item._id, name, body: { status: 'dismissed' } })}
        />
      </div>
    </motion.article>
  );
}

function SocialCart() {
  const q = useQuery({ queryKey: qk.cart('social'), queryFn: () => getCart('social') });
  const act = useCartAction('social');
  return (
    <>
      <div className="card mb-4 border-saffron-400/30 bg-saffron-400/[0.05] flex items-start gap-3" role="note">
        <Info className="h-5 w-5 text-saffron-300 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold">Suggestions only — nothing is ordered until you approve</p>
          <p className="text-xs text-fog-400">Social trends are never auto-ordered. Review each one on its own; trial quantities are kept small so you can test demand cheaply.</p>
        </div>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={4} label="Loading social finds" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !(q.data.items || []).filter((i) => i.status !== 'dismissed').length ? (
        <EmptyState icon={Flame} title="No trend suggestions right now" body="Browse all detected trends, or lower your minimum trend score in Settings." action={<Link to="/trends" className="btn-primary">Browse trends</Link>} />
      ) : (
        <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {q.data.items.filter((i) => i.status !== 'dismissed').map((i) => <SocialCard key={i._id} item={i} act={act} />)}
        </motion.div>
      )}
    </>
  );
}

/* ---------------- PRICE ---------------- */
function PriceCard({ item, act }) {
  const [qty, setQty] = useState(item.suggestedQty ?? 0);
  const busy = act.isPending && act.variables?.id === item._id;
  const e = item.explain || {};
  const perishable = !!item.product?.perishable;
  const info = item.kind === 'info' || perishable;
  const regs = e.regions?.length ? e.regions : item.signal?.regions;
  const regions = regs?.length ? regs : e.scope || item.signal?.scope;
  const name = item.product?.name || item.signal?.commodity || e.commodity || item.keyword;
  return (
    <motion.li variants={stagger.item} className={clsx('rounded-2xl border p-4', item.label === 'Already happened' ? 'border-rose-400/25 bg-rose-500/[0.04]' : 'border-saffron-400/25 bg-saffron-400/[0.04]')}>
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="font-semibold mr-1">{name}</h4>
            <LabelChip label={item.label} />
            {(item.verified ?? e.verified) != null && <VerifiedChip verified={item.verified ?? e.verified} />}
            {perishable && <PerishableChip />}
            {regions && <Chip icon={MapPin}>{Array.isArray(regions) ? regions.join(', ') : String(regions)}</Chip>}
            {e.sourceCount != null && <Chip icon={Newspaper}>{e.sourceCount} source{e.sourceCount === 1 ? '' : 's'}</Chip>}
          </div>
          <p className="text-sm text-fog-300 mt-2">{item.reason}</p>
          {perishable && (
            <p className="mt-2 text-xs text-saffron-200 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Perishable — warning only. Stocking up early would risk spoilage, so no order is suggested.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 items-center">
            <WhyPanel item={item} />
            {item.alertId && (
              <Link to={`/alerts/${item.alertId}`} className="inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Alert details
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
          {info ? (
            <Chip tone="neutral" icon={Info}>Info only</Chip>
          ) : item.status === 'suggested' ? (
            <QtyStepper value={qty} min={item.minQty} max={item.maxQty} onChange={setQty} label={`Quantity for ${name}`} unit={item.product?.unit} />
          ) : (
            <span className="font-mono text-sm">qty {num(item.suggestedQty)}</span>
          )}
          <Actions
            item={item}
            busy={busy}
            canApprove={!info}
            approveLabel="Buy ahead"
            onApprove={() => act.mutate({ id: item._id, name, body: { status: 'approved', suggestedQty: qty } })}
            onDismiss={() => act.mutate({ id: item._id, name, body: { status: 'dismissed' } })}
          />
        </div>
      </div>
    </motion.li>
  );
}

function PriceGroup({ label, items, act }) {
  const expected = label === 'Expected';
  return (
    <section aria-labelledby={`pg-${expected ? 'exp' : 'done'}`} className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h3 id={`pg-${expected ? 'exp' : 'done'}`} className={clsx('font-display text-xl font-bold', expected ? 'text-saffron-300' : 'text-rose-300')}>
          {label}
        </h3>
        <span className="text-xs text-fog-500">
          {expected ? 'Signals that prices are likely to rise soon — you can buy ahead.' : 'Prices have already risen in the market — review your selling prices.'}
        </span>
      </div>
      {!items.length ? (
        <p className="text-sm text-fog-500 rounded-xl border border-dashed border-white/10 p-4">Nothing here right now.</p>
      ) : (
        <motion.ul variants={stagger.container} initial="hidden" animate="show" className="space-y-2">
          {items.map((i) => <PriceCard key={i._id} item={i} act={act} />)}
        </motion.ul>
      )}
    </section>
  );
}

export function PriceCart() {
  const q = useQuery({ queryKey: qk.cart('price'), queryFn: () => getCart('price') });
  const act = useCartAction('price');
  if (q.isLoading) return <SkeletonRows rows={4} label="Loading price alerts" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const items = (q.data.items || []).filter((i) => i.status !== 'dismissed');
  if (!items.length) return <EmptyState icon={ShieldCheck} title="No price warnings" body="When news of a price rise is confirmed by mandi data, it shows up here." action={<Link className="btn-primary" to="/alerts">View all alerts</Link>} />;
  return (
    <div className="space-y-8">
      <PriceGroup label="Expected" items={items.filter((i) => i.label !== 'Already happened')} act={act} />
      <PriceGroup label="Already happened" items={items.filter((i) => i.label === 'Already happened')} act={act} />
    </div>
  );
}

const TABS = [
  { value: 'main', label: 'Main cart', icon: ShoppingCart },
  { value: 'social', label: 'Social media finds', icon: Flame },
  { value: 'price', label: 'Prices', icon: Siren },
];

export default function Cart() {
  useTitle('Cart');
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get('tab')) ? sp.get('tab') : 'main';
  const counts = useQuery({ queryKey: qk.cartCounts, queryFn: getCartCounts });
  return (
    <div>
      <PageHeader kicker="Agent suggestions" title="Cart" subtitle="Three carts, three levels of trust. Open “Why?” on any item to see exactly how it was decided." />
      <Tabs label="Cart type" value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} tabs={TABS.map((t) => ({ ...t, count: counts.data?.[t.value] }))} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {tab === 'main' && <MainCart />}
            {tab === 'social' && <SocialCart />}
            {tab === 'price' && <PriceCart />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { ShieldCheck, Lock } from 'lucide-react';
import { getPaymentsConfig, createPayment, capturePayment } from '../api/payments';
import { errMsg } from '../api/client';
import { qk } from '../lib/queryKeys';
import { money, fmtCurrency } from '../lib/format';
import { Skeleton, Spinner, ErrorState } from './ui';

function PayPalWordmark({ className = '' }) {
  return (
    <span className={`font-display font-extrabold italic tracking-tight ${className}`} aria-hidden>
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009cde]">Pal</span>
    </span>
  );
}

/** Hero PayPal payment panel. Calls onPaid(order) after capture. */
export default function PayPalPay({ order, onPaid, onError }) {
  const cfg = useQuery({ queryKey: qk.payConfig, queryFn: getPaymentsConfig, staleTime: 5 * 60_000 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const reported = useRef(false);

  if (cfg.isLoading) return <Skeleton className="h-40 w-full" />;
  if (cfg.isError) return <ErrorState error={cfg.error} onRetry={cfg.refetch} title="PayPal is unavailable" />;
  const c = cfg.data;
  const fx = Number(c.fxInrToCurrency) || 0;
  const converted = c.currency === 'INR' ? order.totalINR : fx ? order.totalINR * fx : null;

  const fail = (e) => {
    reported.current = true;
    const m = errMsg(e, 'Payment failed');
    setErr(m);
    onError?.(m);
  };

  const simulate = async () => {
    setBusy(true);
    setErr('');
    try {
      const created = await createPayment(order._id);
      const paid = await capturePayment(order._id, created.paypalOrderId);
      onPaid(paid);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#009cde]/30 bg-gradient-to-br from-[#003087]/50 via-ink-900 to-[#009cde]/15 p-5">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#009cde]/20 blur-3xl pointer-events-none" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="rounded-lg bg-white px-2.5 py-1">
            <PayPalWordmark className="text-xl" />
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-fog-300">
            <Lock className="h-3 w-3" aria-hidden /> {c.mode === 'paypal' ? 'PayPal sandbox' : 'Sandbox simulation'}
          </span>
        </div>
        <p className="text-xs text-fog-400 mt-5">Amount to pay {order.supplier?.name ? `to ${order.supplier.name}` : ''}</p>
        <p className="font-display text-4xl font-bold tracking-tight">{money(order.totalINR)}</p>
        {converted != null && c.currency !== 'INR' && (
          <p className="text-sm text-[#7fd3f5] mt-0.5">
            ≈ {fmtCurrency(converted, c.currency)} <span className="text-fog-500">charged in {c.currency} · rate {fx} {c.currency}/INR</span>
          </p>
        )}
        {order.supplier?.paypalEmail && <p className="text-xs text-fog-500 mt-1">Payee: {order.supplier.paypalEmail}</p>}

        <div className="mt-5">
          {c.mode === 'paypal' ? (
            <PayPalScriptProvider options={{ clientId: c.clientId, currency: c.currency, intent: 'capture' }}>
              <div className="rounded-xl bg-white p-3">
                <PayPalButtons
                  style={{ layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' }}
                  forceReRender={[order._id, order.totalINR, c.currency]}
                  createOrder={async () => {
                    setErr('');
                    reported.current = false;
                    try {
                      const r = await createPayment(order._id);
                      return r.paypalOrderId;
                    } catch (e) {
                      fail(e);
                      throw e;
                    }
                  }}
                  onApprove={async (data) => {
                    setBusy(true);
                    try {
                      const paid = await capturePayment(order._id, data.orderID);
                      onPaid(paid);
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onCancel={() => setErr('Payment was cancelled in the PayPal window.')}
                  onError={(e) => { if (!reported.current) fail(e); }}
                />
              </div>
              {busy && <p className="text-sm text-fog-300 mt-2 flex items-center gap-2"><Spinner /> Capturing payment…</p>}
            </PayPalScriptProvider>
          ) : (
            <button
              onClick={simulate}
              disabled={busy}
              className="w-full rounded-full bg-[#ffc439] hover:bg-[#f2ba36] text-[#003087] font-bold py-3.5 font-display text-base flex items-center justify-center gap-2 transition shadow-[0_10px_40px_-10px_rgba(255,196,57,0.6)] disabled:opacity-60"
            >
              {busy ? <Spinner className="text-[#003087]" /> : null}
              {busy ? 'Processing…' : (
                <>
                  Pay with <PayPalWordmark className="text-lg" /> <span className="font-sans font-medium text-sm">(sandbox simulation)</span>
                </>
              )}
            </button>
          )}
        </div>
        {err && <p role="alert" className="text-sm text-rose-300 mt-3">{err}</p>}
        <p className="text-[11px] text-fog-500 mt-3 flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Test environment — no real money moves.
        </p>
      </div>
    </div>
  );
}

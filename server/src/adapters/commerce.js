/** Supplier ordering, mail and PayPal payment adapters. */
import nodemailer from 'nodemailer';
import { env, paypalEnabled } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { CircuitBreaker, fetchJson, withRetry } from './core.js';

// ---------------------------------------------------------------- Mailer
let transport = null;
export const Mailer = {
  async send({ to, subject, text }) {
    if (env.fixtureMode || !env.smtpUrl) {
      logger.info({ to, subject }, 'mail (log only)');
      return { delivered: false, channel: 'log' };
    }
    transport = transport || nodemailer.createTransport(env.smtpUrl);
    const info = await transport.sendMail({ from: 'PalProcure <orders@palprocure.dev>', to, subject, text });
    return { delivered: true, channel: 'email', messageId: info.messageId, preview: nodemailer.getTestMessageUrl(info) || null };
  },
};

// ---------------------------------------------------------------- SupplierAdapter
export function purchaseOrderText(order, supplier, vendor, products) {
  const lines = order.items.map((it) => {
    const p = products.get(String(it.productId));
    return `- ${p?.name || it.productId} (${p?.sku || ''}): ${it.qty} ${p?.unit || ''} @ Rs ${it.unitCost}`;
  });
  return [`Purchase order ${order._id}`, `From: ${vendor.shopName}, ${vendor.location?.city || ''}`, `To: ${supplier.name}`, '', ...lines, '', `Total: Rs ${order.totalINR}`, 'Please confirm delivery date.'].join('\n');
}
export const SupplierAdapter = {
  async placeOrder(order, supplier, vendor, products) {
    const text = purchaseOrderText(order, supplier, vendor, products);
    if (supplier.channel === 'email' && supplier.email) {
      return { channel: 'email', ...(await Mailer.send({ to: supplier.email, subject: `Purchase order from ${vendor.shopName}`, text })) };
    }
    logger.info({ orderId: String(order._id), supplier: supplier.name }, 'purchase order (log adapter)');
    return { channel: 'log', delivered: true };
  },
};

// ---------------------------------------------------------------- PayPal (Orders v2)
const ppBreaker = new CircuitBreaker('paypal');
const ppBase = () => (env.paypalEnv === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
let ppToken = null;

async function paypalToken() {
  if (ppToken && ppToken.exp > Date.now() + 60000) return ppToken.value;
  const basic = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64');
  const r = await fetchJson(`${ppBase()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  ppToken = { value: r.access_token, exp: Date.now() + r.expires_in * 1000 };
  return ppToken.value;
}

/** INR order total converted to the PayPal checkout currency (sandbox does not settle INR domestically). */
export const toCheckoutAmount = (inr) => Math.max(0.01, Math.round(inr * env.paypalFxInr * 100) / 100);

export const PaymentProvider = {
  mode: () => (paypalEnabled() ? 'paypal' : 'simulated'),
  config: () => ({ mode: PaymentProvider.mode(), clientId: paypalEnabled() ? env.paypalClientId : null, currency: env.paypalCurrency, fxInrToCurrency: env.paypalFxInr, environment: env.paypalEnv }),

  async createOrder(order, supplier) {
    const amount = toCheckoutAmount(order.totalINR);
    if (!paypalEnabled()) return { paypalOrderId: `SIM-${order._id}-${Date.now()}`, amount, currency: env.paypalCurrency, simulated: true };
    const token = await paypalToken();
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(order._id),
          description: `PalProcure purchase order for ${supplier?.name || 'supplier'}`.slice(0, 127),
          custom_id: String(order._id),
          amount: { currency_code: env.paypalCurrency, value: amount.toFixed(2) },
          ...(supplier?.paypalEmail ? { payee: { email_address: supplier.paypalEmail } } : {}),
        },
      ],
    };
    const r = await ppBreaker.exec(() =>
      withRetry(() => fetchJson(`${ppBase()}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `create-${order._id}-${order.updatedAt?.getTime?.() || ''}`.slice(0, 108) }, body: JSON.stringify(body) }), { retries: 1 }),
    );
    return { paypalOrderId: r.id, amount, currency: env.paypalCurrency };
  },

  async capture(paypalOrderId) {
    if (!paypalEnabled()) return { status: 'COMPLETED', captureId: `SIMCAP-${Date.now()}`, simulated: true };
    const token = await paypalToken();
    const r = await ppBreaker.exec(() =>
      // Prefer: return=representation guarantees purchase_units[].reference_id and captures in the response.
      fetchJson(`${ppBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', 'PayPal-Request-Id': `capture-${paypalOrderId}`.slice(0, 108) }, body: '{}' }),
    );
    const unit = r.purchase_units?.[0];
    const cap = unit?.payments?.captures?.[0];
    // The order can be COMPLETED while the capture itself is PENDING/DECLINED: the capture status is what counts.
    return { status: cap?.status || r.status, orderStatus: r.status, captureId: cap?.id, referenceId: unit?.reference_id, amount: cap?.amount ? Number(cap.amount.value) : undefined, currency: cap?.amount?.currency_code };
  },
};

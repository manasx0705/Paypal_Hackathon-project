import { CheckCircle2, AlertTriangle, XCircle, Clock, History, ShieldCheck, ShieldQuestion, Leaf, Send, Wallet, PackageCheck, Ban, FileEdit } from 'lucide-react';
import { Chip } from './ui';

export function StockChip({ status }) {
  if (status === 'out') return <Chip tone="bad" icon={XCircle}>Out of stock</Chip>;
  if (status === 'low') return <Chip tone="warn" icon={AlertTriangle}>Low</Chip>;
  return <Chip tone="ok" icon={CheckCircle2}>OK</Chip>;
}

/** Price labels — exactly "Expected" / "Already happened". */
export function LabelChip({ label }) {
  if (label === 'Already happened') return <Chip tone="bad" icon={History}>Already happened</Chip>;
  return <Chip tone="warn" icon={Clock}>Expected</Chip>;
}

export function VerifiedChip({ verified }) {
  return verified ? (
    <Chip tone="ok" icon={ShieldCheck} title="Confirmed against government mandi prices">
      Mandi-verified
    </Chip>
  ) : (
    <Chip tone="neutral" icon={ShieldQuestion} title="Not yet confirmed by mandi prices">
      Unverified
    </Chip>
  );
}

export function PerishableChip() {
  return (
    <Chip tone="info" icon={Leaf} title="Perishable item">
      Perishable
    </Chip>
  );
}

const ORDER = {
  draft: { tone: 'neutral', icon: FileEdit, label: 'Draft' },
  sent: { tone: 'info', icon: Send, label: 'Sent' },
  received: { tone: 'ok', icon: PackageCheck, label: 'Received' },
  cancelled: { tone: 'bad', icon: Ban, label: 'Cancelled' },
};
export function OrderStatusChip({ status }) {
  const o = ORDER[status] || ORDER.draft;
  return (
    <Chip tone={o.tone} icon={o.icon}>
      {o.label}
    </Chip>
  );
}
export function PaymentChip({ payment }) {
  return payment?.status === 'paid' ? (
    <Chip tone="ok" icon={Wallet}>
      Paid
    </Chip>
  ) : (
    <Chip tone="warn" icon={Wallet}>
      Unpaid
    </Chip>
  );
}

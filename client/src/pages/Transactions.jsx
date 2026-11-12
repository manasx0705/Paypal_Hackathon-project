import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, Receipt, ShoppingBag, Truck } from 'lucide-react';
import { listTx, createTx, updateTx, deleteTx } from '../api/transactions';
import { listProducts } from '../api/products';
import { errMsg, errCode } from '../api/client';
import { qk } from '../lib/queryKeys';
import { money, date, todayIST, toISTDateInput, num } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, Spinner, Tabs, useDebounced } from '../components/ui';

const priceKey = (kind) => (kind === 'sales' ? 'unitPrice' : 'unitCost');

function ProductPicker({ value, onChange, id }) {
  const [text, setText] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const d = useDebounced(text, 200);
  const q = useQuery({ queryKey: qk.products({ search: d, limit: 8, active: true }), queryFn: () => listProducts({ search: d, limit: 8, active: true }), enabled: open });
  const items = q.data?.items || [];
  const ref = useRef(null);
  useEffect(() => {
    if (!value) setText('');
  }, [value]);
  const pick = (p) => {
    onChange(p);
    setText(p.name);
    setOpen(false);
  };
  return (
    <div className="relative" ref={ref}>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Start typing a product…"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          if (e.key === 'Enter' && open && items[hi]) { e.preventDefault(); pick(items[hi]); }
        }}
      />
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 w-full rounded-xl glass-strong border border-white/10 max-h-64 overflow-y-auto shadow-2xl">
          {items.map((p, i) => (
            <li
              key={p._id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className={`px-3 py-2 text-sm cursor-pointer ${i === hi ? 'bg-saffron-400/15' : 'hover:bg-white/5'}`}
            >
              {p.name} <span className="text-fog-500 text-xs font-mono">{p.sku}</span>
              <span className="float-right text-xs text-fog-400">stock {num(p.currentStock)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickEntry({ kind }) {
  const qc = useQueryClient();
  const toast = useToast();
  const pk = priceKey(kind);
  const [f, setF] = useState({ date: todayIST(), product: null, qty: '', price: '' });
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: () =>
      createTx(kind, { productId: f.product._id, qty: Number(f.qty), [pk]: Number(f.price), date: new Date(`${f.date}T12:00:00+05:30`).toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [kind] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(`${kind === 'sales' ? 'Sale' : 'Purchase'} recorded`, { body: `${f.qty} × ${f.product.name}` });
      setF((s) => ({ ...s, product: null, qty: '', price: '' }));
      setError('');
    },
    onError: (e) => {
      const msg = errCode(e) === 'INSUFFICIENT_STOCK' ? `Not enough stock to sell that many. ${errMsg(e)}` : errMsg(e);
      setError(msg);
      toast.error('Could not save', { body: msg });
    },
  });
  return (
    <form
      className="grid grid-cols-2 md:grid-cols-[150px_1fr_110px_140px_auto] gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.product) return setError('Pick a product from the list.');
        m.mutate();
        return undefined;
      }}
      aria-label={`Quick ${kind === 'sales' ? 'sale' : 'purchase'} entry`}
    >
      <div>
        <label className="label" htmlFor={`${kind}-date`}>Date</label>
        <input id={`${kind}-date`} type="date" className="input" required max={todayIST()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className="label" htmlFor={`${kind}-product`}>Product</label>
        <ProductPicker
          id={`${kind}-product`}
          value={f.product}
          onChange={(p) => setF((s) => ({ ...s, product: p, price: p ? String(kind === 'sales' ? p.sellPrice ?? '' : p.costPrice ?? '') : s.price }))}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${kind}-qty`}>Quantity</label>
        <input id={`${kind}-qty`} type="number" min="0.01" step="any" required className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${kind}-price`}>{kind === 'sales' ? 'Unit price (₹)' : 'Unit cost (₹)'}</label>
        <input id={`${kind}-price`} type="number" min="0" step="0.01" required className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      </div>
      <button className="btn-primary col-span-2 md:col-span-1" disabled={m.isPending}>
        {m.isPending ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />} Add
      </button>
      {error && (
        <p role="alert" className="col-span-full text-sm text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}

function Row({ kind, r }) {
  const qc = useQueryClient();
  const toast = useToast();
  const pk = priceKey(kind);
  const [edit, setEdit] = useState(null);
  const inv = () => {
    qc.invalidateQueries({ queryKey: [kind] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const upd = useMutation({
    mutationFn: () => updateTx(kind, r._id, { qty: Number(edit.qty), [pk]: Number(edit.price), date: new Date(`${edit.date}T12:00:00+05:30`).toISOString() }),
    onSuccess: () => { inv(); setEdit(null); toast.success('Updated'); },
    onError: (e) => toast.error('Could not update', { body: errMsg(e) }),
  });
  const del = useMutation({
    mutationFn: () => deleteTx(kind, r._id),
    onSuccess: () => { inv(); toast.success('Deleted'); },
    onError: (e) => toast.error('Could not delete', { body: errMsg(e) }),
  });
  if (edit)
    return (
      <tr>
        <td><label className="sr-only" htmlFor={`d-${r._id}`}>Date</label><input id={`d-${r._id}`} type="date" className="input !py-1" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></td>
        <td>{r.product?.name}</td>
        <td><label className="sr-only" htmlFor={`q-${r._id}`}>Quantity</label><input id={`q-${r._id}`} type="number" className="input !py-1 w-24" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} /></td>
        <td><label className="sr-only" htmlFor={`p-${r._id}`}>Price</label><input id={`p-${r._id}`} type="number" step="0.01" className="input !py-1 w-28" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></td>
        <td />
        <td className="whitespace-nowrap">
          <button className="p-1.5 rounded hover:bg-white/10 text-teal-300" aria-label="Save" onClick={() => upd.mutate()} disabled={upd.isPending}><Check className="h-4 w-4" /></button>
          <button className="p-1.5 rounded hover:bg-white/10" aria-label="Cancel edit" onClick={() => setEdit(null)}><X className="h-4 w-4" /></button>
        </td>
      </tr>
    );
  const price = r[pk];
  return (
    <tr>
      <td className="whitespace-nowrap">{date(r.date)}</td>
      <td>
        <span className="font-medium">{r.product?.name || '—'}</span>
        <span className="block text-[11px] text-fog-500 font-mono">{r.product?.sku}</span>
      </td>
      <td className="font-mono">{num(r.qty, 2)} <span className="text-xs text-fog-500">{r.product?.unit}</span></td>
      <td className="font-mono">{money(price)}</td>
      <td className="font-mono text-right">{money((r.qty || 0) * (price || 0))}</td>
      <td className="whitespace-nowrap">
        <button className="p-1.5 rounded hover:bg-white/10" aria-label="Edit row" onClick={() => setEdit({ qty: r.qty, price, date: toISTDateInput(r.date) })}><Pencil className="h-4 w-4" /></button>
        <button className="p-1.5 rounded hover:bg-white/10 text-rose-300" aria-label="Delete row" onClick={() => window.confirm('Delete this record? Stock will be adjusted.') && del.mutate()} disabled={del.isPending}><Trash2 className="h-4 w-4" /></button>
      </td>
    </tr>
  );
}

function History({ kind }) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const limit = 20;
  const params = useMemo(() => {
    const p = { page, limit };
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [page, from, to]);
  const q = useQuery({ queryKey: qk.tx(kind, params), queryFn: () => listTx(kind, params), placeholderData: (p) => p });
  const items = q.data?.items || [];
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3 items-end">
        <div>
          <label className="label" htmlFor={`${kind}-from`}>From</label>
          <input id={`${kind}-from`} type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label" htmlFor={`${kind}-to`}>To</label>
          <input id={`${kind}-to`} type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>
      {q.isLoading ? (
        <SkeletonRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !items.length ? (
        <EmptyState icon={Receipt} title={`No ${kind} recorded`} body="Use the quick entry above, or import a CSV from your billing software." />
      ) : (
        <>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>{kind === 'sales' ? 'Unit price' : 'Unit cost'}</th>
                  <th className="text-right">Total</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => <Row key={r._id} kind={kind} r={r} />)}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={limit} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export default function Transactions() {
  useTitle('Sales & Purchases');
  const [kind, setKind] = useState('sales');
  return (
    <div>
      <PageHeader kicker="Ledger" title="Sales & Purchases" subtitle="Every sale lowers stock and every purchase raises it — the server keeps your inventory in sync." />
      <Tabs label="Ledger" value={kind} onChange={setKind} tabs={[{ value: 'sales', label: 'Sales', icon: ShoppingBag }, { value: 'purchases', label: 'Purchases', icon: Truck }]} />
      <div role="tabpanel" id={`panel-${kind}`} aria-labelledby={`tab-${kind}`} className="space-y-4 mt-4">
        <section className="card" aria-label="Quick entry">
          <h2 className="font-display font-semibold mb-3">Quick entry</h2>
          <QuickEntry key={kind} kind={kind} />
        </section>
        <section className="card" aria-label="History">
          <h2 className="font-display font-semibold mb-3">History</h2>
          <History key={kind} kind={kind} />
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck, Boxes, Archive, Pencil, Trash2, LineChart } from 'lucide-react';
import { listProducts, createProduct, updateProduct, deleteProduct, bulkDeactivate, getCategories } from '../api/products';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers';
import { getForecast } from '../api/forecasts';
import { errMsg } from '../api/client';
import { qk } from '../lib/queryKeys';
import { money, num, mapePct, pct } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { Drawer, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, SkeletonRows, Spinner, Tabs, StatLine, useDebounced, Chip } from '../components/ui';
import { StockChip, PerishableChip } from '../components/chips';
import { ForecastChart } from '../components/charts';
import { ExplainGrid } from '../components/explain';

const EMPTY = {
  sku: '', name: '', category: '', unit: 'pcs', perishable: false, shelfLifeDays: '', costPrice: '', sellPrice: '', currentStock: '',
  leadTimeDays: 3, packSize: 1, supplierId: '', isRegularStock: true, reorderPoint: '', safetyStock: '',
};
const NUMS = ['shelfLifeDays', 'costPrice', 'sellPrice', 'currentStock', 'leadTimeDays', 'packSize', 'reorderPoint', 'safetyStock'];

function toBody(f) {
  const b = { ...f };
  NUMS.forEach((k) => {
    if (b[k] === '' || b[k] == null) delete b[k];
    else b[k] = Number(b[k]);
  });
  if (!b.supplierId) delete b.supplierId;
  delete b._id;
  delete b.status;
  delete b.isActive;
  return b;
}

function ProductForm({ initial, onSubmit, busy, categories, suppliers }) {
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(toBody(f));
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name" id="p-name" required value={f.name} onChange={set('name')} />
        <Field label="SKU" id="p-sku" required value={f.sku} onChange={set('sku')} />
        <Field label="Category" id="p-cat" list="cat-list" required value={f.category} onChange={set('category')} />
        <datalist id="cat-list">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="Unit" id="p-unit" value={f.unit} onChange={set('unit')} hint="e.g. kg, pcs, pack" />
        <Field label="Cost price (₹)" id="p-cost" type="number" step="0.01" min="0" required value={f.costPrice} onChange={set('costPrice')} />
        <Field label="Sell price (₹)" id="p-sell" type="number" step="0.01" min="0" required value={f.sellPrice} onChange={set('sellPrice')} />
        <Field label="Current stock" id="p-stock" type="number" min="0" value={f.currentStock} onChange={set('currentStock')} />
        <Field label="Pack size" id="p-pack" type="number" min="1" value={f.packSize} onChange={set('packSize')} hint="Orders are rounded up to this" />
        <Field label="Lead time (days)" id="p-lead" type="number" min="0" value={f.leadTimeDays} onChange={set('leadTimeDays')} />
        <Field label="Supplier" id="p-sup" as="select" value={f.supplierId || ''} onChange={set('supplierId')}>
          <option value="">— none —</option>
          {suppliers.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Field>
        <Field label="Reorder point (optional)" id="p-rop" type="number" min="0" value={f.reorderPoint ?? ''} onChange={set('reorderPoint')} />
        <Field label="Safety stock (optional)" id="p-ss" type="number" min="0" value={f.safetyStock ?? ''} onChange={set('safetyStock')} />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.perishable} onChange={set('perishable')} className="accent-saffron-500 h-4 w-4" /> Perishable
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.isRegularStock} onChange={set('isRegularStock')} className="accent-saffron-500 h-4 w-4" /> Regular monthly stock
        </label>
      </div>
      {f.perishable && <Field label="Shelf life (days)" id="p-shelf" type="number" min="1" value={f.shelfLifeDays ?? ''} onChange={set('shelfLifeDays')} />}
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Spinner />} Save product
      </button>
    </form>
  );
}

function ForecastTab({ productId }) {
  const q = useQuery({ queryKey: qk.forecast(productId), queryFn: () => getForecast(productId) });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const f = q.data;
  if (f.method === 'insufficient_data')
    return (
      <EmptyState
        icon={LineChart}
        title="Not enough history yet"
        body={`We have ${f.history?.length || 0} month(s) of sales. Forecasts start after a few months — keep recording sales.`}
      />
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip tone="info">Method: {f.method}</Chip>
        <Chip tone={f.confidence === 'high' ? 'ok' : f.confidence === 'low' ? 'bad' : 'warn'}>Confidence: {f.confidence}</Chip>
        <Chip>MAPE {mapePct(f.mape)} vs naive {mapePct(f.naiveMape)}</Chip>
      </div>
      <ForecastChart forecast={f} />
      <div className="grid sm:grid-cols-2 gap-x-6">
        <StatLine label="Suggested order qty" value={num(f.orderQty)} />
        <StatLine label="Reorder point" value={num(f.reorderPoint, 1)} />
        <StatLine label="Safety stock" value={num(f.safetyStock, 1)} />
        <StatLine label="Growth rate" value={pct(f.growthRate)} />
      </div>
      <div>
        <h3 className="font-display font-semibold mb-2">The numbers</h3>
        <ExplainGrid explain={f.explain} />
      </div>
      {f.explain?.steps?.length > 0 && (
        <div>
          <h3 className="font-display font-semibold mb-2">Step by step</h3>
          <ol className="space-y-1.5 list-decimal list-inside">
            {f.explain.steps.map((s, i) => (
              <li key={i} className="text-xs font-mono text-fog-200 bg-white/[0.03] rounded-lg px-3 py-2">
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function SuppliersDialog({ open, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.suppliers, queryFn: listSuppliers, enabled: open });
  const blank = { name: '', phone: '', email: '', paypalEmail: '', defaultLeadTimeDays: 3, channel: 'email' };
  const [edit, setEdit] = useState(null);
  const inv = () => qc.invalidateQueries({ queryKey: qk.suppliers });
  const save = useMutation({
    mutationFn: (s) => {
      const body = { ...s, defaultLeadTimeDays: Number(s.defaultLeadTimeDays) || 0 };
      delete body._id;
      return s._id ? updateSupplier(s._id, body) : createSupplier(body);
    },
    onSuccess: () => {
      inv();
      setEdit(null);
      toast.success('Supplier saved');
    },
    onError: (e) => toast.error('Could not save supplier', { body: errMsg(e) }),
  });
  const del = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      inv();
      toast.success('Supplier removed');
    },
    onError: (e) => toast.error('Could not delete', { body: errMsg(e) }),
  });
  const set = (k) => (e) => setEdit((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} title="Suppliers" wide>
      {edit ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(edit);
          }}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" id="s-name" required value={edit.name} onChange={set('name')} />
            <Field label="Phone" id="s-phone" value={edit.phone || ''} onChange={set('phone')} />
            <Field label="Email" id="s-email" type="email" value={edit.email || ''} onChange={set('email')} />
            <Field label="PayPal email" id="s-pp" type="email" value={edit.paypalEmail || ''} onChange={set('paypalEmail')} hint="Where PayPal payments for this supplier go" />
            <Field label="Default lead time (days)" id="s-lead" type="number" min="0" value={edit.defaultLeadTimeDays} onChange={set('defaultLeadTimeDays')} />
            <Field label="Order channel" id="s-ch" as="select" value={edit.channel} onChange={set('channel')} hint="Email sends the order; Log only records it">
              <option value="email">Email</option>
              <option value="log">Log only</option>
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Spinner />} Save supplier
            </button>
          </div>
        </form>
      ) : (
        <>
          <button className="btn-primary btn-sm mb-4" onClick={() => setEdit(blank)}>
            <Plus className="h-4 w-4" aria-hidden /> Add supplier
          </button>
          {q.isLoading ? (
            <SkeletonRows rows={3} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={q.refetch} />
          ) : !q.data?.length ? (
            <EmptyState icon={Truck} title="No suppliers yet" body="Add the distributors you buy from so approved items can become orders." />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>PayPal</th>
                    <th>Lead</th>
                    <th>Channel</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((s) => (
                    <tr key={s._id}>
                      <td className="font-medium">{s.name}</td>
                      <td className="text-xs text-fog-400">
                        {s.email}
                        <br />
                        {s.phone}
                      </td>
                      <td className="text-xs">{s.paypalEmail || '—'}</td>
                      <td>{s.defaultLeadTimeDays}d</td>
                      <td className="capitalize">{s.channel}</td>
                      <td className="whitespace-nowrap">
                        <button className="p-1.5 rounded hover:bg-white/10" aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-white/10 text-rose-300"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => window.confirm(`Delete supplier ${s.name}?`) && del.mutate(s._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function Inventory() {
  useTitle('Inventory');
  const qc = useQueryClient();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState('');
  const dSearch = useDebounced(search);
  const category = sp.get('category') || '';
  const status = sp.get('status') || '';
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('details');
  const [adding, setAdding] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const limit = 20;
  useEffect(() => setPage(1), [dSearch, category, status]);

  const params = useMemo(() => {
    const p = { page, limit, active: true };
    if (dSearch) p.search = dSearch;
    if (category) p.category = category;
    if (status) p.status = status;
    return p;
  }, [page, dSearch, category, status]);
  const q = useQuery({ queryKey: qk.products(params), queryFn: () => listProducts(params), placeholderData: (prev) => prev });
  const cats = useQuery({ queryKey: qk.categories, queryFn: getCategories });
  const sups = useQuery({ queryKey: qk.suppliers, queryFn: listSuppliers });
  const items = q.data?.items || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: qk.categories });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const create = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      invalidate();
      setAdding(false);
      toast.success('Product added');
    },
    onError: (e) => toast.error('Could not add product', { body: errMsg(e) }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }) => updateProduct(id, body),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Product updated');
    },
    onError: (e) => toast.error('Could not update', { body: errMsg(e) }),
  });
  const deact = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Product deactivated');
    },
    onError: (e) => toast.error('Could not deactivate', { body: errMsg(e) }),
  });
  const bulk = useMutation({
    mutationFn: bulkDeactivate,
    onSuccess: () => {
      invalidate();
      toast.success(`${selected.size} products deactivated`);
      setSelected(new Set());
    },
    onError: (e) => toast.error('Bulk deactivate failed', { body: errMsg(e) }),
  });

  const setFilter = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOnPage = items.length > 0 && items.every((p) => selected.has(p._id));

  return (
    <div>
      <PageHeader
        kicker="Stock room"
        title="Inventory"
        subtitle="Everything on your shelves, with live stock status and per-product demand forecasts."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setSuppliersOpen(true)}>
              <Truck className="h-4 w-4" aria-hidden /> Suppliers
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add product
            </button>
          </>
        }
      />
      <div className="card">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <label htmlFor="inv-search" className="sr-only">
              Search products
            </label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fog-500" aria-hidden />
            <input id="inv-search" className="input pl-9" placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor="inv-cat" className="sr-only">
              Category
            </label>
            <select id="inv-cat" className="input md:w-48" value={category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">All categories</option>
              {(cats.data || []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-status" className="sr-only">
              Stock status
            </label>
            <select id="inv-status" className="input md:w-40" value={status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="ok">OK</option>
              <option value="low">Low</option>
              <option value="out">Out of stock</option>
            </select>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 rounded-xl bg-saffron-400/10 border border-saffron-400/30 px-3 py-2 text-sm" role="status">
            <span>{selected.size} selected</span>
            <button className="btn-danger btn-sm" disabled={bulk.isPending} onClick={() => window.confirm(`Deactivate ${selected.size} products?`) && bulk.mutate([...selected])}>
              <Archive className="h-3.5 w-3.5" aria-hidden /> Deactivate selected
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
        {q.isLoading ? (
          <SkeletonRows rows={8} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : !items.length ? (
          <EmptyState
            icon={Boxes}
            title={dSearch || category || status ? 'No products match' : 'No products yet'}
            body={dSearch || category || status ? 'Try clearing the filters.' : 'Add products one by one or import a CSV.'}
            action={
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden /> Add product
              </button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin -mx-4 sm:mx-0">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className="accent-saffron-500 h-4 w-4"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            items.forEach((p) => (allOnPage ? n.delete(p._id) : n.add(p._id)));
                            return n;
                          })
                        }
                      />
                    </th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Stock</th>
                    <th>Status</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Margin</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <input type="checkbox" aria-label={`Select ${p.name}`} className="accent-saffron-500 h-4 w-4" checked={selected.has(p._id)} onChange={() => toggle(p._id)} />
                      </td>
                      <td>
                        <button className="text-left hover:underline" onClick={() => { setEditing(p); setTab('details'); }}>
                          <span className="font-medium">{p.name}</span>
                          <span className="block text-[11px] text-fog-500 font-mono">{p.sku}</span>
                        </button>
                        {p.perishable && <PerishableChip />}
                      </td>
                      <td className="text-fog-300">{p.category}</td>
                      <td className="text-right font-mono">
                        {num(p.currentStock)} <span className="text-fog-500 text-xs">{p.unit}</span>
                      </td>
                      <td>
                        <StockChip status={p.status} />
                      </td>
                      <td className="text-right font-mono">{money(p.costPrice)}</td>
                      <td className="text-right font-mono">{money(p.sellPrice)}</td>
                      <td className="text-right font-mono text-fog-300">{p.sellPrice ? pct((p.sellPrice - p.costPrice) / p.sellPrice, 0) : '—'}</td>
                      <td className="whitespace-nowrap">
                        <button className="p-1.5 rounded hover:bg-white/10" aria-label={`Forecast for ${p.name}`} onClick={() => { setEditing(p); setTab('forecast'); }}>
                          <LineChart className="h-4 w-4 text-teal-300" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/10" aria-label={`Edit ${p.name}`} onClick={() => { setEditing(p); setTab('details'); }}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={limit} total={q.data.total} onPage={setPage} />
          </>
        )}
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.name || 'Product'} width="max-w-2xl">
        {editing && (
          <div className="space-y-5">
            <Tabs
              label="Product"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'details', label: 'Details', icon: Pencil },
                { value: 'forecast', label: 'Forecast', icon: LineChart },
              ]}
            />
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'details' ? (
                <>
                  <ProductForm
                    key={editing._id}
                    initial={editing}
                    categories={cats.data || []}
                    suppliers={sups.data || []}
                    busy={update.isPending}
                    onSubmit={(body) => update.mutate({ id: editing._id, body })}
                  />
                  <button className="btn-ghost w-full mt-3 text-rose-300" onClick={() => window.confirm('Deactivate this product?') && deact.mutate(editing._id)}>
                    <Archive className="h-4 w-4" aria-hidden /> Deactivate product
                  </button>
                </>
              ) : (
                <ForecastTab productId={editing._id} />
              )}
            </div>
          </div>
        )}
      </Drawer>
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add product">
        <ProductForm initial={EMPTY} categories={cats.data || []} suppliers={sups.data || []} busy={create.isPending} onSubmit={(b) => create.mutate(b)} />
      </Drawer>
      <SuppliersDialog open={suppliersOpen} onClose={() => setSuppliersOpen(false)} />
    </div>
  );
}

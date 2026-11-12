import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, HelpCircle, Clock, History, Flame, FlaskConical } from 'lucide-react';
import { updateMe, deleteMe } from '../api/auth';
import { errMsg } from '../api/client';
import { money0 } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { STATES } from '../lib/locations';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Field, Modal, PageHeader, Spinner, Toggle } from '../components/ui';

export default function Settings() {
  useTitle('Settings');
  const { vendor, setVendor, logout } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(null);
  const [delOpen, setDelOpen] = useState(false);
  const [pw, setPw] = useState('');

  useEffect(() => {
    if (vendor && !f)
      setF({
        name: vendor.name || '',
        shopName: vendor.shopName || '',
        location: { state: 'Maharashtra', district: 'Pune', city: '', pincode: '', ...(vendor.location || {}) },
        settings: { autoOrderEnabled: false, weeklySpendCapINR: 5000, maxQtyMultiplier: 1.5, trendMinScore: 50, lowStockNotify: true, deadStockMonths: 3, emailDigest: false, ...(vendor.settings || {}) },
      });
  }, [vendor, f]);

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        ...f,
        settings: { ...f.settings, weeklySpendCapINR: Number(f.settings.weeklySpendCapINR), maxQtyMultiplier: Number(f.settings.maxQtyMultiplier), trendMinScore: Number(f.settings.trendMinScore) },
      }),
    onSuccess: (v) => {
      setVendor(v);
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error('Could not save', { body: errMsg(e) }),
  });
  const del = useMutation({
    mutationFn: () => deleteMe(pw),
    onSuccess: async () => {
      toast.info('Account deleted');
      await logout();
    },
    onError: (e) => toast.error('Could not delete account', { body: errMsg(e) }),
  });

  if (!f) return null;
  const s = f.settings;
  const setS = (k, v) => setF((x) => ({ ...x, settings: { ...x.settings, [k]: v } }));
  const setL = (k, v) => setF((x) => ({ ...x, location: { ...x.location, [k]: v } }));
  const districts = STATES[f.location.state] || [f.location.district].filter(Boolean);

  return (
    <div className="max-w-4xl">
      <PageHeader kicker="Your shop" title="Settings" subtitle="Tune how bold the co-pilot is allowed to be." />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <section className="card space-y-4" aria-labelledby="prof-h">
          <h2 id="prof-h" className="font-display font-semibold">Profile & location</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Your name" id="st-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Field label="Shop name" id="st-shop" value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value })} />
            <Field label="State" id="st-state" as="select" value={f.location.state} onChange={(e) => setF((x) => ({ ...x, location: { ...x.location, state: e.target.value, district: (STATES[e.target.value] || [''])[0] } }))}>
              {!STATES[f.location.state] && <option>{f.location.state}</option>}
              {Object.keys(STATES).map((st) => <option key={st}>{st}</option>)}
            </Field>
            <Field label="District" id="st-district" as="select" value={f.location.district} onChange={(e) => setL('district', e.target.value)}>
              {!districts.includes(f.location.district) && <option>{f.location.district}</option>}
              {districts.map((d) => <option key={d}>{d}</option>)}
            </Field>
            <Field label="City / area" id="st-city" value={f.location.city || ''} onChange={(e) => setL('city', e.target.value)} />
            <Field label="Pincode" id="st-pin" inputMode="numeric" value={f.location.pincode || ''} onChange={(e) => setL('pincode', e.target.value)} />
          </div>
          <p className="text-xs text-fog-500">Your location decides which mandi prices and regional price alerts apply to you.</p>
        </section>

        <section className="card space-y-5" aria-labelledby="ag-h">
          <h2 id="ag-h" className="font-display font-semibold">Agent behaviour</h2>
          <Toggle
            id="st-auto"
            checked={s.autoOrderEnabled}
            onChange={(v) => setS('autoOrderEnabled', v)}
            label="Auto-order monthly essentials"
            description="When on, the agent may place orders for main-cart essentials by itself — but only up to your weekly cap. Social finds and price alerts are never auto-ordered."
          />
          <div>
            <Field label="Weekly spend cap (₹)" id="st-cap" type="number" min="0" step="100" value={s.weeklySpendCapINR} onChange={(e) => setS('weeklySpendCapINR', e.target.value)} hint={`The agent will never auto-order more than ${money0(s.weeklySpendCapINR)} in any 7 days.`} />
          </div>
          <div>
            <label className="label" htmlFor="st-mult">Quantity multiplier: ×{Number(s.maxQtyMultiplier).toFixed(1)}</label>
            <input id="st-mult" type="range" min="1" max="3" step="0.1" value={s.maxQtyMultiplier} onChange={(e) => setS('maxQtyMultiplier', e.target.value)} className="w-full accent-saffron-500" />
            <p className="text-xs text-fog-400 mt-1">
              In plain words: if the forecast says you need 10, you’ll be allowed to order up to {Math.round(10 * s.maxQtyMultiplier)} — never more. Lower is safer; higher gives you room to stock up.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="st-trend">Minimum trend score: {s.trendMinScore}</label>
            <input id="st-trend" type="range" min="0" max="100" step="5" value={s.trendMinScore} onChange={(e) => setS('trendMinScore', Number(e.target.value))} className="w-full accent-teal-400" />
            <p className="text-xs text-fog-400 mt-1">Only trends scoring at least this much appear in your Social media finds cart.</p>
          </div>
        </section>

        <section className="card space-y-4" aria-labelledby="nt-h">
          <h2 id="nt-h" className="font-display font-semibold">Notifications</h2>
          <Toggle id="st-low" checked={s.lowStockNotify} onChange={(v) => setS('lowStockNotify', v)} label="Low-stock alerts" description="Ping me when a product drops below its reorder point." />
          <Toggle id="st-digest" checked={s.emailDigest} onChange={(v) => setS('emailDigest', v)} label="Weekly email digest" description="A Monday summary of sales, suggestions and alerts." />
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button className="btn-primary shadow-2xl" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save className="h-4 w-4" aria-hidden />} Save settings
          </button>
        </div>
      </form>

      <section className="card mt-6 space-y-4" aria-labelledby="help-h">
        <h2 id="help-h" className="font-display font-semibold flex items-center gap-2"><HelpCircle className="h-4 w-4 text-teal-300" aria-hidden /> Help</h2>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="font-semibold flex items-center gap-1.5"><Clock className="h-4 w-4 text-saffron-300" aria-hidden /> Expected</p>
            <p className="text-fog-400 mt-1">News suggests a price rise is coming but it hasn’t hit the market yet. Buying a little ahead can save money (except perishables).</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="font-semibold flex items-center gap-1.5"><History className="h-4 w-4 text-rose-300" aria-hidden /> Already happened</p>
            <p className="text-fog-400 mt-1">The price has already gone up in mandis. Buying ahead won’t help — review your selling price instead.</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="font-semibold flex items-center gap-1.5"><Flame className="h-4 w-4 text-saffron-300" aria-hidden /> Why social items are suggestions only</p>
            <p className="text-fog-400 mt-1">Online buzz doesn’t always mean customers in your area will buy. So trend items are never auto-ordered, and you approve each one individually.</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="font-semibold flex items-center gap-1.5"><FlaskConical className="h-4 w-4 text-teal-300" aria-hidden /> Trial quantity</p>
            <p className="text-fog-400 mt-1">A deliberately small first order to test whether a trend sells in your shop. If it sells, the agent will suggest more next time.</p>
          </div>
        </div>
      </section>

      <section className="card mt-6 border-rose-400/30" aria-labelledby="dz-h">
        <h2 id="dz-h" className="font-display font-semibold text-rose-300">Danger zone</h2>
        <p className="text-sm text-fog-400 mt-1">Delete your account and all shop data permanently.</p>
        <button className="btn-danger mt-3" onClick={() => setDelOpen(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete account</button>
      </section>
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete account">
        <form onSubmit={(e) => { e.preventDefault(); del.mutate(); }} className="space-y-4">
          <p className="text-sm text-fog-300">This cannot be undone. Enter your password to confirm.</p>
          <Field label="Password" id="del-pw" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn-danger w-full" disabled={!pw || del.isPending}>{del.isPending ? <Spinner /> : <Trash2 className="h-4 w-4" aria-hidden />} Permanently delete</button>
        </form>
      </Modal>
    </div>
  );
}

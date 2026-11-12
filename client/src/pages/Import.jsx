import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, Upload, FileCheck2, CheckCircle2, Boxes, ShoppingBag, Truck, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { downloadTemplate, dryRun, commitImport } from '../api/imports';
import { errMsg } from '../api/client';
import { useTitle } from '../lib/useTitle';
import { useToast } from '../hooks/useToast';
import { PageHeader, Spinner, Chip } from '../components/ui';

const TYPES = [
  { value: 'products', label: 'Products', icon: Boxes, body: 'Your catalogue: SKU, name, category, prices, stock.' },
  { value: 'sales', label: 'Sales', icon: ShoppingBag, body: 'Past sales from your billing app.' },
  { value: 'purchases', label: 'Purchases', icon: Truck, body: 'Stock you bought from suppliers.' },
];
const STEPS = ['Choose type', 'Upload', 'Preview', 'Done'];

export default function ImportPage() {
  useTitle('Import');
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [type, setType] = useState('products');
  const [file, setFile] = useState(null);
  const [dry, setDry] = useState(null);
  const [result, setResult] = useState(null);
  const [dl, setDl] = useState(false);

  const dr = useMutation({
    mutationFn: () => dryRun(type, file),
    onSuccess: (d) => { setDry(d); setStep(2); },
    onError: (e) => toast.error('Dry run failed', { body: errMsg(e) }),
  });
  const cm = useMutation({
    mutationFn: () => commitImport(dry.importId),
    onSuccess: (d) => {
      setResult(d);
      setStep(3);
      ['products', 'sales', 'purchases', 'analytics', 'categories', 'data-quality'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Imported ${d.inserted} rows`);
    },
    onError: (e) => toast.error('Commit failed', { body: errMsg(e) }),
  });
  const reset = () => { setStep(0); setFile(null); setDry(null); setResult(null); };
  const cols = dry?.preview?.[0] ? Object.keys(dry.preview[0]).slice(0, 8) : [];

  return (
    <div>
      <PageHeader kicker="Bring your data" title="Import" subtitle="Upload a CSV, preview every row before anything is saved, then commit." />
      <ol className="flex flex-wrap gap-2 mb-6" aria-label="Import progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={clsx('flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border', i === step ? 'border-saffron-400 bg-saffron-400/10 text-fog-100' : i < step ? 'border-teal-400/40 text-teal-300' : 'border-white/10 text-fog-500')}>
            {i < step ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <span className="font-mono text-xs">{i + 1}</span>}
            {s}
          </li>
        ))}
      </ol>

      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="card">
        {step === 0 && (
          <fieldset>
            <legend className="font-display font-semibold mb-3">What are you importing?</legend>
            <div className="grid sm:grid-cols-3 gap-3">
              {TYPES.map((t) => (
                <label key={t.value} className={clsx('cursor-pointer rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-saffron-400', type === t.value ? 'border-saffron-400 bg-saffron-400/10' : 'border-white/10 hover:border-white/25')}>
                  <input type="radio" className="sr-only" name="itype" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
                  <t.icon className="h-6 w-6 text-saffron-300" aria-hidden />
                  <span className="block font-semibold mt-2">{t.label}</span>
                  <span className="block text-xs text-fog-400 mt-1">{t.body}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                className="btn-ghost"
                disabled={dl}
                onClick={async () => {
                  setDl(true);
                  try { await downloadTemplate(type); } catch (e) { toast.error('Download failed', { body: errMsg(e) }); } finally { setDl(false); }
                }}
              >
                {dl ? <Spinner /> : <Download className="h-4 w-4" aria-hidden />} Download {type} template
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep(1)}>
                Next <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div>
            <h2 className="font-display font-semibold mb-3">Upload your {type} CSV</h2>
            <label
              htmlFor="import-file"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 hover:border-saffron-400/60 p-10 text-center cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
            >
              <Upload className="h-8 w-8 text-saffron-300" aria-hidden />
              <span className="font-semibold">{file ? file.name : 'Drop a CSV here or click to choose'}</span>
              <span className="text-xs text-fog-500">{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Max a few thousand rows'}</span>
            </label>
            <input id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="flex gap-3 mt-5">
              <button className="btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button className="btn-primary" disabled={!file || dr.isPending} onClick={() => dr.mutate()}>
                {dr.isPending ? <Spinner /> : <FileCheck2 className="h-4 w-4" aria-hidden />} Check file (dry run)
              </button>
            </div>
          </div>
        )}

        {step === 2 && dry && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Total rows', dry.counts?.total, 'text-fog-100'],
                ['Valid', dry.counts?.valid, 'text-teal-300'],
                ['Errors', dry.counts?.errors, 'text-rose-300'],
                ['Duplicates', dry.counts?.duplicates, 'text-saffron-300'],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                  <p className="text-xs text-fog-400">{l}</p>
                  <p className={clsx('font-display text-2xl font-bold', c)}>{v ?? 0}</p>
                </div>
              ))}
            </div>
            {dry.errors?.length > 0 && (
              <section>
                <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden /> Rows with errors (they will be skipped)</h3>
                <div className="overflow-x-auto max-h-64 scrollbar-thin">
                  <table className="table">
                    <thead><tr><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
                    <tbody>
                      {dry.errors.map((e, i) => (
                        <tr key={i}><td className="font-mono">{e.row}</td><td className="font-mono">{e.field}</td><td className="text-rose-200">{e.message}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {dry.categorySuggestions?.length > 0 && (
              <section>
                <h3 className="font-display font-semibold mb-2">Category suggestions</h3>
                <p className="text-xs text-fog-400 mb-2">Some rows had no or unknown category — here’s what we’d file them under.</p>
                <ul className="flex flex-wrap gap-2">
                  {dry.categorySuggestions.map((s) => (
                    <li key={`${s.row}-${s.sku}`}><Chip tone="info">Row {s.row}: {s.name || s.sku} → {s.suggested}</Chip></li>
                  ))}
                </ul>
              </section>
            )}
            {cols.length > 0 && (
              <section>
                <h3 className="font-display font-semibold mb-2">Preview</h3>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="table">
                    <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>
                      {dry.preview.slice(0, 10).map((r, i) => (
                        <tr key={i}>{cols.map((c) => <td key={c} className="font-mono text-xs">{typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" disabled={!dry.counts?.valid || cm.isPending} onClick={() => cm.mutate()}>
                {cm.isPending ? <Spinner /> : <CheckCircle2 className="h-4 w-4" aria-hidden />} Import {dry.counts?.valid ?? 0} valid rows
              </button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="text-center py-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="mx-auto h-16 w-16 rounded-full bg-teal-400/15 grid place-items-center">
              <CheckCircle2 className="h-9 w-9 text-teal-300" aria-hidden />
            </motion.div>
            <h2 className="font-display text-2xl font-bold mt-4">Import complete</h2>
            <p className="text-fog-400 mt-1">
              {result.inserted} {result.type} inserted · {result.skipped} skipped
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden /> Import another file</button>
              <Link className="btn-primary" to={result.type === 'products' ? '/inventory' : '/transactions'}>View data</Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

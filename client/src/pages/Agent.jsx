import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bot, Cpu, CheckCircle2, XCircle, Clock, Sparkles, Coins, ChevronDown, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { listRuns, getRun } from '../api/agent';
import { qk } from '../lib/queryKeys';
import { dateTime, num } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useAgentRun } from '../hooks/useAgentRun';
import { Chip, EmptyState, ErrorState, PageHeader, SkeletonRows, Spinner } from '../components/ui';

function summarize(v, max = 160) {
  if (v == null) return '—';
  let s;
  if (typeof v === 'string') s = v;
  else if (Array.isArray(v)) s = `[${v.length} item${v.length === 1 ? '' : 's'}] ${JSON.stringify(v.slice(0, 2))}`;
  else s = JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function ModeBadge({ mode }) {
  return mode === 'llm' ? (
    <Chip tone="warn" icon={Sparkles} title="Large language model reasoning">LLM · Groq</Chip>
  ) : (
    <Chip tone="info" icon={Cpu} title="Deterministic rules, zero tokens">Rules · deterministic, 0 tokens</Chip>
  );
}

function RunStatus({ status }) {
  if (status === 'done') return <Chip tone="ok" icon={CheckCircle2}>Done</Chip>;
  if (status === 'failed') return <Chip tone="bad" icon={XCircle}>Failed</Chip>;
  return <Chip tone="warn" icon={Loader2}>Running</Chip>;
}

function Step({ s, i }) {
  const [open, setOpen] = useState(false);
  const errorText = !s.ok ? s.output?.error?.message || s.output?.error || s.output?.message || (typeof s.output === 'string' ? s.output : null) : null;
  return (
    <motion.li initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.06, 1.2) }} className="relative pl-10">
      <span className={clsx('absolute left-0 top-1 h-7 w-7 rounded-full grid place-items-center border-2 bg-ink-900', s.ok ? 'border-teal-400 text-teal-300' : 'border-rose-400 text-rose-300')}>
        {s.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
      </span>
      <div className={clsx('rounded-xl border p-3', s.ok ? 'border-white/5 bg-white/[0.02]' : 'border-rose-400/30 bg-rose-500/[0.05]')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-fog-500">#{i + 1}</span>
          <span className="font-mono font-semibold text-saffron-200">{s.tool}</span>
          {s.ok ? <Chip tone="ok">ok</Chip> : <Chip tone="bad">rejected</Chip>}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-fog-500"><Clock className="h-3 w-3" aria-hidden />{num(s.ms)} ms</span>
        </div>
        {errorText && <p className="text-sm text-rose-200 mt-2">Rule: {String(errorText)}</p>}
        <p className="text-xs text-fog-400 mt-2 font-mono break-all"><span className="text-fog-500">in:</span> {summarize(s.input)}</p>
        <p className="text-xs text-fog-300 mt-1 font-mono break-all"><span className="text-fog-500">out:</span> {summarize(s.output)}</p>
        <button className="text-[11px] text-teal-300 mt-2 inline-flex items-center gap-1" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Raw JSON <ChevronDown className={clsx('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <pre className="mt-2 text-[11px] bg-ink-950/80 rounded-lg p-2 overflow-x-auto max-h-64 scrollbar-thin">{JSON.stringify({ input: s.input, output: s.output }, null, 2)}</pre>
        )}
      </div>
    </motion.li>
  );
}

function RunViewer({ id }) {
  const q = useQuery({
    queryKey: qk.run(id),
    queryFn: () => getRun(id),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false),
  });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const r = q.data;
  const steps = r.steps || [];
  const rejected = steps.filter((s) => !s.ok).length;
  const dur = r.finishedAt && r.startedAt ? (new Date(r.finishedAt) - new Date(r.startedAt)) / 1000 : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={r.mode} />
        <RunStatus status={r.status} />
        <Chip>trigger: {r.trigger}</Chip>
        <Chip icon={Coins} title="Tokens in / out">{r.mode === 'llm' ? `${num(r.tokensIn)} in · ${num(r.tokensOut)} out tokens` : '0 tokens'}</Chip>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[['Tool calls', steps.length], ['Rejected by rules', rejected], ['Duration', dur != null ? `${dur.toFixed(1)} s` : '—']].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <p className="text-[11px] text-fog-500">{l}</p>
            <p className="font-display text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      {r.summary && <p className="text-sm text-fog-200 rounded-xl border border-saffron-400/20 bg-saffron-400/[0.05] p-3">{r.summary}</p>}
      {r.error && <p role="alert" className="text-sm text-rose-300">{r.error}</p>}
      {!steps.length ? (
        <p className="text-sm text-fog-400">{r.status === 'running' ? 'Waiting for the first tool call…' : 'No tool calls recorded.'}</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-px before:bg-white/10" aria-label="Tool call timeline">
          {steps.map((s, i) => <Step key={i} s={s} i={i} />)}
          {r.status === 'running' && <li className="pl-10 text-sm text-fog-400 flex items-center gap-2"><Spinner /> thinking…</li>}
        </ol>
      )}
      <p className="text-xs text-fog-500">Started {dateTime(r.startedAt)}{r.finishedAt ? ` · finished ${dateTime(r.finishedAt)}` : ''}</p>
    </div>
  );
}

export default function Agent() {
  useTitle('Agent');
  const runs = useQuery({ queryKey: qk.runs, queryFn: listRuns, refetchInterval: (q) => (q.state.data?.some?.((r) => r.status === 'running') ? 3000 : false) });
  const [sel, setSel] = useState(null);
  const agent = useAgentRun();
  const list = runs.data || [];
  const current = sel || list[0]?._id;
  return (
    <div>
      <PageHeader
        kicker="Under the hood"
        title="Agent runs"
        subtitle="Every decision, every tool call, every rule that said no. Mode “LLM” uses GPT-OSS 120B on Groq; “Rules” is a deterministic engine that spends zero tokens."
        actions={<button className="btn-primary" onClick={agent.start} disabled={agent.running}>{agent.running ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />} Run agent now</button>}
      />
      {runs.isLoading ? (
        <SkeletonRows rows={6} />
      ) : runs.isError ? (
        <div className="card"><ErrorState error={runs.error} onRetry={runs.refetch} /></div>
      ) : !list.length ? (
        <div className="card"><EmptyState icon={Bot} title="The agent hasn’t run yet" body="Run it to fill your three carts with explained suggestions." action={<button className="btn-primary" onClick={agent.start}>Run agent now</button>} /></div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
          <nav className="card !p-2" aria-label="Past runs">
            <ul className="space-y-1 max-h-[70vh] overflow-y-auto scrollbar-thin">
              {list.map((r) => (
                <li key={r._id}>
                  <button
                    onClick={() => setSel(r._id)}
                    aria-current={current === r._id ? 'true' : undefined}
                    className={clsx('w-full text-left rounded-xl px-3 py-2.5 transition', current === r._id ? 'bg-saffron-400/10 border border-saffron-400/30' : 'hover:bg-white/5 border border-transparent')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{dateTime(r.startedAt)}</span>
                      {r.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-teal-300" aria-label="done" /> : r.status === 'failed' ? <XCircle className="h-4 w-4 text-rose-300" aria-label="failed" /> : <Loader2 className="h-4 w-4 animate-spin text-saffron-300" aria-label="running" />}
                    </div>
                    <p className="text-[11px] text-fog-500">{r.mode === 'llm' ? 'AI (Groq)' : r.mode === 'llm→rules' ? 'AI → rules fallback' : 'Rules'} · {r.trigger} · {r.steps?.length ?? 0} calls</p>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="card" aria-label="Run details">
            <RunViewer id={current} />
          </section>
        </div>
      )}
    </div>
  );
}

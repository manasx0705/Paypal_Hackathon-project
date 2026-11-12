import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, animate } from 'framer-motion';
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

export function FullScreenLoader({ label = 'Loading…' }) {
  return (
    <div className="min-h-screen grid place-items-center bg-ink-950" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-saffron-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-saffron-400 border-r-teal-400 animate-spin" />
        </div>
        <p className="text-sm text-fog-300 font-display">{label}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-lg bg-white/[0.06]', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function SkeletonRows({ rows = 6, label = 'Loading' }) {
  return (
    <div className="space-y-2" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4" data-testid="empty-state">
      <div className="h-14 w-14 rounded-2xl grid place-items-center bg-gradient-to-br from-saffron-500/20 to-teal-400/10 border border-white/10 mb-4">
        <Icon className="h-6 w-6 text-saffron-300" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="text-sm text-fog-400 mt-1 max-w-md">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }) {
  const msg = error?.response?.data?.error?.message || (error?.message === 'Network Error' ? 'Cannot reach the server.' : error?.message);
  return (
    <div className="flex flex-col items-center text-center py-10 px-4" role="alert" data-testid="error-state">
      <div className="h-14 w-14 rounded-2xl grid place-items-center bg-rose-500/10 border border-rose-400/30 mb-4">
        <AlertTriangle className="h-6 w-6 text-rose-400" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {msg && <p className="text-sm text-fog-400 mt-1 max-w-md">{msg}</p>}
      {onRetry && (
        <button className="btn-ghost mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

/** Wraps a react-query result into loading / error / empty / content states. */
export function QueryState({ q, skeleton, isEmpty, empty, children }) {
  if (q.isLoading) return skeleton || <SkeletonRows />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (isEmpty?.(q.data)) return empty;
  return children(q.data);
}

const TONES = {
  ok: 'bg-teal-400/10 text-teal-300 border-teal-400/30',
  warn: 'bg-saffron-400/10 text-saffron-300 border-saffron-400/30',
  bad: 'bg-rose-500/10 text-rose-300 border-rose-400/30',
  info: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
  neutral: 'bg-white/5 text-fog-300 border-white/10',
  violet: 'bg-violet-400/10 text-violet-300 border-violet-400/30',
};
export function Chip({ tone = 'neutral', icon: Icon, children, className, title }) {
  return (
    <span
      title={title}
      className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONES[tone], className)}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

export function PageHeader({ kicker, title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        {kicker && <p className="kicker mb-1">{kicker}</p>}
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-fog-400 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = 1.1 }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    const to = Number(value) || 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !el) {
      if (el) el.textContent = format(to);
      prev.current = to;
      return undefined;
    }
    const ctrl = animate(prev.current, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    prev.current = to;
    return () => ctrl.stop();
  }, [value, duration, format]);
  return <span ref={ref}>{format(0)}</span>;
}

/** Mouse-tilt card with a glare. */
export function TiltCard({ children, className, ...rest }) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [7, -7]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [0, 1], [-7, 7]), { stiffness: 200, damping: 18 });
  const glare = useTransform([x, y], ([a, b]) => `radial-gradient(circle at ${a * 100}% ${b * 100}%, rgba(255,184,77,0.18), transparent 55%)`);
  return (
    <motion.div
      {...rest}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => {
        x.set(0.5);
        y.set(0.5);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
      className={clsx('card relative overflow-hidden will-change-transform', className)}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: glare }} />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-xl', side = 'right' }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className={clsx('absolute top-0 bottom-0 w-full glass-strong border-white/10 flex flex-col', width, side === 'right' ? 'right-0 border-l' : 'left-0 border-r')}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button aria-label="Close" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={clsx('relative glass-strong border border-white/10 rounded-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin', wide ? 'max-w-3xl' : 'max-w-lg')}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 glass-strong z-10">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button aria-label="Close" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export const Field = forwardRef(function Field({ label, id, hint, error, as = 'input', children, className, ...rest }, ref) {
  const Comp = as;
  const fid = id || `f-${label?.toString().replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <Comp ref={ref} id={fid} className="input" aria-invalid={!!error} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest}>
        {children}
      </Comp>
      {hint && (
        <p id={`${fid}-hint`} className="text-[11px] text-fog-500 mt-1">
          {hint}
        </p>
      )}
      {error && <p className="text-[11px] text-rose-300 mt-1">{error}</p>}
    </div>
  );
});

export function Spinner({ className }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (n != null) {
      e.preventDefault();
      onChange(tabs[n].value);
      refs.current[n]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-2xl glass">
      {tabs.map((t, i) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={active}
            aria-controls={`panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx('relative px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition-colors', active ? 'text-ink-950' : 'text-fog-300 hover:text-fog-100')}
          >
            {active && <motion.span layoutId={`tab-pill-${label}`} className="absolute inset-0 rounded-xl bg-gradient-to-r from-saffron-400 to-saffron-500" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            <span className="relative inline-flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" aria-hidden />}
              {t.label}
              {t.count != null && (
                <span className={clsx('rounded-full px-1.5 text-[11px] min-w-[1.25rem]', active ? 'bg-ink-950/20' : 'bg-white/10')}>{t.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return (
    <nav className="flex items-center justify-between mt-4 text-sm text-fog-400" aria-label="Pagination">
      <span>
        Page {page} of {pages} · {total ?? 0} records
      </span>
      <div className="flex gap-2">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

export function Toggle({ checked, onChange, label, id, description }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fog-100 cursor-pointer">
          {label}
        </label>
        {description && <p className="text-xs text-fog-400 mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors border', checked ? 'bg-teal-400 border-teal-300' : 'bg-white/10 border-white/15')}
      >
        <motion.span layout className={clsx('absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export function StatLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0 text-sm">
      <span className="text-fog-400">{label}</span>
      <span className="font-mono text-fog-100 text-right">{value}</span>
    </div>
  );
}

export function ExtLink({ href, children, className }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('text-teal-300 hover:text-teal-200 underline underline-offset-2', className)}>
      {children}
    </a>
  );
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm text-fog-400 hover:text-fog-100 mb-4">
      ← {children}
    </Link>
  );
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const listItems = (d) => (Array.isArray(d) ? d : d?.items || []);

export const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } },
};

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

const Ctx = createContext(null);
let seq = 0;
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info, loading: Loader2 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t) => {
      const id = t.id ?? `t${++seq}`;
      setToasts((all) => [...all.filter((x) => x.id !== id), { ...t, id }].slice(-5));
      if (t.type !== 'loading') setTimeout(() => dismiss(id), t.duration ?? 5000);
      return id;
    },
    [dismiss],
  );
  const api = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, o = {}) => push({ type: 'success', title, ...o }),
      error: (title, o = {}) => push({ type: 'error', title, duration: 7000, ...o }),
      info: (title, o = {}) => push({ type: 'info', title, ...o }),
    }),
    [push, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60 }}
                role={t.type === 'error' ? 'alert' : 'status'}
                className={clsx(
                  'glass-strong relative overflow-hidden rounded-xl p-3 pr-9 shadow-2xl border',
                  t.type === 'success' && 'border-teal-400/40',
                  t.type === 'error' && 'border-rose-400/50',
                  t.type === 'loading' && 'border-saffron-400/40',
                  t.type === 'info' && 'border-white/10',
                )}
              >
                <div className="flex gap-3">
                  <Icon
                    aria-hidden
                    className={clsx(
                      'h-5 w-5 shrink-0 mt-0.5',
                      t.type === 'success' && 'text-teal-400',
                      t.type === 'error' && 'text-rose-400',
                      t.type === 'loading' && 'text-saffron-400 animate-spin',
                      t.type === 'info' && 'text-fog-300',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-sm text-fog-100">{t.title}</p>
                    {t.body && <p className="text-xs text-fog-300 mt-0.5">{t.body}</p>}
                    {t.link && (
                      <Link to={t.link.to} onClick={() => dismiss(t.id)} className="text-xs text-saffron-300 underline mt-1 inline-block">
                        {t.link.label}
                      </Link>
                    )}
                  </div>
                </div>
                {t.progress != null && (
                  <div className="mt-2 h-1 rounded bg-white/10 overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-saffron-500 to-teal-400" animate={{ width: `${t.progress}%` }} />
                  </div>
                )}
                <button
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                  className="absolute top-2 right-2 p-1 rounded text-fog-400 hover:text-fog-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

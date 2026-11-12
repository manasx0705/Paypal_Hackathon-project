import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';

const COLORS = ['#ffc439', '#009cde', '#2ee6d6', '#ff9f1c', '#ffffff', '#003087'];

export default function Celebration({ show, title = 'Payment captured!', body, onDone }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }).map((_, i) => ({
        x: (Math.random() - 0.5) * 900,
        y: (Math.random() - 0.8) * 700,
        r: Math.random() * 720 - 360,
        c: COLORS[i % COLORS.length],
        s: 6 + Math.random() * 8,
        d: Math.random() * 0.2,
      })),
    [],
  );
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onAnimationComplete={() => setTimeout(() => onDone?.(), 2600)}>
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
          {bits.map((b, i) => (
            <motion.span
              key={i}
              className="absolute rounded-sm"
              style={{ width: b.s, height: b.s * 0.5, background: b.c, left: '50%', top: '50%' }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: b.x, y: [0, b.y, b.y + 500], rotate: b.r, opacity: [1, 1, 0] }}
              transition={{ duration: 2.4, delay: b.d, ease: 'easeOut' }}
            />
          ))}
          <motion.div
            role="status"
            className="relative glass-strong border border-[#009cde]/40 rounded-3xl px-10 py-8 text-center"
            initial={{ scale: 0.5, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring' }} className="mx-auto h-16 w-16 rounded-full bg-[#009cde]/20 grid place-items-center">
              <CheckCircle2 className="h-10 w-10 text-[#4cc3f0]" aria-hidden />
            </motion.div>
            <p className="font-display text-2xl font-bold mt-4">{title}</p>
            {body && <p className="text-sm text-fog-300 mt-1">{body}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

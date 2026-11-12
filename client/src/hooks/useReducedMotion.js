import { useEffect, useState } from 'react';
const Q = '(prefers-reduced-motion: reduce)';
export function useReducedMotion() {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(Q).matches : false);
  const [r, setR] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(Q);
    const h = () => setR(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return r;
}

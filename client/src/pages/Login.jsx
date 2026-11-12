import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBasket, Trophy, Sofa, Sparkles, ArrowRight, LogIn } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { errMsg } from '../api/client';
import { useTitle } from '../lib/useTitle';
import Background from '../components/Background';
import Logo from '../components/Logo';
import { Field, Spinner } from '../components/ui';

const SHOPS = [
  { value: 'grocery', label: 'Grocery', sub: 'Kirana store, Pune', icon: ShoppingBasket },
  { value: 'sports', label: 'Sports', sub: 'Cricket & fitness', icon: Trophy },
  { value: 'furniture', label: 'Furniture', sub: 'Home & office', icon: Sofa },
];

export default function Login() {
  useTitle('Sign in');
  const { login, demo } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const dest = loc.state?.from || '/dashboard';
  const [shop, setShop] = useState('grocery');
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const go = async (kind) => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'demo') await demo(shop);
      else await login(form);
      toast.success(kind === 'demo' ? 'Welcome to the demo shop' : 'Welcome back');
      nav(dest, { replace: true });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative min-h-screen noise">
      <Background />
      <div className="relative z-10 min-h-screen grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12">
          <Link to="/">
            <Logo />
          </Link>
          <div>
            <p className="kicker">Agentic commerce</p>
            <h1 className="font-display text-5xl font-bold leading-tight mt-3">
              Stock what will sell.
              <br />
              <span className="text-gradient">Skip what won’t.</span>
            </h1>
            <p className="text-fog-400 mt-4 max-w-md">Forecasts, social trends and mandi-verified price alerts — turned into a cart you approve and pay with PayPal.</p>
          </div>
          <p className="text-xs text-fog-500">Demo data is synthetic. Nothing is really ordered.</p>
        </div>
        <div className="flex items-center justify-center p-4 sm:p-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
            <div className="lg:hidden">
              <Link to="/">
                <Logo />
              </Link>
            </div>
            <section className="card border-saffron-400/30 bg-gradient-to-br from-saffron-500/10 to-teal-400/5" aria-labelledby="demo-h">
              <h2 id="demo-h" className="font-display text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-saffron-400" aria-hidden /> Judges, start here
              </h2>
              <p className="text-sm text-fog-400 mt-1">Pick a seeded shop and jump straight in.</p>
              <fieldset className="mt-4">
                <legend className="sr-only">Demo shop type</legend>
                <div className="grid grid-cols-3 gap-2">
                  {SHOPS.map((s) => (
                    <label
                      key={s.value}
                      className={clsx(
                        'cursor-pointer rounded-xl border p-3 text-center transition focus-within:ring-2 focus-within:ring-saffron-400',
                        shop === s.value ? 'border-saffron-400 bg-saffron-400/10' : 'border-white/10 hover:border-white/25',
                      )}
                    >
                      <input type="radio" name="shop" value={s.value} checked={shop === s.value} onChange={() => setShop(s.value)} className="sr-only" />
                      <s.icon className={clsx('h-6 w-6 mx-auto', shop === s.value ? 'text-saffron-300' : 'text-fog-400')} aria-hidden />
                      <span className="block text-sm font-semibold mt-1">{s.label}</span>
                      <span className="block text-[10px] text-fog-500">{s.sub}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn-primary w-full mt-4 py-3.5 text-base" onClick={() => go('demo')} disabled={!!busy}>
                {busy === 'demo' ? <Spinner /> : <Sparkles className="h-5 w-5" aria-hidden />}
                Try the live demo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </section>

            <div className="flex items-center gap-3 text-xs text-fog-500">
              <span className="flex-1 h-px bg-white/10" /> or sign in to your shop <span className="flex-1 h-px bg-white/10" />
            </div>

            <form
              className="card space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                go('login');
              }}
            >
              <Field label="Email" id="login-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Field label="Password" id="login-password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              {error && (
                <p role="alert" className="text-sm text-rose-300">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-ghost w-full" disabled={!!busy}>
                {busy === 'login' ? <Spinner /> : <LogIn className="h-4 w-4" aria-hidden />} Sign in
              </button>
              <p className="text-sm text-center text-fog-400">
                New here?{' '}
                <Link to="/register" className="text-saffron-300 underline">
                  Create a shop account
                </Link>
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

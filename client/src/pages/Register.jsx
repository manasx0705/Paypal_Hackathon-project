import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { errMsg } from '../api/client';
import { useTitle } from '../lib/useTitle';
import { STATES, SHOP_TYPES } from '../lib/locations';
import Background from '../components/Background';
import Logo from '../components/Logo';
import { Field, Spinner } from '../components/ui';

export default function Register() {
  useTitle('Create account');
  const { register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', shopName: '', shopType: 'grocery', state: 'Maharashtra', district: 'Pune', city: '', pincode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const pwShort = f.password.length > 0 && f.password.length < 10;

  const submit = async (e) => {
    e.preventDefault();
    if (f.password.length < 10) return setError('Password must be at least 10 characters.');
    setBusy(true);
    setError('');
    try {
      await register({
        name: f.name,
        email: f.email,
        password: f.password,
        shopName: f.shopName,
        shopType: f.shopType,
        location: { state: f.state, district: f.district, city: f.city || f.district, pincode: f.pincode },
      });
      toast.success('Shop created — welcome aboard');
      nav('/dashboard', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="relative min-h-screen noise">
      <Background />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="card w-full max-w-2xl space-y-5">
          <div className="flex items-center justify-between">
            <Link to="/">
              <Logo />
            </Link>
            <Link to="/login" className="text-sm text-fog-400 hover:text-fog-100">
              Have an account? Sign in
            </Link>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Set up your shop</h1>
            <p className="text-sm text-fog-400">Takes a minute. You can import your products afterwards.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Your name" id="r-name" required value={f.name} onChange={set('name')} autoComplete="name" />
            <Field label="Email" id="r-email" type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
            <Field
              label="Password"
              id="r-pw"
              type="password"
              required
              minLength={10}
              value={f.password}
              onChange={set('password')}
              autoComplete="new-password"
              hint="At least 10 characters."
              error={pwShort ? `${10 - f.password.length} more character(s) needed` : undefined}
            />
            <Field label="Shop name" id="r-shop" required value={f.shopName} onChange={set('shopName')} />
            <Field label="Shop type" id="r-type" as="select" value={f.shopType} onChange={set('shopType')}>
              {SHOP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Field>
            <Field
              label="State"
              id="r-state"
              as="select"
              value={f.state}
              onChange={(e) => setF((s) => ({ ...s, state: e.target.value, district: STATES[e.target.value][0] }))}
            >
              {Object.keys(STATES).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Field>
            <Field label="District" id="r-district" as="select" value={f.district} onChange={set('district')}>
              {STATES[f.state].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Field>
            <Field label="City / area (optional)" id="r-city" value={f.city} onChange={set('city')} />
            <Field label="Pincode (optional)" id="r-pin" inputMode="numeric" pattern="[0-9]{6}" value={f.pincode} onChange={set('pincode')} hint="6 digits" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? <Spinner /> : <UserPlus className="h-4 w-4" aria-hidden />} Create account
          </button>
        </motion.form>
      </div>
    </div>
  );
}

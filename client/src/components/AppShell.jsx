import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Boxes, ReceiptIndianRupee, Upload, ShoppingCart, Flame, Siren, Package, Bot, Settings as SettingsIcon,
  Menu, X, Sparkles, LogOut, Cpu, Database, CreditCard,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useAgentRun } from '../hooks/useAgentRun';
import { getStatus } from '../api/system';
import { getCartCounts } from '../api/cart';
import { qk } from '../lib/queryKeys';
import Background from './Background';
import NotificationsBell from './NotificationsBell';
import { Chip, Spinner } from './ui';
import Logo from './Logo';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/transactions', label: 'Sales & Purchases', icon: ReceiptIndianRupee },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/cart', label: 'Cart', icon: ShoppingCart, badge: 'cart' },
  { to: '/trends', label: 'Trends', icon: Flame },
  { to: '/alerts', label: 'Alerts', icon: Siren },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/agent', label: 'Agent', icon: Bot },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function SideNav({ onNavigate }) {
  const { vendor, logout } = useAuth();
  const counts = useQuery({ queryKey: qk.cartCounts, queryFn: getCartCounts });
  const cartTotal = counts.data ? (counts.data.main || 0) + (counts.data.social || 0) + (counts.data.price || 0) : null;
  return (
    <div className="flex h-full flex-col">
      <Link to="/dashboard" className="flex items-center gap-2 px-5 py-5" onClick={onNavigate}>
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'text-fog-100' : 'text-fog-400 hover:text-fog-100 hover:bg-white/5')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-saffron-500/20 to-transparent border border-saffron-400/30"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <n.icon className={clsx('relative h-4 w-4', isActive && 'text-saffron-400')} aria-hidden />
                <span className="relative flex-1">{n.label}</span>
                {n.badge === 'cart' && cartTotal > 0 && (
                  <span className="relative rounded-full bg-teal-400 text-ink-950 text-[10px] font-bold px-1.5 py-0.5" aria-label={`${cartTotal} open cart items`}>
                    {cartTotal}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 p-3 rounded-xl glass">
        <p className="text-sm font-semibold truncate">{vendor?.name}</p>
        <p className="text-xs text-fog-400 truncate">{vendor?.email}</p>
        <button onClick={logout} className="mt-2 inline-flex items-center gap-1.5 text-xs text-fog-400 hover:text-rose-300">
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );
}

function ModeBadges() {
  const s = useQuery({ queryKey: qk.status, queryFn: getStatus, staleTime: 60_000 });
  if (!s.data) return null;
  const d = s.data;
  return (
    <div className="hidden lg:flex items-center gap-1.5">
      {d.fixtureMode && (
        <Chip tone="violet" icon={Database} title="Running on recorded fixture data (offline demo)">
          Fixture data
        </Chip>
      )}
      <Chip tone={d.agentMode === 'llm' ? 'warn' : 'info'} icon={Cpu} title={d.agentMode === 'llm' ? 'Agent plans with an LLM (GPT-OSS 120B on Groq)' : 'Deterministic rules, zero tokens'}>
        Agent: {d.agentMode === 'llm' ? 'AI (Groq)' : 'Rules'}
      </Chip>
      <Chip tone={d.paymentsMode === 'paypal' ? 'ok' : 'neutral'} icon={CreditCard} title="Payments mode">
        {d.paymentsMode === 'paypal' ? 'PayPal sandbox' : 'PayPal simulated'}
      </Chip>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const { vendor } = useAuth();
  const loc = useLocation();
  const agent = useAgentRun();
  return (
    <div className="relative min-h-screen noise">
      <Background />
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30 glass border-y-0 border-l-0">
        <SideNav />
      </aside>
      <AnimatePresence>
        {open && (
          <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 glass-strong border-r border-white/10"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            >
              <button aria-label="Close navigation" className="absolute top-4 right-3 p-2 rounded-lg hover:bg-white/10" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
              <SideNav onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="relative z-10 lg:pl-64">
        <header className="sticky top-0 z-20 glass border-x-0 border-t-0">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-16">
            <button aria-label="Open navigation" className="lg:hidden p-2 rounded-lg hover:bg-white/10" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold truncate">{vendor?.shopName}</p>
              <p className="text-[11px] text-fog-400 truncate capitalize">
                {vendor?.shopType} · {vendor?.location?.district || vendor?.location?.city}, {vendor?.location?.state}
              </p>
            </div>
            <ModeBadges />
            <button className="btn-primary !px-3 sm:!px-4" onClick={agent.start} disabled={agent.running} aria-busy={agent.running}>
              {agent.running ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
              <span className="hidden sm:inline">{agent.running ? 'Agent running…' : 'Refresh suggestions'}</span>
              <span className="sm:hidden sr-only">Refresh suggestions</span>
            </button>
            <NotificationsBell />
          </div>
        </header>
        <main className="px-3 sm:px-6 py-6 max-w-[1400px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

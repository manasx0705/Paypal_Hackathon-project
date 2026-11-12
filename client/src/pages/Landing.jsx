import { lazy, Suspense, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, ShoppingCart, Flame, Siren, LineChart, ShieldCheck, Brain, Wallet, CheckCircle2, Sparkles, Eye, Cpu, ClipboardCheck,
} from 'lucide-react';
import Logo from '../components/Logo';
import { useTitle } from '../lib/useTitle';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAuth } from '../hooks/useAuth';

const HeroScene = lazy(() => import('../three/HeroScene'));

const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
};

const WORDS = ['Forecasts.', 'Trends.', 'Price shocks.', 'Orders.', 'Payments.'];
// Ticker keyframes: hold on each word, then slide to the next (pure transform animation, no React re-renders).
const TICK_Y = [];
const TICK_T = [];
WORDS.forEach((_, i) => {
  const a = i / WORDS.length;
  const b = (i + 0.8) / WORDS.length;
  TICK_Y.push(`-${i * 2}rem`, `-${i * 2}rem`);
  TICK_T.push(a, b);
});
TICK_Y.push(`-${WORDS.length * 2}rem`); // duplicate of the first word, so the loop restart is seamless
TICK_T.push(1);

function Section({ kicker, title, children, id }) {
  return (
    <section id={id} className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <motion.p {...reveal} className="kicker mb-3">
        {kicker}
      </motion.p>
      <motion.h2 {...reveal} className="font-display text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
        {title}
      </motion.h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function Landing() {
  useTitle('AI purchasing co-pilot for Indian shops');
  const reduced = useReducedMotion();
  const { isAuthed } = useAuth();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const heroO = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const cta = isAuthed ? '/dashboard' : '/login';

  return (
    <div className="relative bg-ink-950 text-fog-100 overflow-x-hidden noise">
      <header className="fixed top-0 inset-x-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2" aria-label="Site">
            <a href="#how" className="hidden sm:inline text-sm text-fog-300 hover:text-fog-100 px-3">
              How it works
            </a>
            <Link to={cta} className="btn-ghost btn-sm">
              {isAuthed ? 'Open app' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section ref={heroRef} className="relative h-[100svh] min-h-[640px] w-full overflow-hidden">
        <div className="absolute inset-0 grid-lines [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
        <div className="absolute inset-0" aria-hidden>
          <Suspense fallback={<div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_50%,rgba(255,159,28,.25),transparent_50%)]" />}>
            <HeroScene reduced={reduced} />
          </Suspense>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/70 to-transparent pointer-events-none" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent pointer-events-none" aria-hidden />
        <motion.div style={reduced ? undefined : { y: heroY, opacity: heroO }} className="relative z-10 h-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col justify-center pointer-events-none">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="kicker mb-4">
            Mission control for your kirana
          </motion.p>
          <h1 className="font-display font-bold tracking-tight text-[13vw] sm:text-7xl lg:text-8xl leading-[0.92] max-w-4xl">
            {['Your', 'shop’s', 'AI'].map((w, i) => (
              <motion.span key={w} className="inline-block mr-[0.25em]" initial={{ opacity: 0, y: 60, rotateX: -60 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
                {w}
              </motion.span>
            ))}
            <br />
            <motion.span className="inline-block text-gradient" initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              purchasing <span className="whitespace-nowrap">co&#8209;pilot.</span>
            </motion.span>
          </h1>
          <div className="mt-6 h-8 overflow-hidden font-display text-xl sm:text-2xl text-fog-300" aria-hidden>
            <motion.div animate={reduced ? {} : { y: TICK_Y }} transition={{ duration: WORDS.length * 2, repeat: Infinity, ease: 'easeInOut', times: TICK_T }}>
              {[...WORDS, WORDS[0]].map((w, i) => (
                <div key={i} className="h-8">
                  {w} <span className="text-fog-500">Handled.</span>
                </div>
              ))}
            </motion.div>
          </div>
          <p className="mt-4 max-w-xl text-fog-300">
            PalProcure reads your sales, forecasts demand, spots social-media trends and verified price rises, then fills a cart you can approve — and pay suppliers with PayPal in one tap.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 pointer-events-auto">
            <Link to={cta} className="btn-primary text-base px-6 py-3">
              <Sparkles className="h-5 w-5" aria-hidden /> Try the live demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#carts" className="btn-ghost text-base px-6 py-3">
              See the three carts
            </a>
          </div>
        </motion.div>
      </section>

      {/* PROBLEM */}
      <Section kicker="The problem" title={<>63 million small shops still order from memory.</>} id="problem">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { k: '₹', t: 'Cash stuck in dead stock', b: 'Slow movers sit on shelves for months while best-sellers run out on Saturday.' },
            { k: '#', t: 'Trends move faster than suppliers', b: 'A cricketer endorses a bat on Instagram — by the time you notice, the wave is gone.' },
            { k: '↑', t: 'Price shocks hit without warning', b: 'Onion prices spike in mandis days before your distributor raises rates.' },
          ].map((c, i) => (
            <motion.div key={c.t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }} className="card">
              <span className="font-display text-4xl text-saffron-400">{c.k}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{c.t}</h3>
              <p className="mt-2 text-sm text-fog-400">{c.b}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* THREE CARTS */}
      <Section kicker="One agent, three carts" title={<>Every suggestion lands in the cart where it belongs.</>} id="carts">
        <div className="grid lg:grid-cols-3 gap-4">
          {[
            { icon: ShoppingCart, t: 'Main cart', tag: 'Can auto-order', tone: 'from-teal-400/25', b: 'Monthly essentials from your demand forecast. Optionally auto-ordered — but never past your weekly spend cap.', pts: ['Forecast + safety stock', 'Weekly cap enforced', 'Edit qty within limits'] },
            { icon: Flame, t: 'Social media finds', tag: 'Suggestions only', tone: 'from-saffron-400/25', b: 'Trends scored from news: who is talking, search growth, how many sources. Sponsored hype is penalised.', pts: ['Approve one at a time', 'Small trial quantities', 'Never auto-ordered'] },
            { icon: Siren, t: 'Prices', tag: 'Expected / Already happened', tone: 'from-rose-400/25', b: 'Price-rise warnings from news, verified against government mandi prices before they reach you.', pts: ['Mandi-verified badge', 'Perishables: warning only', 'Inferred supply chain shown'] },
          ].map((c, i) => (
            <motion.div key={c.t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }} whileHover={reduced ? {} : { y: -6 }} className={`card relative overflow-hidden bg-gradient-to-br ${c.tone} to-transparent`}>
              <c.icon className="h-8 w-8 text-fog-100" aria-hidden />
              <h3 className="mt-4 font-display text-2xl font-semibold">{c.t}</h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-saffron-300 mt-1">{c.tag}</p>
              <p className="mt-3 text-sm text-fog-300">{c.b}</p>
              <ul className="mt-4 space-y-1.5">
                {c.pts.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-teal-400" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* HOW THE AGENT DECIDES */}
      <Section kicker="How the agent decides" title={<>Tools, rules, and a paper trail — not a black box.</>} id="how">
        <ol className="relative border-l border-white/10 ml-3 space-y-8">
          {[
            { icon: LineChart, t: 'Forecast', b: 'Monthly demand per product with a confidence band, compared against a naive baseline so you know when to trust it.' },
            { icon: Brain, t: 'Reason with tools', b: 'An LLM agent (GPT-OSS 120B on Groq, or a zero-token rules engine) calls tools: read stock, read forecasts, read trends, propose cart items.' },
            { icon: ShieldCheck, t: 'Guardrails reject bad ideas', b: 'Every proposal is checked by hard rules — quantity bounds, spend cap, perishables — and rejections are logged with the reason.' },
            { icon: Eye, t: 'You see why', b: 'Each item carries the numbers it was built from, the forecast formula steps, and links to the evidence.' },
            { icon: ClipboardCheck, t: 'You approve', b: 'Approved items become draft supplier orders, grouped per supplier.' },
          ].map((s, i) => (
            <motion.li key={s.t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="pl-8 relative">
              <span className="absolute -left-[17px] top-0 h-8 w-8 rounded-full grid place-items-center bg-ink-850 border border-saffron-400/40">
                <s.icon className="h-4 w-4 text-saffron-300" aria-hidden />
              </span>
              <h3 className="font-display text-xl font-semibold">
                <span className="text-fog-500 font-mono text-sm mr-2">0{i + 1}</span>
                {s.t}
              </h3>
              <p className="text-fog-400 mt-1 max-w-2xl">{s.b}</p>
            </motion.li>
          ))}
        </ol>
      </Section>

      {/* EXPLAINABILITY */}
      <Section kicker="Explainability" title={<>Click “Why?” on anything.</>}>
        <motion.div {...reveal} className="card font-mono text-sm max-w-3xl">
          <p className="text-fog-400">// Toor dal 1kg — suggested 24 units</p>
          <p>dailyDemand = 1.9 units/day <span className="text-fog-500">(last 90 days, trend-adjusted)</span></p>
          <p>safetyStock = z(1.65) × σ(0.8) × √leadTime(4) = 2.6</p>
          <p>cover = 1.9 × (4 + 7) + 2.6 − currentStock(3) = 20.5</p>
          <p className="text-teal-300">orderQty = roundUp(20.5, packSize 12) = 24 ✓</p>
        </motion.div>
      </Section>

      {/* PAYPAL */}
      <Section kicker="Pay suppliers" title={<>Approve. Send. <span className="text-[#009cde]">Pay with PayPal.</span></>}>
        <div className="grid lg:grid-cols-2 gap-6 items-center">
          <motion.div {...reveal} className="space-y-3 text-fog-300">
            <p>Approved cart items become supplier orders. Send them by email, then pay in one tap through PayPal Checkout — amounts are converted from INR automatically, and the capture is recorded against the order.</p>
            <ul className="space-y-2">
              {['Draft → Sent → Paid → Received timeline', 'PayPal sandbox or simulated mode for demos', 'Receive partial deliveries line by line'].map((p) => (
                <li key={p} className="flex gap-2 items-center">
                  <Wallet className="h-4 w-4 text-[#009cde]" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...reveal} whileHover={reduced ? {} : { rotate: -1, scale: 1.02 }} className="card bg-gradient-to-br from-[#003087]/40 to-[#009cde]/10 border-[#009cde]/30">
            <p className="text-xs text-fog-400">Order #A41F2C · Shree Traders</p>
            <p className="font-display text-4xl font-bold mt-2">₹18,450.00</p>
            <p className="text-sm text-fog-400">≈ $221.40 USD</p>
            <div className="mt-6 rounded-full bg-[#ffc439] text-[#003087] font-bold text-center py-3 font-display">Pay with PayPal</div>
          </motion.div>
        </div>
      </Section>

      {/* CTA */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <motion.div {...reveal} className="card py-14 bg-gradient-to-br from-saffron-500/15 via-transparent to-teal-400/15">
          <Cpu className="h-10 w-10 mx-auto text-saffron-400" aria-hidden />
          <h2 className="font-display text-3xl sm:text-5xl font-bold mt-4">Take the co-pilot for a spin.</h2>
          <p className="text-fog-400 mt-3">Pick a grocery, sports or furniture shop with real-looking data. No sign-up.</p>
          <Link to={cta} className="btn-primary text-base px-8 py-3 mt-8">
            Try the live demo <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </motion.div>
      </section>
      <footer className="text-center text-xs text-fog-500 pb-10">PalProcure · Built for the PayPal hackathon · Prices in INR</footer>
    </div>
  );
}

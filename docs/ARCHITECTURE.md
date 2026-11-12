# Architecture

```
                         ┌──────────────────────────── React 18 + Vite (client/) ───────────────────────────┐
                         │ Landing (3D hero) · Dashboard · Inventory · Sales · Import · Cart(3 tabs)        │
                         │ Trends · Alerts · Orders + PayPal Buttons · Agent run viewer · Settings          │
                         └───────────────────────────────┬──────────────────────────────────────────────────┘
                                                         │ REST /api/v1 (JWT 15 min + rotating refresh cookie)
┌────────────────────────────────────────── Express API (server/) ─────────────────────────────────────────────┐
│ routes/        auth · data (products, suppliers, sales, purchases) · core (import, analytics, cart, agent,    │
│                orders, payments, trends, alerts, notifications, admin)                                       │
│ agent/         run.js  ── planner: LLM function-calling loop (Groq) | rules planner (0 tokens)            │
│                tools.js ── 9 tools; ALL business rules enforced here (caps, perishables, fit, dedupe)        │
│                audit.js ── independent rule checker (tests + npm run eval:agent)                             │
│ services/      inventory (forecast job, dead stock) · analytics ($dateTrunc, IST) · trends · market          │
│                orders (draft per supplier, guarded auto-order, receive, PayPal) · importer · notify          │
│ intelligence/  forecasting.js · trends.js · market.js   ← pure maths, unit-tested                            │
│ adapters/      llm (budget, schema-validated, fixtures) · data (RSS, Trends, mandi, news) ·                  │
│                commerce (PayPal Orders v2, supplier email/log, mailer) · core (breaker, retry, cache, quota) │
│ jobs/          node-cron (Asia/Kolkata) + Mongo locks + job_runs                                             │
└──────────────┬───────────────────────────────┬───────────────────────────────┬───────────────────────────────┘
               │                               │                               │
         MongoDB (Atlas / Docker /       Groq API (GPT-OSS 120B: extract, PayPal REST (sandbox):
         in-memory replica set)          GPT-OSS 120B: agent)            OAuth → Orders v2 create/capture
```

## Data flow

1. **Every 3 h — ingest:** RSS (+ optional news API) → Prompt Guard screen + one LLM extraction (GPT-OSS 20B on Groq) per *new* article (products, people, sponsored hint, own-words summary, optional market signal). The article text stays in memory only.
2. **Trend engine:** alias table → fuzzy match (≥90) → group mentions over 30 days → distinct notable people and distinct sources → search interest (batches of 4 + anchor, rescaled) → score = 100·(0.45·people/6 + 0.35·growth/3 + 0.20·sources/4) × 0.8 if sponsored → status, flags, taxonomy tags.
3. **Price engine:** extraction → merge by commodity/direction/status/region over 14 days → per vendor: region match → product-name match (with Hindi/Marathi synonyms) → mandi verification (7-day vs 30-day modal price, ±8 %) → capped quantities → `Expected` / `Already happened`.
4. **01:00 forecasts:** monthly IST series → Holt-Winters / Holt / mean-3 / naive (backtested) → safety stock, reorder point, order quantity → low/out-of-stock notifications.
5. **02:00 agent:** planner calls tools → `add_cart_item` validates every rule in code → optional guarded auto-order (main cart only, weekly cap) → supplier order (email/log) → vendor pays with PayPal → marks received → purchases + stock.
6. **03:00:** trend outcome evaluation (crossover = sold ≥ max(5, 25 % of trial) within 30 days), expiry, cleanup.

## Trust boundaries

- Article text, search results and LLM output are **untrusted data**. They only enter the LLM inside `<data>` blocks or as `tool` message content, never in the system prompt.
- The agent cannot pass a vendorId. Every tool executor is scoped to the run's vendor, and unknown fields are rejected.
- Social finds can be approved only through `PATCH /cart/:id` by the vendor (`approvedBy: 'vendor'`). Auto-order touches only main-cart, regular-stock items.

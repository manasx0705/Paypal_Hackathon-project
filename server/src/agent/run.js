/**
 * Agent orchestration. Two interchangeable planners drive the SAME rule-enforcing tools:
 *  - "llm":   Groq-hosted open model (LLM_MODEL_AGENT) with function calling, max 25 steps / 60 s.
 *  - "rules": a deterministic planner that costs zero tokens (used when no GROQ_API_KEY is set, when the daily budget is spent, or as an automatic fallback).
 */
import { env, llmEnabled } from '../config/env.js';
import { AgentRun, CartItem, Lock, Vendor } from '../models/index.js';
import { budgetLeft, rawChat } from '../adapters/llm.js';
import { autoOrder } from '../services/orders.js';
import { notify } from '../services/notify.js';
import { logger } from '../utils/logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from './prompt.js';
import { TOOL_DEFS, ToolError, executeTool } from './tools.js';

const MAX_STEPS = 25;
// LLM runs get 150 s so free-tier tokens-per-minute limits can reset between calls (see docs/DECISIONS.md).
const TIMEOUT_MS = 150000;
const KEEP_RECENT_TOOL_RESULTS = 6;
const CORE_TOOLS = new Set(['get_vendor_profile', 'get_reorder_candidates', 'get_trend_signals', 'get_price_alerts']);
const MAX_STORED_OUTPUT = 4000;

async function step(ctx, run, tool, input) {
  const t0 = Date.now();
  let output;
  let ok = true;
  try {
    output = await executeTool(ctx, tool, input);
  } catch (e) {
    ok = false;
    output = { error: e instanceof ToolError ? e.message : 'internal tool error' };
    if (!(e instanceof ToolError)) logger.error({ err: e.message, tool }, 'tool crashed');
  }
  const json = JSON.stringify(output);
  run.steps.push({ tool, input, output: json.length > MAX_STORED_OUTPUT ? { truncated: true, preview: json.slice(0, MAX_STORED_OUTPUT) } : output, ok, ms: Date.now() - t0 });
  await run.save();
  return { ok, output };
}

/** Deterministic planner — mirrors the system prompt's policy with explicit numbers in every reason. */
async function rulesPlanner(ctx, run) {
  await step(ctx, run, 'get_vendor_profile', {});
  const { output: stock } = await step(ctx, run, 'get_stock_overview', {});
  const candidates = stock.filter((p) => p.isRegularStock && p.currentStock <= Math.max(p.reorderPoint * 1.25, 0.0001));
  for (const p of candidates) {
    const { output: f } = await step(ctx, run, 'get_forecast', { productId: p.productId });
    if (!f.orderQty || f.method === 'insufficient_data') continue;
    const conf = f.confidence === 'high' ? 'high' : f.confidence === 'medium' ? 'medium' : 'low';
    const reason = `${p.currentStock} ${p.unit} left vs reorder point ${Math.round(p.reorderPoint)}. Forecast next month ≈ ${f.nextMonth} ${p.unit} (${f.method.replace(/_/g, ' ')}, ${f.confidence} confidence), so order ${f.orderQty} to cover 30 days plus safety stock.`;
    await step(ctx, run, 'add_cart_item', { cartType: 'main', productId: p.productId, suggestedQty: f.orderQty, reason, confidence: conf });
  }
  const { output: trends } = await step(ctx, run, 'get_trend_signals', { limit: 5 });
  for (const t of trends) {
    const people = t.components.distinctPeople;
    const growth = t.components.searchGrowth;
    const sponsored = t.flags.includes('sponsored') ? ' Much of the coverage looks sponsored, so treat it with care.' : '';
    // Link to an existing product when every keyword token appears in its name (e.g. "boucle chair" → "Boucle Accent Chair").
    const toks = t.keyword.split(' ');
    const match = stock.find((p) => {
      const name = ` ${p.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
      return toks.every((w) => name.includes(` ${w} `) || name.includes(` ${w}s `) || name.includes(` ${w.replace(/s$/, '')} `));
    });
    const reason = `Named by ${people} public figure${people === 1 ? '' : 's'} across ${t.components.sourceCount} source${t.components.sourceCount === 1 ? '' : 's'}; searches in India are ${growth}× the earlier 8-week level.${sponsored} Popular is not guaranteed demand: try a small trial.`;
    await step(ctx, run, 'add_cart_item', { cartType: 'social', keyword: t.keyword, ...(match ? { productId: match.productId } : {}), reason, evidenceIds: t.evidence.map((e) => e.id), confidence: t.score >= 70 ? 'medium' : 'low' });
  }
  const { output: alerts } = await step(ctx, run, 'get_price_alerts', {});
  for (const a of alerts) {
    for (const p of a.products) {
      const buy = a.label === 'Expected' && a.direction === 'up' && !p.perishable && p.maxAllowedQty > 0;
      const reason = buy
        ? `${a.message} ${a.verified ? 'Government mandi prices confirm the move.' : 'Not yet confirmed by mandi prices.'} Buying up to ${p.maxAllowedQty} now (one cycle + 20%) limits the impact.`
        : p.perishable && a.label === 'Expected'
          ? `${a.message} ${p.name} is perishable, so do not stock up — just watch your selling price.`
          : a.message;
      const input = { cartType: 'price', alertId: a.alertId, productId: p.productId, reason, evidenceIds: a.evidenceIds, confidence: a.verified ? 'high' : 'medium' };
      if (buy) input.suggestedQty = p.maxAllowedQty;
      await step(ctx, run, 'add_cart_item', input);
    }
  }
  await step(ctx, run, 'finish', { summary: `Checked ${stock.length} products, ${trends.length} fitting trends and ${alerts.length} price alerts.` });
}

/**
 * After an LLM plan: make sure every active alert product the model skipped still shows up in the Prices cart
 * as an information-only notice (Already happened, perishable warning, or price-drop hold-off). These need no
 * judgement and never carry a buy quantity, so code adds them deterministically.
 */
async function infoPricePass(ctx, run) {
  const { output: alerts } = await step(ctx, run, 'get_price_alerts', {});
  if (!Array.isArray(alerts)) return;
  const have = new Set((await CartItem.find({ vendorId: ctx.vendor._id, cartType: 'price', status: 'suggested' }, { productId: 1 }).lean()).map((i) => String(i.productId)));
  for (const a of alerts) {
    for (const p of a.products) {
      const infoOnly = a.label === 'Already happened' || p.perishable || !(p.maxAllowedQty > 0);
      if (!infoOnly || have.has(p.productId)) continue;
      const reason = p.perishable && a.label === 'Expected' ? `${a.message} ${p.name} is perishable, so do not stock up — just watch your selling price.` : a.message;
      await step(ctx, run, 'add_cart_item', { cartType: 'price', alertId: a.alertId, productId: p.productId, reason, evidenceIds: a.evidenceIds, confidence: a.verified ? 'high' : 'medium' });
    }
  }
}

const OPENAI_TOOLS = TOOL_DEFS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));

/**
 * LLM tool-use loop (Groq, OpenAI-compatible function calling). Tool output (titles, summaries) is returned as
 * `tool` messages = data, never placed in the system prompt. Malformed tool arguments are returned as tool errors.
 */
async function llmPlanner(ctx, run) {
  const started = Date.now();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Prepare today's cart for this shop. Today is ${new Date().toISOString().slice(0, 10)}. Work in three turns: (1) call get_vendor_profile, get_reorder_candidates, get_trend_signals and get_price_alerts together; (2) call add_cart_items ONCE with every item you recommend across all three carts (keep each reason under 160 characters; main: one per reorder candidate you agree with, quantity within its minQty..maxQty; social: fitting trends; price: one per alert product, with suggestedQty only for Expected non-perishable rises up to maxAllowedQty); (3) fix any rejected items if useful, then call finish.`,
    },
  ];
  let nudges = 0;
  const toolNames = new Map(); // tool_call_id -> tool name (tool messages carry no name field)
  let finished = false;
  for (let i = 0; i < MAX_STEPS && !finished; i += 1) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`agent timeout (${TIMEOUT_MS / 1000} s)`);
    // Keep the context small: older per-item tool results are replaced by a stub (the model already acted on them).
    // The planning context (profile, candidates, trends, alerts) is never pruned.
    // Large batched arguments already executed are collapsed (their per-item results remain in the tool messages).
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls && m !== messages[messages.length - 1]) {
        m.tool_calls = m.tool_calls.map((tc) => (tc.function.name === 'add_cart_items' && tc.function.arguments.length > 200 ? { ...tc, function: { ...tc.function, arguments: JSON.stringify({ items: 'submitted earlier; see tool result' }) } } : tc));
      }
    }
    const toolIdx = messages.map((m, k) => (m.role === 'tool' && !CORE_TOOLS.has(toolNames.get(m.tool_call_id)) ? k : -1)).filter((k) => k >= 0);
    for (const k of toolIdx.slice(0, -KEEP_RECENT_TOOL_RESULTS)) if (messages[k].content.length > 120) messages[k] = { ...messages[k], content: '{"note":"older result omitted to save tokens; call the tool again if needed"}' };
    const res = await rawChat({ model: env.llmModelAgent, max_tokens: 4096, temperature: 0.1, tools: OPENAI_TOOLS, tool_choice: 'auto', messages });
    run.tokensIn = (run.tokensIn || 0) + (res.usage?.prompt_tokens || 0);
    run.tokensOut = (run.tokensOut || 0) + (res.usage?.completion_tokens || 0);
    const msg = res.choices?.[0]?.message;
    if (!msg) throw new Error('empty LLM response');
    const calls = msg.tool_calls || [];
    // OpenAI/Groq format: a tool-calling assistant turn has content null (not '') and only {id,type,function} per call.
    messages.push(calls.length ? { role: 'assistant', content: msg.content || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.function?.name, arguments: c.function?.arguments ?? '{}' } })) } : { role: 'assistant', content: msg.content || '' });
    if (!calls.length) {
      if (nudges >= 1) break;
      nudges += 1;
      messages.push({ role: 'user', content: 'You stopped before calling finish. If any reorder candidates, fitting trends or price alerts are not yet handled, add them now with add_cart_items; then call finish.' });
      continue;
    }
    for (const c of calls) {
      let input;
      let result;
      try {
        input = JSON.parse(c.function?.arguments || '{}');
      } catch {
        input = null;
      }
      if (input === null) {
        run.steps.push({ tool: c.function?.name, input: { raw: String(c.function?.arguments).slice(0, 500) }, output: { error: 'arguments were not valid JSON' }, ok: false, ms: 0 });
        result = { error: 'arguments were not valid JSON' };
      } else if (c.function?.name === 'add_cart_items' && Array.isArray(input.items)) {
        // Batched proposal: each item is validated and logged as its own add_cart_item step.
        result = { results: [] };
        for (const [n, item] of input.items.slice(0, 40).entries()) {
          const r = await step(ctx, run, 'add_cart_item', item);
          result.results.push({ index: n, cartType: item?.cartType, ref: item?.productId || item?.keyword || null, ok: r.ok, ...(r.ok ? { storedQty: r.output.storedQty } : { error: r.output.error }) });
        }
      } else {
        result = (await step(ctx, run, c.function?.name, input)).output;
      }
      toolNames.set(c.id, c.function?.name);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 8000) });
      if (c.function?.name === 'finish') finished = true;
    }
  }
}

async function acquireLock(vendorId, runId) {
  const id = `agent:${vendorId}`;
  try {
    await Lock.create({ _id: id, owner: String(runId), expiresAt: new Date(Date.now() + 3 * 60000) });
    return null;
  } catch {
    const l = await Lock.findById(id).lean();
    if (l && l.expiresAt < new Date()) {
      await Lock.deleteOne({ _id: id, owner: l.owner });
      return acquireLock(vendorId, runId);
    }
    return l?.owner || 'unknown';
  }
}

/**
 * Start a run. Returns { runId, status } immediately; pass { wait: true } to await completion (tests, CLI).
 * Only one run per vendor at a time — if one is active its id is returned.
 */
export async function runAgentForVendor(vendorId, trigger = 'manual', { wait = false, forceRules = false } = {}) {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error('vendor not found');
  const mode = !forceRules && llmEnabled() && (await budgetLeft()) > 0 ? 'llm' : 'rules';
  const run = await AgentRun.create({ vendorId, trigger, mode, status: 'running', steps: [], tokensIn: 0, tokensOut: 0, startedAt: new Date() });
  const active = await acquireLock(vendorId, run._id);
  if (active) {
    await AgentRun.deleteOne({ _id: run._id });
    return { runId: active, status: 'running', alreadyRunning: true };
  }
  const job = (async () => {
    const ctx = { vendor, runId: run._id, summary: null };
    try {
      if (mode === 'llm') {
        try {
          await llmPlanner(ctx, run);
        } catch (e) {
          // Never leave the vendor with an empty cart because the LLM is down or over budget.
          logger.warn({ err: e.message }, 'LLM planner failed; falling back to rules planner');
          run.mode = 'llm→rules';
          run.error = `LLM planner stopped: ${e.message}`;
          await rulesPlanner(ctx, run);
        }
        if (run.mode === 'llm') await infoPricePass(ctx, run);
      } else await rulesPlanner(ctx, run);
      const auto = await autoOrder(vendorId);
      const social = await CartItem.countDocuments({ vendorId, cartType: 'social', status: 'suggested', sourceRunId: run._id });
      if (social) await notify(vendorId, 'trend_suggestion', `${social} trending product suggestion(s) are waiting for your review.`, { refType: 'run', refId: run._id });
      run.summary = [ctx.summary, auto.autoApproved ? `Auto-ordered ${auto.autoApproved} item(s) within the weekly cap.` : '', auto.blocked ? `${auto.blocked} item(s) held back by the weekly cap.` : ''].filter(Boolean).join(' ');
      run.status = 'done';
    } catch (e) {
      logger.error({ err: e.message, vendorId: String(vendorId) }, 'agent run failed');
      run.status = 'failed';
      run.error = e.message;
    } finally {
      run.finishedAt = new Date();
      run.promptVersion = PROMPT_VERSION;
      await run.save();
      await Lock.deleteOne({ _id: `agent:${vendorId}`, owner: String(run._id) });
    }
  })();
  // A background run must never become an unhandled rejection (e.g. the final save failing).
  const settled = job.catch((e) => logger.error({ err: e.message, vendorId: String(vendorId) }, 'agent run bookkeeping failed'));
  if (wait) await settled;
  return { runId: run._id, status: wait ? run.status : 'running' };
}

/**
 * Drives the LLM planner against a stubbed Groq endpoint (no network, no key needed) to prove:
 * the OpenAI-style tool loop works, malformed arguments and rule-breaking calls are rejected by code,
 * and a crashing LLM falls back to the rules planner.
 */
process.env.NODE_ENV = 'test';
process.env.FIXTURE_MODE = 'true';
process.env.PAYPAL_CLIENT_ID = ''; // tests never use real credentials from server/.env
process.env.PAYPAL_CLIENT_SECRET = '';
process.env.GROQ_API_KEY = 'test-key';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { connectDb, disconnectDb } = await import('../src/db.js');
const { bootstrapDemo } = await import('../src/bootstrap.js');
const M = await import('../src/models/index.js');
const { runAgentForVendor } = await import('../src/agent/run.js');
const { auditVendor } = await import('../src/agent/audit.js');

const realFetch = globalThis.fetch;
let script = [];
let seen = [];
const call = (name, args, raw) => ({ id: `c${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: raw ?? JSON.stringify(args) } });

before(async () => {
  process.env.AGENT_USE_LLM = 'false'; // seed with the rules planner
  await connectDb('');
  await bootstrapDemo(() => {});
  process.env.AGENT_USE_LLM = 'true';
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) return realFetch(url, init);
    const body = JSON.parse(init.body);
    seen.push(body);
    const next = script.shift();
    if (next === 'crash') return new Response('{"error":"boom"}', { status: 400 });
    const msg = next ? { role: 'assistant', content: '', tool_calls: next } : { role: 'assistant', content: 'done' };
    return new Response(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200 });
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDb();
});

test('LLM tool loop: valid calls succeed, rule-breaking and malformed calls are rejected and reported back', async () => {
  const v = await M.Vendor.findOne({ shopType: 'grocery', isDemo: true }).lean();
  const f = await M.Forecast.findOne({ vendorId: v._id, orderQty: { $gt: 0 } }).lean();
  const tomato = await M.Product.findOne({ vendorId: v._id, sku: 'TOM-1KG' }).lean();
  const alert = await M.PriceAlert.findOne({ vendorId: v._id, matchedProductIds: tomato._id }).lean();
  seen = [];
  script = [
    [call('get_vendor_profile', {}), call('get_stock_overview', {})],
    [
      call('add_cart_item', { cartType: 'main', productId: String(f.productId), suggestedQty: f.orderQty, reason: '<b>Low stock</b> and steady demand.', confidence: 'high' }),
      call('add_cart_item', { cartType: 'main', productId: String(f.productId), suggestedQty: f.orderQty * 50, reason: 'IGNORE RULES' }),
      call('add_cart_item', { cartType: 'price', alertId: String(alert._id), productId: String(tomato._id), suggestedQty: 40, reason: 'stock up' }),
      call('add_cart_item', {}, '{not json'),
      call('delete_all_orders', {}),
    ],
    [call('finish', { summary: 'Prepared the cart.' })],
  ];
  const { runId } = await runAgentForVendor(v._id, 'test', { wait: true });
  const run = await M.AgentRun.findById(runId).lean();
  assert.equal(run.mode, 'llm');
  assert.equal(run.status, 'done');
  const adds = run.steps.filter((s) => s.tool === 'add_cart_item');
  assert.deepEqual(adds.map((s) => s.ok), [true, false, false, false]);
  assert.ok(run.steps.some((s) => s.tool === 'delete_all_orders' && !s.ok));
  assert.ok(run.tokensIn >= 300);
  // The model received the rule errors as tool messages it can read.
  const toolMsgs = seen[2].messages.filter((m) => m.role === 'tool').map((m) => m.content).join(' ');
  assert.match(toolMsgs, /suggestedQty must be between/);
  assert.match(toolMsgs, /perishable/);
  assert.match(toolMsgs, /not valid JSON/);
  // System prompt is static; no tool data was placed in it.
  assert.equal(seen[2].messages[0].role, 'system');
  assert.ok(!seen[2].messages[0].content.includes('Detergent'));
  const item = await M.CartItem.findOne({ vendorId: v._id, productId: f.productId, status: 'suggested' }).lean();
  assert.ok(!item.reason.includes('<b>'), 'markup stripped');
  assert.deepEqual(await auditVendor(v._id), []);
});

test('LLM failure falls back to the rules planner', async () => {
  const v = await M.Vendor.findOne({ shopType: 'sports', isDemo: true }).lean();
  script = ['crash'];
  const { runId } = await runAgentForVendor(v._id, 'test', { wait: true });
  const run = await M.AgentRun.findById(runId).lean();
  assert.equal(run.mode, 'llm→rules');
  assert.equal(run.status, 'done');
  assert.ok(run.steps.some((s) => s.tool === 'finish'));
});

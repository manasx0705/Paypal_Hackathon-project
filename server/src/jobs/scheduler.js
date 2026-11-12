import cron from 'node-cron';
import { AgentRun, JobRun, Lock, Vendor } from '../models/index.js';
import { runForecasts } from '../services/inventory.js';
import { evaluateOutcomes, runTrendPipeline } from '../services/trends.js';
import { expireSignalsAndAlerts, runMarketPipeline } from '../services/market.js';
import * as A from '../services/analytics.js';
import { notify } from '../services/notify.js';
import { logger } from '../utils/logger.js';

async function forEachVendor(fn, concurrency = 3) {
  const vendors = await Vendor.find().lean();
  const out = [];
  for (let i = 0; i < vendors.length; i += concurrency) out.push(...(await Promise.all(vendors.slice(i, i + concurrency).map(fn))));
  return out;
}

export const JOBS = {
  ingest: async () => ({ trends: await runTrendPipeline(), market: await runMarketPipeline() }),
  forecasts: async () => ({ vendors: (await forEachVendor((v) => runForecasts(v._id))).length }),
  agents: async ({ forceRules = false } = {}) => {
    const { runAgentForVendor } = await import('../agent/run.js');
    // LLM runs go one shop at a time to respect free-tier rate limits; rules runs can go 3 at a time.
    const { llmEnabled } = await import('../config/env.js');
    const runs = await forEachVendor((v) => runAgentForVendor(v._id, forceRules ? 'seed' : 'nightly', { wait: true, forceRules }), forceRules || !llmEnabled() ? 3 : 1);
    return { runs: runs.length };
  },
  maintenance: async () => ({
    outcomes: await evaluateOutcomes(),
    expired: await expireSignalsAndAlerts(),
    oldRuns: (await AgentRun.deleteMany({ startedAt: { $lt: new Date(Date.now() - 90 * 86400000) } })).deletedCount,
  }),
  weekly: async () => {
    await forEachVendor(async (v) => {
      const o = await A.overview(v._id);
      await notify(v._id, 'weekly_summary', `This week: revenue ₹${o.revenue30d.toLocaleString('en-IN')} (30d), ${o.lowStockCount} low-stock item(s), ${o.openCartItems} open cart item(s).`, { refType: 'week', refId: new Date().toISOString().slice(0, 10) });
    });
    return { ok: true };
  },
};

/** Run a job under a Mongo lock (no overlapping runs) and record a job_runs row. */
export async function runJob(name, opts = {}) {
  if (!Object.hasOwn(JOBS, name)) throw Object.assign(new Error(`unknown job ${name}`), { status: 404 });
  const lockId = `job:${name}`;
  try {
    await Lock.create({ _id: lockId, owner: String(process.pid), expiresAt: new Date(Date.now() + 30 * 60000) });
  } catch {
    const l = await Lock.findById(lockId).lean();
    if (l && l.expiresAt > new Date()) return { name, status: 'skipped', reason: 'already running' };
    await Lock.deleteOne({ _id: lockId });
    return runJob(name, opts);
  }
  const run = await JobRun.create({ name, startedAt: new Date(), status: 'running' });
  try {
    run.stats = await JOBS[name](opts);
    run.status = 'done';
  } catch (e) {
    run.status = 'failed';
    run.error = e.message;
    logger.error({ job: name, err: e.message }, 'job failed');
  } finally {
    run.finishedAt = new Date();
    await run.save();
    await Lock.deleteOne({ _id: lockId });
  }
  return { name, status: run.status, stats: run.stats, error: run.error };
}

export function startScheduler() {
  const tz = { timezone: 'Asia/Kolkata' };
  // runJob's own bookkeeping (lock / job_runs writes) can reject; never let that become an unhandled rejection.
  const safe = (name) => () => runJob(name).catch((e) => logger.error({ job: name, err: e.message }, 'job bookkeeping failed'));
  cron.schedule('0 */3 * * *', safe('ingest'), tz);
  cron.schedule('0 1 * * *', safe('forecasts'), tz);
  cron.schedule('0 2 * * *', safe('agents'), tz);
  cron.schedule('0 3 * * *', safe('maintenance'), tz);
  cron.schedule('0 6 * * 0', safe('weekly'), tz);
  logger.info('scheduler started (Asia/Kolkata)');
}

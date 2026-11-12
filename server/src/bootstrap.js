import { Vendor } from './models/index.js';
import { DEMO_CREDENTIALS, seedAll } from './seed.js';
import { runJob } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

/** Seed demo vendors and run every pipeline once so the first login shows a full product. */
export async function bootstrapDemo(log = (m) => logger.info(m)) {
  await seedAll({ log });
  log('computing forecasts...');
  await runJob('forecasts');
  log('running trend + price pipelines...');
  await runJob('ingest');
  // First boot uses the zero-token rules planner so the demo is ready fast; "Refresh suggestions" then runs the LLM agent.
  log('preparing first carts (rules planner)...');
  await runJob('agents', { forceRules: true });
  log(`demo ready. Credentials: ${DEMO_CREDENTIALS.map((c) => `${c.email} / ${c.password}`).join(' | ')}`);
}

export const isEmpty = async () => !(await Vendor.exists({}));

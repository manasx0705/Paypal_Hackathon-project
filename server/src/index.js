import { env } from './config/env.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { bootstrapDemo, isEmpty } from './bootstrap.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

await connectDb();
const app = createApp();
app.listen(env.port, () => logger.info(`API on http://localhost:${env.port}/api/v1 (fixtureMode=${env.fixtureMode})`));
if (env.autoSeed && (await isEmpty())) {
  bootstrapDemo().catch((e) => logger.error({ err: e.message }, 'demo bootstrap failed'));
}
if (env.enableCron) startScheduler();

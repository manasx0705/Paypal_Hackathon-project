import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { env, llmEnabled } from './config/env.js';
import { JobRun } from './models/index.js';
import { errorHandler } from './middleware/index.js';
import { authRouter, meRouter } from './routes/auth.js';
import { dataRouter } from './routes/data.js';
import { coreRouter } from './routes/core.js';
import { adapterHealth } from './adapters/core.js';
import { PaymentProvider } from './adapters/commerce.js';
import { openApiDoc } from './openapi.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('x-request-id', req.id);
    const t0 = Date.now();
    res.on('finish', () => logger.info({ reqId: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t0 }, 'request'));
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  const isTest = env.nodeEnv === 'test';
  const api = express.Router();
  api.use('/auth', rateLimit({ windowMs: 60000, limit: isTest ? 1000 : 10, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/refresh' }));
  api.use(rateLimit({ windowMs: 60000, limit: isTest ? 10000 : 300, standardHeaders: true, legacyHeaders: false }));

  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/health/deep', (_req, res) => res.json({ ok: true, fixtureMode: env.fixtureMode, adapters: adapterHealth() }));
  api.get('/system/status', async (_req, res, next) => {
    try {
      const lastJobs = await JobRun.aggregate([{ $sort: { startedAt: -1 } }, { $group: { _id: '$name', status: { $first: '$status' }, finishedAt: { $first: '$finishedAt' } } }]);
      res.json({ fixtureMode: env.fixtureMode, agentMode: llmEnabled() ? 'llm' : 'rules', paymentsMode: PaymentProvider.mode(), lastJobs: lastJobs.map((j) => ({ name: j._id, status: j.status, finishedAt: j.finishedAt })) });
    } catch (e) {
      next(e);
    }
  });
  api.get('/docs', (_req, res) => res.json(openApiDoc()));
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use(dataRouter);
  api.use(coreRouter);
  app.use('/api/v1', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null } }));
  app.use(errorHandler);
  return app;
}

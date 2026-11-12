import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Sets req.vendorId from the access token. vendorId NEVER comes from body/query. */
export function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Missing access token'));
  try {
    const p = jwt.verify(token, env.jwtSecret);
    req.vendorId = p.sub;
    req.vendorEmail = p.email;
    return next();
  } catch {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired access token'));
  }
}

/**
 * validate({ body, query, params }) with Zod schemas; parsed values replace the originals.
 * For PATCH bodies only the keys the client actually sent are kept, so schema defaults never overwrite stored values.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const k of ['body', 'query', 'params']) {
      if (!schemas[k]) continue;
      const parsed = schemas[k].parse(req[k] ?? {});
      if (k === 'body' && req.method === 'PATCH' && parsed && typeof parsed === 'object') {
        const sent = new Set(Object.keys(req.body || {}));
        for (const key of Object.keys(parsed)) if (!sent.has(key)) delete parsed[key];
      }
      req[k === 'query' ? 'q' : k] = parsed;
    }
    if (!schemas.query) req.q = req.query;
    next();
  } catch (e) {
    next(e);
  }
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? null } });
  if (err?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these unique fields already exists', details: err.keyValue ?? null } });
  if (err?.name === 'CastError') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', details: null } });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', details: Object.values(err.errors || {}).map((e) => ({ path: e.path, message: e.message })) } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON', details: null } });
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Attach the CSV in the "file" field', details: null } });
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Payload too large', details: null } });
  logger.error({ err: err?.message, stack: err?.stack, reqId: req.id }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong', details: null } });
}

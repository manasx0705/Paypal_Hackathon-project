import { AdapterCache, UsageCounter } from '../models/index.js';
import { logger } from '../utils/logger.js';

const registry = new Map();

/** Opens for `openMs` after `threshold` consecutive failures. */
export class CircuitBreaker {
  constructor(name, { threshold = 5, openMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
    Object.assign(this, { name, threshold, openMs, now, failures: 0, openedAt: null, lastError: null, lastOk: null });
    registry.set(name, this);
  }
  get state() {
    if (this.openedAt !== null && this.now() - this.openedAt < this.openMs) return 'open';
    if (this.openedAt !== null) return 'half-open';
    return 'closed';
  }
  async exec(fn) {
    if (this.state === 'open') throw Object.assign(new Error(`${this.name} circuit open`), { code: 'CIRCUIT_OPEN' });
    try {
      const r = await fn();
      this.failures = 0;
      this.openedAt = null;
      this.lastOk = new Date();
      return r;
    } catch (e) {
      this.failures += 1;
      this.lastError = e.message;
      if (this.failures >= this.threshold) this.openedAt = this.now();
      throw e;
    }
  }
  health() {
    return { name: this.name, state: this.state, failures: this.failures, lastError: this.lastError, lastOk: this.lastOk };
  }
}

export const adapterHealth = () => [...registry.values()].map((b) => b.health());

/** Retry with exponential backoff. `isRetryable(err)` decides; 429s back off longer. */
export async function withRetry(fn, { retries = 2, baseMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), isRetryable = () => true } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e;
      // Honour the server's Retry-After (seconds) when present, capped at 30 s.
      const wait = e.retryAfterMs ? Math.min(30000, e.retryAfterMs) : baseMs * 2 ** attempt * (e.status === 429 ? 4 : 1);
      logger.warn({ err: e.message, attempt, wait }, 'adapter call failed, backing off');
      await sleep(wait);
      attempt += 1;
    }
  }
}

export async function fetchJson(url, { timeoutMs = 30000, ...init } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      const ra = Number(res.headers.get('retry-after'));
      throw Object.assign(new Error(`HTTP ${res.status} from ${new URL(url).host}`), { status: res.status, body: text.slice(0, 300), retryAfterMs: Number.isFinite(ra) && ra > 0 ? Math.ceil(ra * 1000) + 250 : null });
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

/** Mongo-backed cache with TTL index (adapter_cache). */
export async function cached(key, ttlMs, fn) {
  const hit = await AdapterCache.findById(key).lean();
  if (hit && hit.expiresAt > new Date()) return hit.value;
  const value = await fn();
  await AdapterCache.updateOne({ _id: key }, { value, expiresAt: new Date(Date.now() + ttlMs) }, { upsert: true });
  return value;
}

/** Daily usage counter (quota / token budget). */
export async function addUsage(name, amount = 1) {
  const day = new Date().toISOString().slice(0, 10);
  const doc = await UsageCounter.findOneAndUpdate(
    { _id: `${name}:${day}` },
    { $inc: { count: amount }, $setOnInsert: { expiresAt: new Date(Date.now() + 3 * 86400000) } },
    { upsert: true, new: true },
  );
  return doc.count;
}
export async function getUsage(name) {
  const day = new Date().toISOString().slice(0, 10);
  const doc = await UsageCounter.findById(`${name}:${day}`).lean();
  return doc?.count || 0;
}

/** Quota guard: refuse once usage reaches `fraction` of the daily limit. */
export function quotaAllows(used, limit, fraction = 0.8) {
  return used < Math.floor(limit * fraction);
}

/** Simple per-domain rate limiter (1 request per `ms` per host). */
const lastHit = new Map();
export async function politeWait(url, ms = 1000) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) || 0) + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

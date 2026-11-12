export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

/** Wrap async handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const roundUpToPack = (qty, pack = 1) => {
  const p = pack > 0 ? pack : 1;
  return Math.ceil(Math.max(0, qty) / p - 1e-9) * p;
};
export const monthKey = (d) => {
  const dt = new Date(d);
  const s = dt.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  return s.slice(0, 7);
};
export const stripMarkup = (s, max = 300) =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`#>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

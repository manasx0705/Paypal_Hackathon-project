import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import * as M from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { S } from '../schemas.js';
import { AppError, ah, notFound } from '../utils/errors.js';
import { Mailer } from '../adapters/commerce.js';

const { Vendor, RefreshToken } = M;
const r = Router();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const COOKIE = 'rt';
const cookieOpts = { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 7 * 86400000 };

const accessToken = (v) => jwt.sign({ sub: String(v._id), email: v.email }, env.jwtSecret, { expiresIn: '15m' });

async function issue(res, vendor, family = crypto.randomUUID()) {
  const raw = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({ vendorId: vendor._id, tokenHash: sha(raw), family, expiresAt: new Date(Date.now() + 7 * 86400000) });
  res.cookie(COOKIE, raw, cookieOpts);
  return { accessToken: accessToken(vendor), vendor: vendor.toPublic() };
}

r.post('/register', validate({ body: S.register }), ah(async (req, res) => {
  const b = req.body;
  if (await Vendor.exists({ email: b.email.toLowerCase() })) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  const v = await Vendor.create({ ...b, passwordHash: await bcrypt.hash(b.password, 12) });
  res.status(201).json(await issue(res, v));
}));

r.post('/login', validate({ body: S.login }), ah(async (req, res) => {
  const v = await Vendor.findOne({ email: req.body.email.toLowerCase() });
  const fail = new AppError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect');
  if (!v) throw fail;
  if (v.lockUntil && v.lockUntil > new Date()) throw new AppError(423, 'LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
  if (!(await bcrypt.compare(req.body.password, v.passwordHash))) {
    v.failedLogins += 1;
    if (v.failedLogins >= 10) {
      v.lockUntil = new Date(Date.now() + 15 * 60000);
      v.failedLogins = 0;
    }
    await v.save();
    throw fail;
  }
  v.failedLogins = 0;
  v.lockUntil = null;
  await v.save();
  res.json(await issue(res, v));
}));

/** One-click demo login into a seeded vendor (judges / demo video). */
r.post('/demo', validate({ body: S.demo }), ah(async (req, res) => {
  const v = await Vendor.findOne({ isDemo: true, shopType: req.body.shop });
  if (!v) throw notFound('Demo vendor (run npm run seed)');
  res.json(await issue(res, v));
}));

/** Rotates the refresh token on every use; reusing an old token revokes the whole family. */
r.post('/refresh', ah(async (req, res) => {
  const raw = req.cookies?.[COOKIE];
  if (!raw || typeof raw !== 'string') throw new AppError(401, 'NO_REFRESH', 'No refresh token');
  const t = await RefreshToken.findOne({ tokenHash: sha(raw) });
  if (!t || t.revokedAt || t.expiresAt < new Date()) throw new AppError(401, 'BAD_REFRESH', 'Refresh token invalid');
  // Atomic single use: two concurrent refreshes with the same token cannot both succeed.
  const claimed = t.usedAt ? null : await RefreshToken.findOneAndUpdate({ _id: t._id, usedAt: null }, { usedAt: new Date() }, { new: true });
  if (!claimed) {
    await RefreshToken.updateMany({ family: t.family }, { revokedAt: new Date() });
    res.clearCookie(COOKIE, { path: cookieOpts.path });
    throw new AppError(401, 'REFRESH_REUSED', 'Refresh token reuse detected; please log in again');
  }
  const v = await Vendor.findById(t.vendorId);
  if (!v) throw new AppError(401, 'BAD_REFRESH', 'Account no longer exists');
  res.json(await issue(res, v, t.family));
}));

r.post('/logout', ah(async (req, res) => {
  const raw = req.cookies?.[COOKIE];
  if (raw) {
    const t = await RefreshToken.findOne({ tokenHash: sha(raw) });
    if (t) await RefreshToken.updateMany({ family: t.family }, { revokedAt: new Date() });
  }
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.json({ ok: true });
}));

r.post('/forgot-password', validate({ body: S.forgot }), ah(async (req, res) => {
  const v = await Vendor.findOne({ email: req.body.email.toLowerCase() });
  if (v) {
    const raw = crypto.randomBytes(32).toString('base64url');
    v.resetTokenHash = sha(raw);
    v.resetTokenExpires = new Date(Date.now() + 3600000);
    await v.save();
    await Mailer.send({ to: v.email, subject: 'Reset your PalProcure password', text: `Use this token within 1 hour: ${raw}` });
  }
  res.json({ ok: true }); // same response either way: no account enumeration
}));

r.post('/reset-password', validate({ body: S.reset }), ah(async (req, res) => {
  const v = await Vendor.findOne({ resetTokenHash: sha(req.body.token), resetTokenExpires: { $gt: new Date() } });
  if (!v) throw new AppError(400, 'BAD_TOKEN', 'Reset token is invalid or expired');
  v.passwordHash = await bcrypt.hash(req.body.password, 12);
  v.resetTokenHash = null;
  v.resetTokenExpires = null;
  await v.save();
  await RefreshToken.updateMany({ vendorId: v._id }, { revokedAt: new Date() });
  res.json({ ok: true });
}));

export const authRouter = r;

// ---------------------------------------------------------------- /me
const me = Router();
me.use(requireAuth);
me.get('/', ah(async (req, res) => {
  const v = await Vendor.findById(req.vendorId);
  if (!v) throw notFound('Account');
  res.json(v.toPublic());
}));
me.patch('/', validate({ body: S.patchMe }), ah(async (req, res) => {
  const v = await Vendor.findById(req.vendorId);
  if (!v) throw notFound('Account');
  const { settings, ...rest } = req.body;
  v.set(rest);
  if (settings) for (const [k, val] of Object.entries(settings)) v.settings[k] = val;
  await v.save();
  res.json(v.toPublic());
}));
/** Deletes ALL of the vendor's data after password confirmation. */
me.delete('/', validate({ body: S.deleteMe }), ah(async (req, res) => {
  const v = await Vendor.findById(req.vendorId);
  if (!v || !(await bcrypt.compare(req.body.password, v.passwordHash))) throw new AppError(401, 'BAD_CREDENTIALS', 'Password is incorrect');
  if (v.isDemo) throw new AppError(403, 'DEMO_ACCOUNT', 'Demo accounts cannot be deleted');
  const scoped = ['Supplier', 'Product', 'Sale', 'Purchase', 'Forecast', 'PriceAlert', 'CartItem', 'Order', 'AgentRun', 'TrendOutcome', 'Notification', 'RefreshToken', 'ImportJob'];
  for (const name of scoped) await M[name].deleteMany({ vendorId: v._id });
  await Vendor.deleteOne({ _id: v._id });
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.json({ ok: true });
}));
export const meRouter = me;

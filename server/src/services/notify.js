import { Notification } from '../models/index.js';

/** Create a notification unless the same (type, refId) was created for this vendor in the last 24 hours. */
export async function notify(vendorId, type, message, { refType = null, refId = null } = {}) {
  const since = new Date(Date.now() - 86400000);
  const dup = await Notification.findOne({ vendorId, type, refId: refId ? String(refId) : null, createdAt: { $gte: since } }).lean();
  if (dup) return null;
  return Notification.create({ vendorId, type, message, refType, refId: refId ? String(refId) : null });
}

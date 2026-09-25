import * as shopService from '../services/shopService.js';
import { User, QueueEntry } from '../models/index.js';

export async function listAllShops(req, res, next) {
  try {
    const shops = await shopService.getAllShopsForAdmin();
    res.json({ success: true, data: { shops } });
  } catch (err) {
    next(err);
  }
}

export async function getShop(req, res, next) {
  try {
    const shop = await shopService.getShopForAdmin(req.params.shopId);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

export async function approveShop(req, res, next) {
  try {
    const shop = await shopService.approveShop(req.params.shopId, req.user.id);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

export async function rejectShop(req, res, next) {
  try {
    const { reason } = req.body || {};
    // Not itself a security control (this is stored in an internal audit
    // log, never rendered as HTML), but a plain length/type guard keeps
    // garbage or absurdly large payloads out of AuditLog.metadata.
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : undefined;
    const shop = await shopService.rejectShop(req.params.shopId, req.user.id, safeReason);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

// Safe fields only — never passwordHash. Mirrors the User schema's
// `select: false` on passwordHash, so a plain .find() already excludes
// it; this projection is an explicit second layer on top of that.
// Deleted/anonymized accounts (Section 14) are excluded — a Super Admin
// managing the platform has no legitimate reason to see anonymized
// placeholder records in a list of active users.
export async function listUsers(req, res, next) {
  try {
    const users = await User.find({ isDeleted: { $ne: true } })
      .select('name mobileNumber email role shopId mobileVerified createdAt')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { users } });
  } catch (err) {
    next(err);
  }
}

export async function basicAnalytics(req, res, next) {
  try {
    const [shopsByStatus, usersByRole, activeQueueCount] = await Promise.all([
      shopService.getAllShopsForAdmin().then((shops) =>
        shops.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {})
      ),
      User.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
      QueueEntry.countDocuments({ status: { $in: ['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'] } }),
    ]);

    const userCounts = usersByRole.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});

    res.json({
      success: true,
      data: {
        shopsByStatus,
        usersByRole: userCounts,
        activeQueueEntries: activeQueueCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

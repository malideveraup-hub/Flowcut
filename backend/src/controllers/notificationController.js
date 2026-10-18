import * as notificationService from '../services/notificationService.js';
import * as webPushService from '../services/webPushService.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listMine(req, res, next) {
  try {
    const result = await notificationService.listNotifications(req.user.id, req.query.limit);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function markMineRead(req, res, next) {
  try {
    const updated = await notificationService.markNotificationRead(req.user.id, req.params.notificationId);
    if (!updated) throw new AppError(404, 'Notification not found.');
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    next(error);
  }
}

export async function markAllMineRead(req, res, next) {
  try {
    const updated = await notificationService.markAllNotificationsRead(req.user.id);
    res.json({ success: true, data: { updated } });
  } catch (error) {
    next(error);
  }
}

export async function pushConfiguration(_req, res) {
  res.json({ success: true, data: webPushService.getWebPushConfiguration() });
}

export async function savePushSubscription(req, res, next) {
  try {
    await webPushService.saveWebPushSubscription(req.user.id, req.body || {});
    res.status(201).json({ success: true, message: 'Browser push alerts are enabled.' });
  } catch (error) {
    next(error);
  }
}

export async function removePushSubscription(req, res, next) {
  try {
    const removed = await webPushService.removeWebPushSubscription(req.user.id, req.body?.endpoint);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    next(error);
  }
}

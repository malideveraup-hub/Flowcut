import * as notificationService from '../services/notificationService.js';
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
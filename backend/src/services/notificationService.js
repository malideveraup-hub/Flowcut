import Notification from '../models/Notification.js';
import { sendQueuePushNotification } from './webPushService.js';

export async function createNotificationOnce(fields) {
  try {
    const result = await Notification.updateOne(
      { userId: fields.userId, eventKey: fields.eventKey },
      { $setOnInsert: { ...fields, read: false, channel: 'WEB' } },
      { upsert: true }
    );
    if (result.upsertedCount !== 1) return false;

    if (fields.type === 'NEAR_TURN' || fields.type === 'ARRIVE_SOON') {
      void sendQueuePushNotification(result.upsertedId, fields).catch((error) => {
        console.error('[web-push] Could not send queue reminder:', error.message);
      });
    }

    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

export async function listNotifications(userId, requestedLimit = 30) {
  const limit = Math.max(1, Math.min(50, Number.parseInt(requestedLimit, 10) || 30));
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id queueEntryId type title message read previousPosition position arrivalDeadlineAt createdAt')
      .lean(),
    Notification.countDocuments({ userId, read: false }),
  ]);

  return {
    notifications: notifications.map((item) => ({
      id: String(item._id),
      queueEntryId: item.queueEntryId ? String(item.queueEntryId) : null,
      type: item.type,
      title: item.title,
      message: item.message,
      read: item.read,
      previousPosition: item.previousPosition,
      position: item.position,
      arrivalDeadlineAt: item.arrivalDeadlineAt,
      createdAt: item.createdAt,
    })),
    unreadCount,
  };
}

export async function markNotificationRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true } },
    { new: true }
  ).select('_id');
  return Boolean(notification);
}

export async function markAllNotificationsRead(userId) {
  const result = await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
  return result.modifiedCount;
}

import webPush from 'web-push';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import PushSubscription from '../models/PushSubscription.js';

const PUSH_ENDPOINT_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

const webPushConfigured = Boolean(env.vapidPublicKey && env.vapidPrivateKey);

if (webPushConfigured) {
  webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

export function getWebPushConfiguration() {
  return {
    enabled: webPushConfigured,
    publicKey: webPushConfigured ? env.vapidPublicKey : null,
  };
}

function validateSubscriptionEndpoint(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;

  try {
    const endpoint = new URL(value);
    const allowedHost = PUSH_ENDPOINT_HOSTS.some((host) => (
      endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`)
    ));
    return endpoint.protocol === 'https:'
      && (!endpoint.port || endpoint.port === '443')
      && !endpoint.username
      && !endpoint.password
      && allowedHost;
  } catch {
    return false;
  }
}

function isBase64Url(value, minLength, maxLength) {
  return typeof value === 'string'
    && value.length >= minLength
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function saveWebPushSubscription(userId, input) {
  if (!webPushConfigured) {
    throw new AppError(503, 'Closed-browser alerts are not configured on this server yet.');
  }

  const endpoint = input?.endpoint;
  const keys = input?.keys;
  if (
    !validateSubscriptionEndpoint(endpoint)
    || !keys
    || !isBase64Url(keys.p256dh, 40, 200)
    || !isBase64Url(keys.auth, 16, 100)
  ) {
    throw new AppError(400, 'The browser returned an invalid push subscription. Please try again.');
  }

  let expirationTime = null;
  if (input.expirationTime !== null && input.expirationTime !== undefined) {
    const timestamp = Number(input.expirationTime);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new AppError(400, 'The browser returned an invalid push subscription. Please try again.');
    }
    expirationTime = new Date(timestamp);
  }

  await PushSubscription.updateOne(
    { endpoint },
    {
      $set: {
        userId,
        endpoint,
        expirationTime,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      },
    },
    { upsert: true, runValidators: true }
  );
}

export async function removeWebPushSubscription(userId, endpoint) {
  if (!validateSubscriptionEndpoint(endpoint)) {
    throw new AppError(400, 'The browser returned an invalid push subscription.');
  }
  const result = await PushSubscription.deleteOne({ userId, endpoint });
  return result.deletedCount > 0;
}

export async function sendQueuePushNotification(notificationId, fields) {
  if (!webPushConfigured) return;

  const subscriptions = await PushSubscription.find({ userId: fields.userId }).lean();
  const payload = JSON.stringify({
    id: String(notificationId),
    type: fields.type,
    title: fields.title,
    message: fields.message,
    url: '/my-queue',
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime?.getTime() ?? null,
          keys: subscription.keys,
        },
        payload,
        { TTL: 300, urgency: 'high' }
      );
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      console.error(`[web-push] Delivery failed (status ${error.statusCode || 'unknown'}).`);
    }
  }));
}

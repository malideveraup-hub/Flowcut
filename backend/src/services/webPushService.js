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

const QUEUE_PUSH_PAYLOAD = JSON.stringify({
  title: 'FlowCut queue update',
  message: 'Your queue status has changed. Open FlowCut for details.',
  url: '/my-queue',
});

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

function safeLogFailure(logger, error) {
  logger.error('[web-push] Delivery failed.', {
    status: Number.isInteger(error?.statusCode) ? error.statusCode : null,
    errorType: typeof error?.name === 'string' ? error.name.slice(0, 60) : 'Error',
  });
}

export function createWebPushService({
  pushClient = webPush,
  subscriptions = PushSubscription,
  configuration = env,
  logger = console,
} = {}) {
  const enabled = Boolean(configuration.vapidPublicKey && configuration.vapidPrivateKey);
  if (enabled) {
    pushClient.setVapidDetails(configuration.vapidSubject, configuration.vapidPublicKey, configuration.vapidPrivateKey);
  }

  function getWebPushConfiguration() {
    return { enabled, publicKey: enabled ? configuration.vapidPublicKey : null };
  }

  async function saveWebPushSubscription(userId, input) {
    if (!enabled) throw new AppError(503, 'Closed-browser alerts are not configured on this server yet.');

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
      if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) {
        throw new AppError(400, 'The browser returned an invalid push subscription. Please try again.');
      }
      expirationTime = new Date(timestamp);
    }

    await subscriptions.updateOne(
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

  async function removeWebPushSubscription(userId, endpoint) {
    if (!validateSubscriptionEndpoint(endpoint)) {
      throw new AppError(400, 'The browser returned an invalid push subscription.');
    }
    const result = await subscriptions.deleteOne({ userId, endpoint });
    return result.deletedCount > 0;
  }

  async function sendQueuePushNotification(notificationId, fields) {
    if (!enabled) return;
    const targets = await subscriptions.find({ userId: fields.userId }).lean();
    await Promise.all(targets.map(async (subscription) => {
      try {
        await pushClient.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime() ?? null,
            keys: subscription.keys,
          },
          JSON.stringify({ id: String(notificationId), ...JSON.parse(QUEUE_PUSH_PAYLOAD) }),
          { TTL: 300, urgency: 'high' }
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          try {
            await subscriptions.deleteOne({ _id: subscription._id });
          } catch (cleanupError) {
            safeLogFailure(logger, cleanupError);
          }
          return;
        }
        safeLogFailure(logger, error);
      }
    }));
  }

  return { getWebPushConfiguration, saveWebPushSubscription, removeWebPushSubscription, sendQueuePushNotification };
}

const webPushService = createWebPushService();
export const getWebPushConfiguration = webPushService.getWebPushConfiguration;
export const saveWebPushSubscription = webPushService.saveWebPushSubscription;
export const removeWebPushSubscription = webPushService.removeWebPushSubscription;
export const sendQueuePushNotification = webPushService.sendQueuePushNotification;

import QueueEntry from '../models/QueueEntry.js';
import { createNotificationOnce } from './notificationService.js';
import { computeCustomerWaitEstimate } from '../utils/waitEstimate.js';

const POSITION_STATUSES = ['JOINED', 'WAITING', 'CALLED'];
const WAITING_STATUSES = ['JOINED', 'WAITING'];
const ARRIVAL_WINDOW_MS = 2 * 60 * 1000;
const MONITOR_INTERVAL_MS = 10 * 1000;
const reconciliationTails = new Map();

async function serializeShopReconciliation(shopId, work) {
  const key = String(shopId);
  const previous = reconciliationTails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  reconciliationTails.set(key, tail);

  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (reconciliationTails.get(key) === tail) reconciliationTails.delete(key);
  }
}

function displayTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export async function notifyQueueEntry(entry, fields) {
  if (!entry.customerId) return false;
  return createNotificationOnce({
    userId: entry.customerId,
    shopId: entry.shopId,
    queueEntryId: entry._id,
    ...fields,
  });
}

export async function normalizeShopQueuePositions(shopId, now = new Date(), previousPositions = null) {
  const entries = await QueueEntry.find({ shopId, status: { $in: POSITION_STATUSES } })
    .sort({ queuePosition: 1, createdAt: 1 });

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const storedPosition = entry.queuePosition;
    const previousPosition = previousPositions?.get(String(entry._id)) ?? storedPosition;
    const position = index + 1;
    if (previousPosition === position) continue;

    if (storedPosition !== position) {
      entry.queuePosition = position;
      await entry.save();
    }
    await notifyQueueEntry(entry, {
      eventKey: `${entry._id}:position:${previousPosition}:${position}:${entry.updatedAt?.getTime() || now.getTime()}`,
      type: 'QUEUE_POSITION_CHANGED',
      title: 'Queue position updated',
      message: `Your position changed from #${previousPosition} to #${position}.`,
      previousPosition,
      position,
    });
  }

  return entries;
}

export async function callNextCustomer(shopId, advancedAt = new Date(), reason = 'QUEUE_ADVANCED') {
  const next = await QueueEntry.findOne({ shopId, status: { $in: WAITING_STATUSES } })
    .sort({ queuePosition: 1, createdAt: 1 });
  if (!next) return null;

  const arrivalDeadlineAt = new Date(advancedAt.getTime() + ARRIVAL_WINDOW_MS);
  next.status = 'CALLED';
  next.arrivalDeadlineAt = arrivalDeadlineAt;
  await next.save();

  const message = reason === 'SERVICE_COMPLETED'
    ? `The previous haircut was completed at ${displayTime(advancedAt)}. Please arrive at the shop by ${displayTime(arrivalDeadlineAt)} to keep your place in the queue.`
    : `The queue advanced at ${displayTime(advancedAt)}. Please arrive at the shop by ${displayTime(arrivalDeadlineAt)} to keep your place in the queue.`;
  await notifyQueueEntry(next, {
    eventKey: `${next._id}:arrival-window`,
    type: 'YOU_ARE_NEXT',
    title: "You're next",
    message,
    position: 1,
    arrivalDeadlineAt,
  });

  return next;
}

export async function reconcileShopQueue(shopId, {
  callNextCount = 0,
  now = new Date(),
  previousPositions = null,
  nextCustomerReason = 'QUEUE_ADVANCED',
} = {}) {
  return serializeShopReconciliation(shopId, async () => {
    let nextCalled = 0;
    for (let index = 0; index < callNextCount; index += 1) {
      const next = await callNextCustomer(shopId, now, nextCustomerReason);
      if (!next) break;
      nextCalled += 1;
    }
    await normalizeShopQueuePositions(shopId, now, previousPositions);
    return { nextCalled };
  });
}

export async function expireCalledQueueEntry(entryId, now = new Date()) {
  const entry = await QueueEntry.findOneAndUpdate(
    {
      _id: entryId,
      status: 'CALLED',
      arrivedAt: null,
      arrivalDeadlineAt: { $lte: now },
    },
    { $set: { status: 'SKIPPED' } },
    { new: true }
  );
  if (!entry) return null;

  await notifyQueueEntry(entry, {
    eventKey: `${entry._id}:arrival-window-expired`,
    type: 'QUEUE_REMOVED',
    title: 'Removed from queue',
    message: 'You were removed from the queue because you did not arrive within the required 2-minute arrival window.',
    position: entry.queuePosition,
    arrivalDeadlineAt: entry.arrivalDeadlineAt,
  });
  return entry;
}

async function notifyWaitThresholds(shopId) {
  const entries = await QueueEntry.find({ shopId, status: { $in: WAITING_STATUSES }, customerId: { $ne: null } })
    .sort({ queuePosition: 1, createdAt: 1 });
  for (const entry of entries) {
    const estimate = await computeCustomerWaitEstimate(shopId, entry);
    if (estimate.min <= 10) {
      await notifyQueueEntry(entry, {
        eventKey: `${entry._id}:turn-approaching-10`,
        type: 'NEAR_TURN',
        title: 'Your turn is coming up',
        message: `You're approximately 10 minutes away from your turn at the shop. Please start preparing to head to the shop. Current estimate: ${estimate.min}–${estimate.max} minutes.`,
        position: entry.queuePosition,
      });
    }
    if (estimate.min <= 5) {
      await notifyQueueEntry(entry, {
        eventKey: `${entry._id}:arrive-soon-5`,
        type: 'ARRIVE_SOON',
        title: 'Your turn is almost here',
        message: `You're approximately 5 minutes away. Please head to the shop now so you can arrive before your turn. Current estimate: ${estimate.min}–${estimate.max} minutes.`,
        position: entry.queuePosition,
      });
    }
  }
}

export async function processQueueNotifications(now = new Date()) {
  const expiredCandidates = await QueueEntry.find({
    status: 'CALLED',
    arrivedAt: null,
    arrivalDeadlineAt: { $lte: now },
  }).select('_id shopId').limit(250);
  const expiredByShop = new Map();

  for (const candidate of expiredCandidates) {
    const expired = await expireCalledQueueEntry(candidate._id, now);
    if (expired) {
      const shopKey = String(expired.shopId);
      expiredByShop.set(shopKey, (expiredByShop.get(shopKey) || 0) + 1);
    }
  }

  for (const [shopId, count] of expiredByShop) {
    await reconcileShopQueue(shopId, { callNextCount: count, now });
  }

  const shopIds = await QueueEntry.distinct('shopId', { status: { $in: WAITING_STATUSES } });
  for (const shopId of shopIds) {
    await notifyWaitThresholds(shopId);
  }
}

let monitorTimer = null;
let monitorRunning = false;

export function startQueueNotificationMonitor() {
  if (monitorTimer) return;

  const run = async () => {
    if (monitorRunning) return;
    monitorRunning = true;
    try {
      await processQueueNotifications();
    } catch (error) {
      console.error('[queue-notifications] Monitor run failed:', error.message);
    } finally {
      monitorRunning = false;
    }
  };

  void run();
  monitorTimer = setInterval(run, MONITOR_INTERVAL_MS);
  monitorTimer.unref?.();
}

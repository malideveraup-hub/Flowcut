import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import QueueEntry from '../src/models/QueueEntry.js';
import Notification from '../src/models/Notification.js';
import {
  expireCalledQueueEntry,
  notifyQueueEntry,
  reconcileShopQueue,
} from '../src/services/queueNotificationService.js';

const SHOP_ID = 'shop-1';
const COMPLETED_AT = new Date('2026-10-09T02:30:00.000Z'); // 10:30 AM in FlowCut's UTC+8 display zone.
const originalMethods = {};
let entries;
let notifications;

function makeEntry(id, customerId, status, queuePosition) {
  return {
    _id: id,
    customerId,
    shopId: SHOP_ID,
    status,
    queuePosition,
    createdAt: new Date(COMPLETED_AT.getTime() + queuePosition * 1000),
    updatedAt: new Date(COMPLETED_AT.getTime()),
    arrivalDeadlineAt: null,
    arrivedAt: null,
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };
}

function matchesShopAndStatus(entry, filter) {
  return String(entry.shopId) === String(filter.shopId)
    && filter.status.$in.includes(entry.status);
}

function sortEntries(items) {
  return [...items].sort((left, right) => (
    left.queuePosition - right.queuePosition || left.createdAt - right.createdAt
  ));
}

beforeEach(() => {
  entries = [];
  notifications = new Map();
  originalMethods.find = QueueEntry.find;
  originalMethods.findOne = QueueEntry.findOne;
  originalMethods.findOneAndUpdate = QueueEntry.findOneAndUpdate;
  originalMethods.updateOne = Notification.updateOne;

  QueueEntry.find = (filter) => ({
    sort: async () => sortEntries(entries.filter((entry) => matchesShopAndStatus(entry, filter))),
  });
  QueueEntry.findOne = (filter) => ({
    sort: async () => sortEntries(entries.filter((entry) => matchesShopAndStatus(entry, filter)))[0] || null,
  });
  QueueEntry.findOneAndUpdate = async (filter, update) => {
    const entry = entries.find((item) => (
      String(item._id) === String(filter._id)
      && item.status === filter.status
      && item.arrivedAt === filter.arrivedAt
      && item.arrivalDeadlineAt <= filter.arrivalDeadlineAt.$lte
    ));
    if (!entry) return null;
    Object.assign(entry, update.$set);
    return entry;
  };
  Notification.updateOne = async (filter, update) => {
    const key = `${filter.userId}:${filter.eventKey}`;
    if (notifications.has(key)) return { upsertedCount: 0 };
    notifications.set(key, update.$setOnInsert);
    return { upsertedCount: 1 };
  };
});

afterEach(() => {
  QueueEntry.find = originalMethods.find;
  QueueEntry.findOne = originalMethods.findOne;
  QueueEntry.findOneAndUpdate = originalMethods.findOneAndUpdate;
  Notification.updateOne = originalMethods.updateOne;
});

test('service completion calls the next customer with a two-minute deadline and a check-in protects their place', async () => {
  const customerB = makeEntry('entry-b', 'customer-b', 'WAITING', 1);
  entries = [
    makeEntry('entry-a', 'customer-a', 'COMPLETED', 0),
    customerB,
    makeEntry('entry-c', 'customer-c', 'WAITING', 2),
    makeEntry('entry-d', 'customer-d', 'WAITING', 3),
  ];

  await reconcileShopQueue(SHOP_ID, {
    callNextCount: 1,
    now: COMPLETED_AT,
    nextCustomerReason: 'SERVICE_COMPLETED',
  });

  const deadline = new Date(COMPLETED_AT.getTime() + 2 * 60 * 1000);
  assert.equal(customerB.status, 'CALLED');
  assert.equal(customerB.arrivalDeadlineAt.getTime(), deadline.getTime());
  const arrivalNotice = [...notifications.values()].find((item) => item.type === 'YOU_ARE_NEXT');
  assert.equal(arrivalNotice.arrivalDeadlineAt.getTime(), deadline.getTime());
  assert.match(arrivalNotice.message, /10:32 AM/);

  customerB.arrivedAt = new Date(COMPLETED_AT.getTime() + 60 * 1000);
  const expiredAfterCheckIn = await expireCalledQueueEntry('entry-b', new Date(deadline.getTime() + 1000));
  assert.equal(expiredAfterCheckIn, null);
  assert.equal(customerB.status, 'CALLED');
});

test('a missed arrival deadline preserves the queue record, notifies B, and promotes C with updated positions', async () => {
  const customerB = makeEntry('entry-b', 'customer-b', 'CALLED', 1);
  customerB.arrivalDeadlineAt = new Date(COMPLETED_AT.getTime() + 2 * 60 * 1000);
  const customerC = makeEntry('entry-c', 'customer-c', 'WAITING', 2);
  const customerD = makeEntry('entry-d', 'customer-d', 'WAITING', 3);
  entries = [customerB, customerC, customerD];

  const expired = await expireCalledQueueEntry('entry-b', new Date(customerB.arrivalDeadlineAt.getTime() + 1000));
  assert.equal(expired, customerB);
  assert.equal(customerB.status, 'SKIPPED');
  assert.equal(entries.includes(customerB), true);
  assert.ok([...notifications.values()].some((item) => item.type === 'QUEUE_REMOVED' && item.userId === 'customer-b'));

  const advancedAt = new Date(customerB.arrivalDeadlineAt.getTime() + 1000);
  await reconcileShopQueue(SHOP_ID, { callNextCount: 1, now: advancedAt });
  assert.equal(customerC.status, 'CALLED');
  assert.equal(customerC.arrivalDeadlineAt.getTime(), advancedAt.getTime() + 2 * 60 * 1000);
  assert.equal(customerC.queuePosition, 1);
  assert.equal(customerD.queuePosition, 2);
  assert.ok([...notifications.values()].some((item) => item.type === 'YOU_ARE_NEXT' && item.userId === 'customer-c'));
  assert.ok([...notifications.values()].some((item) => (
    item.type === 'QUEUE_POSITION_CHANGED'
    && item.userId === 'customer-d'
    && item.previousPosition === 3
    && item.position === 2
  )));
});

test('one customer leaving recalculates every remaining position and excludes the customer who left', async () => {
  const customerA = makeEntry('entry-a', 'customer-a', 'CANCELLED', 1);
  const customerB = makeEntry('entry-b', 'customer-b', 'WAITING', 2);
  const customerC = makeEntry('entry-c', 'customer-c', 'WAITING', 3);
  const customerD = makeEntry('entry-d', 'customer-d', 'WAITING', 4);
  entries = [customerA, customerB, customerC, customerD];

  await reconcileShopQueue(SHOP_ID);

  assert.deepEqual([customerB.queuePosition, customerC.queuePosition, customerD.queuePosition], [1, 2, 3]);
  assert.equal([...notifications.values()].some((item) => item.userId === 'customer-a'), false);
  for (const [userId, previousPosition, position] of [
    ['customer-b', 2, 1],
    ['customer-c', 3, 2],
    ['customer-d', 4, 3],
  ]) {
    assert.ok([...notifications.values()].some((item) => (
      item.userId === userId
      && item.type === 'QUEUE_POSITION_CHANGED'
      && item.previousPosition === previousPosition
      && item.position === position
    )));
  }
});

test('nearly simultaneous departures use actual remaining positions instead of subtracting one repeatedly', async () => {
  const customerA = makeEntry('entry-a', 'customer-a', 'CANCELLED', 1);
  const customerB = makeEntry('entry-b', 'customer-b', 'CANCELLED', 2);
  const customerC = makeEntry('entry-c', 'customer-c', 'WAITING', 3);
  const customerD = makeEntry('entry-d', 'customer-d', 'WAITING', 4);
  entries = [customerA, customerB, customerC, customerD];

  await reconcileShopQueue(SHOP_ID);

  assert.deepEqual([customerC.queuePosition, customerD.queuePosition], [1, 2]);
  assert.ok([...notifications.values()].some((item) => (
    item.userId === 'customer-c' && item.previousPosition === 3 && item.position === 1
  )));
  assert.ok([...notifications.values()].some((item) => (
    item.userId === 'customer-d' && item.previousPosition === 4 && item.position === 2
  )));
  assert.equal([...notifications.values()].some((item) => ['customer-a', 'customer-b'].includes(item.userId)), false);
});

test('notification event keys are unique per queue entry and remain idempotent on retries', async () => {
  const firstVisit = makeEntry('entry-first', 'customer-same', 'WAITING', 1);
  const secondVisit = makeEntry('entry-second', 'customer-same', 'WAITING', 1);
  const first = await notifyQueueEntry(firstVisit, {
    eventKey: `${firstVisit._id}:turn-approaching-10`,
    type: 'NEAR_TURN',
    title: 'Your turn is coming up',
    message: 'Start preparing to head to the shop.',
  });
  const retry = await notifyQueueEntry(firstVisit, {
    eventKey: `${firstVisit._id}:turn-approaching-10`,
    type: 'NEAR_TURN',
    title: 'Your turn is coming up',
    message: 'Start preparing to head to the shop.',
  });
  const laterVisit = await notifyQueueEntry(secondVisit, {
    eventKey: `${secondVisit._id}:turn-approaching-10`,
    type: 'NEAR_TURN',
    title: 'Your turn is coming up',
    message: 'Start preparing to head to the shop.',
  });

  assert.equal(first, true);
  assert.equal(retry, false);
  assert.equal(laterVisit, true);
  assert.equal(notifications.size, 2);
});

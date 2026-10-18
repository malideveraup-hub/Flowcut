import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransition,
  canApplyDelay,
  validateDelayMinutes,
  validateRequestId,
} from '../src/validation/queueValidation.js';
import { calculateAssignedQueueWaitEstimate, calculateShopWaitRange } from '../src/utils/waitEstimate.js';

test('shop wait ranges include active service work and pause time, and avoid estimates with no active barbers', () => {
  const now = new Date('2026-10-18T10:30:00.000Z');
  const waitRange = calculateShopWaitRange({
    waitingEntries: [{ serviceId: 'next', baseMinutes: 20 }],
    activeEntries: [{ _id: 'current', serviceId: 'current', baseMinutes: 40, delayMinutes: 5, pausedAt: new Date('2026-10-18T10:20:00.000Z'), pausedDurationMs: 0 }],
    durationById: new Map(),
    startedAtByEntryId: new Map([['current', new Date('2026-10-18T10:00:00.000Z')]]),
    activeBarberCount: 1,
    now,
  });
  assert.deepEqual(waitRange, { min: 45, max: 59 });
  assert.deepEqual(calculateShopWaitRange({
    waitingEntries: [], activeEntries: [], durationById: new Map(), startedAtByEntryId: new Map(), activeBarberCount: 0, now,
  }), { min: 0, max: 0 });
  assert.deepEqual(calculateShopWaitRange({
    waitingEntries: [{ serviceId: 'next' }], activeEntries: [], durationById: new Map(), startedAtByEntryId: new Map(), activeBarberCount: 0, now,
  }), { min: null, max: null });
});

test('a running-late service can record another delay and then finish', () => {
  assert.equal(canTransition('IN_SERVICE', 'DELAYED'), true);
  assert.equal(canTransition('DELAYED', 'DELAYED'), true);
  assert.equal(canTransition('DELAYED', 'COMPLETED'), true);
});

test('only active services can receive another delay while a paused delayed service can resume', () => {
  assert.equal(canApplyDelay('IN_SERVICE'), true);
  assert.equal(canApplyDelay('DELAYED'), true);
  assert.equal(canApplyDelay('PAUSED'), false);
  assert.equal(canApplyDelay('COMPLETED'), false);
  assert.equal(canTransition('PAUSED', 'DELAYED'), true);
  assert.equal(canTransition('COMPLETED', 'DELAYED'), false);
});

test('only the visible extension amounts are accepted', () => {
  assert.equal(validateDelayMinutes(3), null);
  assert.equal(validateDelayMinutes(5), null);
  assert.equal(validateDelayMinutes(10), null);
  assert.match(validateDelayMinutes(15), /3, 5, 10/);
});

test('barber mutations require a valid UUID request ID', () => {
  assert.equal(validateRequestId('2b3e4567-e89b-42d3-a456-426614174000'), null);
  assert.notEqual(validateRequestId('retry-without-a-uuid'), null);
});

test('assigned waits include only that barber’s remaining service and earlier entries', () => {
  const now = new Date('2026-10-13T08:20:00.000Z');
  const entries = [
    { _id: 'current-a', serviceId: 'cut', status: 'DELAYED', queuePosition: 1, baseMinutes: 60, delayMinutes: 10 },
    { _id: 'ahead-a', serviceId: 'trim', status: 'WAITING', queuePosition: 2 },
    { _id: 'target-a', serviceId: 'fade', status: 'WAITING', queuePosition: 3 },
  ];
  const wait = calculateAssignedQueueWaitEstimate({
    entry: entries[2],
    entries,
    durationByServiceId: new Map([['trim', 15], ['fade', 30]]),
    startedAtByEntryId: new Map([['current-a', new Date('2026-10-13T08:00:00.000Z')]]),
    now,
  });

  // (60 base + 10 added - 20 elapsed) + 15 minutes ahead.
  assert.equal(wait.min, 65);
  assert.equal(wait.remainingMinutes, 65);
});

test('an overtime service contributes zero remaining minutes to the next customer', () => {
  const now = new Date('2026-10-13T09:00:00.000Z');
  const entries = [
    { _id: 'current-a', serviceId: 'cut', status: 'DELAYED', queuePosition: 1, baseMinutes: 30, delayMinutes: 5 },
    { _id: 'target-a', serviceId: 'trim', status: 'WAITING', queuePosition: 2 },
  ];
  const wait = calculateAssignedQueueWaitEstimate({
    entry: entries[1],
    entries,
    durationByServiceId: new Map([['trim', 20]]),
    startedAtByEntryId: new Map([['current-a', new Date('2026-10-13T08:15:00.000Z')]]),
    now,
  });

  assert.equal(wait.min, 0);
});

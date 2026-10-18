import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransition,
  validateDelayMinutes,
  validateRequestId,
} from '../src/validation/queueValidation.js';
import { calculateAssignedQueueWaitEstimate } from '../src/utils/waitEstimate.js';

test('a running-late service can record another delay and then finish', () => {
  assert.equal(canTransition('IN_SERVICE', 'DELAYED'), true);
  assert.equal(canTransition('DELAYED', 'DELAYED'), true);
  assert.equal(canTransition('DELAYED', 'COMPLETED'), true);
});

test('paused and completed services cannot receive another delay', () => {
  assert.equal(canTransition('PAUSED', 'DELAYED'), false);
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

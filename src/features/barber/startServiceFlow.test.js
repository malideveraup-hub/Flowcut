import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveStartConflict, startServiceWithConflictRecovery } from './startServiceFlow.js';

const entryId = 'queue-entry-1';

function dashboard({ current = null, upNext = [], availability = 'AVAILABLE' } = {}) {
  return { current, upNext, barber: { availability } };
}

test('a refreshed dashboard confirms a start that committed before a conflict response', async () => {
  let requests = 0;
  const result = await startServiceWithConflictRecovery(
    entryId,
    async () => {
      requests += 1;
      const error = new Error('This entry was already updated. Showing the latest.');
      error.status = 409;
      throw error;
    },
    async () => dashboard({ current: { id: entryId, status: 'IN_SERVICE' } })
  );

  assert.deepEqual(result, { alreadyStarted: true });
  assert.equal(requests, 1);
});

test('a conflict is retried once only when fresh data confirms the entry is still startable', async () => {
  let requests = 0;
  const result = await startServiceWithConflictRecovery(
    entryId,
    async () => {
      requests += 1;
      if (requests === 1) {
        const error = new Error('The queue changed.');
        error.status = 409;
        throw error;
      }
      return { success: true };
    },
    async () => dashboard({ upNext: [{ id: entryId, status: 'WAITING' }] })
  );

  assert.deepEqual(result, { success: true });
  assert.equal(requests, 2);
});

test('a changed entry is not retried and gets a contextual conflict message', async () => {
  let requests = 0;
  await assert.rejects(
    startServiceWithConflictRecovery(
      entryId,
      async () => {
        requests += 1;
        const error = new Error('This customer is no longer eligible to start service.');
        error.status = 409;
        throw error;
      },
      async () => dashboard({ upNext: [{ id: 'another-entry', status: 'WAITING' }] })
    ),
    /This customer is no longer eligible to start service/
  );
  assert.equal(requests, 1);
});

test('a different next customer prevents retry', async () => {
  const decision = resolveStartConflict(
    dashboard({ upNext: [{ id: 'another-entry', status: 'CALLED' }, { id: entryId, status: 'WAITING' }] }),
    entryId
  );

  assert.deepEqual(decision, { type: 'conflict', message: 'A different customer is now next. The queue has been refreshed.' });
});

test('an active service for the barber prevents retry', async () => {
  const decision = resolveStartConflict(
    dashboard({ current: { id: 'another-entry', status: 'IN_SERVICE' }, upNext: [{ id: entryId, status: 'WAITING' }] }),
    entryId
  );

  assert.deepEqual(decision, { type: 'conflict', message: 'Finish your current service before starting another.' });
});

test('an in-flight refresh can confirm the target was started without sending a duplicate request', async () => {
  const decision = resolveStartConflict(
    dashboard({ current: { id: entryId, status: 'IN_SERVICE' } }),
    entryId
  );

  assert.deepEqual(decision, { type: 'started' });
});

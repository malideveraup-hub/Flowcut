import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireServiceSubmission, releaseServiceSubmission } from '../src/utils/serviceSubmissionLock.js';

test('service form ignores a second submission while the first request is pending', async () => {
  const lock = { current: false };
  let requests = 0;
  let finishFirst;
  const pendingRequest = new Promise((resolve) => { finishFirst = resolve; });
  const submit = async () => {
    if (!acquireServiceSubmission(lock)) return;
    requests += 1;
    try {
      await pendingRequest;
    } finally {
      releaseServiceSubmission(lock);
    }
  };

  const first = submit();
  await submit();
  assert.equal(requests, 1);
  finishFirst();
  await first;
  assert.equal(lock.current, false);
});

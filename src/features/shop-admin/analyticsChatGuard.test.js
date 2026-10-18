import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireChatRequest, releaseChatRequest } from './analyticsChatGuard.js';

test('repeated Send and Try again handlers share one synchronous in-flight guard', async () => {
  const requestRef = { current: false };
  let requestCount = 0;
  const submit = async () => {
    if (!acquireChatRequest(requestRef)) return;
    requestCount += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      releaseChatRequest(requestRef);
    }
  };

  await Promise.all([submit(), submit(), submit()]);
  assert.equal(requestCount, 1);
  assert.equal(requestRef.current, false);
  await submit();
  assert.equal(requestCount, 2);
});

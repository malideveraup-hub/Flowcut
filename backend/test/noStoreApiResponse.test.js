import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noStoreApiResponse } from '../src/middleware/noStoreApiResponse.js';

test('live queue and barber API responses cannot be stored by HTTP caches', () => {
  const headers = {};
  let nextCalled = false;
  noStoreApiResponse({}, {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
  }, () => { nextCalled = true; });

  assert.equal(headers['cache-control'], 'private, no-store');
  assert.equal(nextCalled, true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthRequestGuard } from './authRequestGuard.js';

test('a startup session check cannot overwrite a login that happened while it was pending', () => {
  const guard = createAuthRequestGuard();
  const startupCheck = guard.begin();

  // Login commits a newer authenticated user while the initial /auth/me
  // request is still in flight.
  guard.invalidate();

  assert.equal(guard.isCurrent(startupCheck), false);
});

test('only the newest concurrent session check may update auth state', () => {
  const guard = createAuthRequestGuard();
  const earlierCheck = guard.begin();
  const latestCheck = guard.begin();

  assert.equal(guard.isCurrent(earlierCheck), false);
  assert.equal(guard.isCurrent(latestCheck), true);
});

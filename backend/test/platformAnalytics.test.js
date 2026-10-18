import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireRole } from '../src/middleware/authMiddleware.js';
import { validatePlatformAnalyticsRange } from '../src/services/platformAnalyticsService.js';

test('platform analytics validates ordered UTC day ranges with a one-year cap', () => {
  const range = validatePlatformAnalyticsRange({ from: '2026-01-01', to: '2026-01-31' });
  assert.equal(range.from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.throws(() => validatePlatformAnalyticsRange({ from: '2026-02-01', to: '2026-01-31' }), /on or before/);
  assert.throws(() => validatePlatformAnalyticsRange({ from: '2026-02-30', to: '2026-03-01' }), /invalid/);
  assert.throws(() => validatePlatformAnalyticsRange({ from: '2026-01-01', to: '2027-01-02' }), /cannot exceed/);
  assert.throws(() => validatePlatformAnalyticsRange({ from: '01-01-2026', to: '2026-01-31' }), /YYYY-MM-DD/);
});

test('platform analytics role gate denies shop admins and permits super admins', () => {
  const gate = requireRole('super_admin');
  let denied;
  gate({ user: { role: 'shop_admin' } }, {}, (error) => { denied = error; });
  assert.ok(denied);
  assert.equal(denied.statusCode, 403);
  let allowed = false;
  gate({ user: { role: 'super_admin' } }, {}, (error) => { allowed = !error; });
  assert.equal(allowed, true);
});

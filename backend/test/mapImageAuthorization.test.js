import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/middleware/authMiddleware.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('map image management role check denies other roles and allows shop admins', () => {
  const middleware = requireRole('shop_admin');
  let denied;
  for (const role of ['customer', 'barber', 'super_admin']) {
    middleware({ user: { role } }, {}, (error) => { denied = error; });
    assert.ok(denied instanceof AppError);
    assert.equal(denied.statusCode, 403);
  }

  let passed = false;
  middleware({ user: { role: 'shop_admin' } }, {}, (error) => {
    assert.equal(error, undefined);
    passed = true;
  });
  assert.equal(passed, true);
});

test('map image management role check rejects requests without an authenticated user', () => {
  let denied;
  requireRole('super_admin')({}, {}, (error) => { denied = error; });
  assert.ok(denied instanceof AppError);
  assert.equal(denied.statusCode, 401);
});

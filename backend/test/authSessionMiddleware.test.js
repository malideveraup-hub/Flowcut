import assert from 'node:assert/strict';
import test from 'node:test';
import { User } from '../src/models/index.js';
import { authSessionService } from '../src/services/authSessionService.js';
import { requireAuth, requireRole, requireShopAccess, qualifiesAsSessionActivity } from '../src/middleware/authMiddleware.js';
import { logout } from '../src/controllers/authController.js';
import { signToken } from '../src/utils/tokens.js';
import { AUTH_COOKIE_NAME } from '../src/utils/cookies.js';

function responseMock() {
  const headers = {};
  return {
    headers,
    cleared: false,
    set(name, value) { headers[name] = value; return this; },
    clearCookie() { this.cleared = true; },
  };
}

test('background polling and notifications do not extend the idle deadline', () => {
  for (const path of [
    '/api/queue/my',
    '/api/queue/my/history',
    '/api/barber/dashboard',
    '/api/shop-admin/dashboard-summary',
    '/api/shop-admin/analytics/chat',
    '/api/shop-admin/analytics/insights',
    '/api/admin/analytics/platform',
    '/api/notifications',
    '/api/notifications/read-all',
  ]) {
    assert.equal(qualifiesAsSessionActivity({ method: 'GET', originalUrl: `${path}?poll=1` }), false, path);
  }
  assert.equal(qualifiesAsSessionActivity({ method: 'PATCH', originalUrl: '/api/queue/my' }), true);
  assert.equal(qualifiesAsSessionActivity({ method: 'GET', originalUrl: '/api/auth/me' }), true);
  assert.equal(qualifiesAsSessionActivity({ method: 'GET', originalUrl: '/api/shop-admin/queue' }), true);
});

test('requireAuth validates the session, advances qualifying activity, and provides client deadlines', async (t) => {
  const userId = 'session-user-id';
  const lastActivityAt = new Date(Date.now());
  const session = {
    userId,
    lastActivityAt,
    absoluteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
  t.mock.method(authSessionService, 'validate', async (jti, options) => {
    assert.equal(jti, 'session-123');
    assert.deepEqual(options, { qualifyingActivity: true });
    return session;
  });
  t.mock.method(User, 'findById', async () => ({
    _id: { toString: () => userId },
    name: 'Test User',
    role: 'customer',
    mobileNumber: '09123456789',
    isDeleted: false,
  }));

  const req = {
    cookies: { [AUTH_COOKIE_NAME]: signToken({ id: userId, jti: 'session-123' }) },
    method: 'POST',
    originalUrl: '/api/queue/my/check-in',
  };
  const res = responseMock();
  let nextError;
  await requireAuth(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(req.user.id, userId);
  assert.equal(res.headers['X-FlowCut-Session-Activity'], '1');
  assert.equal(Number(res.headers['X-FlowCut-Idle-Expires-At']), lastActivityAt.getTime() + 30 * 60 * 1000);
  assert.ok(Number(res.headers['X-FlowCut-Idle-Remaining-Ms']) > 0);
  assert.ok(Number(res.headers['X-FlowCut-Absolute-Remaining-Ms']) > 0);
  assert.equal(res.cleared, false);
});

test('requireAuth clears an expired or revoked session and returns a safe session code', async (t) => {
  t.mock.method(authSessionService, 'validate', async () => null);
  const req = {
    cookies: { [AUTH_COOKIE_NAME]: signToken({ id: 'session-user-id', jti: 'revoked-session' }) },
    method: 'GET',
    originalUrl: '/api/auth/me',
  };
  const res = responseMock();
  let nextError;
  await requireAuth(req, res, (error) => { nextError = error; });

  assert.equal(res.cleared, true);
  assert.equal(nextError.statusCode, 401);
  assert.equal(nextError.code, 'SESSION_EXPIRED');
  assert.doesNotMatch(nextError.message, /session-user-id|revoked-session/);
});

test('role and shop guards continue using the authenticated database identity', () => {
  let roleError;
  requireRole('shop_admin')({ user: { role: 'customer' } }, {}, (error) => { roleError = error; });
  assert.equal(roleError.statusCode, 403);

  let shopError;
  requireShopAccess((req) => req.params.shopId)(
    { user: { role: 'shop_admin', shopId: 'shop-a' }, params: { shopId: 'shop-b' } },
    {},
    (error) => { shopError = error; }
  );
  assert.equal(shopError.statusCode, 403);
});

test('logout revokes the presented cookie session and clears the HttpOnly cookie', async (t) => {
  let revokedToken;
  let clearedCookie;
  let responseBody;
  t.mock.method(authSessionService, 'revokeToken', async (token) => {
    revokedToken = token;
    return true;
  });
  const res = {
    clearCookie(name) { clearedCookie = name; },
    json(body) { responseBody = body; return this; },
  };

  await logout({ cookies: { [AUTH_COOKIE_NAME]: 'current-session-token' } }, res);

  assert.equal(revokedToken, 'current-session-token');
  assert.equal(clearedCookie, AUTH_COOKIE_NAME);
  assert.deepEqual(responseBody, { success: true, message: 'Logged out.' });
});

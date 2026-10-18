import { verifyToken } from '../utils/tokens.js';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '../utils/cookies.js';
import { User, Barber } from '../models/index.js';
import { AppError } from './errorHandler.js';
import { hasCurrentConsent } from '../validation/consentValidation.js';
import { authSessionService } from '../services/authSessionService.js';
import { env } from '../config/env.js';

const PASSIVE_AUTH_PATHS = new Set([
  '/api/queue/my',
  '/api/queue/my/history',
  '/api/barber/dashboard',
  '/api/shop-admin/dashboard-summary',
]);

export function qualifiesAsSessionActivity(req) {
  const path = req.originalUrl.split('?')[0];
  if (path === '/api/notifications' || path.startsWith('/api/notifications/')) return false;
  if (path === '/api/shop-admin/analytics' || path.startsWith('/api/shop-admin/analytics/')) return false;
  if (path === '/api/admin/analytics' || path.startsWith('/api/admin/analytics/')) return false;
  if (req.method === 'GET' && PASSIVE_AUTH_PATHS.has(path)) return false;
  return true;
}

/**
 * Verifies the auth cookie and attaches a trustworthy req.user.
 *
 * Deliberately re-reads the user from MongoDB on every request instead of
 * trusting the JWT payload for anything beyond "which user id" — the
 * the user id selects the account and the session id is checked in MongoDB. This means
 * req.user.role and req.user.shopId always reflect the CURRENT database
 * state, not whatever was true when the user last logged in.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      throw new AppError(401, 'Authentication required.');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      clearAuthCookie(res);
      if (error?.name === 'TokenExpiredError') {
        throw new AppError(401, 'Your session has expired. Please sign in again.', [], 'SESSION_EXPIRED');
      }
      throw new AppError(401, 'Authentication required.', [], 'AUTH_REQUIRED');
    }

    if (!payload?.jti) {
      clearAuthCookie(res);
      throw new AppError(401, 'Your session has expired. Please sign in again.', [], 'SESSION_EXPIRED');
    }

    const qualifyingActivity = qualifiesAsSessionActivity(req);
    const session = await authSessionService.validate(payload.jti, { qualifyingActivity });
    if (!session || String(session.userId) !== String(payload.id)) {
      clearAuthCookie(res);
      throw new AppError(401, 'Your session has expired. Please sign in again.', [], 'SESSION_EXPIRED');
    }

    const user = await User.findById(payload.id);
    // isDeleted check: an anonymized account's mobileNumber no longer
    // matches the login format anyway, but this closes the same gap for
    // any OTHER path a token could theoretically still be valid through
    // (e.g. it was issued moments before the account was deleted and
    // hasn't expired yet).
    if (!user || user.isDeleted) {
      clearAuthCookie(res);
      await authSessionService.revoke(payload.jti);
      throw new AppError(401, 'Your session is no longer valid. Please sign in again.', [], 'SESSION_EXPIRED');
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      lastName: user.lastName || null,
      mobileNumber: user.mobileNumber,
      email: user.email || null,
      emailVerified: user.emailVerified,
      role: user.role,
      shopId: user.shopId ? user.shopId.toString() : null,
      consentCurrent: hasCurrentConsent(user),
    };

    const lastActivityAtMs = new Date(session.lastActivityAt).getTime();
    const absoluteExpiresAtMs = new Date(session.absoluteExpiresAt).getTime();
    const idleExpiresAtMs = lastActivityAtMs + env.authSessionIdleTimeoutMs;
    res.set('X-FlowCut-Idle-Expires-At', String(idleExpiresAtMs));
    res.set('X-FlowCut-Absolute-Expires-At', String(absoluteExpiresAtMs));
    res.set('X-FlowCut-Idle-Remaining-Ms', String(Math.max(0, idleExpiresAtMs - Date.now())));
    res.set('X-FlowCut-Absolute-Remaining-Ms', String(Math.max(0, absoluteExpiresAtMs - Date.now())));
    res.set('X-FlowCut-Session-Activity', qualifyingActivity ? '1' : '0');

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Blocks access to account-level actions until the user has accepted the
 * CURRENT Terms/Privacy version (Section 12: "if the Terms or Privacy
 * notice is updated to a new version, prompt renewed consent before
 * continuing with relevant account functionality"). Must run after
 * requireAuth. Deliberately NOT applied to every route — public browsing
 * stays consent-free, and the consent-recording endpoint itself
 * obviously can't require consent to already be current.
 */
export function requireCurrentConsent(req, res, next) {
  if (!req.user) {
    return next(new AppError(401, 'Authentication required.'));
  }
  if (!req.user.consentCurrent) {
    return next(new AppError(403, 'Please review and accept the current Terms and Privacy Notice to continue.'));
  }
  next();
}

/**
 * requireRole('shop_admin') or requireRole('shop_admin', 'super_admin').
 * Always checks req.user.role, which requireAuth populated from the
 * database moments ago — never a client-supplied role field.
 */
export function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
}

/**
 * Reusable for later phases (shop/service/queue routes) — not wired into
 * any route yet since none of those routes exist in Phase 3. Compares
 * the AUTHENTICATED user's own shopId (from the database, via requireAuth)
 * against whatever shop the request is asking about, instead of trusting
 * a client-supplied shopId for authorization (Section 9/10).
 *
 * Usage once shop routes exist, e.g.:
 *   router.get('/api/shop-admin/queue/:shopId',
 *     requireAuth, requireRole('shop_admin'),
 *     requireShopAccess((req) => req.params.shopId),
 *     controller)
 *
 * super_admin always passes, matching Section 8's platform-wide access.
 */
export function requireShopAccess(getRequestedShopId) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required.'));
    }
    if (req.user.role === 'super_admin') {
      return next();
    }
    const requestedShopId = String(getRequestedShopId(req) || '');
    if (!req.user.shopId || req.user.shopId !== requestedShopId) {
      return next(new AppError(403, 'You do not have access to this shop.'));
    }
    next();
  };
}

/**
 * Resolves the authenticated barber's OWN Barber profile (the doc's own
 * _id, distinct from their User _id) and attaches it as req.barber =
 * { id, shopId }. Every barber queue action (start/finish/delay) needs
 * this Barber _id, not the User id — this is the one place that lookup
 * happens, so route handlers never query Barber themselves using
 * anything the client supplied.
 */
export async function attachBarberProfile(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'barber') {
      return next(new AppError(403, 'Barber access required.'));
    }
    const barber = await Barber.findOne({ userId: req.user.id, shopId: req.user.shopId });
    if (!barber) {
      return next(new AppError(404, 'Barber profile not found for this account.'));
    }
    req.barber = { id: barber._id.toString(), shopId: barber.shopId.toString() };
    next();
  } catch (err) {
    next(err);
  }
}

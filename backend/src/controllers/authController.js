import * as authService from '../services/authService.js';
import { setAuthCookie, clearAuthCookie, AUTH_COOKIE_NAME } from '../utils/cookies.js';
import { authSessionService } from '../services/authSessionService.js';
import { env } from '../config/env.js';

function setSessionTimingHeaders(res, lastActivityAt, absoluteExpiresAt) {
  const idleExpiresAtMs = new Date(lastActivityAt).getTime() + env.authSessionIdleTimeoutMs;
  const absoluteExpiresAtMs = new Date(absoluteExpiresAt).getTime();
  res.set('X-FlowCut-Idle-Expires-At', String(idleExpiresAtMs));
  res.set('X-FlowCut-Absolute-Expires-At', String(absoluteExpiresAtMs));
  res.set('X-FlowCut-Idle-Remaining-Ms', String(Math.max(0, idleExpiresAtMs - Date.now())));
  res.set('X-FlowCut-Absolute-Remaining-Ms', String(Math.max(0, absoluteExpiresAtMs - Date.now())));
  res.set('X-FlowCut-Session-Activity', '1');
}

/**
 * Every handler below reads ONLY the specific fields it expects off
 * req.body. This is the actual mass-assignment defense (Section 1/9) —
 * not a filter that strips unwanted fields, but code that never looks at
 * them in the first place. Sending { role: 'super_admin' } alongside a
 * normal registration body has literally no code path that reads it.
 */

export async function register(req, res, next) {
  try {
    const { name, lastName, email, password, termsAccepted, privacyAccepted } = req.body || {};
    const data = await authService.registerCustomer({
      name,
      lastName,
      email,
      password,
      termsAccepted,
      privacyAccepted,
    });
    res.status(201).json({
      success: true,
      data: { email: data.email, expiresAt: data.expiresAt, requiresVerification: true },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password, rememberMe } = req.body || {};
    const { user, token, session } = await authService.authenticateUser({ email, password });
    setAuthCookie(res, token, rememberMe !== false);
    setSessionTimingHeaders(res, session.lastActivityAt, session.absoluteExpiresAt);
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    const { user, token, session } = await authService.verifyEmailOtp({ email, otp });
    setAuthCookie(res, token);
    setSessionTimingHeaders(res, session.lastActivityAt, session.absoluteExpiresAt);
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

export async function resendEmail(req, res, next) {
  try {
    const { email } = req.body || {};
    const data = await authService.resendEmailOtp({ email });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const data = await authService.requestPasswordReset({ email });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    const data = await authService.resetPassword({ token, password });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// requireAuth has already populated req.user from a fresh DB read.
export async function me(req, res) {
  res.json({ success: true, data: { user: req.user } });
}

export async function updateMe(req, res, next) {
  try {
    const { name, lastName, email, mobileNumber } = req.body || {};
    const user = await authService.updateProfile(req.user.id, { name, lastName, email, mobileNumber });
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  try {
    await authSessionService.revokeToken(req.cookies?.[AUTH_COOKIE_NAME]);
  } finally {
    clearAuthCookie(res);
  }
  res.json({ success: true, message: 'Logged out.' });
}

export async function recordConsent(req, res, next) {
  try {
    const { termsAccepted, privacyAccepted } = req.body || {};
    const user = await authService.recordConsent(req.user.id, { termsAccepted, privacyAccepted });
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/auth/me — always the AUTHENTICATED user's own account
// (req.user.id, from requireAuth's fresh DB read). There is no request
// field that names a different account to delete, so there is nothing
// for a client to manipulate here even in principle.
export async function deleteMe(req, res, next) {
  try {
    await authService.deleteOwnAccount(req.user.id);
    clearAuthCookie(res);
    res.json({ success: true, message: 'Your account has been deleted.' });
  } catch (err) {
    next(err);
  }
}

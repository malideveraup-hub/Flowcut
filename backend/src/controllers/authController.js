import * as authService from '../services/authService.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies.js';

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
    const { email, password } = req.body || {};
    const { user, token } = await authService.authenticateUser({ email, password });
    setAuthCookie(res, token);
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    const { user, token } = await authService.verifyEmailOtp({ email, otp });
    setAuthCookie(res, token);
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
  clearAuthCookie(res);
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

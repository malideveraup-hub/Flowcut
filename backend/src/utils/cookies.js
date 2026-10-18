import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'flowcut_token';

// Shared between set/clear so a mismatch (e.g. different `path`) can
// never accidentally leave a cookie that clearCookie() fails to remove.
function cookieOptions() {
  return {
    httpOnly: true, // never readable from client-side JS — the whole point of this approach
    secure: env.nodeEnv === 'production', // requires HTTPS in production; localhost HTTP is fine in dev
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax', // sent on same-site navigations/requests; see README "cookie tradeoffs"
    path: '/',
  };
}

export function setAuthCookie(res, token, rememberMe = true) {
  const options = cookieOptions();
  if (rememberMe) {
    // Browser lifetime is separate from JWT expiry. Session cookies are
    // used when Remember Me is unchecked; persistent cookies last 7 days.
    options.maxAge = 7 * 24 * 60 * 60 * 1000;
  }
  res.cookie(AUTH_COOKIE_NAME, token, options);
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions());
}

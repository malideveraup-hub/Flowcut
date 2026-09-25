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

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...cookieOptions(),
    // Browser-side lifetime. The JWT itself independently expires per
    // JWT_EXPIRES_IN (checked on every request by verifyToken) — this is
    // just how long the browser bothers holding onto the cookie at all,
    // so it's fine for it to be a same-or-longer, round number.
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions());
}

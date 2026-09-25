import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Applied only to POST /api/auth/login and POST /api/auth/register
 * (Section 19). Limits are intentionally generous enough not to get in
 * the way of normal local development/testing, while still doing
 * something real against basic brute-force/spam attempts.
 *
 * This is one layer, not a complete defense — see backend/README.md
 * "Phase 3 limitations" for what it doesn't cover (e.g. distributed
 * attacks across many IPs, account lockout policies).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    errors: [],
  },
});

function gmailKey(req) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return email ? `gmail:${email}` : `ip:${ipKeyGenerator(req.ip)}`;
}

export const gmailOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: gmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many Gmail verification requests. Please try again later.', errors: [] },
});

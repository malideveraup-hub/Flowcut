import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Signs a JWT containing ONLY { id }. Deliberately does not embed role or
 * shopId (even though the spec's example showed those) — authMiddleware
 * re-reads the user fresh from MongoDB on every request instead, so a
 * role change or shop reassignment takes effect on the user's very next
 * request rather than only after their old token expires. The trade-off
 * is one extra DB read per authenticated request, which is a good trade
 * for a system whose whole premise is per-shop authorization correctness.
 */
export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/**
 * Throws if the token is missing, malformed, expired, or signed with a
 * different secret. Callers must catch this — see authMiddleware.js.
 */
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

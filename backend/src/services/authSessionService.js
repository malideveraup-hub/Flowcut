import { randomUUID } from 'node:crypto';
import { AuthSession } from '../models/index.js';
import { env } from '../config/env.js';
import { signToken, verifyToken } from '../utils/tokens.js';

export function createAuthSessionService({
  sessionModel = AuthSession,
  now = () => Date.now(),
  makeId = randomUUID,
  idleTimeoutMs = env.authSessionIdleTimeoutMs,
  maxLifetimeMs = env.authSessionMaxLifetimeMs,
  tokenSigner = signToken,
  tokenVerifier = verifyToken,
} = {}) {
  async function create(userId) {
    const issuedAtMs = now();
    const issuedAtSeconds = Math.floor(issuedAtMs / 1000);
    const absoluteExpiresAt = new Date(issuedAtSeconds * 1000 + maxLifetimeMs);
    const jti = makeId();
    const token = tokenSigner({
      id: String(userId),
      jti,
      iat: issuedAtSeconds,
    }, { expiresIn: Math.floor(maxLifetimeMs / 1000) });

    await sessionModel.create({
      jti,
      userId,
      createdAt: new Date(issuedAtMs),
      lastActivityAt: new Date(issuedAtMs),
      absoluteExpiresAt,
      revokedAt: null,
    });

    return {
      token,
      jti,
      lastActivityAt: new Date(issuedAtMs),
      absoluteExpiresAt,
    };
  }

  async function validate(jti, { qualifyingActivity = false } = {}) {
    if (typeof jti !== 'string' || !jti) return null;
    const currentTime = now();
    const currentDate = new Date(currentTime);
    const activeFilter = {
      jti,
      revokedAt: null,
      absoluteExpiresAt: { $gt: currentDate },
      lastActivityAt: { $gt: new Date(currentTime - idleTimeoutMs) },
    };

    if (qualifyingActivity) {
      return sessionModel.findOneAndUpdate(
        activeFilter,
        { $set: { lastActivityAt: currentDate } },
        { new: true }
      );
    }
    return sessionModel.findOne(activeFilter);
  }

  async function revoke(jti) {
    if (typeof jti !== 'string' || !jti) return false;
    const result = await sessionModel.updateOne(
      { jti, revokedAt: null },
      { $set: { revokedAt: new Date(now()) } }
    );
    return Boolean(result.modifiedCount ?? result.nModified);
  }

  async function revokeToken(token) {
    if (typeof token !== 'string' || !token) return false;
    let payload;
    try {
      // The signature is still verified; ignoring exp here lets logout revoke
      // a valid JWT whose deadline has passed while the browser still has it.
      payload = tokenVerifier(token, { ignoreExpiration: true });
    } catch {
      return false;
    }
    return revoke(payload?.jti);
  }

  return { create, validate, revoke, revokeToken };
}

export const authSessionService = createAuthSessionService();

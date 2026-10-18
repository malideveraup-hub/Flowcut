import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { GeminiRequestCounter, GeminiRequestSlot } from '../models/index.js';
import { AppError } from './errorHandler.js';

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

export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: gmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again later.', errors: [] },
});

export function createMongoGeminiCounterStore(model = GeminiRequestCounter) {
  return {
    async increment(scope, windowMs, now = Date.now()) {
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const id = `${scope}:${windowStart}`;
      const options = { upsert: true, new: true, setDefaultsOnInsert: true };
      try {
        const result = await model.findOneAndUpdate(
          { _id: id },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) } },
          options,
        );
        return {
          count: result.count,
          retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
        };
      } catch (error) {
        // Concurrent first writes can race the _id upsert. The loser then
        // increments the document the winner created.
        if (error?.code !== 11000) throw error;
        const result = await model.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { new: true });
        if (!result) throw error;
        return {
          count: result.count,
          retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
        };
      }
    },
  };
}

export function createMongoGeminiLeaseStore(model = GeminiRequestSlot) {
  return {
    async acquire(maxConcurrent, owner, now = Date.now(), leaseMs = env.geminiConcurrencyLeaseMs) {
      const slotIds = Array.from({ length: maxConcurrent }, (_, index) => `gemini:${index}`);
      for (const id of slotIds) {
        try {
          const slot = await model.findOneAndUpdate(
            { _id: id, expiresAt: { $lte: new Date(now) } },
            { $set: { owner, expiresAt: new Date(now + leaseMs) } },
            { upsert: true, new: true },
          );
          if (slot?.owner === owner) return { id, owner };
        } catch (error) {
          if (error?.code !== 11000) throw error;
        }
      }
      const occupied = await model.find({ _id: { $in: slotIds } }).select('expiresAt').sort({ expiresAt: 1 }).limit(1).lean();
      const expiresAt = occupied[0]?.expiresAt ? new Date(occupied[0].expiresAt).getTime() : now + 1000;
      return { retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
    },
    async release(lease) {
      await model.updateOne(
        { _id: lease.id, owner: lease.owner },
        { $set: { owner: '', expiresAt: new Date(0) } },
      );
    },
  };
}

export function createGeminiRequestLimiter({
  endpoint,
  counterStore = createMongoGeminiCounterStore(),
  leaseStore = createMongoGeminiLeaseStore(),
  windowMs = env.geminiLimitWindowMs,
  userLimitMax = env.geminiUserLimitMax,
  appLimitMax = env.geminiAppLimitMax,
  shopLimitMax = endpoint === 'insights' ? 8 : 24,
  maxConcurrent = env.geminiMaxConcurrentRequests,
  leaseMs = env.geminiConcurrencyLeaseMs,
  now = () => Date.now(),
}) {
  return async function limitGeminiRequests(req, res, next) {
    const requestId = randomUUID();
    req.geminiRequestId = requestId;
    res.set('X-Request-ID', requestId);

    const userId = String(req.user?.id || '');
    const shopId = String(req.user?.shopId || '');
    if (!userId || !shopId) return next(new AppError(401, 'Authentication required.'));

    try {
      const limits = [
        { scope: 'app:gemini', max: appLimitMax },
        { scope: `user:${userId}`, max: userLimitMax },
        { scope: `shop:${shopId}:${endpoint}`, max: shopLimitMax },
      ];
      for (const limit of limits) {
        const usage = await counterStore.increment(limit.scope, windowMs, now());
        if (usage.count > limit.max) {
          const retryAfterSeconds = usage.retryAfterSeconds || Math.ceil(windowMs / 1000);
          console.warn('[gemini-control] request_limited', {
            requestId,
            cause: 'application_rate_limit',
            scope: limit.scope.split(':')[0],
            endpoint,
            retryAfterSeconds,
          });
          res.set('Retry-After', String(retryAfterSeconds));
          return res.status(429).json({
            success: false,
            message: 'Too many questions were submitted in a short time. Please wait before sending another question.',
            errors: [],
            code: 'AI_APPLICATION_RATE_LIMIT',
          });
        }
      }

      const lease = await leaseStore.acquire(maxConcurrent, requestId, now(), leaseMs);
      if (lease.retryAfterSeconds) {
        console.warn('[gemini-control] request_limited', {
          requestId,
          cause: 'application_concurrency_limit',
          endpoint,
          retryAfterSeconds: lease.retryAfterSeconds,
        });
        res.set('Retry-After', String(lease.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          message: 'Too many questions were submitted in a short time. Please wait before sending another question.',
          errors: [],
          code: 'AI_CONCURRENCY_LIMIT',
        });
      }

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        leaseStore.release(lease).catch(() => {
          console.warn('[gemini-control] lease_release_failed', { requestId, endpoint });
        });
      };
      res.once('finish', release);
      res.once('close', release);
      next();
    } catch {
      console.error('[gemini-control] shared_store_unavailable', { requestId, endpoint });
      next(new AppError(503, 'The AI assistant is temporarily unavailable. Please try again later.', [], 'AI_LIMITER_UNAVAILABLE'));
    }
  };
}

export const analyticsInsightsLimiter = createGeminiRequestLimiter({ endpoint: 'insights' });
export const analyticsChatLimiter = createGeminiRequestLimiter({ endpoint: 'chat' });

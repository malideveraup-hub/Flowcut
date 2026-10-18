import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSessionService } from '../src/services/authSessionService.js';

const MINUTE = 60_000;

function createMemorySessionModel() {
  const records = [];
  const isActive = (record, filter) => record.jti === filter.jti &&
    record.revokedAt === filter.revokedAt &&
    record.absoluteExpiresAt > filter.absoluteExpiresAt.$gt &&
    record.lastActivityAt > filter.lastActivityAt.$gt;

  return {
    records,
    async create(record) {
      records.push({ ...record });
      return record;
    },
    async findOne(filter) {
      return records.find((record) => isActive(record, filter)) || null;
    },
    async findOneAndUpdate(filter, update) {
      const record = records.find((candidate) => isActive(candidate, filter));
      if (!record) return null;
      Object.assign(record, update.$set);
      return record;
    },
    async updateOne(filter, update) {
      const record = records.find((candidate) => candidate.jti === filter.jti && candidate.revokedAt === filter.revokedAt);
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set);
      return { modifiedCount: 1 };
    },
  };
}

function setupSessionService({ nowValue = Date.now(), idleTimeoutMs = 30 * MINUTE, maxLifetimeMs = 7 * 24 * 60 * MINUTE } = {}) {
  let currentTime = nowValue;
  let nextId = 0;
  const tokens = new Map();
  const sessionModel = createMemorySessionModel();
  const service = createAuthSessionService({
    sessionModel,
    now: () => currentTime,
    makeId: () => `session-${++nextId}`,
    idleTimeoutMs,
    maxLifetimeMs,
    tokenSigner: (payload) => {
      const token = `signed-session-${payload.jti}`;
      tokens.set(token, payload);
      return token;
    },
    tokenVerifier: (token, options) => {
      assert.deepEqual(options, { ignoreExpiration: true });
      const payload = tokens.get(token);
      if (!payload) throw new Error('invalid token');
      return payload;
    },
  });
  return { service, sessionModel, tokens, setNow(value) { currentTime = value; } };
}

test('session creation stores an immutable absolute deadline and signs a unique session id', async () => {
  const baseTime = Date.UTC(2026, 0, 1);
  const { service, sessionModel } = setupSessionService({ nowValue: baseTime, maxLifetimeMs: 7 * 24 * 60 * MINUTE });
  const session = await service.create('user-123');

  assert.equal(session.jti, 'session-1');
  assert.equal(session.token, 'signed-session-session-1');
  assert.equal(sessionModel.records[0].userId, 'user-123');
  assert.equal(sessionModel.records[0].createdAt.getTime(), baseTime);
  assert.equal(session.absoluteExpiresAt.getTime(), baseTime + 7 * 24 * 60 * MINUTE);
  assert.equal(sessionModel.records[0].absoluteExpiresAt.getTime(), session.absoluteExpiresAt.getTime());
});

test('qualifying activity resets the idle deadline but cannot revive an idle-expired session', async () => {
  const baseTime = Date.UTC(2026, 0, 1);
  const { service, sessionModel, setNow } = setupSessionService({ nowValue: baseTime });
  const session = await service.create('user-123');

  setNow(baseTime + 20 * MINUTE);
  assert.ok(await service.validate(session.jti), 'a valid session remains available to passive reads');
  const touched = await service.validate(session.jti, { qualifyingActivity: true });
  assert.equal(touched.lastActivityAt.getTime(), baseTime + 20 * MINUTE);

  setNow(baseTime + 49 * MINUTE);
  assert.ok(await service.validate(session.jti), 'qualifying activity extended the 30 minute idle window');

  setNow(baseTime + 50 * MINUTE + 1);
  assert.equal(await service.validate(session.jti, { qualifyingActivity: true }), null);
  assert.equal(sessionModel.records[0].lastActivityAt.getTime(), baseTime + 20 * MINUTE);
  setNow(baseTime + 51 * MINUTE);
  assert.equal(await service.validate(session.jti, { qualifyingActivity: true }), null);
});

test('absolute lifetime ends a session even when recent activity keeps it idle-active', async () => {
  const baseTime = Date.UTC(2026, 0, 1);
  const { service, setNow } = setupSessionService({
    nowValue: baseTime,
    idleTimeoutMs: 2 * 60 * MINUTE,
    maxLifetimeMs: 60 * MINUTE,
  });
  const session = await service.create('user-123');
  setNow(baseTime + 59 * MINUTE);
  assert.ok(await service.validate(session.jti, { qualifyingActivity: true }));
  setNow(baseTime + 60 * MINUTE);
  assert.equal(await service.validate(session.jti, { qualifyingActivity: true }), null);
});

test('logout revokes only the JWT session it received, including after JWT expiration', async () => {
  const { service } = setupSessionService();
  const first = await service.create('user-123');
  const second = await service.create('user-123');

  assert.equal(await service.revokeToken(first.token), true);
  assert.equal(await service.validate(first.jti), null);
  assert.ok(await service.validate(second.jti));
  assert.equal(await service.revokeToken('not-a-signed-token'), false);
});

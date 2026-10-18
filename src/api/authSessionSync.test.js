import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSessionSync } from './authSessionSync.js';

class FakeBroadcastChannel {
  static groups = new Map();

  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    const group = FakeBroadcastChannel.groups.get(name) || new Set();
    group.add(this);
    FakeBroadcastChannel.groups.set(name, group);
  }

  addEventListener(type, listener) {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'message') this.listeners.delete(listener);
  }

  postMessage(data) {
    for (const peer of FakeBroadcastChannel.groups.get(this.name) || []) {
      if (peer === this) continue;
      for (const listener of peer.listeners) listener({ data });
    }
  }

  close() {
    FakeBroadcastChannel.groups.get(this.name)?.delete(this);
    this.listeners.clear();
  }
}

function fakeWindow() {
  return {
    BroadcastChannel: FakeBroadcastChannel,
    addEventListener() {},
    removeEventListener() {},
    localStorage: { setItem() {}, removeItem() {} },
  };
}

test('session sync shares logout and expiration events without broadcasting user data', () => {
  const first = createAuthSessionSync({ windowRef: fakeWindow() });
  const second = createAuthSessionSync({ windowRef: fakeWindow() });
  const received = [];
  const unsubscribe = second.subscribe((message) => received.push(message));

  first.publish({ type: 'logout', user: { email: 'private@example.test' }, token: 'secret-token' });
  first.publish({ type: 'expired', prompt: 'session credentials' });

  assert.deepEqual(received.map(({ type }) => type), ['logout', 'expired']);
  assert.ok(received.every((message) => Object.keys(message).sort().join(',') === 'sentAt,type'));
  unsubscribe();
  first.close();
  second.close();
});

test('activity sync contains only the session deadlines and remaining times and rejects malformed messages', () => {
  const first = createAuthSessionSync({ windowRef: fakeWindow() });
  const second = createAuthSessionSync({ windowRef: fakeWindow() });
  const received = [];
  const unsubscribe = second.subscribe((message) => received.push(message));

  first.publish({
    type: 'activity', idleExpiresAt: 1000, absoluteExpiresAt: 9000,
    idleRemainingMs: 100, absoluteRemainingMs: 900, user: { name: 'private' },
  });
  first.publish({ type: 'activity', idleExpiresAt: 'invalid', absoluteExpiresAt: 9000, idleRemainingMs: 100, absoluteRemainingMs: 900 });
  first.publish({ type: 'unsupported', token: 'not broadcast' });

  assert.equal(received.length, 1);
  assert.equal(received[0].idleExpiresAt, 1000);
  assert.equal(received[0].absoluteExpiresAt, 9000);
  assert.equal(received[0].idleRemainingMs, 100);
  assert.equal(received[0].absoluteRemainingMs, 900);
  assert.deepEqual(Object.keys(received[0]).sort(), [
    'absoluteExpiresAt', 'absoluteRemainingMs', 'idleExpiresAt', 'idleRemainingMs', 'sentAt', 'type',
  ]);
  unsubscribe();
  first.close();
  second.close();
});

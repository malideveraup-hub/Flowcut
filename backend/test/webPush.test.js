import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createWebPushService } from '../src/services/webPushService.js';

const configuration = { vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'mailto:test@example.com' };
const endpoint = (path) => `https://fcm.googleapis.com/${path}`;
const validInput = (path) => ({ endpoint: endpoint(path), expirationTime: null, keys: { p256dh: 'a'.repeat(65), auth: 'b'.repeat(22) } });

function makeHarness() {
  const rows = [];
  const calls = [];
  const client = {
    setVapidDetails: (...args) => calls.push(['vapid', ...args]),
    sendNotification: async (...args) => {
      calls.push(['send', ...args]);
      const failure = client.failureFor?.(args[0].endpoint);
      if (failure) throw failure;
    },
  };
  const subscriptions = {
    async updateOne(filter, update) {
      let row = rows.find((item) => item.endpoint === filter.endpoint);
      if (!row) { row = { _id: String(rows.length + 1) }; rows.push(row); }
      Object.assign(row, update.$set);
    },
    find(filter) { return { lean: async () => rows.filter((row) => row.userId === filter.userId) }; },
    async deleteOne(filter) {
      const index = rows.findIndex((row) => (filter._id ? row._id === filter._id : row.userId === filter.userId && row.endpoint === filter.endpoint));
      if (index < 0) return { deletedCount: 0 };
      rows.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
  const logs = [];
  const service = createWebPushService({ pushClient: client, subscriptions, configuration, logger: { error: (...args) => logs.push(args) } });
  return { service, rows, calls, client, logs };
}

test('stores multiple devices, validates subscriptions, and scopes removal to the authenticated owner', async () => {
  const { service, rows } = makeHarness();
  await service.saveWebPushSubscription('user-a', validInput('device-1'));
  await service.saveWebPushSubscription('user-a', validInput('device-2'));
  assert.equal(rows.length, 2);
  assert.equal(await service.removeWebPushSubscription('user-b', endpoint('device-1')), false);
  assert.equal(rows.length, 2);
  assert.equal(await service.removeWebPushSubscription('user-a', endpoint('device-1')), true);
  assert.equal(rows.length, 1);
  await assert.rejects(service.saveWebPushSubscription('user-a', { ...validInput('bad'), endpoint: 'https://attacker.invalid/push' }), { statusCode: 400 });
});

test('sends minimized payload to every device and removes expired endpoints', async () => {
  const { service, rows, calls, client, logs } = makeHarness();
  await service.saveWebPushSubscription('user-a', validInput('device-1'));
  await service.saveWebPushSubscription('user-a', validInput('device-2'));
  client.failureFor = (target) => target.endsWith('device-1') ? Object.assign(new Error('secret endpoint details'), { statusCode: 410 }) : null;
  await service.sendQueuePushNotification('notification-id', { userId: 'user-a' });
  assert.equal(calls.filter(([type]) => type === 'send').length, 2);
  const successful = calls.find((call) => call[0] === 'send' && call[1].endpoint.endsWith('device-2'));
  assert.deepEqual(JSON.parse(successful[2]), {
    id: 'notification-id', title: 'FlowCut queue update',
    message: 'Your queue status has changed. Open FlowCut for details.', url: '/my-queue',
  });
  assert.equal(rows.length, 1);
  assert.equal(logs.length, 0);
});

test('logs delivery failures safely and keeps them from escaping the sender', async () => {
  const { service, client, logs } = makeHarness();
  await service.saveWebPushSubscription('user-a', validInput('device-1'));
  client.failureFor = () => Object.assign(new Error('sensitive endpoint and payload'), { statusCode: 503 });
  await assert.doesNotReject(service.sendQueuePushNotification('n1', { userId: 'user-a' }));
  assert.deepEqual(logs[0], ['[web-push] Delivery failed.', { status: 503, errorType: 'Error' }]);
});

test('does not store subscriptions when VAPID is unavailable', async () => {
  const service = createWebPushService({ pushClient: {}, subscriptions: {}, configuration: {} });
  assert.deepEqual(service.getWebPushConfiguration(), { enabled: false, publicKey: null });
  await assert.rejects(service.saveWebPushSubscription('user-a', validInput('device-1')), { statusCode: 503 });
});

test('push subscription endpoints require an authenticated customer session', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const requests = [
    ['GET', '/push-configuration'],
    ['PUT', '/push-subscription', { endpoint: endpoint('unauthorized'), keys: { p256dh: 'a'.repeat(65), auth: 'b'.repeat(22) } }],
    ['DELETE', '/push-subscription', { endpoint: endpoint('unauthorized') }],
  ];
  for (const [method, path, body] of requests) {
    const response = await fetch(`${base}${path}`, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 401, `${method} ${path} must reject an unauthenticated request`);
  }
});

test('service worker displays push notifications and opens the safe target on click', async () => {
  const source = await readFile(new URL('../../public/service-worker.js', import.meta.url), 'utf8');
  const listeners = {};
  const shown = [];
  const opened = [];
  const worker = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    location: { origin: 'https://www.flowcutph.me' },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(source, { self: worker, URL, Promise, console });
  let pushTask;
  listeners.push({ data: { json: () => ({ title: 'FlowCut queue update', message: 'Open FlowCut.', url: '/my-queue' }) }, waitUntil: (task) => { pushTask = task; } });
  await pushTask;
  assert.equal(shown[0][0], 'FlowCut queue update');
  let clickTask;
  listeners.notificationclick({ notification: { data: { url: 'https://attacker.invalid/' }, close() {} }, waitUntil: (task) => { clickTask = task; } });
  await clickTask;
  assert.deepEqual(opened, ['https://www.flowcutph.me/my-queue']);
});

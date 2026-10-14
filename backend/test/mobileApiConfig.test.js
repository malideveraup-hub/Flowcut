import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiBase } from '../../src/api/apiBase.js';
import { isLocalDevelopmentOrigin } from '../src/utils/localDevelopmentOrigin.js';

test('development API URL follows the computer host when opened from a phone', () => {
  const phoneLocation = { origin: 'http://192.168.1.42:5173', hostname: '192.168.1.42' };

  assert.equal(resolveApiBase('http://localhost:4000', phoneLocation, true), 'http://192.168.1.42:4000');
  assert.equal(resolveApiBase(undefined, phoneLocation, true), 'http://192.168.1.42:4000');
});

test('development keeps loopback on desktop and preserves explicit remote API hosts', () => {
  const desktopLocation = { origin: 'http://localhost:5173', hostname: 'localhost' };
  const phoneLocation = { origin: 'http://192.168.1.42:5173', hostname: '192.168.1.42' };

  assert.equal(resolveApiBase(undefined, desktopLocation, true), 'http://localhost:4000');
  assert.equal(resolveApiBase('https://api.flowcutph.me/', phoneLocation, true), 'https://api.flowcutph.me');
  assert.equal(resolveApiBase('http://localhost:4000', phoneLocation, false), 'http://localhost:4000');
  assert.equal(resolveApiBase(undefined, phoneLocation, false), '');
});

test('only private IPv4 Vite origins qualify for the development CORS exception', () => {
  assert.equal(isLocalDevelopmentOrigin('http://192.168.1.42:5173'), true);
  assert.equal(isLocalDevelopmentOrigin('http://10.0.0.8:5173'), true);
  assert.equal(isLocalDevelopmentOrigin('http://172.31.2.10:5173'), true);
  assert.equal(isLocalDevelopmentOrigin('http://8.8.8.8:5173'), false);
  assert.equal(isLocalDevelopmentOrigin('https://192.168.1.42:5173'), false);
  assert.equal(isLocalDevelopmentOrigin('http://192.168.1.42:5174'), false);
});

test('API CORS reflects desktop and private LAN origins with credentials', async () => {
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/flowcut-cors-test';
  process.env.JWT_SECRET ||= 'cors-test-secret-that-is-never-used-to-sign-a-token';

  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const apiRoot = `http://127.0.0.1:${server.address().port}`;
    for (const origin of ['http://localhost:5173', 'http://192.168.1.42:5173']) {
      const response = await fetch(`${apiRoot}/api/health`, { headers: { Origin: origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    }

    const preflight = await fetch(`${apiRoot}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://192.168.1.42:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://192.168.1.42:5173');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

    const untrusted = await fetch(`${apiRoot}/api/health`, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

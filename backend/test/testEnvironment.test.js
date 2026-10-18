import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from '../src/config/env.js';

test('test runner uses isolated credentials and non-routable local service settings', () => {
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.mongoUri, 'mongodb://127.0.0.1:1/flowcut-test');
  assert.equal(env.jwtSecret, 'test-only-never-use-outside-tests');
  assert.equal(env.smtpHost, '127.0.0.1');
  assert.equal(env.smtpPort, 1);
  assert.equal(env.resendApiKey, '');
  assert.equal(process.env.GEMINI_API_KEY, '');
  assert.equal(env.vapidPublicKey, '');
  assert.equal(env.vapidPrivateKey, '');
});

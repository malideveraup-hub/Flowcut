import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import test from 'node:test';

// Use a local closed port so failure behavior is deterministic and never
// contacts a real mail provider or reads credentials from backend/.env.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/flowcut-test';
process.env.JWT_SECRET = 'test-only-mail-startup-secret';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_USER = 'test-user';
process.env.SMTP_PASS = 'test-password';
process.env.MAIL_FROM = 'FlowCut <no-reply@example.test>';
delete process.env.RESEND_API_KEY;

let mailService;

test('SMTP transport initialization does not resolve DNS or require provider connectivity', async (t) => {
  t.mock.method(dns, 'resolve4', async () => {
    throw Object.assign(new Error('DNS should not be queried during import.'), { code: 'ETIMEOUT' });
  });
  mailService = await import('../src/services/mailService.js?no-eager-dns');
  assert.equal(mailService.activeMailProvider, 'smtp');
});

test('SMTP connection failures become safe 503 errors when sending', async (t) => {
  let logLine = '';
  t.mock.method(console, 'error', (...args) => { logLine = args.join(' '); });

  await assert.rejects(mailService.sendOtpEmail('customer@example.test', '123456'), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.message, 'Email delivery is temporarily unavailable. Please try again.');
    assert.match(error.providerCode, /^E(?:SOCKET|CONNECTION)$/);
    return true;
  });
  assert.match(logLine, /\[mail\] SMTP delivery failed/);
  assert.doesNotMatch(logLine, /test-password|customer@example\.test/);
});

test('server startup reaches listen when the SMTP provider is unavailable', async (t) => {
  const { startServer } = await import('../src/server.js');
  const calls = [];
  t.mock.method(console, 'log', () => {});

  const server = await startServer({
    connectDatabase: async () => { calls.push('database'); },
    synchronizeIndexes: async () => { calls.push('indexes'); },
    startMonitor: () => { calls.push('monitor'); },
    app: {},
    port: 0,
    listen: (_app, port, callback) => {
      calls.push(`listen:${port}`);
      callback();
      return { listening: true };
    },
  });

  assert.deepEqual(calls, ['database', 'indexes', 'monitor', 'listen:0']);
  assert.deepEqual(server, { listening: true });
});

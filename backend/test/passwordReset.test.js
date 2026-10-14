import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';

// Force a fake Resend configuration before importing the service. The tests
// replace fetch, so they never send mail or use credentials from backend/.env.
process.env.NODE_ENV = 'production';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/flowcut-test';
process.env.JWT_SECRET = 'test-only-password-reset-secret';
process.env.RESEND_API_KEY = 'test-only-resend-key';
process.env.MAIL_FROM = 'FlowCut <no-reply@example.test>';
process.env.FRONTEND_URL = 'https://flowcut.test';

const [{ User }, authServiceModule] = await Promise.all([
  import('../src/models/index.js'),
  import('../src/services/authService.js'),
]);
const { requestPasswordReset, resetPassword, authenticateUser } = authServiceModule;

function fakeAccount(email = 'registered@gmail.com') {
  return {
    _id: { toString: () => 'test-user-id' },
    name: 'Test',
    lastName: 'Customer',
    mobileNumber: '09123456789',
    mobileVerified: false,
    email,
    emailVerified: true,
    passwordHash: 'old-password-hash',
    role: 'customer',
    shopId: null,
    termsAccepted: true,
    termsVersion: '1.0',
    privacyAccepted: true,
    privacyVersion: '1.0',
    isDeleted: false,
    save: async () => {},
  };
}

function acceptedResendResponse(id = 'test-message-id') {
  return { ok: true, status: 200, json: async () => ({ id }) };
}

test('registered Gmail reset waits for provider acceptance and sends a one-hour link', async (t) => {
  const account = fakeAccount();
  const startedAt = Date.now();
  let releaseProvider;
  let markProviderStarted;
  let requestFinished = false;
  let sentRequest;
  const providerGate = new Promise((resolve) => { releaseProvider = resolve; });
  const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });

  t.mock.method(User, 'findOne', async (filter) => {
    assert.deepEqual(filter, { email: 'registered@gmail.com' });
    return account;
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sentRequest = { url, options, body: JSON.parse(options.body) };
    markProviderStarted();
    await providerGate;
    return acceptedResendResponse();
  });
  t.mock.method(console, 'info', () => {});

  const pendingRequest = requestPasswordReset({ email: '  Registered@gmail.com  ' }).then((result) => {
    requestFinished = true;
    return result;
  });
  await providerStarted;
  assert.equal(requestFinished, false, 'the endpoint service must wait for the provider');
  releaseProvider();

  const result = await pendingRequest;
  assert.deepEqual(result, {
    message: 'If an account exists for that Gmail, a password reset link will be sent.',
  });
  assert.equal(sentRequest.url, 'https://api.resend.com/emails');
  assert.equal(sentRequest.body.subject, 'Reset your FlowCut password');
  assert.match(sentRequest.body.text, /https:\/\/flowcut\.test\/reset-password\?token=[a-f\d]{64}/);
  assert.match(sentRequest.body.html, /href="https:\/\/flowcut\.test\/reset-password\?token=[a-f\d]{64}"/);

  const token = sentRequest.body.text.match(/token=([a-f\d]{64})/)[1];
  assert.equal(
    account.passwordResetTokenHash,
    crypto.createHash('sha256').update(token).digest('hex'),
    'only the SHA-256 token hash should be stored'
  );
  assert.notEqual(account.passwordResetTokenHash, token);
  assert.ok(account.passwordResetExpiresAt.getTime() >= startedAt + 59 * 60 * 1000);
  assert.ok(account.passwordResetExpiresAt.getTime() <= Date.now() + 60 * 60 * 1000);
});

test('unknown Gmail gets the same public response and no email is attempted', async (t) => {
  t.mock.method(User, 'findOne', async () => null);
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('No email should be sent for an unregistered address');
  });

  const result = await requestPasswordReset({ email: 'unknown@gmail.com' });
  assert.deepEqual(result, {
    message: 'If an account exists for that Gmail, a password reset link will be sent.',
  });
});

test('account lookup failures stay generic and log only a safe failure code', async (t) => {
  let logLine = '';
  t.mock.method(User, 'findOne', async () => {
    throw Object.assign(new Error('Do not log this database detail or email.'), { code: 'ETESTDB' });
  });
  t.mock.method(console, 'error', (...args) => { logLine = args.join(' '); });

  const result = await requestPasswordReset({ email: 'lookup-failure@gmail.com' });
  assert.deepEqual(result, {
    message: 'If an account exists for that Gmail, a password reset link will be sent.',
  });
  assert.match(logLine, /stage=account_lookup_failed code=ETESTDB/);
  assert.doesNotMatch(logLine, /Do not log|lookup-failure@gmail\.com/);
});

test('reset-token storage failures stay generic and are logged before any email attempt', async (t) => {
  const account = fakeAccount('storage-failure@gmail.com');
  let logLine = '';
  t.mock.method(User, 'findOne', async () => account);
  account.save = async () => {
    throw Object.assign(new Error('Do not log this document or token.'), { code: 121, name: 'MongoServerError' });
  };
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Email must not be attempted unless its token was stored.');
  });
  t.mock.method(console, 'error', (...args) => { logLine = args.join(' '); });

  const result = await requestPasswordReset({ email: 'storage-failure@gmail.com' });
  assert.deepEqual(result, {
    message: 'If an account exists for that Gmail, a password reset link will be sent.',
  });
  assert.match(logLine, /stage=token_storage_failed code=121/);
  assert.doesNotMatch(logLine, /Do not log|storage-failure@gmail\.com|token=/);
});

test('provider rejection is logged safely and does not change the generic public response', async (t) => {
  const account = fakeAccount('rejected@gmail.com');
  let logLine = '';
  t.mock.method(User, 'findOne', async () => account);
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      name: 'validation_error',
      message: 'Do not log this provider response or recipient.',
    }),
  }));
  t.mock.method(console, 'error', (...args) => { logLine = args.join(' '); });

  const result = await requestPasswordReset({ email: 'rejected@gmail.com' });
  assert.deepEqual(result, {
    message: 'If an account exists for that Gmail, a password reset link will be sent.',
  });
  assert.match(logLine, /provider=resend code=validation_error response=422/);
  assert.doesNotMatch(logLine, /Do not log this provider response|rejected@gmail\.com|token=/);
});

test('invalid, expired, and previously used tokens cannot reset a password', async (t) => {
  let updateCalls = 0;
  t.mock.method(User, 'findOne', () => ({ select: async () => null }));
  t.mock.method(User, 'findOneAndUpdate', async () => { updateCalls += 1; return null; });

  await assert.rejects(
    resetPassword({ token: 'not-a-token', password: 'NewSecurePass123!' }),
    /invalid or expired/
  );
  await assert.rejects(
    resetPassword({ token: 'a'.repeat(64), password: 'NewSecurePass123!' }),
    /invalid or expired/
  );
  assert.equal(updateCalls, 0);
});

test('a valid token is single-use and the new password works for login', async (t) => {
  const account = fakeAccount();
  const originalToken = 'b'.repeat(64);
  const expectedTokenHash = crypto.createHash('sha256').update(originalToken).digest('hex');
  let updateFilter;
  let update;
  let passwordResetConsumed = false;

  t.mock.method(User, 'findOne', (filter) => ({
    select: async (selection) => {
      if (selection === '_id') {
        if (passwordResetConsumed || filter.passwordResetTokenHash !== expectedTokenHash) return null;
        return { _id: account._id };
      }
      if (selection === '+passwordHash' && filter.email === account.email) return account;
      throw new Error('Unexpected user query in password-reset test.');
    },
  }));
  t.mock.method(User, 'findOneAndUpdate', async (filter, updateDocument) => {
    updateFilter = filter;
    update = updateDocument;
    account.passwordHash = updateDocument.$set.passwordHash;
    passwordResetConsumed = true;
    return account;
  });

  const resetResult = await resetPassword({
    token: originalToken,
    password: 'NewSecurePass123!',
  });
  assert.deepEqual(resetResult, { message: 'Your password has been reset.' });
  assert.equal(updateFilter.passwordResetTokenHash, expectedTokenHash);
  assert.ok(updateFilter.passwordResetExpiresAt.$gt instanceof Date);
  assert.deepEqual(update.$unset, { passwordResetTokenHash: '', passwordResetExpiresAt: '' });
  assert.notEqual(account.passwordHash, 'old-password-hash');

  const loginResult = await authenticateUser({
    email: 'REGISTERED@gmail.com',
    password: 'NewSecurePass123!',
  });
  assert.equal(loginResult.user.email, 'registered@gmail.com');
  assert.equal(loginResult.user.passwordHash, undefined);
  assert.ok(loginResult.token);

  await assert.rejects(
    resetPassword({ token: originalToken, password: 'AnotherSecurePass123!' }),
    /invalid or expired/
  );
});

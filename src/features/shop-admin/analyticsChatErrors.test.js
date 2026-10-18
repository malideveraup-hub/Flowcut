import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatChatErrorMessage } from './analyticsChatErrors.js';

test('chat errors distinguish app throttles, provider limits, quota, timeout, and configuration', () => {
  for (const error of [
    { code: 'AI_APPLICATION_RATE_LIMIT', retryAfterSeconds: 8 },
    { code: 'GEMINI_RATE_LIMIT', retryAfterSeconds: 75 },
    { code: 'GEMINI_QUOTA_EXHAUSTED' },
    { code: 'GEMINI_TIMEOUT' },
    { code: 'GEMINI_PROVIDER_UNAVAILABLE' },
    { code: 'GEMINI_CONFIGURATION' },
  ]) {
    const message = formatChatErrorMessage(error);
    assert.match(message, /AI-generated insights are temporarily unavailable/);
    assert.match(message, /dashboard metrics and charts remain available/);
  }
  assert.match(formatChatErrorMessage({ code: 'AI_APPLICATION_RATE_LIMIT', retryAfterSeconds: 8 }), /8 seconds/);
  assert.match(formatChatErrorMessage({ code: 'GEMINI_RATE_LIMIT', retryAfterSeconds: 75 }), /2 minutes/);
  assert.match(formatChatErrorMessage({ code: 'GEMINI_TIMEOUT' }), /too long to respond/);
  assert.match(formatChatErrorMessage({ code: 'GEMINI_CONFIGURATION' }), /contact the administrator/);
  assert.doesNotMatch(formatChatErrorMessage({ message: 'raw provider error includes a secret' }), /secret/);
});

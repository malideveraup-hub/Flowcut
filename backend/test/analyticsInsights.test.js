import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { createOwnShopAnalyticsInsightsHandler } from '../src/controllers/analyticsController.js';
import { createGeminiRequestLimiter } from '../src/middleware/rateLimiters.js';
import { createAnalyticsInsightsService, requestGeminiJson } from '../src/services/analyticsInsightsService.js';

const shopId = '68a000000000000000000001';
const analytics = {
  range: { from: '2026-10-01', to: '2026-10-07' },
  summary: { customersServed: 15, averageWaitMinutes: 22, averageMinutes: 31, waitSampleCount: 12 },
  daily: [{ date: '2026-10-01', joined: 4, completed: 3 }],
  hourly: [{ hour: 9, joined: 4 }],
  peakHours: { busiest: { hour: 9, count: 4 }, quietest: { hour: 10, count: 0 } },
  waitDistribution: [{ label: '15-<30 min', count: 8, percent: 66.7 }],
  serviceStats: [{ serviceName: 'Classic cut', completedCount: 5, sampleCount: 5, averageMinutes: 31, medianMinutes: 30, percentile80Minutes: 36, mostCommonDurations: [{ minutes: 30, count: 3 }], outlierCount: 0, serviceId: 'private-id' }],
  barberStats: [{ barberName: 'Alex', completedCount: 5, sampleCount: 5, averageMinutes: 31, medianMinutes: 30, percentile80Minutes: 36, mostCommonDurations: [{ minutes: 30, count: 3 }], outlierCount: 0, barberId: 'private-id', currentAvailability: 'AVAILABLE' }],
  explanations: ['Queue size snapshots are unavailable.'],
  records: [{ customerId: 'must-not-be-sent', customerEmail: 'private@example.test' }],
};

const modelResponse = {
  summary: 'Wait times are elevated in the selected period.',
  insights: [{
    title: 'Review peak-hour coverage',
    observation: 'The busiest hour recorded four joins.',
    recommendation: 'Compare staffing during this hour for the next two weeks.',
    evidence: ['9:00 UTC had 4 queue entries.'],
    confidence: 'Low',
  }],
  limitations: ['Only 12 valid wait observations are available.'],
};

test('installed Gemini SDK uses the supported GenerateContent request and retries transient provider errors once', async () => {
  let attempts = 0;
  let captured;
  const result = await requestGeminiJson({
    prompt: [{ role: 'user', parts: [{ text: 'Check supported aggregates.' }] }],
    schema: { responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' } }, required: ['answer'] } },
    apiKey: 'test-only-key',
    model: 'gemini-3.8-flash',
    fetchImpl: async (url, init) => {
      attempts += 1;
      captured = { url: String(url), init };
      if (attempts === 1) return new Response(JSON.stringify({ error: { message: 'temporary' } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"grounded"}' }] } }] }), { status: 200 });
    },
  });
  assert.equal(result.answer, 'grounded');
  assert.equal(attempts, 2);
  assert.match(captured.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(new Headers(captured.init.headers).get('x-goog-api-key'), 'test-only-key');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.contents[0].parts[0].text, 'Check supported aggregates.');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.properties.answer.type, 'STRING');
  assert.equal(body.generationConfig.temperature, undefined);

  let permanentFailureAttempts = 0;
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema: { responseSchema: { type: 'OBJECT' } },
    apiKey: 'test-only-key', model: 'gemini-3.8-flash',
    fetchImpl: async () => {
      permanentFailureAttempts += 1;
      return new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 403 });
    },
  }), { statusCode: 503 });
  assert.equal(permanentFailureAttempts, 1);
});

test('Gemini receives only aggregate shop analytics and returns structured insight data', async () => {
  let receivedShopId;
  let receivedFilters;
  let request;
  const generate = createAnalyticsInsightsService({
    apiKey: 'test-key',
    model: 'test-model',
    readAnalytics: async (id, filters) => {
      receivedShopId = id;
      receivedFilters = filters;
      return analytics;
    },
    clientFactory: (key) => {
      assert.equal(key, 'test-key');
      return { models: { generateContent: async (options) => {
        request = options;
        return { text: JSON.stringify(modelResponse) };
      } } };
    },
  });

  const filters = { from: '2026-10-01', to: '2026-10-07', serviceId: 'service-filter', shopId: 'untrusted-client-shop' };
  const result = await generate(shopId, filters);
  const prompt = request.contents[0].parts[0].text;

  assert.equal(receivedShopId, shopId);
  assert.equal(receivedFilters, filters);
  assert.equal(request.model, 'test-model');
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.equal(request.config.maxOutputTokens, 1600);
  assert.match(prompt, /Classic cut/);
  assert.match(prompt, /"customersServed":15/);
  assert.match(prompt, /"averageWaitMinutes":22/);
  assert.match(prompt, /"averageMinutes":31/);
  assert.match(prompt, /"mostCommonDurations":\[\{"minutes":30,"count":3\}\]/);
  assert.doesNotMatch(prompt, /must-not-be-sent|private@example\.test|customerId|customerEmail/);
  assert.deepEqual(result.insights, modelResponse.insights);
  assert.deepEqual(result.range, analytics.range);
  assert.equal(result.model, 'test-model');
});

test('AI insights fail clearly when Gemini is not configured without reading shop analytics', async () => {
  let analyticsRead = false;
  const generate = createAnalyticsInsightsService({
    apiKey: '',
    readAnalytics: async () => { analyticsRead = true; return analytics; },
  });
  await assert.rejects(generate(shopId, {}), { statusCode: 503, code: 'GEMINI_CONFIGURATION' });
  assert.equal(analyticsRead, false);
});

test('Gemini provider failures and malformed responses become safe application errors', async () => {
  const base = { apiKey: 'test-key', readAnalytics: async () => analytics };
  const unavailable = createAnalyticsInsightsService({
    ...base,
    clientFactory: () => ({ models: { generateContent: async () => { throw Object.assign(new Error('Daily project quota exceeded'), { status: 429, code: 'RESOURCE_EXHAUSTED' }); } } }),
  });
  await assert.rejects(unavailable(shopId, {}), { statusCode: 503, code: 'GEMINI_QUOTA_EXHAUSTED' });

  const billing = createAnalyticsInsightsService({
    ...base,
    clientFactory: () => ({ models: { generateContent: async () => {
      throw Object.assign(new Error('Billing account is not linked to this project'), { status: 403, code: 'PERMISSION_DENIED' });
    } } }),
  });
  await assert.rejects(billing(shopId, {}), { statusCode: 503, code: 'GEMINI_BILLING_CONFIGURATION' });

  const malformed = createAnalyticsInsightsService({
    ...base,
    clientFactory: () => ({ models: { generateContent: async () => ({ text: 'not json' }) } }),
  });
  await assert.rejects(malformed(shopId, {}), { statusCode: 502, message: /unreadable response/ });
});

test('Gemini configuration failures retain provider codes and safe diagnostics in logs', async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    await assert.rejects(requestGeminiJson({
      prompt: 'private customer@example.test prompt',
      schema: { responseSchema: { type: 'OBJECT' } },
      apiKey: 'private-test-key',
      model: 'gemini-3.8-flash',
      fetchImpl: async () => new Response(JSON.stringify({ error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Unsupported maxLength setting for responseSchema; customer@example.test',
      } }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    }), { statusCode: 502, message: /rejected the analytics request configuration/ });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(logs.length, 1);
  const [, entry] = logs[0];
  assert.equal(entry.providerCode, 'INVALID_ARGUMENT');
  assert.equal(entry.diagnostic, 'schema,string_length_constraint');
  assert.equal(entry.status, 400);
  assert.doesNotMatch(JSON.stringify(entry), /customer@example\.test|private-test-key|private customer/);
});

test('Gemini safety blocks and token limits return clear safe errors', async () => {
  const schema = { responseSchema: { type: 'OBJECT' } };
  const safety = async () => ({ promptFeedback: { blockReason: 'SAFETY' } });
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: safety } }),
  }), { statusCode: 422, message: /safety filters blocked it/ });
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) } }),
  }), { statusCode: 502, message: /reached its answer limit/ });
});

test('Gemini quota and rate-limit responses are not retried as if they were transient', async () => {
  let quotaAttempts = 0;
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema: { responseSchema: { type: 'OBJECT' } },
    apiKey: 'test-key', model: 'gemini-3.8-flash',
    fetchImpl: async () => {
      quotaAttempts += 1;
      return new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Project daily quota exceeded' } }), { status: 429 });
    },
  }), { statusCode: 503, code: 'GEMINI_QUOTA_EXHAUSTED' });
  assert.equal(quotaAttempts, 1);

  let rateLimitAttempts = 0;
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema: { responseSchema: { type: 'OBJECT' } },
    apiKey: 'test-key', model: 'gemini-3.8-flash',
    fetchImpl: async () => {
      rateLimitAttempts += 1;
      return new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for requests per minute, limit: 15' } }), { status: 429, headers: { 'Retry-After': '12' } });
    },
  }), (error) => error.statusCode === 503 && error.code === 'GEMINI_RATE_LIMIT' && error.retryAfterSeconds === 12);
  assert.equal(rateLimitAttempts, 1);
});

test('provider quota logs retain safe quota dimensions and retry delay without logging provider text', async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  try {
    await assert.rejects(requestGeminiJson({
      prompt: 'private prompt',
      schema: { responseSchema: { type: 'OBJECT' } },
      apiKey: 'private-test-key',
      model: 'gemini-3.5-flash-lite',
      fetchImpl: async () => new Response(JSON.stringify({ error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 27, model: gemini-3.5-flash-lite. customer@example.test',
      } }), { status: 429, headers: { 'Retry-After': '7' } }),
    }), { code: 'GEMINI_QUOTA_EXHAUSTED' });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(logs.length, 1);
  const [, entry] = logs[0];
  assert.equal(entry.retryAfterSeconds, 7);
  assert.deepEqual(entry.quotaDetails, [{
    quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
    quotaLimit: '27',
    model: 'gemini-3.5-flash-lite',
  }]);
  assert.doesNotMatch(JSON.stringify(entry), /customer@example\.test|private-test-key|private prompt/);
});

test('Gemini distinguishes timeouts and oversized inputs without exposing provider text', async () => {
  const schema = { responseSchema: { type: 'OBJECT' } };
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: async () => {
      throw Object.assign(new Error('private timeout payload should not be returned'), { name: 'TimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' });
    } } }),
  }), { statusCode: 504, code: 'GEMINI_TIMEOUT' });

  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: async () => {
      throw Object.assign(new Error('Input prompt contains too many tokens'), { status: 400, code: 'INVALID_ARGUMENT' });
    } } }),
  }), { statusCode: 413, message: /selected analytics request is too large/ });
});

test('empty Gemini text is reported separately from malformed JSON', async () => {
  const schema = { responseSchema: { type: 'OBJECT' } };
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: async () => ({ text: '' }) } }),
  }), { statusCode: 502, message: /empty response/ });
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema, apiKey: 'test-key', model: 'gemini-3.8-flash',
    clientFactory: () => ({ models: { generateContent: async () => ({ text: '{broken' }) } }),
  }), { statusCode: 502, message: /unreadable response/ });
});

test('insight controller uses the authenticated shop id and request filters', async () => {
  let receivedShopId;
  let receivedFilters;
  let responseBody;
  const handler = createOwnShopAnalyticsInsightsHandler(async (id, filters) => {
    receivedShopId = id;
    receivedFilters = filters;
    return { summary: 'ok' };
  });
  const body = { from: '2026-10-01', to: '2026-10-07', shopId: 'client-shop-id' };

  await handler(
    { user: { shopId }, body },
    { json: (value) => { responseBody = value; } },
    (error) => { throw error; },
  );
  assert.equal(receivedShopId, shopId);
  assert.equal(receivedFilters, body);
  assert.deepEqual(responseBody, { success: true, data: { summary: 'ok' } });
});

test('quick insight generation is rate limited per authenticated shop', async (context) => {
  const counters = new Map();
  const counterStore = {
    async increment(scope, windowMs, now) {
      const key = `${scope}:${Math.floor(now / windowMs)}`;
      const count = (counters.get(key) || 0) + 1;
      counters.set(key, count);
      return { count, retryAfterSeconds: 1 };
    },
  };
  const limiter = createGeminiRequestLimiter({
    endpoint: 'insights', counterStore,
    leaseStore: { acquire: async (_max, owner) => ({ id: owner, owner }), release: async () => {} },
    appLimitMax: 100, userLimitMax: 100, shopLimitMax: 8, now: () => 1000,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'insight-rate-limit-test-user', shopId: 'insight-rate-limit-test-shop' }; next(); });
  app.post('/insights', limiter, (_req, res) => res.json({ success: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  let finalResponse;
  for (let index = 0; index < 9; index += 1) {
    finalResponse = await fetch(`http://127.0.0.1:${address.port}/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }
  assert.equal(finalResponse.status, 429);
});

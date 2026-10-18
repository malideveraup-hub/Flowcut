import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { createOwnShopAnalyticsInsightsHandler } from '../src/controllers/analyticsController.js';
import { analyticsInsightsLimiter } from '../src/middleware/rateLimiters.js';
import { createAnalyticsInsightsService, requestGeminiJson } from '../src/services/analyticsInsightsService.js';

const shopId = '68a000000000000000000001';
const analytics = {
  range: { from: '2026-10-01', to: '2026-10-07' },
  summary: { customersServed: 15, averageWaitMinutes: 22, averageMinutes: 31, waitSampleCount: 12 },
  daily: [{ date: '2026-10-01', joined: 4, completed: 3 }],
  hourly: [{ hour: 9, joined: 4 }],
  peakHours: { busiest: { hour: 9, count: 4 }, quietest: { hour: 10, count: 0 } },
  waitDistribution: [{ label: '15-<30 min', count: 8, percent: 66.7 }],
  serviceStats: [{ serviceName: 'Classic cut', completedCount: 5, sampleCount: 5, averageMinutes: 31, medianMinutes: 30, percentile80Minutes: 36, outlierCount: 0, serviceId: 'private-id' }],
  barberStats: [{ barberName: 'Alex', completedCount: 5, sampleCount: 5, averageMinutes: 31, medianMinutes: 30, percentile80Minutes: 36, outlierCount: 0, barberId: 'private-id', currentAvailability: 'AVAILABLE' }],
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

  let permanentFailureAttempts = 0;
  await assert.rejects(requestGeminiJson({
    prompt: 'test', schema: { responseSchema: { type: 'OBJECT' } },
    apiKey: 'test-only-key', model: 'gemini-3.8-flash',
    fetchImpl: async () => {
      permanentFailureAttempts += 1;
      return new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 403 });
    },
  }), { statusCode: 502 });
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
  await assert.rejects(generate(shopId, {}), { statusCode: 503, message: /GEMINI_API_KEY/ });
  assert.equal(analyticsRead, false);
});

test('Gemini provider failures and malformed responses become safe application errors', async () => {
  const base = { apiKey: 'test-key', readAnalytics: async () => analytics };
  const unavailable = createAnalyticsInsightsService({
    ...base,
    clientFactory: () => ({ models: { generateContent: async () => { throw Object.assign(new Error('quota'), { status: 429 }); } } }),
  });
  await assert.rejects(unavailable(shopId, {}), { statusCode: 503, message: /rate limited/ });

  const malformed = createAnalyticsInsightsService({
    ...base,
    clientFactory: () => ({ models: { generateContent: async () => ({ text: 'not json' }) } }),
  });
  await assert.rejects(malformed(shopId, {}), { statusCode: 502, message: /unreadable response/ });
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
  }), { statusCode: 502, message: /response was too long/ });
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
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { shopId: 'insight-rate-limit-test-shop' }; next(); });
  app.post('/insights', analyticsInsightsLimiter, (_req, res) => res.json({ success: true }));
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

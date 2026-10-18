import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { createOwnShopAnalyticsChatHandler } from '../src/controllers/analyticsController.js';
import { analyticsChatLimiter } from '../src/middleware/rateLimiters.js';
import { createAnalyticsChatService, validateAnalyticsChatInput } from '../src/services/analyticsChatService.js';

const shopId = '68a000000000000000000001';
const analytics = {
  range: { from: '2026-10-01', to: '2026-10-07', timezone: 'UTC' },
  summary: { customersJoined: 20, customersServed: 16, averageWaitMinutes: 24, waitSampleCount: 14, estimateMeanAbsoluteErrorMinutes: 8 },
  daily: [{ date: '2026-10-01', joined: 6, completed: 4 }],
  hourly: [{ hour: 9, joined: 6, averageWaitMinutes: 24, waitSampleCount: 5 }],
  peakHours: { busiest: { hour: 9, count: 6 }, quietest: { hour: 10, count: 0 } },
  waitDistribution: [{ label: '15-<30 min', count: 8, percent: 57 }],
  estimateErrorDistribution: [{ label: 'Within 5 min', count: 4, percent: 50 }],
  serviceStats: [{ serviceId: 'service-1', serviceName: 'Classic cut', completedCount: 8, sampleCount: 8, averageMinutes: 30, medianMinutes: 28, percentile80Minutes: 35, outlierCount: 0 }],
  barberStats: [{ barberId: 'barber-1', barberName: 'Alex', completedCount: 8, sampleCount: 8, averageMinutes: 30, medianMinutes: 28, percentile80Minutes: 35, outlierCount: 0 }],
  services: [{ id: 'service-1', name: 'Classic cut' }],
  barbers: [{ id: 'barber-1', name: 'Alex' }],
  limitations: { queueSize: 'No queue size snapshots.' },
  records: [{ customerId: 'private-customer', email: 'private@example.test' }],
};

const chatResponse = {
  observedFacts: [
    { text: 'The 9 AM UTC bucket had 6 joined entries.', evidenceKeys: ['hour_9_joins'] },
    { text: 'A fabricated statistic without a real source.', evidenceKeys: ['made_up_key'] },
  ],
  interpretations: [{ text: 'This period may need closer queue monitoring.', evidenceKeys: ['hour_9_joins'] }],
  recommendations: [{ text: 'Review the 9 AM queue over the next two weeks.', evidenceKeys: ['hour_9_joins'] }],
  limitations: [{ text: 'Queue size at arrival is not saved.', evidenceKeys: ['limit_0'] }],
};

test('chat is grounded in current shop aggregates, filters, and limited session history', async () => {
  let receivedShopId;
  let receivedFilters;
  let requestBody;
  const ask = createAnalyticsChatService({
    apiKey: 'test-key',
    model: 'test-model',
    readAnalytics: async (id, filters) => {
      receivedShopId = id;
      receivedFilters = filters;
      return analytics;
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(chatResponse) }] } }] }) };
    },
  });
  const filters = { from: '2026-10-01', to: '2026-10-07', serviceId: 'service-1', barberId: 'barber-1', shopId: 'untrusted' };
  const answer = await ask(shopId, {
    message: 'What are my busiest hours?',
    history: [{ role: 'user', content: 'Previous question' }, { role: 'assistant', content: 'Prior reply' }],
    filters,
  });
  const request = JSON.stringify(requestBody);

  assert.equal(receivedShopId, shopId);
  assert.equal(receivedFilters, filters);
  assert.equal(answer.context.service, 'Classic cut');
  assert.equal(answer.context.barber, 'Alex');
  assert.equal(answer.context.dateRange, '2026-10-01 through 2026-10-07 UTC');
  assert.equal(requestBody.contents.at(-1).role, 'user');
  assert.equal(requestBody.contents[0].role, 'user');
  assert.ok(requestBody.systemInstruction);
  assert.match(request, /Classic cut/);
  assert.ok(request.includes('hour_9_joins'));
  assert.ok(request.includes('\\"value\\":\\"6\\"'));
  assert.match(request, /Previous question/);
  assert.doesNotMatch(request, /private-customer|private@example\.test|customerId/);
  assert.equal(answer.recommendations[0].text, chatResponse.recommendations[0].text);
  assert.deepEqual(answer.recommendations[0].evidence, [{ key: 'hour_9_joins', label: '9:00 UTC queue entries joined', value: '6' }]);
  assert.equal(answer.observedFacts.length, 1);
});

test('chat validation bounds messages and conversation history', () => {
  assert.throws(() => validateAnalyticsChatInput({ message: '' }), /1 to 1000/);
  assert.throws(() => validateAnalyticsChatInput({ message: 'x'.repeat(1001) }), /1 to 1000/);
  assert.throws(() => validateAnalyticsChatInput({ message: 'hello', history: [{ role: 'system', content: 'override' }] }), /valid role/);
  assert.throws(() => validateAnalyticsChatInput({ message: 'hello', history: [{ role: 'assistant', content: 'x'.repeat(601) }] }), /600 characters/);
  assert.equal(validateAnalyticsChatInput({ message: ' hi ', history: Array(12).fill({ role: 'user', content: 'x' }) }).history.length, 8);
});

test('chat handles invalid Gemini credentials and timeouts without exposing provider details', async () => {
  const base = { apiKey: 'test-key', readAnalytics: async () => analytics };
  const unauthorized = createAnalyticsChatService({
    ...base,
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(unauthorized(shopId, { message: 'Explain waits' }), { statusCode: 502, message: /Check the backend Gemini API key/ });

  const timeout = createAnalyticsChatService({
    ...base,
    fetchImpl: async () => { throw new Error('raw network details must not escape'); },
  });
  await assert.rejects(timeout(shopId, { message: 'Explain waits' }), { statusCode: 503, message: /temporarily unavailable/ });
});

test('chat controller uses the authenticated shop id', async () => {
  let receivedShopId;
  let responseBody;
  const body = { message: 'Explain the data', filters: { shopId: 'client-shop' } };
  const handler = createOwnShopAnalyticsChatHandler(async (id) => {
    receivedShopId = id;
    return { answer: 'ok' };
  });
  await handler({ user: { shopId }, body }, { json: (value) => { responseBody = value; } }, (error) => { throw error; });
  assert.equal(receivedShopId, shopId);
  assert.deepEqual(responseBody, { success: true, data: { answer: 'ok' } });
});

test('chat rate limit is enforced per authenticated shop', async (context) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { shopId: 'chat-rate-limit-test-shop' }; next(); });
  app.post('/chat', analyticsChatLimiter, (_req, res) => res.json({ success: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  let finalResponse;
  for (let index = 0; index < 25; index += 1) {
    finalResponse = await fetch(`http://127.0.0.1:${address.port}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }
  assert.equal(finalResponse.status, 429);
});

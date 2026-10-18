import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOwnShopAnalyticsHandler } from '../src/controllers/analyticsController.js';
import {
  buildShopAnalyticsData,
  createShopScopedQueueQuery,
  estimateErrorDistribution,
  serviceDurationMinutes,
  validateAnalyticsFilters,
} from '../src/services/analyticsService.js';

const shopId = '68a000000000000000000001';
const serviceId = '68a000000000000000000002';
const barberId = '68a000000000000000000003';

function filters(overrides = {}) {
  return {
    from: new Date('2026-10-01T00:00:00.000Z'),
    to: new Date('2026-10-04T00:00:00.000Z'),
    fromLabel: '2026-10-01',
    toLabel: '2026-10-03',
    serviceId: null,
    barberId: null,
    page: 1,
    pageSize: 10,
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const entries = [
    { _id: 'first', serviceId, barberId, customerId: 'customer', createdAt: new Date('2026-10-01T09:00:00Z'), updatedAt: new Date('2026-10-01T09:40:00Z'), status: 'COMPLETED' },
    { _id: 'second', serviceId, barberId, customerId: 'customer', createdAt: new Date('2026-10-02T09:00:00Z'), updatedAt: new Date('2026-10-02T09:40:00Z'), status: 'COMPLETED' },
    { _id: 'walk-in', serviceId, barberId: null, customerId: null, createdAt: new Date('2026-10-03T12:00:00Z'), updatedAt: new Date('2026-10-03T12:40:00Z'), status: 'COMPLETED' },
  ];
  const logs = [
    { _id: 'log-1', queueEntryId: 'first', serviceId, barberId, startTime: new Date('2026-10-01T09:10:00Z'), endTime: new Date('2026-10-01T09:40:00Z'), actualDuration: 30 },
    { _id: 'log-2', queueEntryId: 'second', serviceId, barberId, startTime: new Date('2026-10-02T09:15:00Z'), endTime: new Date('2026-10-02T09:40:00Z'), actualDuration: 25 },
    { _id: 'malformed', queueEntryId: 'second', serviceId, barberId, startTime: 'invalid', endTime: new Date('2026-10-02T09:40:00Z'), actualDuration: 25 },
    { _id: 'orphan', queueEntryId: 'missing', serviceId, barberId, startTime: new Date(), endTime: new Date(), actualDuration: 1 },
  ];
  return buildShopAnalyticsData({
    trafficEntries: entries,
    completedEntries: entries,
    logs,
    barbers: [{ _id: barberId, name: 'Alex', status: 'ACTIVE', availability: 'AVAILABLE' }],
    services: [{ _id: serviceId, name: 'Classic cut' }],
    loggedBarbers: [{ _id: barberId, name: 'Alex' }],
    estimates: [],
    filters: filters(),
    ...overrides,
  });
}

test('validates date range, ObjectId filters, and table pagination', () => {
  const parsed = validateAnalyticsFilters({
    from: '2026-10-01',
    to: '2026-10-07',
    serviceId,
    barberId,
    page: '3',
    pageSize: '25',
    shopId: 'client-cannot-select-this-shop',
  }, new Date('2026-10-10T12:00:00Z'));
  assert.equal(parsed.fromLabel, '2026-10-01');
  assert.equal(parsed.toLabel, '2026-10-07');
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 25);
  assert.equal(Object.hasOwn(parsed, 'shopId'), false);
  assert.throws(() => validateAnalyticsFilters({ from: '2026-10-08', to: '2026-10-07' }), /on or before/);
  assert.throws(() => validateAnalyticsFilters({ from: '10/01/2026', to: '2026-10-07' }), /YYYY-MM-DD/);
  assert.throws(() => validateAnalyticsFilters({ from: '2026-01-01', to: '2026-10-01' }), /cannot exceed/);
  assert.throws(() => validateAnalyticsFilters({ from: '2026-10-01', to: '2026-10-02', serviceId: 'bad-id' }), /serviceId/);
  assert.throws(() => validateAnalyticsFilters({ from: '2026-10-01', to: '2026-10-02', pageSize: '101' }), /pageSize/);
});

test('estimate error distribution uses five signed ranges with known proportions', () => {
  const bins = estimateErrorDistribution([-20, -10, 0, 10, 20]);
  assert.deepEqual(bins.map((bin) => bin.count), [1, 1, 1, 1, 1]);
  assert.deepEqual(bins.map((bin) => bin.percent), [20, 20, 20, 20, 20]);
});

test('peak-hour comparisons require a useful sample and compare observed hours only', () => {
  const trafficEntries = Array.from({ length: 10 }, (_, index) => ({
    _id: `traffic-${index}`,
    createdAt: new Date(`2026-10-01T${index < 6 ? '09' : '10'}:00:00Z`),
    status: 'WAITING',
  }));
  const data = fixture({ trafficEntries, completedEntries: [], logs: [], estimates: [] });
  assert.deepEqual(data.peakHours, {
    busiest: { hour: 9, count: 6 },
    quietest: { hour: 10, count: 4 },
    sampleCount: 10,
  });
  assert.equal(fixture().peakHours, null);
});

test('all queue history queries bind the authenticated shop id, ignoring client shop ids', () => {
  const query = createShopScopedQueueQuery(shopId, filters({ serviceId, barberId }));
  assert.equal(query.shopId, shopId);
  assert.equal(query.serviceId, serviceId);
  assert.equal(query.barberId, barberId);
  assert.equal(query.$or[0].createdAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.deepEqual(query.$or[1].status.$in, ['COMPLETED', 'CANCELLED']);
});

test('analytics controller uses the authenticated shop id rather than a client shop id', async () => {
  let receivedShopId;
  let responseBody;
  const handler = createOwnShopAnalyticsHandler(async (requestedShopId) => {
    receivedShopId = requestedShopId;
    return { ok: true };
  });
  await handler(
    { user: { shopId }, query: { shopId: '68a000000000000000000099' } },
    { json: (body) => { responseBody = body; } },
    (error) => { throw error; },
  );
  assert.equal(receivedShopId, shopId);
  assert.deepEqual(responseBody, { success: true, data: { ok: true } });
});

test('duration fallback rejects malformed and reversed intervals', () => {
  assert.equal(serviceDurationMinutes({ actualDuration: 24, startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z' }), 24);
  assert.equal(serviceDurationMinutes({ actualDuration: null, startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T10:30:00Z' }), 30);
  assert.equal(serviceDurationMinutes({ actualDuration: null, startTime: '2026-10-01T10:30:00Z', endTime: '2026-10-01T10:00:00Z' }), null);
  assert.equal(serviceDurationMinutes({ actualDuration: null, startTime: 'bad', endTime: null }), null);
  assert.equal(serviceDurationMinutes({ actualDuration: -1, startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T10:30:00Z' }), 30);
  assert.equal(serviceDurationMinutes({ actualDuration: 729, service: { estimatedDuration: 30 } }), null);
  assert.equal(serviceDurationMinutes({ actualDuration: 729, service: { estimatedDuration: 30 }, startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T10:25:00Z' }), 25);
  assert.equal(serviceDurationMinutes({ actualDuration: null, service: { estimatedDuration: 30 }, startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T22:09:00Z' }), null);
});

test('service durations above the service-specific limit are excluded and counted', () => {
  const data = fixture({
    logs: [
      { _id: 'valid', queueEntryId: 'first', serviceId, barberId, startTime: new Date('2026-10-01T09:10:00Z'), endTime: new Date('2026-10-01T09:40:00Z'), actualDuration: 30 },
      { _id: 'implausible', queueEntryId: 'second', serviceId, barberId, startTime: new Date('2026-10-02T09:15:00Z'), endTime: new Date('2026-10-02T21:24:00Z'), actualDuration: 729 },
    ],
  });
  assert.equal(data.summary.averageMinutes, 30);
  assert.equal(data.summary.sampleCount, 1);
  assert.equal(data.summary.outlierCount, 1);
  assert.equal(data.serviceStats[0].outlierCount, 1);
});

test('computes visit, wait, duration, distribution, service, barber, and estimate summaries', () => {
  const data = fixture({
    estimates: [
      { queueEntryId: 'first', estimatedMin: 5, estimatedMax: 15, calculatedAt: new Date('2026-10-01T09:05:00Z') },
      { queueEntryId: 'first', estimatedMin: 0, estimatedMax: 10, calculatedAt: new Date('2026-10-01T09:30:00Z') },
      { queueEntryId: 'second', estimatedMin: 20, estimatedMax: 10, calculatedAt: new Date('2026-10-02T09:05:00Z') },
    ],
  });
  assert.equal(data.summary.customersJoined, 3);
  assert.equal(data.summary.customersServed, 3);
  assert.equal(data.records.length, 2);
  assert.equal(data.records.find((record) => record.queueEntryId === 'first').estimatedWaitMin, 5);
  assert.equal(data.summary.estimateSampleCount, 1);
  assert.equal(data.summary.estimateMeanAbsoluteErrorMinutes, 0);
  assert.equal(data.summary.estimateWithinRangePercent, 100);
  assert.equal(data.summary.averageWaitMinutes, 12.5);
  assert.equal(data.summary.averageMinutes, 27.5);
  assert.equal(data.daily.length, 3);
  assert.equal(data.hourly[9].joined, 2);
  assert.equal(data.serviceStats[0].completedCount, 3);
  assert.equal(data.serviceStats[0].requestedCount, 3);
  assert.equal(data.barberStats[0].completedCount, 2);
  assert.equal(data.summary.currentAvailableBarbers, 1);
  assert.equal(data.queueSizeAnalysis, null);
  assert.equal(data.waitTimeRegression, null);
});

test('counts cancellations against finalized visits and keeps live queue status separate', () => {
  const cancelled = { _id: 'cancelled', serviceId, barberId, createdAt: new Date('2026-10-03T10:00:00Z'), updatedAt: new Date('2026-10-03T10:08:00Z'), status: 'CANCELLED' };
  const data = fixture({
    trafficEntries: [cancelled],
    completedEntries: [],
    cancelledEntries: [cancelled],
    logs: [],
    estimates: [],
    currentQueueStatuses: { WAITING: 2, IN_SERVICE: 1 },
  });
  assert.equal(data.summary.cancelledVisits, 1);
  assert.equal(data.summary.finalizedVisits, 1);
  assert.equal(data.summary.cancellationRatePercent, 100);
  assert.deepEqual(data.queueStatusBreakdown, { WAITING: 2, IN_SERVICE: 1 });
  assert.equal(data.daily.find((day) => day.date === '2026-10-03').cancelled, 1);
});

test('empty and incomplete datasets return explicit empty samples without fabricated statistics', () => {
  const data = fixture({ trafficEntries: [], completedEntries: [], logs: [], estimates: [] });
  assert.equal(data.summary.customersJoined, 0);
  assert.equal(data.summary.customersServed, 0);
  assert.equal(data.summary.averageWaitMinutes, null);
  assert.equal(data.summary.waitsOver30Percent, null);
  assert.equal(data.summary.estimateSampleCount, 0);
  assert.equal(data.summary.estimateMeanAbsoluteErrorMinutes, null);
  assert.equal(data.waitDistribution.every((bin) => bin.count === 0 && bin.percent === null), true);
  assert.equal(data.pagination.total, 0);
  assert.equal(data.queueSizeAnalysis, null);
});

test('record pagination returns only the requested slice while summary counts stay complete', () => {
  const data = fixture({ filters: filters({ page: 2, pageSize: 1 }) });
  assert.equal(data.records.length, 1);
  assert.equal(data.pagination.page, 2);
  assert.equal(data.pagination.total, 2);
  assert.equal(data.summary.customersServed, 3);
});

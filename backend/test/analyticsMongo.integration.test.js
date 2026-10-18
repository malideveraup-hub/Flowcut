import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';

const integrationUri = process.env.FLOWCUT_TEST_MONGODB_URI;
const integrationEnabled = process.env.FLOWCUT_DB_INTEGRATION === '1' && !!integrationUri;

test('shop analytics use isolated MongoDB records and stay accurate through mocked Gemini failures', { skip: !integrationEnabled }, async () => {
  let parsedUri;
  try {
    parsedUri = new URL(integrationUri);
  } catch {
    assert.fail('FLOWCUT_TEST_MONGODB_URI must be a local MongoDB URI.');
  }
  assert.ok(['mongodb:', 'mongodb+srv:'].includes(parsedUri.protocol), 'FLOWCUT_TEST_MONGODB_URI must use MongoDB.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsedUri.hostname), 'Analytics integration tests only run against loopback MongoDB.');

  const databaseName = `fc_analytics_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  process.env.MONGODB_URI = integrationUri;
  let connected = false;
  try {
    await mongoose.connect(integrationUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
    connected = true;

    const [{ default: QueueEntry }, { default: ServiceLog }, { default: WaitingEstimate }, { default: Barber }, { default: Service }] = await Promise.all([
      import('../src/models/QueueEntry.js'),
      import('../src/models/ServiceLog.js'),
      import('../src/models/WaitingEstimate.js'),
      import('../src/models/Barber.js'),
      import('../src/models/Service.js'),
    ]);
    const { createOwnShopAnalyticsHandler } = await import('../src/controllers/analyticsController.js');
    const { getOwnShopAnalytics } = await import('../src/services/analyticsService.js');
    const { createAnalyticsInsightsService } = await import('../src/services/analyticsInsightsService.js');

    const shopId = new mongoose.Types.ObjectId();
    const otherShopId = new mongoose.Types.ObjectId();
    const service = await Service.create({ shopId, name: 'Known Test Haircut', estimatedDuration: 30, price: 0 });
    const barber = await Barber.create({ shopId, userId: new mongoose.Types.ObjectId(), name: 'Known Test Barber', status: 'ACTIVE', availability: 'AVAILABLE' });
    const otherService = await Service.create({ shopId: otherShopId, name: 'Other Shop Haircut', estimatedDuration: 30, price: 0 });
    const otherBarber = await Barber.create({ shopId: otherShopId, userId: new mongoose.Types.ObjectId(), name: 'Other Shop Barber', status: 'ACTIVE', availability: 'AVAILABLE' });

    async function addEntry({ id, status, createdAt, updatedAt = createdAt, walkIn = false, serviceId = service._id, entryShopId = shopId }) {
      return QueueEntry.create({
        _id: id,
        shopId: entryShopId,
        serviceId,
        barberId: walkIn ? null : (entryShopId.equals(otherShopId) ? otherBarber._id : barber._id),
        customerId: walkIn ? null : new mongoose.Types.ObjectId(),
        walkInName: walkIn ? 'Known Test Walk-in' : null,
        source: walkIn ? 'walk_in' : 'reservation',
        status,
        queuePosition: 0,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
      });
    }

    const first = await addEntry({ id: new mongoose.Types.ObjectId(), status: 'COMPLETED', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:40:00.000Z' });
    const second = await addEntry({ id: new mongoose.Types.ObjectId(), status: 'COMPLETED', createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:50:00.000Z' });
    await addEntry({ id: new mongoose.Types.ObjectId(), status: 'CANCELLED', createdAt: '2026-10-03T11:00:00.000Z', updatedAt: '2026-10-03T11:05:00.000Z' });
    await addEntry({ id: new mongoose.Types.ObjectId(), status: 'WAITING', createdAt: '2026-10-03T12:00:00.000Z', walkIn: true });
    const foreign = await addEntry({ id: new mongoose.Types.ObjectId(), status: 'COMPLETED', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:40:00.000Z', entryShopId: otherShopId, serviceId: otherService._id });

    await ServiceLog.create([
      { queueEntryId: first._id, serviceId: service._id, barberId: barber._id, startTime: new Date('2026-10-01T09:10:00.000Z'), endTime: new Date('2026-10-01T09:40:00.000Z'), actualDuration: 30 },
      { queueEntryId: second._id, serviceId: service._id, barberId: barber._id, startTime: new Date('2026-10-02T10:25:00.000Z'), endTime: new Date('2026-10-02T10:50:00.000Z'), actualDuration: 25 },
      { queueEntryId: foreign._id, serviceId: otherService._id, barberId: otherBarber._id, startTime: new Date('2026-10-01T09:10:00.000Z'), endTime: new Date('2026-10-01T09:40:00.000Z'), actualDuration: 30 },
    ]);
    await WaitingEstimate.create([
      { queueEntryId: first._id, estimatedMin: 5, estimatedMax: 15, calculatedAt: new Date('2026-10-01T09:05:00.000Z') },
      { queueEntryId: second._id, estimatedMin: 20, estimatedMax: 30, calculatedAt: new Date('2026-10-02T10:05:00.000Z') },
    ]);

    const query = { from: '2026-10-01', to: '2026-10-03' };
    const analytics = await getOwnShopAnalytics(String(shopId), query);
    assert.deepEqual(analytics.summary, {
      customersJoined: 4,
      customersServed: 2,
      cancelledVisits: 1,
      finalizedVisits: 3,
      cancellationRatePercent: (1 / 3) * 100,
      averageWaitMinutes: 17.5,
      waitSampleCount: 2,
      waitsOver30Count: 0,
      waitsOver30Percent: 0,
      sampleCount: 2,
      cleanedSampleCount: 2,
      averageMinutes: 27.5,
      medianMinutes: 27.5,
      percentile80Minutes: 30,
      durationFrequency: [{ minutes: 25, count: 1 }, { minutes: 30, count: 1 }],
      mostCommonDurations: [{ minutes: 25, count: 1 }, { minutes: 30, count: 1 }],
      outlierCount: 0,
      currentAvailableBarbers: 1,
      estimateSampleCount: 2,
      estimateMeanAbsoluteErrorMinutes: 0,
      estimateMeanBiasMinutes: 0,
      estimateWithinRangePercent: 100,
      estimateErrorSampleCount: 2,
    });
    assert.equal(analytics.records.length, 2);
    assert.equal(analytics.pagination.total, 2);
    assert.equal(analytics.daily.find((row) => row.date === '2026-10-03').cancelled, 1);
    assert.equal(analytics.hourly[9].joined, 1);
    assert.deepEqual(analytics.waitDistribution.map(({ count }) => count), [1, 1, 0, 0]);
    assert.equal(analytics.estimateErrorDistribution.find((bin) => bin.label === 'Within 5 min').percent, 100);
    assert.equal(analytics.queueStatusBreakdown.WAITING, 1);
    const serviceStats = analytics.serviceStats.find((row) => row.serviceName === 'Known Test Haircut');
    assert.equal(serviceStats.requestedCount, 4);
    assert.equal(serviceStats.completedCount, 2);
    assert.equal(serviceStats.averageMinutes, 27.5);
    assert.equal(serviceStats.medianMinutes, 27.5);
    assert.equal(serviceStats.percentile80Minutes, 30);
    assert.deepEqual(serviceStats.durationFrequency, [{ minutes: 25, count: 1 }, { minutes: 30, count: 1 }]);
    assert.deepEqual(serviceStats.mostCommonDurations, [{ minutes: 25, count: 1 }, { minutes: 30, count: 1 }]);
    assert.equal(analytics.barberStats.find((row) => row.barberName === 'Known Test Barber').completedCount, 2);

    let responseBody;
    let forwardedError;
    const analyticsHandler = createOwnShopAnalyticsHandler(getOwnShopAnalytics);
    await analyticsHandler(
      { user: { shopId: String(shopId) }, query },
      { json: (body) => { responseBody = body; } },
      (error) => { forwardedError = error; },
    );
    assert.equal(forwardedError, undefined);
    assert.equal(responseBody.data.summary.customersServed, 2);
    assert.equal(responseBody.data.summary.averageMinutes, 27.5);

    const providerFailures = [
      { error: Object.assign(new Error('Daily project quota exceeded'), { status: 429, code: 'RESOURCE_EXHAUSTED' }), code: 'GEMINI_QUOTA_EXHAUSTED' },
      { error: Object.assign(new Error('Gemini request timed out'), { name: 'TimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' }), code: 'GEMINI_TIMEOUT' },
      { error: Object.assign(new Error('Gemini service unavailable'), { status: 503, code: 'UNAVAILABLE' }), code: 'GEMINI_PROVIDER_UNAVAILABLE' },
    ];
    for (const { error, code } of providerFailures) {
      const insights = createAnalyticsInsightsService({
        apiKey: 'test-only-key',
        model: 'test-only-model',
        readAnalytics: getOwnShopAnalytics,
        clientFactory: () => ({ models: { generateContent: async () => { throw error; } } }),
      });
      await assert.rejects(insights(String(shopId), query), { code });
      const stillAccurate = await getOwnShopAnalytics(String(shopId), query);
      assert.equal(stillAccurate.summary.customersServed, 2);
      assert.equal(stillAccurate.summary.averageMinutes, 27.5);
      assert.equal(stillAccurate.records.length, 2);
    }

    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    connected = false;
    const previousBufferTimeout = mongoose.get('bufferTimeoutMS');
    mongoose.set('bufferTimeoutMS', 50);
    try {
      let databaseError;
      let failureBody;
      let failureStatus;
      const failureResponse = {
        status(code) { failureStatus = code; return this; },
        json(body) { failureBody = body; return this; },
      };
      await analyticsHandler(
        { user: { shopId: String(shopId) }, query },
        failureResponse,
        (error) => { databaseError = error; },
      );
      assert.ok(databaseError instanceof Error);
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        const { errorHandler } = await import('../src/middleware/errorHandler.js');
        errorHandler(databaseError, {}, failureResponse, () => {});
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(failureStatus, 500);
      assert.equal(failureBody.success, false);
      assert.equal(failureBody.data, undefined);
      assert.equal(failureBody.message, 'Something went wrong on our end. Please try again.');
    } finally {
      mongoose.set('bufferTimeoutMS', previousBufferTimeout);
    }
  } finally {
    try {
      if (connected) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});

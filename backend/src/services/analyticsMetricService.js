import { requestGeminiJson } from './analyticsGeminiService.js';

const metricSchema = {
  type: 'OBJECT',
  properties: {
    averageWaitMinutes: { type: 'NUMBER', nullable: true },
    averageServiceMinutes: { type: 'NUMBER', nullable: true },
    completedVisits: { type: 'INTEGER' },
    cancellationRatePercent: { type: 'NUMBER', nullable: true },
    longWaitRatePercent: { type: 'NUMBER', nullable: true },
  },
  required: ['averageWaitMinutes', 'averageServiceMinutes', 'completedVisits', 'cancellationRatePercent', 'longWaitRatePercent'],
};

const chartSchema = {
  type: 'OBJECT',
  properties: {
    daily: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      date: { type: 'STRING' }, joined: { type: 'INTEGER' }, completed: { type: 'INTEGER' }, cancelled: { type: 'INTEGER' },
      averageWaitMinutes: { type: 'NUMBER', nullable: true }, waitSampleCount: { type: 'INTEGER' },
    }, required: ['date', 'joined', 'completed', 'cancelled', 'averageWaitMinutes', 'waitSampleCount'] } },
    hourly: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      hour: { type: 'INTEGER' }, joined: { type: 'INTEGER' }, averageWaitMinutes: { type: 'NUMBER', nullable: true }, waitSampleCount: { type: 'INTEGER' },
    }, required: ['hour', 'joined', 'averageWaitMinutes', 'waitSampleCount'] } },
    peakHours: { type: 'OBJECT', nullable: true, properties: {
      busiest: { type: 'OBJECT', properties: { hour: { type: 'INTEGER' }, count: { type: 'INTEGER' } }, required: ['hour', 'count'] },
      quietest: { type: 'OBJECT', properties: { hour: { type: 'INTEGER' }, count: { type: 'INTEGER' } }, required: ['hour', 'count'] },
      sampleCount: { type: 'INTEGER' },
    }, required: ['busiest', 'quietest', 'sampleCount'] },
    waitDistribution: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      label: { type: 'STRING' }, count: { type: 'INTEGER' }, percent: { type: 'NUMBER', nullable: true },
    }, required: ['label', 'count', 'percent'] } },
    queueStatusBreakdown: { type: 'OBJECT', properties: Object.fromEntries(
      ['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED', 'JOINED'].map((key) => [key, { type: 'INTEGER' }]),
    ), required: ['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED', 'JOINED'] },
    serviceStats: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      serviceId: { type: 'STRING' }, serviceName: { type: 'STRING' }, requestedCount: { type: 'INTEGER' }, completedCount: { type: 'INTEGER' },
      medianMinutes: { type: 'NUMBER', nullable: true }, averageMinutes: { type: 'NUMBER', nullable: true },
      percentile80Minutes: { type: 'NUMBER', nullable: true }, outlierCount: { type: 'INTEGER' },
    }, required: ['serviceId', 'serviceName', 'requestedCount', 'completedCount', 'medianMinutes', 'averageMinutes', 'percentile80Minutes', 'outlierCount'] } },
    barberStats: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      barberId: { type: 'STRING', nullable: true }, barberName: { type: 'STRING' }, completedCount: { type: 'INTEGER' },
      averageMinutes: { type: 'NUMBER', nullable: true }, currentAvailability: { type: 'STRING', nullable: true },
    }, required: ['barberId', 'barberName', 'completedCount', 'averageMinutes', 'currentAvailability'] } },
  },
  required: ['daily', 'hourly', 'peakHours', 'waitDistribution', 'queueStatusBreakdown', 'serviceStats', 'barberStats'],
};

function chartInputs(analytics) {
  return {
    daily: analytics.daily.map(({ date, joined, completed, cancelled, averageWaitMinutes, waitSampleCount }) => ({ date, joined, completed, cancelled, averageWaitMinutes, waitSampleCount })),
    hourly: analytics.hourly.map(({ hour, joined, averageWaitMinutes, waitSampleCount }) => ({ hour, joined, averageWaitMinutes, waitSampleCount })),
    peakHours: analytics.peakHours,
    waitDistribution: analytics.waitDistribution.map(({ label, count, percent }) => ({ label, count, percent })),
    queueStatusBreakdown: Object.fromEntries(['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED', 'JOINED'].map((key) => [key, analytics.queueStatusBreakdown?.[key] || 0])),
    serviceStats: analytics.serviceStats.map(({ serviceId, serviceName, requestedCount, completedCount, medianMinutes, averageMinutes, percentile80Minutes, outlierCount }) => ({ serviceId: String(serviceId), serviceName, requestedCount, completedCount, medianMinutes, averageMinutes, percentile80Minutes, outlierCount })),
    barberStats: analytics.barberStats.map(({ barberId, barberName, completedCount, averageMinutes, currentAvailability }) => ({ barberId: barberId == null ? null : String(barberId), barberName, completedCount, averageMinutes, currentAvailability })),
  };
}

function matchesExpected(expected, actual) {
  if (expected == null || typeof expected !== 'object') {
    if (typeof expected === 'number') {
      if (Number.isInteger(expected)) return Number.isInteger(actual) && actual === expected;
      return Number.isFinite(actual) && Math.abs(expected - actual) <= 0.05;
    }
    return expected === actual;
  }
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((item, index) => matchesExpected(item, actual[index]));
  return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matchesExpected(value, actual[key]));
}

function expectedMetrics(analytics) {
  const { summary } = analytics;
  return {
    averageWaitMinutes: summary.averageWaitMinutes,
    averageServiceMinutes: summary.averageMinutes,
    completedVisits: summary.customersServed,
    cancellationRatePercent: summary.cancellationRatePercent,
    longWaitRatePercent: summary.waitsOver30Percent,
  };
}

function validGeminiMetrics(metrics, expected) {
  if (!metrics || typeof metrics !== 'object') return false;
  return Object.entries(expected).every(([key, value]) => {
    const actual = metrics[key];
    if (value == null) return actual == null;
    if (!Number.isFinite(value) || !Number.isFinite(actual)) return false;
    if (key === 'completedVisits') return Number.isInteger(actual) && actual === value;
    return Math.abs(actual - value) <= 0.05;
  });
}

export async function calculateDashboardMetricsWithGemini(analytics, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  clientFactory,
} = {}) {
  const fallbackMetrics = expectedMetrics(analytics);
  if (!apiKey) {
    const { calculationInputs, chartCalculationInputs, ...dashboardData } = analytics;
    return { ...dashboardData, dashboardMetrics: fallbackMetrics, calculationSource: 'backend' };
  }

  try {
    const charts = chartInputs(analytics);
    const promptInputs = { dashboardMetrics: analytics.calculationInputs, chartOperands: analytics.chartCalculationInputs };
    const serializedInputs = JSON.stringify(promptInputs);
    if (serializedInputs.length > 300_000) throw new Error('Analytics input exceeds Gemini request limit');
    const result = await requestGeminiJson({
      prompt: `Calculate the five dashboard summary metrics using these aggregate formulas: averageWaitMinutes = totalWaitMinutes / validWaitCount; averageServiceMinutes = totalServiceDurationMinutes / validServiceDurationCount; completedVisits = completedVisitCount; cancellationRatePercent = cancelledVisitCount / finalizedVisitCount * 100; longWaitRatePercent = longWaitCount / validWaitCount * 100. Return null for any zero denominator.

Calculate chart datasets from chartOperands. For dailyBuckets and hourlyBuckets calculate averageWaitMinutes = totalWaitMinutes / waitSampleCount, or null when the count is zero. For waitSamples, make bins 0 to under 15, 15 to under 30, 30 to under 45, and 45 or more minutes; calculate each percent from the total sample count. For each serviceGroups and barberGroups row, calculate the duration sample count, average, median (mean of the two middle values for even sample counts), and 80th percentile (nearest rank, ceil(0.8 * n)); outlierCount is the number of non-numeric duration samples. Copy each group's IDs, labels, request/completion counts, and availability. Peak hours are the busiest and quietest hours with at least one join, only when totalJoined is at least 10 and at least two hours have joins; otherwise return null. Copy queueStatusBreakdown counts. Do not infer or invent data. Return metrics and chart datasets in the required JSON schema.

${serializedInputs}`,
      schema: { responseSchema: { type: 'OBJECT', properties: { ...metricSchema.properties, charts: chartSchema }, required: [...metricSchema.required, 'charts'] } },
      apiKey,
      model,
      clientFactory,
      maxOutputTokens: Number(process.env.ANALYTICS_DASHBOARD_MAX_OUTPUT_TOKENS) || 8192,
    });
    if (!validGeminiMetrics(result, fallbackMetrics) || !matchesExpected(charts, result.charts)) throw new Error('Gemini analytics output failed verification');
    const { calculationInputs, chartCalculationInputs, ...dashboardData } = analytics;
    return { ...dashboardData, dashboardMetrics: Object.fromEntries(Object.keys(fallbackMetrics).map((key) => [key, result[key]])), chartData: result.charts, calculationSource: 'gemini' };
  } catch {
    const { calculationInputs, chartCalculationInputs, ...dashboardData } = analytics;
    return { ...dashboardData, dashboardMetrics: fallbackMetrics, calculationSource: 'backend' };
  }
}

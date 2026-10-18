import { Barber, QueueEntry, Service, ServiceLog, WaitingEstimate } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidObjectId } from '../utils/mongoId.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 90;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value, field) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
    throw new AppError(400, `The ${field} date must use YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, `The ${field} date is invalid.`);
  }
  return date;
}

function parsePositiveInteger(value, fallback, field, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new AppError(400, `${field} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new AppError(400, `${field} must be between 1 and ${max}.`);
  }
  return parsed;
}

export function validateAnalyticsFilters(query = {}, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const toDay = query.to ? parseDay(query.to, 'end') : today;
  const fromDay = query.from ? parseDay(query.from, 'start') : new Date(toDay.getTime() - (6 * DAY_MS));
  if (fromDay > toDay) throw new AppError(400, 'The start date must be on or before the end date.');
  const toExclusive = new Date(toDay.getTime() + DAY_MS);
  if (toExclusive.getTime() - fromDay.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new AppError(400, `Date ranges cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  for (const [field, value] of [['serviceId', query.serviceId], ['barberId', query.barberId]]) {
    if (value && !isValidObjectId(value)) throw new AppError(400, `The ${field} filter is invalid.`);
  }

  return {
    from: fromDay,
    to: toExclusive,
    fromLabel: fromDay.toISOString().slice(0, 10),
    toLabel: toDay.toISOString().slice(0, 10),
    serviceId: query.serviceId || null,
    barberId: query.barberId || null,
    page: parsePositiveInteger(query.page, 1, 'page', 100000),
    pageSize: parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize', MAX_PAGE_SIZE),
  };
}

function baseQueryWithoutDates(shopId, filters) {
  return {
    shopId,
    ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
    ...(filters.barberId ? { barberId: filters.barberId } : {}),
  };
}

export function createShopScopedQueueQuery(shopId, filters) {
  const scope = baseQueryWithoutDates(shopId, filters);
  return {
    ...scope,
    $or: [
      { createdAt: { $gte: filters.from, $lt: filters.to } },
      { status: { $in: ['COMPLETED', 'CANCELLED'] }, updatedAt: { $gte: filters.from, $lt: filters.to } },
    ],
  };
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function idOf(value) {
  return String(value?._id ?? value);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile80(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.8) - 1)];
}

export function estimateErrorDistribution(errors) {
  const ranges = [
    { label: 'Estimate >15 min too long', min: -Infinity, max: -15 },
    { label: 'Estimate 5-15 min too long', min: -15, max: -5 },
    { label: 'Within 5 min', min: -5, max: 5, inclusiveMax: true },
    { label: 'Estimate 5-15 min too short', min: 5, max: 15 },
    { label: 'Estimate 15+ min too short', min: 15, max: Infinity },
  ];
  return ranges.map((range) => {
    const count = errors.filter((value) => (
      value >= range.min && (range.max === Infinity || (range.inclusiveMax ? value <= range.max : value < range.max))
    )).length;
    return { label: range.label, count, percent: errors.length ? (count / errors.length) * 100 : null };
  });
}

export function serviceDurationMinutes(log) {
  // Reject sessions over the configurable cap, or over twice their service's
  // expected duration (with a 30 minute floor for short services).
  const configuredValue = Number(process.env.FLOWCUT_ANALYTICS_MAX_DURATION_MINUTES);
  const configuredMaximum = Number.isFinite(configuredValue) && configuredValue >= 30
    ? Math.min(480, configuredValue)
    : 180;
  const serviceMaximum = Number.isFinite(log.service?.estimatedDuration)
    ? Math.min(configuredMaximum, Math.max(30, log.service.estimatedDuration * 2))
    : configuredMaximum;
  const validDuration = (value) => Number.isFinite(value) && value >= 1 && value <= serviceMaximum;
  if (validDuration(log.actualDuration)) return log.actualDuration;
  const startedAt = dateValue(log.startTime)?.getTime();
  const finishedAt = dateValue(log.endTime)?.getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) return null;
  const elapsedMinutes = (finishedAt - startedAt) / 60000;
  return validDuration(elapsedMinutes) ? elapsedMinutes : null;
}

function waitMinutes(joinedAt, startedAt) {
  const joined = dateValue(joinedAt)?.getTime();
  const started = dateValue(startedAt)?.getTime();
  if (!Number.isFinite(joined) || !Number.isFinite(started) || started < joined) return null;
  const value = (started - joined) / 60000;
  return value <= 24 * 60 ? value : null;
}

function initialApplicableEstimate(estimates, joinedAt, startedAt) {
  const joined = dateValue(joinedAt)?.getTime();
  const started = dateValue(startedAt)?.getTime();
  if (!Number.isFinite(joined) || !Number.isFinite(started)) return null;
  return estimates
    .filter((estimate) => {
      const calculated = dateValue(estimate.calculatedAt)?.getTime();
      return Number.isFinite(calculated)
        && calculated >= joined
        && calculated <= started
        && Number.isFinite(estimate.estimatedMin)
        && Number.isFinite(estimate.estimatedMax)
        && estimate.estimatedMin >= 0
        && estimate.estimatedMax >= estimate.estimatedMin;
    })
    .sort((left, right) => new Date(left.calculatedAt) - new Date(right.calculatedAt))[0] || null;
}

function durationSummary(values) {
  const cleaned = values.filter(Number.isFinite);
  return {
    sampleCount: cleaned.length,
    cleanedSampleCount: cleaned.length,
    averageMinutes: cleaned.length ? mean(cleaned) : null,
    medianMinutes: median(cleaned),
    percentile80Minutes: percentile80(cleaned),
    outlierCount: values.length - cleaned.length,
  };
}

function buildStats({ trafficEntries, completedEntries, cancelledEntries, currentQueueStatuses, records, services, barbers, filters }) {
  const byDay = new Map();
  for (let time = filters.from.getTime(); time < filters.to.getTime(); time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10);
    byDay.set(date, { date, joined: 0, completed: 0, cancelled: 0, waitTotal: 0, waitSampleCount: 0 });
  }
  const toDayKey = (value) => dateValue(value)?.toISOString().slice(0, 10);
  trafficEntries.forEach((entry) => {
    const bucket = byDay.get(toDayKey(entry.createdAt));
    if (bucket) bucket.joined += 1;
  });
  completedEntries.forEach((entry) => {
    const bucket = byDay.get(toDayKey(entry.updatedAt));
    if (bucket) bucket.completed += 1;
  });
  cancelledEntries.forEach((entry) => {
    const bucket = byDay.get(toDayKey(entry.updatedAt));
    if (bucket) bucket.cancelled += 1;
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, joined: 0, actualWaitSampleCount: 0, actualWaitTotal: 0 }));
  trafficEntries.forEach((entry) => {
    const createdAt = dateValue(entry.createdAt);
    if (createdAt) hourly[createdAt.getUTCHours()].joined += 1;
  });

  const validWaits = records.map((record) => record.actualWaitMinutes).filter(Number.isFinite);
  records.forEach((record) => {
    if (record.actualWaitMinutes == null) return;
    const startedAt = dateValue(record.startedAt);
    if (!startedAt) return;
    const dailyBucket = byDay.get(startedAt.toISOString().slice(0, 10));
    if (dailyBucket) {
      dailyBucket.waitTotal += record.actualWaitMinutes;
      dailyBucket.waitSampleCount += 1;
    }
    const bucket = hourly[startedAt.getUTCHours()];
    bucket.actualWaitSampleCount += 1;
    bucket.actualWaitTotal += record.actualWaitMinutes;
  });
  const waitsOver30 = validWaits.filter((value) => value > 30).length;
  const observedHours = hourly.filter((bucket) => bucket.joined > 0);
  const peakHours = trafficEntries.length >= 10 && observedHours.length >= 2
    ? {
      busiest: observedHours.reduce((best, bucket) => (bucket.joined > best.joined ? bucket : best)),
      quietest: observedHours.reduce((best, bucket) => (bucket.joined < best.joined ? bucket : best)),
      sampleCount: trafficEntries.length,
    }
    : null;
  const waitDistribution = [
    { label: '0-<15 min', min: 0, max: 15 },
    { label: '15-<30 min', min: 15, max: 30 },
    { label: '30-<45 min', min: 30, max: 45 },
    { label: '45+ min', min: 45, max: Infinity },
  ].map((range) => {
    const count = validWaits.filter((value) => value >= range.min && (range.max === Infinity ? true : value < range.max)).length;
    return { label: range.label, count, percent: validWaits.length ? (count / validWaits.length) * 100 : null };
  });

  const estimatedRecords = records.filter((record) => Number.isFinite(record.actualWaitMinutes)
    && Number.isFinite(record.estimateErrorMinutes));
  const estimateErrors = estimatedRecords.map((record) => record.estimateErrorMinutes);
  const inRangeCount = estimatedRecords.filter((record) => (
    record.actualWaitMinutes >= record.estimatedWaitMin && record.actualWaitMinutes <= record.estimatedWaitMax
  )).length;

  const serviceNameById = new Map(services.map((service) => [idOf(service), service.name]));
  const requestedByService = new Map();
  const completedByService = new Map();
  const serviceGroups = new Map();
  trafficEntries.forEach((entry) => {
    const key = idOf(entry.serviceId);
    requestedByService.set(key, (requestedByService.get(key) || 0) + 1);
  });
  completedEntries.forEach((entry) => {
    const key = idOf(entry.serviceId);
    completedByService.set(key, (completedByService.get(key) || 0) + 1);
  });
  for (const [serviceId, completedCount] of completedByService) {
    serviceGroups.set(serviceId, {
      id: serviceId,
      name: serviceNameById.get(serviceId) || 'Former service',
      count: completedCount,
      durations: [],
    });
  }
  const barberGroups = new Map();
  records.forEach((record) => {
    const service = serviceGroups.get(record.serviceId) || { id: record.serviceId, name: record.serviceName, count: 0, durations: [] };
    service.durations.push(record.durationMinutes);
    serviceGroups.set(record.serviceId, service);

    const barberKey = record.barberId || 'former';
    const barber = barberGroups.get(barberKey) || { id: record.barberId, name: record.barberName, count: 0, durations: [] };
    barber.count += 1;
    barber.durations.push(record.durationMinutes);
    barberGroups.set(barberKey, barber);
  });

  const serviceStats = [...serviceGroups.values()].map((service) => {
    const durations = durationSummary(service.durations);
    return {
      serviceId: service.id,
      serviceName: service.name || serviceNameById.get(service.id) || 'Unknown service',
      completedCount: service.count,
      requestedCount: requestedByService.get(service.id) || 0,
      ...durations,
      outlierCount: durations.outlierCount,
    };
  }).sort((left, right) => right.completedCount - left.completedCount || left.serviceName.localeCompare(right.serviceName));
  for (const [serviceId, requestedCount] of requestedByService) {
    if (serviceGroups.has(serviceId)) continue;
    serviceStats.push({ serviceId, serviceName: serviceNameById.get(serviceId) || 'Unknown service', requestedCount, completedCount: 0, ...durationSummary([]) });
  }
  serviceStats.sort((left, right) => right.requestedCount - left.requestedCount || left.serviceName.localeCompare(right.serviceName));

  const barberById = new Map(barbers.map((barber) => [idOf(barber), barber]));
  const statBarbers = filters.barberId ? barbers.filter((barber) => idOf(barber) === filters.barberId) : barbers;
  statBarbers.forEach((barber) => {
    const id = idOf(barber);
    if (!barberGroups.has(id)) barberGroups.set(id, { id, name: barber.name, count: 0, durations: [] });
  });
  const barberStats = [...barberGroups.values()].map((barber) => ({
    barberId: barber.id,
    barberName: barber.name,
    completedCount: barber.count,
    ...durationSummary(barber.durations),
    currentAvailability: barberById.get(barber.id)?.availability || null,
    employmentStatus: barberById.get(barber.id)?.status || null,
  })).sort((left, right) => right.completedCount - left.completedCount || left.barberName.localeCompare(right.barberName));

  const availableNow = barbers.filter((barber) => barber.status === 'ACTIVE' && barber.availability === 'AVAILABLE').length;
  const overallDurationSummary = durationSummary(records.map((record) => record.durationMinutes));

  return {
    range: { from: filters.fromLabel, to: filters.toLabel, timezone: 'UTC' },
    summary: {
      customersJoined: trafficEntries.length,
      customersServed: completedEntries.length,
      cancelledVisits: cancelledEntries.length,
      finalizedVisits: completedEntries.length + cancelledEntries.length,
      cancellationRatePercent: completedEntries.length + cancelledEntries.length
        ? cancelledEntries.length / (completedEntries.length + cancelledEntries.length) * 100
        : null,
      averageWaitMinutes: mean(validWaits),
      waitSampleCount: validWaits.length,
      waitsOver30Count: waitsOver30,
      waitsOver30Percent: validWaits.length ? (waitsOver30 / validWaits.length) * 100 : null,
      ...overallDurationSummary,
      outlierCount: overallDurationSummary.outlierCount,
      currentAvailableBarbers: availableNow,
      estimateSampleCount: estimatedRecords.length,
      estimateMeanAbsoluteErrorMinutes: estimateErrors.length ? mean(estimateErrors.map(Math.abs)) : null,
      estimateMeanBiasMinutes: estimateErrors.length ? mean(estimateErrors) : null,
      estimateWithinRangePercent: estimatedRecords.length ? (inRangeCount / estimatedRecords.length) * 100 : null,
      estimateErrorSampleCount: estimateErrors.length,
    },
    daily: [...byDay.values()].map(({ waitTotal, ...day }) => ({
      ...day,
      averageWaitMinutes: day.waitSampleCount ? waitTotal / day.waitSampleCount : null,
    })),
    hourly: hourly.map((bucket) => ({
      hour: bucket.hour,
      joined: bucket.joined,
      averageWaitMinutes: bucket.actualWaitSampleCount ? bucket.actualWaitTotal / bucket.actualWaitSampleCount : null,
      waitSampleCount: bucket.actualWaitSampleCount,
    })),
    peakHours: peakHours && {
      busiest: { hour: peakHours.busiest.hour, count: peakHours.busiest.joined },
      quietest: { hour: peakHours.quietest.hour, count: peakHours.quietest.joined },
      sampleCount: peakHours.sampleCount,
    },
    queueStatusBreakdown: currentQueueStatuses,
    waitDistribution,
    estimateErrorDistribution: estimateErrorDistribution(estimateErrors),
    serviceStats,
    barberStats,
    queueSizeAnalysis: null,
    longWaitByQueueSize: null,
    waitTimeRegression: null,
    barberAvailabilityAnalysis: null,
  };
}

export function buildShopAnalyticsData({ trafficEntries, completedEntries, cancelledEntries = [], currentQueueStatuses = {}, logs, barbers, services, loggedBarbers, estimates, filters }) {
  const entryById = new Map(completedEntries.map((entry) => [idOf(entry), entry]));
  const serviceById = new Map(services.map((service) => [idOf(service), service]));
  const barberById = new Map(loggedBarbers.map((barber) => [idOf(barber), barber]));
  const estimatesByEntry = new Map();
  estimates.forEach((estimate) => {
    const id = idOf(estimate.queueEntryId);
    const rows = estimatesByEntry.get(id) || [];
    rows.push(estimate);
    estimatesByEntry.set(id, rows);
  });

  const records = logs.flatMap((log) => {
    const entry = entryById.get(idOf(log.queueEntryId));
    const service = serviceById.get(idOf(log.serviceId));
    const startedAt = dateValue(log.startTime);
    const finishedAt = dateValue(log.endTime);
    if (!entry || idOf(log.serviceId) !== idOf(entry.serviceId) || !startedAt || !finishedAt || finishedAt < startedAt) return [];
    const barber = barberById.get(idOf(log.barberId));
    const appliedEstimate = initialApplicableEstimate(estimatesByEntry.get(idOf(entry)) || [], entry.createdAt, startedAt);
    const durationMinutes = serviceDurationMinutes({ ...log, service });
    const actualWait = waitMinutes(entry.createdAt, startedAt);
    return [{
      id: idOf(log),
      queueEntryId: idOf(entry),
      serviceId: idOf(service),
      serviceName: service?.name || 'Former service',
      barberId: barber ? idOf(barber) : null,
      barberName: barber?.name || 'Former barber',
      joinedAt: entry.createdAt,
      startedAt,
      finishedAt,
      actualWaitMinutes: actualWait,
      durationMinutes,
      estimateErrorMinutes: appliedEstimate && actualWait != null
        ? actualWait - ((appliedEstimate.estimatedMin + appliedEstimate.estimatedMax) / 2)
        : null,
      estimatedWaitMin: appliedEstimate?.estimatedMin ?? null,
      estimatedWaitMax: appliedEstimate?.estimatedMax ?? null,
      estimateCalculatedAt: appliedEstimate?.calculatedAt || null,
    }];
  }).sort((left, right) => right.finishedAt - left.finishedAt);

  const stats = buildStats({ trafficEntries, completedEntries, cancelledEntries, currentQueueStatuses, records, services, barbers, filters });
  const totalPages = Math.max(1, Math.ceil(records.length / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * filters.pageSize;

  return {
    ...stats,
    services: services.map((service) => ({ id: idOf(service), name: service.name })),
    barbers: barbers.map((barber) => ({
      id: idOf(barber),
      name: barber.name,
      status: barber.status,
      availability: barber.availability,
    })),
    records: records.slice(offset, offset + filters.pageSize),
    pagination: { page, pageSize: filters.pageSize, total: records.length, totalPages },
    limitations: {
      queueSize: 'Queue size at the time a customer joined is not stored historically.',
      longWaitByQueueSize: 'Queue-size snapshots are required to calculate long-wait probability by queue size.',
      regression: 'Historical queue size and barber availability at each visit are required for this regression.',
      barberAvailability: 'Only current barber availability is stored; historical availability comparisons are unavailable.',
    },
  };
}

export async function getOwnShopAnalytics(shopId, query = {}, now = new Date()) {
  const filters = validateAnalyticsFilters(query, now);
  const baseQuery = createShopScopedQueueQuery(shopId, filters);
  const [queueEntries, barbers, services] = await Promise.all([
    QueueEntry.find(baseQuery).select('_id serviceId barberId customerId createdAt updatedAt status').lean(),
    Barber.find({ shopId }).select('_id name status availability').sort({ name: 1 }).lean(),
    Service.find({ shopId }).select('_id name estimatedDuration').sort({ name: 1 }).lean(),
  ]);

  if (filters.serviceId && !services.some((service) => idOf(service) === filters.serviceId)) {
    throw new AppError(400, 'The selected service is not available in this shop.');
  }
  if (filters.barberId && !barbers.some((barber) => idOf(barber) === filters.barberId)) {
    throw new AppError(400, 'The selected barber is not available in this shop.');
  }

  const trafficEntries = queueEntries.filter((entry) => (
    entry.createdAt >= filters.from && entry.createdAt < filters.to
  ));
  const completedEntries = queueEntries.filter((entry) => (
    entry.status === 'COMPLETED' && entry.updatedAt >= filters.from && entry.updatedAt < filters.to
  ));
  const cancelledEntries = queueEntries.filter((entry) => (
    entry.status === 'CANCELLED' && entry.updatedAt >= filters.from && entry.updatedAt < filters.to
  ));
  const currentStatusRows = await QueueEntry.aggregate([
    { $match: { ...baseQueryWithoutDates(shopId, filters), status: { $in: ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'] } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const currentQueueStatuses = Object.fromEntries(currentStatusRows.map((row) => [row._id, row.count]));
  const completedIds = completedEntries.map((entry) => entry._id);
  const logs = completedIds.length
    ? await ServiceLog.find({ queueEntryId: { $in: completedIds } })
      .select('_id queueEntryId serviceId barberId startTime endTime actualDuration')
      .sort({ endTime: -1 })
      .lean()
    : [];

  const estimateIds = completedIds;
  const estimates = estimateIds.length
    ? await WaitingEstimate.find({ queueEntryId: { $in: estimateIds } })
      .select('queueEntryId estimatedMin estimatedMax calculatedAt')
      .lean()
    : [];

  const logBarberIds = [...new Set(logs.map((log) => idOf(log.barberId)))];
  const loggedBarbers = logBarberIds.length
    ? await Barber.find({ _id: { $in: logBarberIds }, shopId }).select('_id name').lean()
    : [];
  return buildShopAnalyticsData({ trafficEntries, completedEntries, cancelledEntries, currentQueueStatuses, logs, barbers, services, loggedBarbers, estimates, filters });
}

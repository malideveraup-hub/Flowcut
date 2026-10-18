import { AppError } from '../middleware/errorHandler.js';
import { QueueEntry, ServiceLog, Shop, ShopRating, User } from '../models/index.js';
import { serviceDurationMinutes } from './analyticsService.js';

const DAY_MS = 86400000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_BUCKETS = [20, 30, 40, 50, 60, Infinity];

function parseDay(value, field) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) throw new AppError(400, `${field} must use YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError(400, `${field} is invalid.`);
  return date;
}

export function validatePlatformAnalyticsRange(query = {}) {
  const from = parseDay(query.from, 'Start date');
  const toDay = parseDay(query.to, 'End date');
  if (from > toDay) throw new AppError(400, 'The start date must be on or before the end date.');
  const to = new Date(toDay.getTime() + DAY_MS);
  const duration = to.getTime() - from.getTime();
  if (duration > 366 * DAY_MS) throw new AppError(400, 'Platform analytics ranges cannot exceed 366 days.');
  return { from, to, fromLabel: query.from, toLabel: query.to, duration };
}

function validWaitMinutes(joinedAt, startedAt) {
  const joined = new Date(joinedAt).getTime();
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(joined) || !Number.isFinite(started) || started < joined) return null;
  const wait = (started - joined) / 60000;
  return wait <= 1440 ? wait : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function emptyDay(date) {
  return { date: date.toISOString().slice(0, 10), revenue: 0, joined: 0, completed: 0, cancelled: 0, waitTotal: 0, waitSampleCount: 0 };
}

async function periodAnalytics(from, to) {
  const [logs, joinedDays, finalStatusDays] = await Promise.all([
    ServiceLog.find({ endTime: { $gte: from, $lt: to } })
      .select('queueEntryId serviceId startTime endTime actualDuration')
      .populate({ path: 'queueEntryId', select: 'shopId status createdAt updatedAt', populate: { path: 'shopId', select: 'name' } })
      .populate({ path: 'serviceId', select: 'name price estimatedDuration shopId' })
      .sort({ endTime: 1 }).lean(),
    QueueEntry.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    QueueEntry.aggregate([
      { $match: { status: { $in: ['COMPLETED', 'CANCELLED'] }, updatedAt: { $gte: from, $lt: to } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'UTC' } }, status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);

  const days = new Map();
  for (let day = from.getTime(); day < to.getTime(); day += DAY_MS) {
    const record = emptyDay(new Date(day));
    days.set(record.date, record);
  }
  joinedDays.forEach((row) => { const day = days.get(row._id); if (day) day.joined = row.count; });
  finalStatusDays.forEach((row) => {
    const day = days.get(row._id.day);
    if (day && row._id.status === 'COMPLETED') day.completed = row.count;
    if (day && row._id.status === 'CANCELLED') day.cancelled = row.count;
  });

  const shopTotals = new Map();
  const serviceTotals = new Map();
  const activeShops = new Set();
  const validDurations = [];
  let excludedDurationCount = 0;
  logs.forEach((log) => {
    const entry = log.queueEntryId;
    const service = log.serviceId;
    if (!entry || entry.status !== 'COMPLETED' || !service || String(entry.shopId?._id || entry.shopId) !== String(service.shopId)) return;
    const shopId = String(entry.shopId?._id || entry.shopId);
    activeShops.add(shopId);
    const day = days.get(new Date(log.endTime).toISOString().slice(0, 10));
    if (day) day.revenue += Number(service.price) || 0;
    const shop = shopTotals.get(shopId) || { shopId, shopName: entry.shopId?.name || 'Shop', revenue: 0, completedServiceCount: 0 };
    shop.revenue += Number(service.price) || 0;
    shop.completedServiceCount += 1;
    shopTotals.set(shopId, shop);
    const serviceName = service.name || 'Unspecified service';
    const serviceTotal = serviceTotals.get(serviceName) || { serviceName, completedCount: 0, revenue: 0 };
    serviceTotal.completedCount += 1;
    serviceTotal.revenue += Number(service.price) || 0;
    serviceTotals.set(serviceName, serviceTotal);

    const duration = serviceDurationMinutes({ ...log, service });
    if (Number.isFinite(duration)) validDurations.push(duration);
    else excludedDurationCount += 1;
    const wait = validWaitMinutes(entry.createdAt, log.startTime);
    if (day && Number.isFinite(wait)) {
      day.waitTotal += wait;
      day.waitSampleCount += 1;
    }
  });

  const durationCounts = DURATION_BUCKETS.map((max, bucketIndex) => validDurations.filter((duration) => {
    const min = bucketIndex === 0 ? 0 : DURATION_BUCKETS[bucketIndex - 1];
    return duration > min && duration <= max;
  }).length);
  return {
    revenue: [...shopTotals.values()].reduce((total, shop) => total + shop.revenue, 0),
    completedServiceCount: [...shopTotals.values()].reduce((total, shop) => total + shop.completedServiceCount, 0),
    activeShopCount: activeShops.size,
    averageWaitMinutes: days.size ? (() => {
      const count = [...days.values()].reduce((sum, day) => sum + day.waitSampleCount, 0);
      const total = [...days.values()].reduce((sum, day) => sum + day.waitTotal, 0);
      return count ? total / count : null;
    })() : null,
    waitSampleCount: [...days.values()].reduce((sum, day) => sum + day.waitSampleCount, 0),
    averageDurationMinutes: validDurations.length ? validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length : null,
    medianDurationMinutes: median(validDurations),
    durationSampleCount: validDurations.length,
    durationExcludedCount: excludedDurationCount,
    durationCounts,
    shopTotals: [...shopTotals.values()],
    serviceTotals: [...serviceTotals.values()].sort((left, right) => right.completedCount - left.completedCount),
    daily: [...days.values()].map(({ waitTotal, ...day }) => ({
      ...day,
      averageWaitMinutes: day.waitSampleCount ? waitTotal / day.waitSampleCount : null,
    })),
  };
}

export async function getPlatformAnalytics(query = {}) {
  const range = validatePlatformAnalyticsRange(query);
  const previousFrom = new Date(range.from.getTime() - range.duration);
  const [shopRows, userRows, activeQueueEntries, current, previous, ratingRows] = await Promise.all([
    Shop.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    QueueEntry.countDocuments({ status: { $in: ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'] } }),
    periodAnalytics(range.from, range.to),
    periodAnalytics(previousFrom, range.from),
    ShopRating.aggregate([
      { $match: { createdAt: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
  ]);
  const shopsByStatus = Object.fromEntries(shopRows.map((row) => [row._id, row.count]));
  const usersByRole = Object.fromEntries(userRows.map((row) => [row._id, row.count]));
  const previousShopTotals = new Map(previous.shopTotals.map((shop) => [shop.shopId, shop]));
  const shopRankings = current.shopTotals
    .map((shop) => ({ ...shop, previousRevenue: previousShopTotals.get(shop.shopId)?.revenue || 0 }))
    .sort((left, right) => right.revenue - left.revenue);
  const totalRegisteredShops = Object.entries(shopsByStatus)
    .filter(([status]) => status !== 'DRAFT')
    .reduce((sum, [, count]) => sum + count, 0);
  const currentSummary = Object.fromEntries(Object.entries(current).filter(([key]) => !['shopTotals', 'serviceTotals'].includes(key)));
  const currentCompletedVisits = current.daily.reduce((sum, day) => sum + day.completed, 0);
  const previousCompletedVisits = previous.daily.reduce((sum, day) => sum + day.completed, 0);
  return {
    range: { from: range.fromLabel, to: range.toLabel, timezone: 'UTC' },
    stats: { shopsByStatus, usersByRole, activeQueueEntries, totalRegisteredShops },
    current: { ...currentSummary, completedVisitCount: currentCompletedVisits },
    previous: { revenue: previous.revenue, completedServiceCount: previous.completedServiceCount, completedVisitCount: previousCompletedVisits, activeShopCount: previous.activeShopCount },
    shopRankings,
    serviceTotals: current.serviceTotals,
    ratings: { average: ratingRows[0]?.average ?? null, count: ratingRows[0]?.count || 0 },
    limitations: {
      shopActivity: 'An active shop has at least one completed service log in the selected range.',
      queueHistory: 'Queue completion and cancellation counts use the final stored status timestamp; prior status transitions are not stored.',
    },
  };
}

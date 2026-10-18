import { Barber, ServiceLog } from '../models/index.js';
import QueueEntry from '../models/QueueEntry.js';
import Service from '../models/Service.js';
import { DEFAULT_SERVICE_MINUTES } from '../config/queueConfig.js';

/**
 * Computes a live estimated wait RANGE for a shop from its CURRENT queue
 * state, including queued services, active work, delays, pauses, and active
 * barber capacity. This is operational arithmetic, not a prediction model.
 * The calculation itself is read-only. Queue-entry creation records one
 * initial estimate snapshot so later descriptive accuracy analysis can use
 * real historical estimates; legacy entries without one remain unscored.
 */
export async function computeLiveWaitEstimate(shopId) {
  const [waitingEntries, activeEntries, activeBarberCount] = await Promise.all([
    QueueEntry.find({ shopId, status: { $in: ['JOINED', 'WAITING', 'CALLED'] } }).select('serviceId baseMinutes'),
    QueueEntry.find({ shopId, status: { $in: SERVICE_IN_PROGRESS_STATUSES } })
      .select('serviceId baseMinutes delayMinutes pausedAt pausedDurationMs'),
    Barber.countDocuments({ shopId, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
  ]);

  const activeIds = activeEntries.map((entry) => entry._id);
  const serviceIds = [...new Set([...waitingEntries, ...activeEntries].map((entry) => String(entry.serviceId)))];
  const [services, serviceLogs] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }).select('_id estimatedDuration'),
    activeIds.length
      ? ServiceLog.find({ queueEntryId: { $in: activeIds } }).select('queueEntryId startTime')
      : [],
  ]);
  const durationById = new Map(services.map((service) => [String(service._id), service.estimatedDuration]));
  const startedAtByEntryId = new Map(serviceLogs.map((log) => [String(log.queueEntryId), log.startTime]));
  const range = calculateShopWaitRange({ waitingEntries, activeEntries, durationById, startedAtByEntryId, activeBarberCount, now: new Date() });
  return { ...range, waitingCount: waitingEntries.length };
}

export function calculateShopWaitRange({ waitingEntries, activeEntries, durationById, startedAtByEntryId, activeBarberCount, now }) {
  const totalEntries = [...waitingEntries, ...activeEntries];
  if (!totalEntries.length) return { min: 0, max: 0 };
  if (!activeBarberCount) return { min: null, max: null };

  const durationFor = (entry) => entry.baseMinutes || durationById.get(String(entry.serviceId)) || DEFAULT_SERVICE_MINUTES;
  const waitingMinutes = waitingEntries.reduce((sum, entry) => sum + durationFor(entry), 0);
  const activeMinutes = activeEntries.reduce((sum, entry) => {
    const startedAt = startedAtByEntryId.get(String(entry._id));
    const pausedMs = (Number(entry.pausedDurationMs) || 0)
      + (entry.pausedAt ? Math.max(0, now - new Date(entry.pausedAt)) : 0);
    const elapsed = startedAt
      ? Math.max(0, (now - new Date(startedAt) - pausedMs) / 60000)
      : 0;
    return sum + Math.max(0, durationFor(entry) + (entry.delayMinutes || 0) - elapsed);
  }, 0);
  const min = Math.max(0, Math.ceil((waitingMinutes + activeMinutes) / activeBarberCount));
  return { min, max: min === 0 ? 0 : Math.max(min + 5, Math.ceil(min * 1.3)) };
}

const ACTIVE_QUEUE_STATUSES = ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'];
const SERVICE_IN_PROGRESS_STATUSES = ['IN_SERVICE', 'DELAYED', 'PAUSED'];
const WAITING_STATUSES = ['JOINED', 'WAITING', 'CALLED'];

function minutesRange(minutes) {
  const min = Math.max(0, Math.ceil(minutes));
  return { min, max: min === 0 ? 0 : Math.max(min, Math.ceil(min * 1.3)), remainingMinutes: min };
}

export function calculateAssignedQueueWaitEstimate({
  entry,
  entries,
  durationByServiceId,
  startedAtByEntryId,
  pauseByEntryId = new Map(),
  now,
}) {
  const currentEntries = entries.filter((item) => SERVICE_IN_PROGRESS_STATUSES.includes(item.status));
  const current = currentEntries[0];
  const durationFor = (item) => item.baseMinutes
    || durationByServiceId.get(String(item.serviceId))
    || DEFAULT_SERVICE_MINUTES;
  const remainingFor = (item) => {
    const startedAt = startedAtByEntryId.get(String(item._id));
    const pause = pauseByEntryId.get(String(item._id));
    const ongoingPauseMs = pause?.pausedAt ? Math.max(0, now - pause.pausedAt) : 0;
    const elapsed = startedAt
      ? Math.max(0, (now - startedAt - (Number(pause?.pausedDurationMs) || 0) - ongoingPauseMs) / 60000)
      : 0;
    return Math.max(0, durationFor(item) + (item.delayMinutes || 0) - elapsed);
  };

  if (SERVICE_IN_PROGRESS_STATUSES.includes(entry.status)) {
    return minutesRange(remainingFor(entry));
  }

  const activeRemaining = current ? remainingFor(current) : 0;
  const minutesAhead = entries.reduce((total, item) => {
    if (String(item._id) === String(entry._id)) return total;
    if (!WAITING_STATUSES.includes(item.status) || item.queuePosition >= entry.queuePosition) return total;
    return total + durationFor(item);
  }, 0);
  return minutesRange(activeRemaining + minutesAhead);
}

/**
 * One queue wait calculation shared by customer queue responses and the
 * barber workspace. Assigned entries use only that barber's line and add
 * the active service's remaining estimate. Unassigned entries keep the
 * shop-wide estimate used by the existing queue flow.
 */
export async function computeQueueWaitEstimate(shopId, entry, now = new Date()) {
  if (entry.status === 'CALLED') return { min: 0, max: 0, remainingMinutes: 0 };

  if (entry.barberId) {
    const [assignedBarber, barberEntries] = await Promise.all([
      Barber.findOne({ _id: entry.barberId, shopId, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }).select('_id'),
      QueueEntry.find({ shopId, barberId: entry.barberId, status: { $in: ACTIVE_QUEUE_STATUSES } })
        .select('_id serviceId status queuePosition delayMinutes baseMinutes pausedAt pausedDurationMs'),
    ]);
    if (!assignedBarber) return { min: null, max: null, remainingMinutes: null };

    const serviceIds = [...new Set(barberEntries.map((item) => String(item.serviceId)))];
    const [services, serviceLogs] = await Promise.all([
      Service.find({ _id: { $in: serviceIds } }).select('_id estimatedDuration'),
      ServiceLog.find({ queueEntryId: { $in: barberEntries
        .filter((item) => SERVICE_IN_PROGRESS_STATUSES.includes(item.status))
        .map((item) => item._id) } })
        .select('queueEntryId startTime delayMinutes'),
    ]);
    const durationById = new Map(services.map((service) => [
      String(service._id), service.estimatedDuration || DEFAULT_SERVICE_MINUTES,
    ]));
    const startedAtByEntryId = new Map(serviceLogs.map((log) => [String(log.queueEntryId), log.startTime]));
    const pauseByEntryId = new Map(barberEntries.map((item) => [String(item._id), item]));
    return calculateAssignedQueueWaitEstimate({
      entry,
      entries: barberEntries,
      durationByServiceId: durationById,
      startedAtByEntryId,
      pauseByEntryId,
      now,
    });
  }

  const [entriesAhead, activeServices, activeBarberCount] = await Promise.all([
    QueueEntry.find({
      shopId,
      status: { $in: WAITING_STATUSES },
      queuePosition: { $lt: entry.queuePosition },
    }).select('serviceId'),
    QueueEntry.find({ shopId, status: { $in: SERVICE_IN_PROGRESS_STATUSES } })
      .select('serviceId delayMinutes pausedAt pausedDurationMs'),
    Barber.countDocuments({ shopId, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
  ]);

  if (!activeBarberCount) return { min: null, max: null, remainingMinutes: null };

  const entries = [...entriesAhead, ...activeServices];
  const serviceIds = [...new Set(entries.map((item) => String(item.serviceId)))];
  const [services, serviceLogs] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }).select('_id estimatedDuration'),
    ServiceLog.find({ queueEntryId: { $in: activeServices.map((item) => item._id) } })
      .select('queueEntryId startTime'),
  ]);
  const durationById = new Map(services.map((service) => [String(service._id), service.estimatedDuration || DEFAULT_SERVICE_MINUTES]));
  const startByEntry = new Map(serviceLogs.map((log) => [String(log.queueEntryId), log.startTime]));
  const pauseByEntry = new Map(activeServices.map((item) => [String(item._id), item]));
  const fallbackDuration = services.length
    ? services.reduce((total, service) => total + service.estimatedDuration, 0) / services.length
    : DEFAULT_SERVICE_MINUTES;
  const activeIds = new Set(activeServices.map((item) => String(item._id)));
  const totalMinutes = entries.reduce((total, item) => {
    const duration = durationById.get(String(item.serviceId)) ?? fallbackDuration;
    if (!activeIds.has(String(item._id))) return total + duration;
    const startedAt = startByEntry.get(String(item._id));
    const pause = pauseByEntry.get(String(item._id));
    const ongoingPauseMs = pause?.pausedAt ? Math.max(0, now - pause.pausedAt) : 0;
    const elapsed = startedAt
      ? Math.max(0, (now - startedAt - (Number(pause?.pausedDurationMs) || 0) - ongoingPauseMs) / 60000)
      : 0;
    return total + Math.max(0, duration - elapsed + (item.delayMinutes || 0));
  }, 0);

  const min = Math.max(0, Math.ceil(totalMinutes / activeBarberCount));
  return { min, max: min === 0 ? 0 : Math.max(min + 5, Math.ceil(min * 1.3)), remainingMinutes: min };
}

export const computeCustomerWaitEstimate = computeQueueWaitEstimate;

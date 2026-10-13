import { Barber, ServiceLog } from '../models/index.js';
import QueueEntry from '../models/QueueEntry.js';
import Service from '../models/Service.js';
import { DEFAULT_SERVICE_MINUTES } from '../config/queueConfig.js';

/**
 * Computes a live estimated wait RANGE for a shop from its CURRENT queue
 * state — number waiting, each of their services' estimatedDuration, and
 * how many barbers are currently available to work.
 *
 * This is deliberately simple, real-time arithmetic, not a prediction
 * model: it is recomputed from scratch on every call, uses no historical
 * data, and stores nothing. Phase 5 owns ServiceLog-based historical
 * averaging, persisted WaitingEstimate records, and prediction-accuracy
 * tracking — none of that exists here. This is the same class of formula
 * the pre-backend frontend mock used, now computed from real MongoDB data
 * instead of an in-memory array.
 */
export async function computeLiveWaitEstimate(shopId) {
  const [waitingEntries, activeBarberCount] = await Promise.all([
    QueueEntry.find({ shopId, status: 'WAITING' }).select('serviceId'),
    Barber.countDocuments({ shopId, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
  ]);

  const barbers = Math.max(activeBarberCount, 1); // avoid divide-by-zero when no barber is marked active

  if (waitingEntries.length === 0) {
    return { min: 5, max: 10, waitingCount: 0 };
  }

  const serviceIds = [...new Set(waitingEntries.map((e) => String(e.serviceId)))];
  const services = await Service.find({ _id: { $in: serviceIds } }).select('estimatedDuration');
  const durationById = new Map(services.map((s) => [String(s._id), s.estimatedDuration]));
  const fallbackDuration =
    services.length > 0 ? services.reduce((sum, s) => sum + s.estimatedDuration, 0) / services.length : 25;

  const totalMinutes = waitingEntries.reduce((sum, entry) => {
    const duration = durationById.get(String(entry.serviceId)) ?? fallbackDuration;
    return sum + duration;
  }, 0);

  const min = Math.max(5, Math.round(totalMinutes / barbers));
  const max = Math.max(min + 5, Math.round(min * 1.3));

  return { min, max, waitingCount: waitingEntries.length };
}

const ACTIVE_QUEUE_STATUSES = ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'];
const SERVICE_IN_PROGRESS_STATUSES = ['IN_SERVICE', 'DELAYED', 'PAUSED'];
const WAITING_STATUSES = ['JOINED', 'WAITING', 'CALLED'];

function minutesRange(minutes) {
  const min = Math.max(0, Math.ceil(minutes));
  return { min, max: min === 0 ? 0 : Math.max(min, Math.ceil(min * 1.3)), remainingMinutes: min };
}

export function calculateAssignedQueueWaitEstimate({ entry, entries, durationByServiceId, startedAtByEntryId, now }) {
  const currentEntries = entries.filter((item) => SERVICE_IN_PROGRESS_STATUSES.includes(item.status));
  const current = currentEntries[0];
  const durationFor = (item) => item.baseMinutes
    || durationByServiceId.get(String(item.serviceId))
    || DEFAULT_SERVICE_MINUTES;
  const remainingFor = (item) => {
    const startedAt = startedAtByEntryId.get(String(item._id));
    const elapsed = startedAt ? Math.max(0, (now - startedAt) / 60000) : 0;
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
    const barberEntries = await QueueEntry.find({
      shopId,
      barberId: entry.barberId,
      status: { $in: ACTIVE_QUEUE_STATUSES },
    }).select('_id serviceId status queuePosition delayMinutes baseMinutes');

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
    return calculateAssignedQueueWaitEstimate({
      entry,
      entries: barberEntries,
      durationByServiceId: durationById,
      startedAtByEntryId,
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
      .select('serviceId delayMinutes'),
    Barber.countDocuments({ shopId, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
  ]);

  const entries = [...entriesAhead, ...activeServices];
  const serviceIds = [...new Set(entries.map((item) => String(item.serviceId)))];
  const [services, serviceLogs] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }).select('_id estimatedDuration'),
    ServiceLog.find({ queueEntryId: { $in: activeServices.map((item) => item._id) } }).select('queueEntryId startTime'),
  ]);
  const durationById = new Map(services.map((service) => [String(service._id), service.estimatedDuration || DEFAULT_SERVICE_MINUTES]));
  const startByEntry = new Map(serviceLogs.map((log) => [String(log.queueEntryId), log.startTime]));
  const fallbackDuration = services.length
    ? services.reduce((total, service) => total + service.estimatedDuration, 0) / services.length
    : DEFAULT_SERVICE_MINUTES;
  const activeIds = new Set(activeServices.map((item) => String(item._id)));
  const totalMinutes = entries.reduce((total, item) => {
    const duration = durationById.get(String(item.serviceId)) ?? fallbackDuration;
    if (!activeIds.has(String(item._id))) return total + duration;
    const startedAt = startByEntry.get(String(item._id));
    const elapsed = startedAt ? Math.max(0, (now - startedAt) / 60000) : 0;
    return total + Math.max(0, duration - elapsed + (item.delayMinutes || 0));
  }, 0);

  const barbers = Math.max(activeBarberCount, 1);
  const min = Math.max(5, Math.ceil(totalMinutes / barbers));
  return { min, max: Math.max(min + 5, Math.ceil(min * 1.3)), remainingMinutes: min };
}

export const computeCustomerWaitEstimate = computeQueueWaitEstimate;

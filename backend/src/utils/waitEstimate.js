import { Barber } from '../models/index.js';
import QueueEntry from '../models/QueueEntry.js';
import Service from '../models/Service.js';

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

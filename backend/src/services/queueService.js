import { validateName } from '../validation/authValidation.js';
import { QueueEntry, Service, User } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidObjectId } from '../utils/mongoId.js';
import { computeLiveWaitEstimate } from '../utils/waitEstimate.js';
import { toPublicQueueEntry, toStaffQueueEntry } from '../utils/publicSerializers.js';
import { canTransition, ACTIVE_QUEUE_STATUSES, validateDelayMinutes } from '../validation/queueValidation.js';
import Shop from '../models/Shop.js';
import Barber from '../models/Barber.js';

async function requireActiveService(shopId, serviceId) {
  // serviceId arrives from the request BODY here (not a route :param, so
  // validateObjectIdParam never sees it) — checked explicitly before it
  // ever reaches a query, closing the same class of gap ObjectId route
  // params are already protected against.
  if (!isValidObjectId(serviceId)) {
    throw new AppError(400, 'Select a valid, active service for this shop.', { serviceId: 'Invalid service.' });
  }
  const service = await Service.findOne({ _id: serviceId, shopId, status: 'ACTIVE' });
  if (!service) {
    throw new AppError(400, 'Select a valid, active service for this shop.', { serviceId: 'Invalid service.' });
  }
  return service;
}

async function requireApprovedShop(shopId) {
  const shop = await Shop.findOne({ _id: shopId, status: 'APPROVED' });
  if (!shop) {
    throw new AppError(404, 'Shop not found.');
  }
  return shop;
}

async function nextQueuePosition(shopId) {
  const waitingCount = await QueueEntry.countDocuments({ shopId, status: 'WAITING' });
  return waitingCount + 1;
}

// ---------------------------------------------------------------------
// Customer-facing
// ---------------------------------------------------------------------

export async function joinQueue(customerId, shopId, serviceId) {
  await requireApprovedShop(shopId);
  await requireActiveService(shopId, serviceId);

  const existingActive = await QueueEntry.findOne({
    customerId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  });
  if (existingActive) {
    throw new AppError(409, "You're already in a queue. Leave it before joining another.");
  }

  const queuePosition = await nextQueuePosition(shopId);

  return QueueEntry.create({
    shopId,
    customerId, // always from the authenticated session — never the request body
    serviceId,
    source: 'reservation',
    status: 'WAITING',
    queuePosition,
  });
}

/**
 * The customer's own active entry, with a live-computed "how many people
 * are actually still ahead of me right now" — not just the queuePosition
 * stored at join time, which goes stale the moment anyone ahead leaves.
 */
export async function getMyActiveQueueEntry(customerId) {
  const entry = await QueueEntry.findOne({
    customerId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  }).sort({ createdAt: -1 });

  if (!entry) return null;

  const [aheadCount, service, shop] = await Promise.all([
    QueueEntry.countDocuments({
      shopId: entry.shopId,
      status: 'WAITING',
      createdAt: { $lt: entry.createdAt },
    }),
    Service.findById(entry.serviceId).select('name'),
    Shop.findById(entry.shopId).select('name'),
  ]);

  const wait = await computeLiveWaitEstimate(entry.shopId);

  return {
    id: entry._id.toString(),
    status: entry.status,
    aheadCount,
    serviceName: service?.name || null,
    shopName: shop?.name || null,
    shopId: entry.shopId.toString(),
    wait: { min: wait.min, max: wait.max },
  };
}

export async function cancelMyQueueEntry(customerId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, customerId });
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  if (!canTransition(entry.status, 'CANCELLED')) {
    throw new AppError(409, "This queue entry can't be cancelled anymore.");
  }
  entry.status = 'CANCELLED';
  await entry.save();
  return entry;
}

// ---------------------------------------------------------------------
// Public (anonymized) queue view
// ---------------------------------------------------------------------

export async function getPublicShopQueue(shopId, viewerCustomerId = null) {
  await requireApprovedShop(shopId);

  const entries = await QueueEntry.find({
    shopId,
    status: { $in: ['WAITING', 'CALLED', 'IN_SERVICE'] },
  })
    .sort({ createdAt: 1 })
    .select('status serviceId customerId');

  const serviceIds = [...new Set(entries.map((e) => String(e.serviceId)))];
  const services = await Service.find({ _id: { $in: serviceIds } }).select('name');
  const nameById = new Map(services.map((s) => [String(s._id), s.name]));

  return entries.map((entry, i) =>
    toPublicQueueEntry(entry, i, {
      isViewer: viewerCustomerId && entry.customerId && String(entry.customerId) === String(viewerCustomerId),
      serviceName: nameById.get(String(entry.serviceId)) || null,
    })
  );
}

// ---------------------------------------------------------------------
// Shop Admin / staff queue management (real names, shop-scoped)
// ---------------------------------------------------------------------

export async function getShopQueue(shopId) {
  const entries = await QueueEntry.find({
    shopId,
    status: { $in: ['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'] },
  }).sort({ createdAt: 1 });

  const [customers, services, barbers] = await Promise.all([
    User.find({ _id: { $in: entries.map((e) => e.customerId).filter(Boolean) } }).select('name'),
    Service.find({ _id: { $in: entries.map((e) => e.serviceId) } }).select('name'),
    Barber.find({ _id: { $in: entries.map((e) => e.barberId).filter(Boolean) } }).select('name'),
  ]);
  const customerNameById = new Map(customers.map((c) => [String(c._id), c.name]));
  const serviceNameById = new Map(services.map((s) => [String(s._id), s.name]));
  const barberNameById = new Map(barbers.map((b) => [String(b._id), b.name]));

  return entries.map((entry) =>
    toStaffQueueEntry(entry, {
      customerName: entry.customerId ? customerNameById.get(String(entry.customerId)) : null,
      serviceName: serviceNameById.get(String(entry.serviceId)),
      barberName: entry.barberId ? barberNameById.get(String(entry.barberId)) : null,
    })
  );
}

export async function addWalkIn(shopId, { serviceId, walkInName }) {
  await requireActiveService(shopId, serviceId);
  const nameErr = validateName(walkInName);
  if (nameErr) throw new AppError(400, nameErr, { walkInName: nameErr });
  const trimmedName = walkInName.trim();

  const queuePosition = await nextQueuePosition(shopId);

  return QueueEntry.create({
    shopId,
    walkInName: trimmedName,
    serviceId,
    source: 'walk_in',
    status: 'WAITING',
    queuePosition,
  });
}

async function requireShopQueueEntry(shopId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, shopId });
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  return entry;
}

export async function skipEntry(shopId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  if (!canTransition(entry.status, 'SKIPPED')) {
    throw new AppError(409, `Can't skip an entry with status ${entry.status}.`);
  }
  entry.status = 'SKIPPED';
  await entry.save();
  return entry;
}

export async function cancelEntryByStaff(shopId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  if (!canTransition(entry.status, 'CANCELLED')) {
    throw new AppError(409, `Can't cancel an entry with status ${entry.status}.`);
  }
  entry.status = 'CANCELLED';
  await entry.save();
  return entry;
}

// ---------------------------------------------------------------------
// Barber operations — every one of these takes the ACTING BARBER's own
// {id, shopId} (resolved server-side from the session) and verifies the
// target entry belongs to that same shop before touching it.
// ---------------------------------------------------------------------

export async function startService(shopId, barberId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  if (!canTransition(entry.status, 'IN_SERVICE')) {
    throw new AppError(409, `Can't start service from status ${entry.status}.`);
  }

  const alreadyServing = await QueueEntry.findOne({
    barberId,
    status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] },
    _id: { $ne: entryId },
  });
  if (alreadyServing) {
    throw new AppError(409, 'This barber already has an active service.');
  }

  entry.status = 'IN_SERVICE';
  entry.barberId = barberId;
  await entry.save();
  return entry;
}

function requireAssignedBarber(entry, barberId) {
  if (!entry.barberId || String(entry.barberId) !== String(barberId)) {
    throw new AppError(403, 'This service is not assigned to you.');
  }
}

export async function finishService(shopId, barberId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  requireAssignedBarber(entry, barberId);
  if (!canTransition(entry.status, 'COMPLETED')) {
    throw new AppError(409, 'This service was never started, so it cannot be finished.');
  }
  entry.status = 'COMPLETED';
  await entry.save();
  return entry;
}

export async function applyDelay(shopId, barberId, entryId, minutes) {
  const delayErr = validateDelayMinutes(minutes);
  if (delayErr) throw new AppError(400, delayErr);

  const entry = await requireShopQueueEntry(shopId, entryId);
  requireAssignedBarber(entry, barberId);
  if (!canTransition(entry.status, 'DELAYED')) {
    throw new AppError(409, 'Delays can only be applied to a service in progress.');
  }

  entry.status = 'DELAYED';
  entry.delayMinutes = (entry.delayMinutes || 0) + Number(minutes);
  await entry.save();
  return entry;
}

/**
 * The barber's own operational dashboard: their current assignment (if
 * any) plus the shop's up-next WAITING list. barberId/shopId are always
 * the AUTHENTICATED barber's own — see barberController.js.
 */
export async function getBarberDashboard(shopId, barberId) {
  const [barber, current, upNext] = await Promise.all([
    Barber.findById(barberId),
    QueueEntry.findOne({ shopId, barberId, status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] } }),
    QueueEntry.find({ shopId, status: 'WAITING' }).sort({ createdAt: 1 }),
  ]);

  const serviceIds = [...new Set([current?.serviceId, ...upNext.map((e) => e.serviceId)].filter(Boolean))];
  const customerIds = [...new Set([current?.customerId, ...upNext.map((e) => e.customerId)].filter(Boolean))];
  const [services, customers] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }).select('name'),
    User.find({ _id: { $in: customerIds } }).select('name'),
  ]);
  const serviceNameById = new Map(services.map((s) => [String(s._id), s.name]));
  const customerNameById = new Map(customers.map((c) => [String(c._id), c.name]));

  function shape(entry) {
    if (!entry) return null;
    return {
      id: entry._id.toString(),
      status: entry.status,
      customerName: entry.customerId ? customerNameById.get(String(entry.customerId)) : entry.walkInName,
      serviceName: serviceNameById.get(String(entry.serviceId)) || null,
      source: entry.source,
      startedAt: entry.updatedAt, // best-effort until Phase 5's real ServiceLog.startTime exists
      delayMinutes: entry.delayMinutes || 0,
    };
  }

  return {
    barber: barber ? { id: barber._id.toString(), name: barber.name, availability: barber.availability } : null,
    current: shape(current),
    upNext: upNext.map(shape),
  };
}

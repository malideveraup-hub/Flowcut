import { validateName } from '../validation/authValidation.js';
import { QueueEntry, Service, ServiceLog, User } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidObjectId } from '../utils/mongoId.js';
import { computeCustomerWaitEstimate, computeLiveWaitEstimate } from '../utils/waitEstimate.js';
import { toPublicQueueEntry, toStaffQueueEntry } from '../utils/publicSerializers.js';
import { canTransition, ACTIVE_QUEUE_STATUSES, validateDelayMinutes } from '../validation/queueValidation.js';
import { expireCalledQueueEntry, notifyQueueEntry, reconcileShopQueue } from './queueNotificationService.js';
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
  const activeCount = await QueueEntry.countDocuments({ shopId, status: { $in: ['JOINED', 'WAITING', 'CALLED'] } });
  return activeCount + 1;
}

// ---------------------------------------------------------------------
// Customer-facing
// ---------------------------------------------------------------------

export async function joinQueue(customerId, shopId, serviceId) {
  const shop = await requireApprovedShop(shopId);
  if (shop.queueOpen === false) throw new AppError(409, 'This shop is not accepting new queue entries right now.');
  await requireActiveService(shopId, serviceId);

  const existingActive = await QueueEntry.findOne({
    customerId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  });
  if (existingActive) {
    throw new AppError(409, "You're already in a queue. Leave it before joining another.");
  }

  const queuePosition = await nextQueuePosition(shopId);

  const entry = await QueueEntry.create({
    shopId,
    customerId, // always from the authenticated session — never the request body
    serviceId,
    source: 'reservation',
    status: 'WAITING',
    queuePosition,
  });
  await reconcileShopQueue(shopId);
  return entry;
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

  const [aheadCount, service, shop, barber, wait] = await Promise.all([
    QueueEntry.countDocuments({
      shopId: entry.shopId,
      status: { $in: ['JOINED', 'WAITING', 'CALLED'] },
      queuePosition: { $lt: entry.queuePosition },
    }),
    Service.findById(entry.serviceId).select('name'),
    Shop.findById(entry.shopId).select('name'),
    entry.barberId
      ? Barber.findOne({ _id: entry.barberId, shopId: entry.shopId }).select('name')
      : null,
    computeCustomerWaitEstimate(entry.shopId, entry),
  ]);

  return {
    id: entry._id.toString(),
    status: entry.status,
    position: entry.queuePosition,
    aheadCount,
    serviceName: service?.name || null,
    shopName: shop?.name || null,
    barberName: barber?.name || null,
    shopId: entry.shopId.toString(),
    wait: { min: wait.min, max: wait.max },
    arrivedAt: entry.arrivedAt || null,
    arrivalDeadlineAt: entry.arrivalDeadlineAt || null,
  };
}

export async function checkInMyQueue(customerId) {
  const entry = await QueueEntry.findOne({ customerId, status: { $in: ACTIVE_QUEUE_STATUSES } })
    .sort({ createdAt: -1 });
  if (!entry) throw new AppError(404, 'No active queue entry.');

  const now = new Date();
  if (entry.status === 'CALLED' && !entry.arrivedAt && entry.arrivalDeadlineAt && entry.arrivalDeadlineAt <= now) {
    const expired = await expireCalledQueueEntry(entry._id, now);
    if (expired) await reconcileShopQueue(entry.shopId, { callNextCount: 1, now });
    throw new AppError(409, 'Your arrival window has expired and you were removed from the queue.');
  }

  if (!entry.arrivedAt) {
    entry.arrivedAt = now;
    await entry.save();
  }
  return getMyActiveQueueEntry(customerId);
}

export async function getMyQueueHistory(customerId, { page = 1, pageSize = 5 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.max(1, Math.min(50, Number.parseInt(pageSize, 10) || 5));
  const filter = { customerId, status: { $in: ['COMPLETED', 'CANCELLED', 'SKIPPED'] } };
  const [total, completedTotal, entries] = await Promise.all([
    QueueEntry.countDocuments(filter),
    QueueEntry.countDocuments({ customerId, status: 'COMPLETED' }),
    QueueEntry.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize),
  ]);

  const entryIds = entries.map((entry) => entry._id);
  const shopIds = [...new Set(entries.map((entry) => String(entry.shopId)))];
  const serviceIds = [...new Set(entries.map((entry) => String(entry.serviceId)))];
  const barberIds = [...new Set(entries.map((entry) => entry.barberId).filter(Boolean).map(String))];
  const [shops, services, barbers, logs] = await Promise.all([
    Shop.find({ _id: { $in: shopIds } }).select('name'),
    Service.find({ _id: { $in: serviceIds } }).select('name'),
    Barber.find({ _id: { $in: barberIds } }).select('name'),
    ServiceLog.find({ queueEntryId: { $in: entryIds } }).select('queueEntryId startTime actualDuration'),
  ]);
  const shopNames = new Map(shops.map((shop) => [String(shop._id), shop.name]));
  const serviceNames = new Map(services.map((service) => [String(service._id), service.name]));
  const barberNames = new Map(barbers.map((barber) => [String(barber._id), barber.name]));
  const logsByEntry = new Map(logs.map((log) => [String(log.queueEntryId), log]));

  const items = entries.map((entry) => {
    const log = logsByEntry.get(String(entry._id));
    const createdAt = entry.createdAt;
    const endOfWait = log?.startTime || (entry.status === 'COMPLETED' ? null : entry.updatedAt);
    return {
      id: String(entry._id),
      shopId: String(entry.shopId),
      shop: shopNames.get(String(entry.shopId)) || 'Shop unavailable',
      service: serviceNames.get(String(entry.serviceId)) || 'Service unavailable',
      barber: entry.barberId ? barberNames.get(String(entry.barberId)) || null : null,
      date: createdAt,
      waitMinutes: endOfWait && createdAt ? Math.max(0, Math.round((endOfWait - createdAt) / 60000)) : null,
      serviceMinutes: Number.isFinite(log?.actualDuration) ? Math.round(log.actualDuration) : null,
      status: entry.status,
    };
  });

  return { items, total, completedTotal, page: safePage, pageSize: safePageSize };
}

export async function cancelMyQueueEntry(customerId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, customerId });
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  if (!canTransition(entry.status, 'CANCELLED')) {
    throw new AppError(409, "This queue entry can't be cancelled anymore.");
  }
  const wasCalled = entry.status === 'CALLED';
  entry.status = 'CANCELLED';
  await entry.save();
  await notifyQueueEntry(entry, {
    eventKey: `${entry._id}:customer-left`,
    type: 'QUEUE_LEFT',
    title: 'You left the queue',
    message: 'Your queue entry was cancelled. You can join another queue any time.',
    position: entry.queuePosition,
  });
  await reconcileShopQueue(entry.shopId, { callNextCount: wasCalled ? 1 : 0 });
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

const QUEUE_TABLE_STATUSES = {
  ALL: ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'],
  WAITING: ['JOINED', 'WAITING'],
  ALMOST_UP: ['CALLED'],
  IN_SERVICE: ['IN_SERVICE', 'DELAYED', 'PAUSED'],
  HISTORY: ['COMPLETED', 'CANCELLED', 'SKIPPED'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
  LEFT_QUEUE: ['SKIPPED'],
};

export async function getShopQueueBoard(shopId, options = {}) {
  const statusKey = String(options.status || 'ALL').toUpperCase();
  const status = QUEUE_TABLE_STATUSES[statusKey] || QUEUE_TABLE_STATUSES.ALL;
  const pageSize = Math.max(1, Math.min(25, Number.parseInt(options.limit, 10) || 12));
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const sortFields = {
    queue: { queuePosition: 1, createdAt: 1 },
    joined: { createdAt: 1 },
    newest: { createdAt: -1 },
    wait: { queuePosition: 1, createdAt: 1 },
    status: { status: 1, queuePosition: 1 },
    service: { serviceId: 1, queuePosition: 1 },
    barber: { barberId: 1, queuePosition: 1 },
  };
  const filter = { shopId, status: { $in: status } };
  const sort = sortFields[options.sort] || sortFields.queue;

  if (options.barberId) {
    if (!isValidObjectId(options.barberId)) throw new AppError(400, 'Select a valid barber.');
    filter.barberId = options.barberId;
  }
  if (options.serviceId) {
    if (!isValidObjectId(options.serviceId)) throw new AppError(400, 'Select a valid service.');
    filter.serviceId = options.serviceId;
  }

  const search = String(options.search || '').trim().slice(0, 100);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(escaped, 'i');
    const [customers, services] = await Promise.all([
      User.find({ name: matcher }).select('_id').limit(100),
      Service.find({ shopId, name: matcher }).select('_id').limit(100),
    ]);
    const alternatives = [
      { walkInName: matcher },
      { customerId: { $in: customers.map((customer) => customer._id) } },
      { serviceId: { $in: services.map((service) => service._id) } },
    ];
    if (/^#?\d+$/.test(search)) alternatives.push({ queuePosition: Number.parseInt(search.replace('#', ''), 10) });
    filter.$or = alternatives;
  }

  const [[total, entries], counts, shop, waitEstimate] = await Promise.all([
    Promise.all([
      QueueEntry.countDocuments(filter),
      QueueEntry.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
    ]),
    Promise.all([
      QueueEntry.countDocuments({ shopId, status: { $in: ['JOINED', 'WAITING'] } }),
      QueueEntry.countDocuments({ shopId, status: 'CALLED' }),
      QueueEntry.countDocuments({ shopId, status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] } }),
      QueueEntry.countDocuments({ shopId, status: 'COMPLETED' }),
      QueueEntry.countDocuments({ shopId, status: 'CANCELLED' }),
      QueueEntry.countDocuments({ shopId, status: 'SKIPPED' }),
    ]),
    Shop.findById(shopId).select('queueOpen'),
    computeLiveWaitEstimate(shopId),
  ]);

  const customerIds = [...new Set(entries.map((entry) => entry.customerId).filter(Boolean).map(String))];
  const serviceIds = [...new Set(entries.map((entry) => String(entry.serviceId)))];
  const barberIds = [...new Set(entries.map((entry) => entry.barberId).filter(Boolean).map(String))];
  const [customers, services, barbers] = await Promise.all([
    User.find({ _id: { $in: customerIds } }).select('name'),
    Service.find({ _id: { $in: serviceIds } }).select('name'),
    Barber.find({ _id: { $in: barberIds } }).select('name'),
  ]);
  const customerNames = new Map(customers.map((customer) => [String(customer._id), customer.name]));
  const serviceNames = new Map(services.map((service) => [String(service._id), service.name]));
  const barberNames = new Map(barbers.map((barber) => [String(barber._id), barber.name]));
  const shapedEntries = entries.map((entry) => toStaffQueueEntry(entry, {
    customerName: entry.customerId ? customerNames.get(String(entry.customerId)) : null,
    serviceName: serviceNames.get(String(entry.serviceId)) || null,
    barberName: entry.barberId ? barberNames.get(String(entry.barberId)) || null : null,
  }));

  return {
    entries: shapedEntries,
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: { waiting: counts[0], almostUp: counts[1], inService: counts[2], completed: counts[3], cancelled: counts[4], left: counts[5] },
    queueOpen: shop?.queueOpen !== false,
    waitEstimate,
  };
}

export async function updateShopQueueEntry(shopId, entryId, fields = {}) {
  const entry = await QueueEntry.findOne({ _id: entryId, shopId });
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  if (!['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'].includes(entry.status)) {
    throw new AppError(409, 'Only active queue entries can be updated.');
  }

  if (Object.hasOwn(fields, 'serviceId')) {
    await requireActiveService(shopId, fields.serviceId);
    entry.serviceId = fields.serviceId;
  }
  if (Object.hasOwn(fields, 'barberId')) {
    if (fields.barberId === null || fields.barberId === '') {
      entry.barberId = null;
    } else {
      if (!isValidObjectId(fields.barberId)) throw new AppError(400, 'Select a valid barber.');
      const barber = await Barber.findOne({ _id: fields.barberId, shopId, status: 'ACTIVE' });
      if (!barber) throw new AppError(400, 'Select an active barber from this shop.');
      if (['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(entry.status)) {
        const alreadyServing = await QueueEntry.findOne({
          shopId,
          barberId: fields.barberId,
          status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] },
          _id: { $ne: entryId },
        });
        if (alreadyServing) throw new AppError(409, 'That barber is already serving another customer.');
      }
      entry.barberId = fields.barberId;
    }
  }
  await entry.save();
  await reconcileShopQueue(shopId);
  return entry;
}

export async function completeShopQueueEntry(shopId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, shopId });
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  if (!canTransition(entry.status, 'COMPLETED')) {
    throw new AppError(409, 'Only a service in progress can be marked completed.');
  }

  const finishedAt = new Date();
  if (entry.barberId) {
    const serviceLog = await ServiceLog.findOne({ queueEntryId: entry._id });
    if (serviceLog) {
      serviceLog.endTime = finishedAt;
      serviceLog.actualDuration = serviceLog.startTime
        ? Math.max(0, (finishedAt - serviceLog.startTime) / 60000)
        : null;
      await serviceLog.save();
    } else {
      await ServiceLog.create({
        queueEntryId: entry._id,
        barberId: entry.barberId,
        serviceId: entry.serviceId,
        endTime: finishedAt,
      });
    }
  }
  entry.status = 'COMPLETED';
  await entry.save();
  await reconcileShopQueue(shopId, {
    callNextCount: 1,
    now: finishedAt,
    nextCustomerReason: 'SERVICE_COMPLETED',
  });
  return entry;
}

export async function moveShopQueueEntry(shopId, entryId, targetPosition) {
  const nextPosition = Number(targetPosition);
  if (!Number.isInteger(nextPosition) || nextPosition < 1) {
    throw new AppError(400, 'Choose a valid queue position.');
  }
  const entry = await QueueEntry.findOne({ _id: entryId, shopId, status: 'WAITING' });
  if (!entry) throw new AppError(409, 'Only waiting customers can be moved.');
  const waitingCount = await QueueEntry.countDocuments({ shopId, status: 'WAITING' });
  const boundedPosition = Math.min(nextPosition, waitingCount);
  if (boundedPosition === entry.queuePosition) return entry;
  const previousPositions = new Map((await QueueEntry.find({ shopId, status: 'WAITING' }).select('_id queuePosition'))
    .map((item) => [String(item._id), item.queuePosition]));

  if (boundedPosition < entry.queuePosition) {
    await QueueEntry.updateMany({
      shopId,
      status: 'WAITING',
      queuePosition: { $gte: boundedPosition, $lt: entry.queuePosition },
    }, { $inc: { queuePosition: 1 } });
  } else {
    await QueueEntry.updateMany({
      shopId,
      status: 'WAITING',
      queuePosition: { $gt: entry.queuePosition, $lte: boundedPosition },
    }, { $inc: { queuePosition: -1 } });
  }
  entry.queuePosition = boundedPosition;
  await entry.save();
  await reconcileShopQueue(shopId, { previousPositions });
  return entry;
}

export async function setShopQueueOpen(shopId, isOpen) {
  if (typeof isOpen !== 'boolean') throw new AppError(400, 'Queue status must be open or closed.');
  const shop = await Shop.findByIdAndUpdate(shopId, { queueOpen: isOpen }, { new: true }).select('queueOpen');
  if (!shop) throw new AppError(404, 'Shop not found.');
  return shop.queueOpen;
}

export async function addWalkIn(shopId, { serviceId, walkInName }) {
  const shop = await Shop.findOne({ _id: shopId, status: 'APPROVED' }).select('queueOpen');
  if (!shop) throw new AppError(404, 'Shop not found.');
  if (shop.queueOpen === false) throw new AppError(409, 'This shop is not accepting new queue entries right now.');
  await requireActiveService(shopId, serviceId);
  const nameErr = validateName(walkInName);
  if (nameErr) throw new AppError(400, nameErr, { walkInName: nameErr });
  const trimmedName = walkInName.trim();

  const queuePosition = await nextQueuePosition(shopId);

  const entry = await QueueEntry.create({
    shopId,
    walkInName: trimmedName,
    serviceId,
    source: 'walk_in',
    status: 'WAITING',
    queuePosition,
  });
  await reconcileShopQueue(shopId);
  return entry;
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
  const wasCalled = entry.status === 'CALLED';
  entry.status = 'SKIPPED';
  await entry.save();
  await notifyQueueEntry(entry, {
    eventKey: `${entry._id}:staff-skipped`,
    type: 'QUEUE_REMOVED',
    title: 'Removed from queue',
    message: 'A shop team member removed your queue entry.',
    position: entry.queuePosition,
  });
  await reconcileShopQueue(shopId, { callNextCount: wasCalled ? 1 : 0 });
  return entry;
}

export async function cancelEntryByStaff(shopId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  if (!canTransition(entry.status, 'CANCELLED')) {
    throw new AppError(409, `Can't cancel an entry with status ${entry.status}.`);
  }
  const wasCalled = entry.status === 'CALLED';
  entry.status = 'CANCELLED';
  await entry.save();
  await notifyQueueEntry(entry, {
    eventKey: `${entry._id}:staff-cancelled`,
    type: 'QUEUE_CANCELLED',
    title: 'Queue entry cancelled',
    message: 'A shop team member cancelled your queue entry.',
    position: entry.queuePosition,
  });
  await reconcileShopQueue(shopId, { callNextCount: wasCalled ? 1 : 0 });
  return entry;
}

// ---------------------------------------------------------------------
// Barber operations — every one of these takes the ACTING BARBER's own
// {id, shopId} (resolved server-side from the session) and verifies the
// target entry belongs to that same shop before touching it.
// ---------------------------------------------------------------------

export async function startService(shopId, barberId, entryId) {
  const entry = await requireShopQueueEntry(shopId, entryId);
  const startedAt = new Date();
  if (entry.status === 'CALLED' && !entry.arrivedAt && entry.arrivalDeadlineAt && entry.arrivalDeadlineAt <= startedAt) {
    const expired = await expireCalledQueueEntry(entry._id, startedAt);
    if (expired) await reconcileShopQueue(shopId, { callNextCount: 1, now: startedAt });
    throw new AppError(409, 'The customer arrival window expired before service could start.');
  }
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

  let serviceLog = await ServiceLog.findOne({ queueEntryId: entry._id });
  if (!serviceLog) {
    serviceLog = new ServiceLog({
      queueEntryId: entry._id,
      barberId,
      serviceId: entry.serviceId,
      startTime: startedAt,
    });
  } else {
    serviceLog.barberId = barberId;
    serviceLog.serviceId = entry.serviceId;
    serviceLog.startTime ||= startedAt;
  }
  await serviceLog.save();

  entry.status = 'IN_SERVICE';
  entry.barberId = barberId;
  entry.arrivedAt ||= startedAt;
  await entry.save();
  await notifyQueueEntry(entry, {
    eventKey: `${entry._id}:service-started`,
    type: 'SERVICE_STARTED',
    title: 'Your service has started',
    message: 'Your barber is starting your service now.',
    position: entry.queuePosition,
  });
  await reconcileShopQueue(shopId, { now: startedAt });
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

  const finishedAt = new Date();
  let serviceLog = await ServiceLog.findOne({ queueEntryId: entry._id });
  if (!serviceLog) {
    serviceLog = new ServiceLog({
      queueEntryId: entry._id,
      barberId,
      serviceId: entry.serviceId,
      endTime: finishedAt,
    });
  } else {
    serviceLog.endTime = finishedAt;
    serviceLog.actualDuration = serviceLog.startTime
      ? Math.max(0, (finishedAt - serviceLog.startTime) / 60000)
      : null;
  }
  await serviceLog.save();

  entry.status = 'COMPLETED';
  await entry.save();
  await reconcileShopQueue(shopId, {
    callNextCount: 1,
    now: finishedAt,
    nextCustomerReason: 'SERVICE_COMPLETED',
  });
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

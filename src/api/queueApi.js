import { db, mutate } from './mockStore';
import { ApiError } from './errors';
import { canTransition, validateDelay } from '../validation/queueValidation';
import { toPublicShop, toPublicQueueList } from './publicSerializers';

// ---------------------------------------------------------------------
// Internal helpers (not exported) - shared lookups used across the file.
// ---------------------------------------------------------------------

function activeBarberCount(shopId) {
  const count = db.barbers.filter(
    (b) => b.shopId === shopId && (b.status === 'available' || b.status === 'in_service')
  ).length;
  return count || 1;
}

function avgServiceDuration(shopId) {
  const services = db.services.filter((s) => s.shopId === shopId);
  if (services.length === 0) return 25;
  return services.reduce((sum, s) => sum + s.durationMin, 0) / services.length;
}

function serviceById(id) {
  return db.services.find((s) => s.id === id);
}
function barberById(id) {
  return db.barbers.find((b) => b.id === id);
}
function shopById(id) {
  return db.shops.find((s) => s.id === id);
}

function requireShop(shopId) {
  const shop = shopById(shopId);
  if (!shop) throw new ApiError('NOT_FOUND', 'This shop no longer exists.');
  return shop;
}

function requireActiveShop(shopId) {
  const shop = requireShop(shopId);
  if (shop.status !== 'active') throw new ApiError('INACTIVE', 'This shop is not currently accepting queue entries.');
  return shop;
}

function requireQueueEntry(entryId) {
  const entry = db.queue.find((q) => q.id === entryId);
  if (!entry) throw new ApiError('NOT_FOUND', 'That queue entry no longer exists.');
  return entry;
}

// ---------------------------------------------------------------------
// Waiting-time estimation (Section 12 of the Master Project Document)
// ---------------------------------------------------------------------

export function getWaitEstimate(shopId) {
  const waitingCount = db.queue.filter((q) => q.shopId === shopId && q.status === 'WAITING').length;
  const barbers = activeBarberCount(shopId);
  const avgDuration = avgServiceDuration(shopId);
  const min = Math.max(5, Math.round((waitingCount * avgDuration) / barbers));
  const max = Math.max(min + 5, Math.round(min * 1.3));
  return { min, max };
}

export function getShopSummary(shopId) {
  const waiting = db.queue.filter((q) => q.shopId === shopId && q.status === 'WAITING').length;
  const inService = db.queue.filter((q) => q.shopId === shopId && q.status === 'IN_SERVICE').length;
  const barbers = db.barbers.filter((b) => b.shopId === shopId);
  const wait = getWaitEstimate(shopId);
  return { waiting, inService, barbers, ...wait };
}

// ---------------------------------------------------------------------
// PUBLIC reads — safe for unauthenticated visitors (Sections 2, 7, 19).
// Every field returned here has been through publicSerializers.js. This
// is the frontend mirror of GET /api/shops, GET /api/shops/:id,
// GET /api/shops/:id/queue — the real controllers must build their JSON
// response the same explicit way, not serialize the DB document directly.
// ---------------------------------------------------------------------

export function getPublicShops() {
  return db.shops
    .filter((s) => s.status === 'active')
    .map((s) => {
      const wait = getWaitEstimate(s.id);
      const waiting = db.queue.filter((q) => q.shopId === s.id && q.status === 'WAITING').length;
      const activeBarbers = activeBarberCount(s.id);
      return { ...toPublicShop(s), waitMin: wait.min, waitMax: wait.max, waiting, activeBarbers };
    });
}

export function getPublicShop(shopId) {
  const shop = shopById(shopId);
  if (!shop || shop.status !== 'active') return null;
  const wait = getWaitEstimate(shopId);
  const waiting = db.queue.filter((q) => q.shopId === shopId && q.status === 'WAITING').length;
  return { ...toPublicShop(shop), waitMin: wait.min, waitMax: wait.max, waiting };
}

export function getPublicServices(shopId) {
  // Service fields (name/duration/price) are already public-safe; no
  // separate serializer needed, but routed through getServices so shop
  // scoping stays in one place.
  return getServices(shopId);
}

export function getPublicQueue(shopId, viewerEntryId = null) {
  const entries = getQueue(shopId).map((q) => ({ ...q, service: serviceById(q.serviceId) }));
  return toPublicQueueList(entries, viewerEntryId);
}

// Back-compat alias used by earlier screens — now explicitly routed
// through the public serializer rather than returning raw shop records.
export function getShops() {
  return getPublicShops();
}
export function getShop(shopId) {
  return shopById(shopId) || null;
}

// ---------------------------------------------------------------------
// Shared / staff reads (shop-scoped; real backend must still verify the
// requesting user is authorized for `shopId` — see Section 14).
// ---------------------------------------------------------------------

export function getServices(shopId) {
  return db.services.filter((s) => s.shopId === shopId && s.active);
}

export function getBarbers(shopId) {
  return db.barbers.filter((b) => b.shopId === shopId);
}

export function getQueue(shopId) {
  return db.queue
    .filter((q) => q.shopId === shopId)
    .sort((a, b) => (a.status === 'IN_SERVICE' ? -1 : 1) - (b.status === 'IN_SERVICE' ? -1 : 1) || a.position - b.position);
}

// Staff-only view: real customer names. Never expose this shape to a
// public/unauthenticated request (Section 7) — use getPublicQueue instead.
export function getQueueView(shopId) {
  return getQueue(shopId).map((q) => ({
    ...q,
    service: serviceById(q.serviceId),
    barber: q.barberId ? barberById(q.barberId) : null,
  }));
}

// ---------------------------------------------------------------------
// Mutations — every one below validates shop/service/state before
// touching the store, and throws ApiError instead of failing silently.
// This is what the Express layer must also do against real documents.
// ---------------------------------------------------------------------

export function addWalkIn(shopId, { customerName, serviceId }) {
  requireActiveShop(shopId);
  const service = serviceById(serviceId);
  if (!service || service.shopId !== shopId || !service.active) {
    throw new ApiError('VALIDATION', 'Select a valid, active service for this shop.');
  }
  const trimmedName = (customerName || '').trim();
  if (!trimmedName) throw new ApiError('VALIDATION', 'Enter a customer name.');

  mutate((state) => {
    const position = state.queue.filter((q) => q.shopId === shopId && q.status === 'WAITING').length + 1;
    state.queue.push({
      id: 'q-' + Date.now(),
      shopId,
      customerName: trimmedName,
      serviceId,
      barberId: null,
      source: 'walk_in',
      status: 'WAITING',
      startedAt: null,
      position,
    });
  });
}

export function joinQueue(shopId, serviceId, customerName = 'You') {
  requireActiveShop(shopId);
  const service = serviceById(serviceId);
  if (!service || service.shopId !== shopId || !service.active) {
    throw new ApiError('VALIDATION', 'Select a valid, active service for this shop.');
  }
  // A real backend derives "the customer" from the authenticated session
  // and checks: does this account already have an active entry anywhere?
  // The mock store only tracks a single "my" entry, so this mirrors that.
  const existing = db.myQueueEntryId && db.queue.find((q) => q.id === db.myQueueEntryId);
  if (existing && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
    throw new ApiError('CONFLICT', "You're already in a queue. Leave it before joining another.");
  }

  let newId;
  mutate((state) => {
    const position = state.queue.filter((q) => q.shopId === shopId && q.status === 'WAITING').length + 1;
    newId = 'q-' + Date.now();
    state.queue.push({
      id: newId,
      shopId,
      customerName,
      serviceId,
      barberId: null,
      source: 'reservation',
      status: 'WAITING',
      startedAt: null,
      position,
      isMe: true,
    });
    state.myQueueEntryId = newId;
  });
  return newId;
}

export function getMyQueueEntry() {
  if (!db.myQueueEntryId) return null;
  const entry = db.queue.find((q) => q.id === db.myQueueEntryId);
  if (!entry) return null;
  const aheadCount = db.queue.filter(
    (q) => q.shopId === entry.shopId && q.status === 'WAITING' && q.position < entry.position
  ).length;
  const wait = getWaitEstimate(entry.shopId);
  const shop = getPublicShop(entry.shopId);
  return { ...entry, shop, aheadCount, wait };
}

export function leaveMyQueue() {
  const entry = db.myQueueEntryId && db.queue.find((q) => q.id === db.myQueueEntryId);
  if (entry && !canTransition(entry.status, 'CANCELLED')) {
    throw new ApiError('INVALID_STATE', "This queue entry can't be cancelled anymore.");
  }
  mutate((state) => {
    const target = state.queue.find((q) => q.id === state.myQueueEntryId);
    if (target) target.status = 'CANCELLED';
    state.myQueueEntryId = null;
  });
}

export function startService(entryId, shopId, barberId) {
  const entry = requireQueueEntry(entryId);
  if (entry.shopId !== shopId) {
    throw new ApiError('FORBIDDEN', 'This queue entry belongs to a different shop.');
  }
  if (!canTransition(entry.status, 'IN_SERVICE')) {
    throw new ApiError('INVALID_STATE', `Can't start service from status ${entry.status}.`);
  }
  const barber = barberById(barberId);
  if (!barber || barber.shopId !== shopId) {
    throw new ApiError('FORBIDDEN', 'This barber is not part of this shop.');
  }
  const alreadyServing = db.queue.some(
    (q) => q.barberId === barberId && q.status === 'IN_SERVICE' && q.id !== entryId
  );
  if (alreadyServing) {
    throw new ApiError('INVALID_STATE', 'This barber already has an active service.');
  }

  mutate((state) => {
    const target = state.queue.find((q) => q.id === entryId);
    target.status = 'IN_SERVICE';
    target.startedAt = Date.now();
    target.barberId = barberId;
  });
}

export function finishService(entryId, shopId) {
  const entry = requireQueueEntry(entryId);
  if (entry.shopId !== shopId) {
    throw new ApiError('FORBIDDEN', 'This queue entry belongs to a different shop.');
  }
  if (!canTransition(entry.status, 'COMPLETED')) {
    throw new ApiError('INVALID_STATE', 'This service was never started, so it cannot be finished.');
  }
  mutate((state) => {
    state.queue.find((q) => q.id === entryId).status = 'COMPLETED';
  });
}

export function skipEntry(entryId, shopId) {
  const entry = requireQueueEntry(entryId);
  if (entry.shopId !== shopId) throw new ApiError('FORBIDDEN', 'This queue entry belongs to a different shop.');
  if (!canTransition(entry.status, 'SKIPPED')) {
    throw new ApiError('INVALID_STATE', `Can't skip an entry with status ${entry.status}.`);
  }
  mutate((state) => {
    state.queue.find((q) => q.id === entryId).status = 'SKIPPED';
  });
}

export function cancelEntry(entryId, shopId) {
  const entry = requireQueueEntry(entryId);
  if (entry.shopId !== shopId) throw new ApiError('FORBIDDEN', 'This queue entry belongs to a different shop.');
  if (!canTransition(entry.status, 'CANCELLED')) {
    throw new ApiError('INVALID_STATE', `Can't cancel an entry with status ${entry.status}.`);
  }
  mutate((state) => {
    state.queue.find((q) => q.id === entryId).status = 'CANCELLED';
  });
}

export function applyDelay(entryId, shopId, minutes) {
  const delayError = validateDelay(minutes);
  if (delayError) throw new ApiError('VALIDATION', delayError);
  const entry = requireQueueEntry(entryId);
  if (entry.shopId !== shopId) throw new ApiError('FORBIDDEN', 'This queue entry belongs to a different shop.');
  if (entry.status !== 'IN_SERVICE') {
    throw new ApiError('INVALID_STATE', 'Delays can only be applied to a service in progress.');
  }
  mutate((state) => {
    const target = state.queue.find((q) => q.id === entryId);
    target.delayMinutes = (target.delayMinutes || 0) + minutes;
  });
}

export function setBarberStatus(barberId, shopId, status) {
  const barber = barberById(barberId);
  if (!barber || barber.shopId !== shopId) {
    throw new ApiError('FORBIDDEN', 'This barber is not part of this shop.');
  }
  mutate((state) => {
    state.barbers.find((b) => b.id === barberId).status = status;
  });
}

/**
 * Barber Home data for the CURRENT SESSION's shop/barber. shopId and
 * barberId must come from useSession() (server-derived identity), never
 * be picked freely by the page — see Section 14.
 */
export function getCurrentBarberQueue(shopId, barberId) {
  const barber = barberById(barberId);
  if (!barber || barber.shopId !== shopId) {
    throw new ApiError('FORBIDDEN', 'This barber is not part of this shop.');
  }
  const current = db.queue.find((q) => q.shopId === shopId && q.barberId === barberId && q.status === 'IN_SERVICE');
  const upNext = db.queue
    .filter((q) => q.shopId === shopId && q.status === 'WAITING')
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ ...q, service: serviceById(q.serviceId) }));
  return {
    current: current ? { ...current, service: serviceById(current.serviceId) } : null,
    upNext,
    barber,
  };
}

export function getNotifications() {
  return db.notifications;
}

export function markAllNotificationsRead() {
  mutate((state) => {
    state.notifications.forEach((n) => (n.read = true));
  });
}

// ---------------------------------------------------------------------
// Super Admin — platform-wide, not shop-scoped.
// ---------------------------------------------------------------------

export function getApprovals() {
  return db.approvals;
}

export function approveShop(approvalId) {
  mutate((state) => {
    const appr = state.approvals.find((a) => a.id === approvalId);
    if (appr) {
      state.approvals = state.approvals.filter((a) => a.id !== approvalId);
      state.shops.push({
        id: 'shop-' + Date.now(),
        name: appr.shopName,
        address: 'Address pending',
        hours: '9:00 AM - 6:00 PM',
        status: 'active',
      });
    }
  });
}

export function rejectShop(approvalId) {
  mutate((state) => {
    state.approvals = state.approvals.filter((a) => a.id !== approvalId);
  });
}

/**
 * Submits a new shop for approval. Mirrors Section 3: this NEVER creates
 * an active shop — it only ever lands in the approvals queue. There is no
 * fake auto-approval anywhere in this file.
 */
export function submitShopRegistration({ shopName, address, contact, ownerName, ownerEmail }) {
  mutate((state) => {
    state.approvals.push({
      id: 'appr-' + Date.now(),
      shopName,
      owner: ownerName,
      ownerEmail,
      address,
      contact,
      submitted: 'just now',
    });
  });
}

export function getAllShopsForAdmin() {
  return db.shops;
}

export function setShopStatus(shopId, status) {
  mutate((state) => {
    const shop = state.shops.find((s) => s.id === shopId);
    if (shop) shop.status = status;
  });
}

export function getPlatformStats() {
  return {
    activeShops: db.shops.filter((s) => s.status === 'active').length,
    pendingApprovals: db.approvals.length,
    activeQueues: new Set(db.queue.filter((q) => q.status !== 'COMPLETED' && q.status !== 'CANCELLED').map((q) => q.shopId)).size,
    totalCustomers: 2340,
  };
}

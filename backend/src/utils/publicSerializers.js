// Mirrors flowcut-ui/src/api/publicSerializers.js's intent, enforced
// server-side where it actually matters (Section 14): these are the ONLY
// functions allowed to build a response body for a public/unauthenticated
// endpoint. Controllers must never pass a raw Mongoose document straight
// to res.json() for a public route.

export function toPublicShop(shop) {
  if (!shop) return null;
  return {
    id: shop._id.toString(),
    name: shop.name,
    address: shop.address,
    contactPhone: shop.contact?.phone || null,
    openingTime: shop.operatingHours?.openingTime || null,
    closingTime: shop.operatingHours?.closingTime || null,
    // Deliberately excluded even though present on the document:
    // ownerId, status, createdAt/updatedAt, any future internal notes.
  };
}

export function toPublicService(service) {
  if (!service) return null;
  return {
    id: service._id.toString(),
    name: service.name,
    description: service.description || '',
    estimatedDuration: service.estimatedDuration,
    price: service.price,
  };
}

/**
 * Anonymized queue entry for public viewing. Never includes the real
 * customer's name/id/mobile/email — only what's needed to answer "how
 * does the line look right now." `isViewer` lets the customer who OWNS
 * this entry see "You" instead of a number, without exposing that fact
 * to anyone else looking at the same public queue.
 */
export function toPublicQueueEntry(entry, index, { isViewer = false, serviceName = null } = {}) {
  return {
    queuePosition: index + 1,
    status: entry.status,
    serviceName,
    displayName: isViewer ? 'You' : `Customer #${index + 1}`,
  };
}

// Staff-facing shape (Shop Admin / Barber dashboards) — real name is
// fine here, but still never anything from the User document beyond
// name/id, and never barberId's password-adjacent fields etc.
export function toStaffQueueEntry(entry, { customerName, serviceName, barberName } = {}) {
  return {
    id: entry._id.toString(),
    customerId: entry.customerId ? entry.customerId.toString() : null,
    customerName: customerName || entry.walkInName || 'Walk-in customer',
    serviceId: entry.serviceId.toString(),
    serviceName,
    barberId: entry.barberId ? entry.barberId.toString() : null,
    barberName: barberName || null,
    status: entry.status,
    queuePosition: entry.queuePosition,
    source: entry.source,
    delayMinutes: entry.delayMinutes || 0,
    createdAt: entry.createdAt,
  };
}

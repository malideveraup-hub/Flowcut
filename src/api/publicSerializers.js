// Explicit "what is safe to send to an unauthenticated request" layer.
//
// This is the frontend's mirror of what the real Express controllers for
// GET /api/shops, GET /api/shops/:id, and GET /api/shops/:id/queue must
// do: build a response object field-by-field from an allow-list, never
// `res.json(shopDocument)` or `res.json(queueEntryDocument)` directly.
// Hiding fields with CSS or simply not *rendering* a field in a component
// is not the same thing — the network response itself must not contain
// customer emails, phone numbers, password hashes, internal user ids, or
// staff-only notes. These functions are where that boundary is drawn.

export function toPublicShop(shop) {
  if (!shop) return null;
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    hours: shop.hours,
    // Deliberately excluded even though present on the internal record:
    // ownerId, status history, internal approval notes.
  };
}

export function toPublicService(service) {
  if (!service) return null;
  return {
    id: service.id,
    name: service.name,
    durationMin: service.durationMin,
    price: service.price,
  };
}

/**
 * Anonymized queue entry for public viewing. Never includes the real
 * customer name, id, email, or phone — only what's needed to answer
 * "how does the line look right now."
 */
export function toPublicQueueEntry(entry, index, { isViewer = false } = {}) {
  return {
    queuePosition: index + 1,
    status: entry.status,
    serviceName: entry.service?.name || null,
    displayName: isViewer ? 'You' : `Customer #${index + 1}`,
  };
}

export function toPublicQueueList(entries, viewerEntryId = null) {
  return entries
    .filter((e) => e.status === 'WAITING' || e.status === 'IN_SERVICE' || e.status === 'CALLED')
    .map((entry, i) => toPublicQueueEntry(entry, i, { isViewer: entry.id === viewerEntryId }));
}

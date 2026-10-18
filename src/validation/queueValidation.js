// The QueueEntry state machine (Section 10 of the spec) and delay-value
// rules. This module is the single source of truth for "is this
// transition/value allowed" so the frontend and the future Express
// backend can share the exact same rule set instead of drifting apart.
//
// The frontend calling into queueApi.js gets these rules enforced against
// the mock store. That enforcement is NOT a security boundary — a
// malicious client could call a real API directly and skip the frontend
// entirely. The Express backend must run this same table (or an
// equivalent) against the authoritative database record, not trust
// whatever state the client claims a queue entry is in.

export const QUEUE_TRANSITIONS = {
  WAITING: ['CALLED', 'IN_SERVICE', 'SKIPPED', 'CANCELLED'],
  CALLED: ['IN_SERVICE', 'SKIPPED', 'CANCELLED', 'NO_SHOW'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  SKIPPED: ['WAITING', 'CANCELLED'],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(fromStatus, toStatus) {
  return (QUEUE_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

// Only these quick-delay values are exposed in the UI (Section 9). A
// backend must reject any other value even if a client sends one directly.
export const ALLOWED_DELAY_MINUTES = [5, 10, 15];

export function validateDelay(minutes) {
  if (!ALLOWED_DELAY_MINUTES.includes(minutes)) {
    return `Delay must be one of: ${ALLOWED_DELAY_MINUTES.join(', ')} minutes.`;
  }
  return null;
}

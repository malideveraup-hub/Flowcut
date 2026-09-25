// The authoritative QueueEntry state machine. This is what actually gets
// enforced — see queueService.js, which calls canTransition() before
// every status change and rejects anything not listed here, regardless
// of what a client requests.
//
// Design decision (documented since the brief's lifecycle description
// left some edges unspecified): the existing Barber UI has no separate
// "call next customer" action — it goes straight from an idle/next-up
// card to "Start Service". So WAITING is allowed to go directly to
// IN_SERVICE (not just through CALLED) to match how the product actually
// works today; CALLED is still modeled as a legal intermediate step for
// a future "call next" feature.
//
// DELAYED and PAUSED are modeled as sub-states of an in-progress service
// (Section 8: "IN_SERVICE -> DELAYED", "IN_SERVICE -> PAUSED/BREAK") that
// can resume back to IN_SERVICE or go straight to COMPLETED — a barber
// finishing up while technically "running behind" is still a normal
// finish, not an error.
export const QUEUE_TRANSITIONS = {
  JOINED: ['WAITING', 'CANCELLED'],
  WAITING: ['CALLED', 'IN_SERVICE', 'SKIPPED', 'CANCELLED'],
  CALLED: ['IN_SERVICE', 'SKIPPED', 'CANCELLED'],
  IN_SERVICE: ['DELAYED', 'PAUSED', 'COMPLETED'],
  DELAYED: ['IN_SERVICE', 'COMPLETED'],
  PAUSED: ['IN_SERVICE', 'COMPLETED'],
  COMPLETED: [],
  SKIPPED: ['WAITING', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransition(fromStatus, toStatus) {
  return (QUEUE_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

// A customer is considered to have an "active" queue entry (blocking a
// second join anywhere) if it's in any of these statuses.
export const ACTIVE_QUEUE_STATUSES = ['JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED'];

// Only these quick-delay values are ever accepted (Section 12). 0 is a
// valid stored default (see ServiceLog/QueueEntry from Phase 2) meaning
// "no delay recorded" — it is NOT a value a client can submit as an
// action; there is nothing to "apply" if the delay is zero.
export const ALLOWED_DELAY_MINUTES = [5, 10, 15];

export function validateDelayMinutes(value) {
  if (value === null || value === undefined || value === '') return 'Delay must be a number.';
  // Reject arrays/objects outright before coercion — `Number([10]) === 10`
  // in JavaScript, which would otherwise let a non-numeric shape sneak
  // through as a seemingly-valid delay value.
  if (typeof value !== 'number' && typeof value !== 'string') return 'Delay must be a number.';
  const n = Number(value);
  if (Number.isNaN(n)) return 'Delay must be a number.';
  if (!ALLOWED_DELAY_MINUTES.includes(n)) {
    return `Delay must be one of: ${ALLOWED_DELAY_MINUTES.join(', ')} minutes.`;
  }
  return null;
}

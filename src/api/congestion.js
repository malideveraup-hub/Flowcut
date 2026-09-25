// Section 6 of the design spec: one congestion system, rendered differently
// per skin but always meaning the same thing.

export const CONGESTION = {
  low: { label: 'Quiet', shortLabel: 'QUIET', hint: 'Good time to visit' },
  moderate: { label: 'Moderate', shortLabel: 'MODERATE', hint: 'Normal flow' },
  high: { label: 'Busy', shortLabel: 'BUSY', hint: 'Consider visiting later' },
};

// Simple MVP thresholds matching Section 12 of the Master Project Document.
export function congestionFromWait(minMinutes) {
  if (minMinutes <= 15) return 'low';
  if (minMinutes <= 30) return 'moderate';
  return 'high';
}

export const QUEUE_STATUS_META = {
  JOINED: { label: 'Joined', level: 'moderate' },
  WAITING: { label: 'Waiting', level: 'moderate' },
  CALLED: { label: 'Called', level: 'moderate' },
  IN_SERVICE: { label: 'In service', level: 'low' },
  DELAYED: { label: 'Delayed', level: 'high' },
  PAUSED: { label: 'Paused', level: 'high' },
  COMPLETED: { label: 'Completed', level: 'low' },
  SKIPPED: { label: 'Skipped', level: 'high' },
  CANCELLED: { label: 'Cancelled', level: 'high' },
  NO_SHOW: { label: 'No-show', level: 'high' },
  RESERVED: { label: 'Reserved', level: 'moderate' },
  WALK_IN: { label: 'Walk-in', level: 'moderate' },
  PENDING: { label: 'Pending', level: 'moderate' },
};

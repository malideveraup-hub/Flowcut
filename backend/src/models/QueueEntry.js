import mongoose from 'mongoose';

// NOTE on this enum vs. the existing frontend (see backend README "Phase 2"
// section for the full explanation): the frontend's mock queue logic
// (src/validation/queueValidation.js) currently uses a *different* status
// set: WAITING, CALLED, IN_SERVICE, COMPLETED, SKIPPED, CANCELLED, NO_SHOW
// (no JOINED/DELAYED/PAUSED). This phase's spec explicitly asked for the
// list below, so that's what's implemented here — but the two will need
// to be reconciled before the frontend is wired to this API (later
// phase), otherwise a status the backend sends may not be one the
// frontend's QUEUE_STATUS_META/QUEUE_TRANSITIONS tables know how to
// display or validate.
export const QUEUE_STATUSES = [
  'JOINED',
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
  'DELAYED',
  'PAUSED',
];

const queueEntrySchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // Phase 4 change: relaxed from required to optional. Shop Admins
      // and Barbers can add a WALK-IN customer who has no FlowCut
      // account at all (Section: "Barber/Staff Access" and the existing
      // frontend's "Add walk-in" flow, preserved from earlier phases).
      // Exactly one of customerId / walkInName must be present — that
      // rule is enforced in queueService.js (validation belongs in the
      // service layer, not as a database-level conditional-required
      // constraint, to keep the schema simple).
      default: null,
    },
    // Only set when this entry has no linked account (a walk-in). Never
    // set alongside customerId.
    walkInName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    // Distinguishes a customer who joined remotely (via the app/QR) from
    // one a staff member added at the counter — the existing Barber/Shop
    // Admin UI already displays this as a "Reserved"/"Walk-in" badge.
    source: {
      type: String,
      enum: ['reservation', 'walk_in'],
      required: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barber',
      default: null,
    },
    // Schema-level only: this enum defines which VALUES are legal to
    // store. Transition legality (e.g. rejecting COMPLETED -> IN_SERVICE)
    // is enforced in services/queueService.js via
    // validation/queueValidation.js's canTransition() — added in Phase 4.
    status: {
      type: String,
      enum: QUEUE_STATUSES,
      default: 'JOINED',
    },
    queuePosition: {
      type: Number,
      required: true,
      min: 0,
    },
    // Phase 4 addition: accumulates minutes reported via the barber's
    // Delay action while this entry is being served. Deliberately lives
    // directly on QueueEntry rather than ServiceLog — full ServiceLog
    // creation (with real startTime/endTime/actualDuration) is Phase 5's
    // job per the brief ("Phase 5 will handle... serviceLogs"). This
    // field just gives the Phase 4 DELAY action somewhere real to persist
    // to without reaching into Phase 5's territory.
    delayMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// Powers the single most common query: "this shop's currently
// waiting/active queue" (e.g. status: { $in: ['WAITING','CALLED'] }).
queueEntrySchema.index({ shopId: 1, status: 1 });
// Powers "this shop's queue history in order" and reporting/analytics.
queueEntrySchema.index({ shopId: 1, createdAt: 1 });
// Powers "does this customer already have an active entry anywhere" —
// the duplicate-join check from earlier phases of the frontend prototype.
queueEntrySchema.index({ customerId: 1, status: 1 });

// Exactly one of customerId / walkInName must be present — a queue entry
// is either a real account's entry or a staff-recorded walk-in, never
// both and never neither.
queueEntrySchema.pre('validate', function guardCustomerIdentity() {
  const hasAccount = !!this.customerId;
  const hasWalkInName = !!this.walkInName;
  if (hasAccount === hasWalkInName) {
    this.invalidate('customerId', 'Provide exactly one of customerId or walkInName.');
  }
});

export default mongoose.model('QueueEntry', queueEntrySchema, 'queueentries');

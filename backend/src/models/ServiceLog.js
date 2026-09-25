import mongoose from 'mongoose';

// Matches the delay options the Customer/Barber UI already exposes
// (+5 / +10 / +15) plus 0 (no delay recorded).
export const ALLOWED_DELAY_MINUTES = [0, 5, 10, 15];

const serviceLogSchema = new mongoose.Schema(
  {
    queueEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueEntry',
      required: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barber',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },

    // Real server timestamps once Start/Finish Service exist (later
    // phase). Nullable here because this phase only defines the shape —
    // nothing writes to this collection yet.
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },

    // Minutes. Deliberately NOT auto-computed by a schema hook — Section 7
    // is explicit that (endTime - startTime) must be calculated by the
    // service layer when Finish Service actually runs, using real
    // server-side timestamps, not derived silently here from whatever
    // startTime/endTime happen to be set.
    actualDuration: {
      type: Number,
      default: null,
      min: 0,
    },

    delayMinutes: {
      type: Number,
      enum: ALLOWED_DELAY_MINUTES,
      default: 0,
    },
  },
  { timestamps: true }
);

// One-to-one in practice (one log per completed queue entry), but not
// enforced unique here — a later phase may legitimately need multiple
// log rows per entry (e.g. if a service is paused and resumed). Simple
// lookup index only.
serviceLogSchema.index({ queueEntryId: 1 });
serviceLogSchema.index({ barberId: 1 });
serviceLogSchema.index({ serviceId: 1 });
// Powers historical/analytics queries ("average duration over the last
// 7 days") once the prediction engine is built.
serviceLogSchema.index({ startTime: 1 });

export default mongoose.model('ServiceLog', serviceLogSchema, 'servicelogs');

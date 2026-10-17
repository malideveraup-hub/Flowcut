import mongoose from 'mongoose';

// Discrete extension controls plus 0; the stored delayMinutes field is a
// cumulative total and may therefore be another value (for example 8).
export const ALLOWED_DELAY_MINUTES = [0, 3, 5, 10];

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
    serviceNameAtStart: {
      type: String,
      trim: true,
      default: null,
    },

    // Real server timestamps from the barber's Start/Finish actions.
    // They remain nullable for legacy or admin-completed entries that did
    // not pass through both actions.
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },

    // Active service minutes calculated by the service layer at completion
    // from server timestamps, with paused intervals excluded.
    actualDuration: {
      type: Number,
      default: null,
      min: 0,
    },

    // Catalog price copied when service begins. This is a listed service
    // value for analytics, not a payment or settlement record.
    priceAtStart: {
      type: Number,
      default: null,
      min: 0,
    },

    delayMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 480,
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

import mongoose from 'mongoose';

const waitingEstimateSchema = new mongoose.Schema(
  {
    queueEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueEntry',
      required: true,
    },
    // FlowCut always shows a RANGE, never a single fake-precise number
    // (Section 8 of the brief) — the schema itself makes a single-value
    // estimate structurally impossible to store.
    estimatedMin: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedMax: {
      type: Number,
      required: true,
      min: 0,
    },
    calculatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Basic data-integrity guard only — NOT the prediction algorithm itself
// (that's a later phase). Just makes sure nothing can ever store a range
// that's backwards. Written without a `next` callback parameter
// (Mongoose's modern promise-style hook) — Mongoose 9 inspects function
// arity to decide callback-vs-promise style, and a declared-but-unused
// `next` param was actually misdetected, so it's correctness, not just style.
waitingEstimateSchema.pre('validate', function guardRangeOrder() {
  if (this.estimatedMin != null && this.estimatedMax != null && this.estimatedMax < this.estimatedMin) {
    this.invalidate('estimatedMax', 'estimatedMax must be greater than or equal to estimatedMin');
  }
});

// Powers "this queue entry's estimate history, most recent first" — kept
// as a history (not overwritten in place) so prediction accuracy can be
// evaluated later by comparing an old estimate to the eventual actual
// duration.
waitingEstimateSchema.index({ queueEntryId: 1, calculatedAt: -1 });

export default mongoose.model('WaitingEstimate', waitingEstimateSchema, 'waitingestimates');

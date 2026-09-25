import mongoose from 'mongoose';

export const SERVICE_STATUSES = ['ACTIVE', 'INACTIVE'];

const serviceSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Minutes. This is the shop's stated reference duration — the real
    // "how long did it actually take" data lives in ServiceLog once that
    // starts getting written in a later phase.
    estimatedDuration: {
      type: Number,
      required: true,
      min: 1,
      max: 480,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: SERVICE_STATUSES,
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

// Powers "list this shop's services".
serviceSchema.index({ shopId: 1 });

// Design decision: a service name must be unique WITHIN a shop (two
// different shops can both have "Haircut"; the same shop cannot have two
// services both named "Haircut"). If duplicate names within a shop turn
// out to be desirable later (e.g. two tiers both literally called
// "Haircut" with different prices), drop the `unique` option here.
serviceSchema.index({ shopId: 1, name: 1 }, { unique: true });

export default mongoose.model('Service', serviceSchema, 'services');

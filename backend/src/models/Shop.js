import mongoose from 'mongoose';

export const SHOP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

const shopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    contact: {
      phone: {
        type: String,
        required: true,
        trim: true,
      },
    },
    operatingHours: {
      // Stored as "HH:mm" 24-hour strings (e.g. "09:00") rather than Date
      // objects, since these represent a daily recurring time-of-day, not
      // a specific instant. Logical open-before-close validation belongs
      // to the service layer in a later phase, once shop registration is
      // actually implemented — not enforced here at the schema level.
      openingTime: { type: String, required: true, trim: true },
      closingTime: { type: String, required: true, trim: true },
    },
    queueOpen: {
      type: Boolean,
      default: true,
    },

    // A shop always starts PENDING. Nothing in this phase ever sets this
    // to APPROVED — that only happens through Super Admin approval logic
    // in a later phase. The frontend must never be able to set this
    // directly (Section 3 / Section 13 of the brief).
    status: {
      type: String,
      enum: SHOP_STATUSES,
      default: 'PENDING',
    },

    // The User who owns/manages this shop. Assigned server-side when a
    // shop application is approved — never accepted as client input.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    queueQr: {
      token: { type: String, default: null },
      status: { type: String, enum: ['active', 'disabled'], default: null },
      codeId: { type: String, default: null },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Powers "list all APPROVED shops" (public browsing) and Super Admin
// filtering by status.
shopSchema.index({ status: 1 });
// Powers "find the shop(s) this user owns" — used once shop-admin
// authorization is implemented.
shopSchema.index({ ownerId: 1 });
shopSchema.index({ 'queueQr.token': 1 }, {
  unique: true,
  partialFilterExpression: { 'queueQr.token': { $type: 'string' } },
});

export default mongoose.model('Shop', shopSchema, 'shops');

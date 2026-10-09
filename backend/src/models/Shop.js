import mongoose from 'mongoose';

export const SHOP_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

const applicationFieldIsRequired = function applicationFieldIsRequired() {
  return this.status !== 'DRAFT' && this.applicationVersion === 2;
};

const registrationDocumentSchema = new mongoose.Schema({
  key: { type: String, enum: ['mayor', 'brgy', 'dti', 'sec', 'bir', 'sanitary', 'fsic'], required: true },
  name: { type: String, required: true, maxlength: 120 },
  number: { type: String, trim: true, maxlength: 100 },
  issueDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  fileName: { type: String, trim: true, maxlength: 255 },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'] },
  size: { type: Number, min: 0, max: 5 * 1024 * 1024 },
}, { _id: false });

const shopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: function nameIsRequired() { return this.status !== 'DRAFT'; },
      trim: true,
      validate: {
        validator(value) { return this.status === 'DRAFT' || (typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100); },
        message: 'Shop name must be 2-100 characters.',
      },
    },
    address: {
      type: String,
      required: function addressIsRequired() { return this.status !== 'DRAFT'; },
      trim: true,
      validate: {
        validator(value) { return this.status === 'DRAFT' || (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200); },
        message: 'Address is required and must be 200 characters or fewer.',
      },
    },
    contact: {
      phone: {
        type: String,
        required: function phoneIsRequired() { return this.status !== 'DRAFT'; },
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        required: function contactEmailIsRequired() { return this.status !== 'DRAFT' && this.applicationVersion === 2; },
      },
    },
    ownerName: {
      type: String,
      trim: true,
      maxlength: 100,
      required: function ownerNameIsRequired() { return this.status !== 'DRAFT' && this.applicationVersion === 2; },
    },
    operatingHours: {
      // Stored as "HH:mm" 24-hour strings (e.g. "09:00") rather than Date
      // objects, since these represent a daily recurring time-of-day, not
      // a specific instant. Logical open-before-close validation belongs
      // to the service layer in a later phase, once shop registration is
      // actually implemented — not enforced here at the schema level.
      openingTime: { type: String, trim: true },
      closingTime: { type: String, trim: true },
    },
    applicationVersion: { type: Number, enum: [1, 2], default: 1 },
    businessType: {
      type: String,
      enum: ['sole', 'corp', 'part'],
      required: function businessTypeIsRequired() { return this.status !== 'DRAFT' && this.applicationVersion === 2; },
    },
    addressDetails: {
      street: { type: String, trim: true, maxlength: 150, required: applicationFieldIsRequired },
      barangay: { type: String, trim: true, maxlength: 100, required: applicationFieldIsRequired },
      city: { type: String, trim: true, maxlength: 100, required: applicationFieldIsRequired },
      province: { type: String, trim: true, maxlength: 100, required: applicationFieldIsRequired },
    },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      confirmed: { type: Boolean, default: false },
    },
    registrationDocuments: { type: [registrationDocumentSchema], default: [] },
    queueOpen: {
      type: Boolean,
      default: true,
    },

    // A submitted shop application starts PENDING. Draft applications stay DRAFT.
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
shopSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { status: 'DRAFT' } });
shopSchema.index({ 'queueQr.token': 1 }, {
  unique: true,
  partialFilterExpression: { 'queueQr.token': { $type: 'string' } },
});

export default mongoose.model('Shop', shopSchema, 'shops');

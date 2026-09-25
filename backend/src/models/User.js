import mongoose from 'mongoose';

// Kept as a named export so controllers/validation in later phases import
// the same list instead of retyping it (Section 13: role must be a strict
// enum, consistent everywhere).
export const USER_ROLES = ['customer', 'barber', 'shop_admin', 'super_admin'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    lastName: {
      type: String,
      required: function () {
        return this.role === 'customer';
      },
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

   
    mobileNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      match: [/^09\d{9}$/, 'mobileNumber must be exactly 11 digits starting with 09'],
    },
    mobileVerified: {
      type: Boolean,
      default: false,
    },

    email: {
      type: String,
      required: function () {
        return this.role === 'customer';
      },
      trim: true,
      lowercase: true,
    },
    emailVerified: { type: Boolean, default: false },
    otpHash: { type: String, select: false, default: null },
    otpExpiresAt: { type: Date, select: false, default: null },
    otpAttempts: { type: Number, select: false, default: 0 },
    otpSentAt: { type: Date, select: false, default: null },

    
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      default: 'customer',
    },

    // null for customers and super admins; set for barbers and shop
    // admins. Never trust a client-supplied value for this field when
    // authentication/authorization is implemented (later phase) — it
    // must be assigned by server-side logic only (e.g. on shop approval).
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      default: null,
    },

    // ---- Consent record (Section 12) ----
    // Recorded at the moment of registration (or, for accounts created by
    // someone else — a Shop Admin creating a Barber, or the dev seed
    // script — the first time that account actually logs in and is
    // routed through the consent gate; see requireCurrentConsent
    // middleware). Versions let a future Terms/Privacy update force
    // renewed consent without needing a migration: the gate simply
    // compares the stored version to CURRENT_TERMS_VERSION /
    // CURRENT_PRIVACY_VERSION (validation/consentValidation.js).
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: null },
    privacyAccepted: { type: Boolean, default: false },
    privacyAcceptedAt: { type: Date, default: null },
    privacyVersion: { type: String, default: null },

    // ---- Account deletion (Section 14) ----
    // Deletion is implemented as ANONYMIZATION, not a hard delete — see
    // authService.deleteOwnAccount() for the full reasoning. isDeleted
    // lets every read path exclude these accounts without needing to
    // hunt down every reference to the (now-anonymized) user elsewhere
    // in the database.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);


userSchema.index({ email: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema, 'users');

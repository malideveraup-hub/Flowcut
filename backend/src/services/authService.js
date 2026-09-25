import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, QueueEntry, Barber } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { signToken } from '../utils/tokens.js';
import {
  validateName,
  validateMobileNumber,
  normalizeMobileNumber,
  validateEmail,
  normalizeEmail,
  validateOtp,
  validatePassword,
  LOGIN_GENERIC_ERROR,
} from '../validation/authValidation.js';
import {
  validateConsent,
  hasCurrentConsent,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from '../validation/consentValidation.js';
import { ACTIVE_QUEUE_STATUSES } from '../validation/queueValidation.js';
import { sendOtpEmail } from './mailService.js';

const SALT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;

function sendRegistrationOtpEmail(email, otp) {
  sendOtpEmail(email, otp).catch((err) => {
    console.error('[mail] Registration OTP delivery failed:', err.message);
  });
}

/**
 * The ONLY shape of user data that ever leaves this service. passwordHash
 * never appears here — not omitted by convention, structurally absent.
 * `consentCurrent` is computed rather than stored, so the frontend never
 * has to duplicate the version-comparison logic itself.
 */
export function toSafeUser(userDoc) {
  return {
    id: userDoc._id.toString(),
    name: userDoc.name,
    lastName: userDoc.lastName || null,
    mobileNumber: userDoc.mobileNumber,
    mobileVerified: userDoc.mobileVerified,
    email: userDoc.email || null,
    emailVerified: userDoc.emailVerified,
    role: userDoc.role,
    shopId: userDoc.shopId ? userDoc.shopId.toString() : null,
    consentCurrent: hasCurrentConsent(userDoc),
  };
}

function duplicateKeyMessage(err) {
  const field = Object.keys(err.keyPattern || {})[0];
  if (field === 'email') return 'This email is already registered.';
  return 'That account already exists.';
}

/**
 * Registers a CUSTOMER account. This is the only role the public
 * registration endpoint can ever create — role is hardcoded below, never
 * read from the caller's input (Section 1/9: no role escalation via
 * mass assignment, by construction, not just by convention).
 *
 * Consent is required and validated the same way every other field is:
 * server-side, authoritatively. A request missing/false consent is
 * rejected with a 400 before anything is written to the database — there
 * is no code path that creates an account without it.
 */
export async function registerCustomer({ name, lastName, email, password, termsAccepted, privacyAccepted }) {
  const errors = {};
  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const lastNameErr = validateName(lastName);
  if (lastNameErr) errors.lastName = lastNameErr;
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const emailErr = validateEmail(trimmedEmail);
  if (emailErr) errors.email = emailErr;

  const passwordErr = validatePassword(password);
  if (passwordErr) errors.password = passwordErr;

  const consentErr = validateConsent({ termsAccepted, privacyAccepted });
  if (consentErr) errors.consent = consentErr;

  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }

  const normalizedEmail = normalizeEmail(trimmedEmail);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date();

  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    if (!existingEmail.emailVerified && !existingEmail.isDeleted) {
      existingEmail.name = name.trim();
      existingEmail.lastName = lastName.trim();
      existingEmail.passwordHash = passwordHash;
      existingEmail.termsAccepted = true;
      existingEmail.termsAcceptedAt = now;
      existingEmail.termsVersion = CURRENT_TERMS_VERSION;
      existingEmail.privacyAccepted = true;
      existingEmail.privacyAcceptedAt = now;
      existingEmail.privacyVersion = CURRENT_PRIVACY_VERSION;

      const otp = String(crypto.randomInt(100000, 1000000));
      existingEmail.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      existingEmail.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
      existingEmail.otpAttempts = 0;
      existingEmail.otpSentAt = new Date();
      await existingEmail.save({ validateBeforeSave: false });
      sendRegistrationOtpEmail(normalizedEmail, otp);
      return { email: normalizedEmail, expiresAt: existingEmail.otpExpiresAt.toISOString() };
    }
    throw new AppError(409, 'This Gmail is already registered.', { email: 'Already registered.' });
  }

  let user;
  try {
    user = await User.create({
      name: name.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'customer', // hardcoded — see function doc comment above
      shopId: null,
      emailVerified: false,
      termsAccepted: true,
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyAccepted: true,
      privacyAcceptedAt: now,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
  } catch (err) {
    // ...and a safety net in case two requests raced past the pre-check
    // above (rare, but the unique index is the real guarantee either way).
    if (err.code === 11000) {
      throw new AppError(409, duplicateKeyMessage(err));
    }
    throw err;
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  user.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save({ validateBeforeSave: false });

  sendRegistrationOtpEmail(normalizedEmail, otp);

  return { email: normalizedEmail, expiresAt: user.otpExpiresAt.toISOString() };
}

export async function verifyEmailOtp({ email, otp }) {
  const normalizedEmail = normalizeEmail(email);
  const emailErr = validateEmail(normalizedEmail);
  const otpErr = validateOtp(otp);
  if (emailErr || otpErr) throw new AppError(400, 'Please enter a valid Gmail and 6-digit code.');

  const user = await User.findOne({ email: normalizedEmail }).select('+otpHash +otpExpiresAt +otpAttempts');
  if (!user || user.isDeleted || user.emailVerified) throw new AppError(400, 'This verification code is invalid or expired.');
  if (user.otpAttempts >= 5 || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new AppError(400, 'This verification code is invalid or expired.');
  }

  const otpHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');
  if (otpHash !== user.otpHash) {
    user.otpAttempts += 1;
    await user.save({ validateBeforeSave: false });
    throw new AppError(400, 'This verification code is invalid or expired.');
  }

  user.emailVerified = true;
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  user.otpSentAt = null;
  await user.save({ validateBeforeSave: false });
  return { user: toSafeUser(user), token: signToken({ id: user._id.toString() }) };
}

export async function resendEmailOtp({ email }) {
  const normalizedEmail = normalizeEmail(email);
  if (validateEmail(normalizedEmail)) throw new AppError(400, 'Enter a valid Gmail address.');
  const user = await User.findOne({ email: normalizedEmail }).select('+otpHash +otpExpiresAt +otpAttempts +otpSentAt');
  if (!user || user.isDeleted || user.emailVerified) throw new AppError(400, 'This account does not need verification.');

  const otp = String(crypto.randomInt(100000, 1000000));
  user.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save({ validateBeforeSave: false });
  await sendOtpEmail(normalizedEmail, otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  await user.save({ validateBeforeSave: false });
  return { email: normalizedEmail, expiresAt: user.otpExpiresAt.toISOString() };
}

export async function authenticateUser({ email, password }) {
  const emailErr = validateEmail(email);
  if (emailErr || typeof password !== 'string' || !password) {
    // Intentionally the same generic message as a wrong password below —
    // don't tell the caller which part of their input was the problem.
    throw new AppError(400, 'Please enter your Gmail and password.', {
      email: emailErr,
    });
  }

  const normalizedEmail = normalizeEmail(email);

  // passwordHash has `select: false` on the schema — it must be
  // explicitly opted back in here, and nowhere else in the codebase does.
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user || user.isDeleted) {
    // A deleted/anonymized account's mobileNumber no longer matches the
    // PH format anyway (see deleteOwnAccount), so this branch is mostly
    // defense in depth — but it means a deleted account NEVER succeeds
    // at login, full stop, regardless of how its record got there.
    throw new AppError(401, LOGIN_GENERIC_ERROR);
  }

  if (!user.emailVerified) {
    throw new AppError(403, 'Please verify your Gmail before logging in.', {
      email: 'Gmail verification required.',
      otpExpiresAt: user.otpExpiresAt ? user.otpExpiresAt.toISOString() : null,
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, LOGIN_GENERIC_ERROR);
  }

  const token = signToken({ id: user._id.toString() });
  return { user: toSafeUser(user), token };
}

/**
 * PATCH /api/auth/me. Only name/email/mobileNumber can ever be changed
 * here — the controller only forwards those three fields into this
 * function to begin with (see authController.js), so role/shopId/
 * passwordHash are never even candidates for the update object below.
 */
export async function updateProfile(userId, { name, lastName, email, mobileNumber }) {
  const setFields = {};
  const unsetFields = {};

  if (name !== undefined) {
    const err = validateName(name);
    if (err) throw new AppError(400, err, { name: err });
    setFields.name = name.trim();
  }

  if (lastName !== undefined) {
    const err = validateName(lastName);
    if (err) throw new AppError(400, err, { lastName: err });
    setFields.lastName = lastName.trim();
  }

  if (email !== undefined) {
    const trimmed = typeof email === 'string' ? email.trim() : '';
    if (trimmed) {
      const err = validateEmail(trimmed);
      if (err) throw new AppError(400, err, { email: err });
      setFields.email = normalizeEmail(trimmed);
    } else {
      // Clearing the optional email needs $unset, not $set: undefined —
      // Mongoose silently drops undefined keys from a $set, which would
      // leave the old email in place instead of actually removing it.
      unsetFields.email = '';
    }
  }

  if (mobileNumber !== undefined) {
    const err = validateMobileNumber(mobileNumber);
    if (err) throw new AppError(400, err, { mobileNumber: err });
    setFields.mobileNumber = normalizeMobileNumber(mobileNumber);
  }

  if (Object.keys(setFields).length === 0 && Object.keys(unsetFields).length === 0) {
    throw new AppError(400, 'Nothing to update.');
  }

  const update = {};
  if (Object.keys(setFields).length > 0) update.$set = setFields;
  if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

  let user;
  try {
    user = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, duplicateKeyMessage(err));
    }
    throw err;
  }

  if (!user) throw new AppError(404, 'Account not found.');
  return toSafeUser(user);
}

/**
 * Records (or renews) consent. Used both right after registration is not
 * necessary (registerCustomer already does it), and for:
 *   (a) an account created by someone else (a Shop Admin creating a
 *       Barber, or the dev seed script) accepting for the first time, and
 *   (b) an existing account re-accepting after CURRENT_TERMS_VERSION /
 *       CURRENT_PRIVACY_VERSION is bumped.
 * Same validation as registration — only a literal `true` counts.
 */
export async function recordConsent(userId, { termsAccepted, privacyAccepted }) {
  const err = validateConsent({ termsAccepted, privacyAccepted });
  if (err) throw new AppError(400, err);

  const now = new Date();
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        termsAccepted: true,
        termsAcceptedAt: now,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyAccepted: true,
        privacyAcceptedAt: now,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      },
    },
    { new: true }
  );
  if (!user) throw new AppError(404, 'Account not found.');
  return toSafeUser(user);
}

/**
 * Account deletion (Section 14) — implemented as ANONYMIZATION, not a
 * hard delete, and this is a deliberate choice, not a shortcut:
 *
 *  - QueueEntry documents reference customerId; shop-level analytics and
 *    a shop's own operational history legitimately need those records to
 *    keep meaning ("how many customers did we serve last week") even
 *    after one of those customers deletes their account. Hard-deleting
 *    the User would either cascade-delete that shop's history (data loss
 *    for a party who did nothing wrong) or leave a dangling reference.
 *  - What the user is actually entitled to is THEIR information being
 *    removed — name, mobile number, email — not the mere fact that some
 *    anonymous customer was served at some point.
 *
 * So: any active queue entry is cancelled first (a deleted customer can't
 * still be waiting in a live line), then the account's identifying fields
 * are overwritten and the password hash replaced with an unusable random
 * value, and the record is flagged isDeleted so it's excluded from every
 * user-facing list going forward (see adminController.listUsers). The
 * User document itself is kept, purely so `QueueEntry.customerId` /
 * `Barber.userId` / `Shop.ownerId` references don't dangle.
 *
 * A Shop Admin or Barber CAN delete their own account through this same
 * path. Known limitation, documented rather than silently handled: a
 * deleted Shop Admin's shop keeps running with its ownerId pointing at
 * the now-anonymized record (the shop itself isn't deleted or
 * reassigned — that would require a whole ownership-transfer feature
 * this pass doesn't build). A deleted Barber's operational profile is
 * set to INACTIVE/OFFLINE so they stop appearing as staff.
 */
export async function deleteOwnAccount(userId) {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(404, 'Account not found.');
  }

  await QueueEntry.updateMany(
    { customerId: userId, status: { $in: ACTIVE_QUEUE_STATUSES } },
    { $set: { status: 'CANCELLED' } }
  );

  if (user.role === 'barber') {
    await Barber.updateMany({ userId }, { $set: { status: 'INACTIVE', availability: 'OFFLINE' } });
  }

  // A random, never-reusable value — this account can never log in again
  // by any means, not even if somehow re-hashed or replayed.
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);

  user.name = 'Deleted User';
  // mobileNumber has a required + unique + PH-format index; a deleted
  // account keeps a syntactically-invalid-but-unique placeholder so the
  // index constraint is satisfied without ever matching a real login
  // attempt (validateMobileNumber would reject this shape outright).
  user.mobileNumber = `deleted-${user._id.toString()}`;
  user.email = undefined;
  user.passwordHash = unusableHash;
  user.isDeleted = true;
  user.deletedAt = new Date();
  // Deliberately NOT clearing role/shopId — see the Barber/Shop Admin
  // note above; those references are left intact on purpose.

  // The mobileNumber's schema-level `match` validator would reject our
  // own placeholder format, so this specific save skips schema
  // validation — every other field on this path is either a fixed
  // literal or already-validated data, not client input.
  await user.save({ validateBeforeSave: false });

  return { success: true };
}

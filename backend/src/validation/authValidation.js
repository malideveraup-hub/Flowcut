// Backend validation for authentication. This is the copy that actually
// matters for security — the frontend's copy exists only for immediate
// user feedback and can always be bypassed by calling the API directly
// (curl, a modified client, etc).
//
// SECURITY HARDENING PASS: every validator below now starts by checking
// the VALUE'S TYPE, not just its content. Before this pass, a validator
// like `validateMobileNumber({ $ne: null })` would call `.trim()` on an
// object and throw an unhandled TypeError (surfacing as a raw 500,
// potentially leaking a stack trace) instead of cleanly rejecting the
// request. Requiring `typeof value === 'string'` up front is what
// actually stops a NoSQL operator-injection attempt like
// `{ "mobileNumber": { "$ne": null } }` from ever reaching a Mongoose
// query — it never gets far enough to become part of one.

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export function validateName(name) {
  if (name === undefined || name === null) return 'Name is required.';
  if (typeof name !== 'string') return 'Name must be text.';
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Name must be 2-100 characters.';
  // Letters (including common accented characters, e.g. Ñ), spaces,
  // apostrophes, hyphens, and periods (for initials) only. Rejects
  // digits, HTML/script payloads, and other symbols outright.
  if (!/^[A-Za-z\u00C0-\u017F' .-]+$/.test(trimmed)) {
    return 'Name can only contain letters, spaces, apostrophes, hyphens, and periods.';
  }
  return null;
}

// Philippine mobile numbers only: exactly 11 digits, starting with "09".
// No +63, no spaces/dashes, no other length.
const PH_MOBILE_RE = /^09\d{9}$/;

export function normalizeMobileNumber(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\D/g, '');
}

export function validateMobileNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return 'Mobile number is required.';
  if (typeof raw !== 'string') return 'Mobile number must be text.';
  const normalized = normalizeMobileNumber(raw);
  if (!normalized) return 'Mobile number is required.';
  if (!PH_MOBILE_RE.test(normalized)) {
    return 'Enter a valid mobile number in the format 09XXXXXXXXX (11 digits, starting with 09).';
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// Email is OPTIONAL for FlowCut (mobile number is primary) — call this
// only when a non-empty email was actually supplied.
export function validateEmail(email) {
  if (typeof email !== 'string') return 'Enter a valid email address.';
  const trimmed = email.trim();
  if (!trimmed) return 'Enter a valid email address.';
  if (trimmed.length > 254) return 'Email is too long.';
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address.';
  if (!trimmed.toLowerCase().endsWith('@gmail.com')) return 'Use a Gmail address ending in @gmail.com.';
  return null;
}

export function validateOtp(otp) {
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) return 'Enter the 6-digit code sent to your Gmail.';
  return null;
}

export function validatePassword(password) {
  if (!isNonEmptyString(password)) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password is too long.';
  return null;
}

export const LOGIN_GENERIC_ERROR = 'Invalid Gmail or password.';

/**
 * Fields a normal customer registration request is allowed to influence.
 * The controller only ever destructures these specific keys off
 * req.body — role/shopId/passwordHash/mobileVerified/status/ownerId are
 * never read from the request at all, so there's nothing for a client to
 * "mass assign" even if it sends them. termsAccepted/privacyAccepted are
 * included here but are booleans checked for === true, never stored
 * verbatim as arbitrary client input (see authService.registerCustomer).
 */
export const REGISTRATION_ALLOWED_FIELDS = [
  'name',
  'lastName',
  'email',
  'password',
  'termsAccepted',
  'privacyAccepted',
];

/**
 * Fields a logged-in user may change about their own profile via
 * PATCH /api/auth/me.
 */
export const PROFILE_UPDATE_ALLOWED_FIELDS = ['name', 'lastName', 'email', 'mobileNumber'];

export { isNonEmptyString };

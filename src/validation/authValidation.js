// Frontend validation for authentication forms.
//
// IMPORTANT: this exists purely for user experience (immediate feedback,
// fewer round trips). It is NOT a security boundary. The real Express API
// (backend/src/validation/authValidation.js) re-runs equivalent checks
// server-side against the actual request body — a manipulated client
// (curl, devtools, a modified frontend build) can bypass every function
// in this file, which is exactly why the backend copy exists and is
// authoritative.

export function validateName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Name must be 2-100 characters.';
  // Mirrors the backend's format exactly — letters, spaces, apostrophes,
  // hyphens, and periods only. filterNameInput() (utils/inputFilters.js)
  // already keeps most of these characters from ever being typed, so
  // this mainly catches pasted text.
  if (!/^[A-Za-z\u00C0-\u017F' .-]+$/.test(trimmed)) {
    return 'Name can only contain letters, spaces, apostrophes, hyphens, and periods.';
  }
  return null;
}

// Philippine mobile numbers only (Section 7 of the Phase 4 brief):
// exactly 11 digits, starting with "09". Mirrors
// backend/src/validation/authValidation.js's PH_MOBILE_RE exactly — same
// rule, same rejected examples (+63 format, spaces, hyphens, wrong
// length all rejected).
const MOBILE_RE = /^09\d{9}$/;

export function normalizeMobileNumber(raw) {
  return (raw || '').trim().replace(/\D/g, '');
}

export function validateMobileNumber(raw) {
  const normalized = normalizeMobileNumber(raw);
  if (!normalized) return 'Mobile number is required.';
  if (!MOBILE_RE.test(normalized)) return 'Enter a valid mobile number: 09XXXXXXXXX (11 digits, starting with 09).';
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email is OPTIONAL — only call this when the user actually typed
// something in the email field (see Register.jsx). This function itself
// still treats an empty string as invalid, since "should I validate at
// all" and "is this string a valid email" are different questions.
export function validateEmail(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return 'Enter a valid email address.';
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address.';
  if (!trimmed.toLowerCase().endsWith('@gmail.com')) return 'Use a Gmail address ending in @gmail.com.';
  return null;
}

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Use at least 8 characters.';
  return null;
}

export function validateConfirmPassword(password, confirm) {
  if (confirm !== password) return "Passwords don't match.";
  return null;
}

// Login intentionally does NOT distinguish "no account" from "wrong
// password" (Section 4/9: don't reveal account existence).
export function validateOtp(otp) {
  if (!/^\d{6}$/.test((otp || '').trim())) return 'Enter the 6-digit code sent to your Gmail.';
  return null;
}

export const LOGIN_GENERIC_ERROR = 'Invalid Gmail or password.';

/**
 * Fields a CUSTOMER is ever allowed to submit at registration. The real
 * backend builds its own record from validated input and assigns
 * role/id/timestamps itself — never spreads an arbitrary request body
 * into a new User document. This whitelist is the frontend's mirror of
 * that rule so nothing here ever "invents" a field to send.
 */
export const REGISTRATION_ALLOWED_FIELDS = ['name', 'lastName', 'email', 'password'];

export function pickAllowedFields(source, allowed) {
  const result = {};
  allowed.forEach((key) => {
    if (key in source) result[key] = source[key];
  });
  return result;
}

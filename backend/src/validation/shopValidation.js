// SECURITY HARDENING: every validator type-checks its input before doing
// anything else, so a non-string value (e.g. a NoSQL operator-injection
// attempt like { "$gt": "" }) is rejected immediately with a clean 400
// instead of throwing when `.trim()` is called on something that isn't
// a string — see the equivalent note in authValidation.js.

// Reject obvious HTML/script payloads even in fields that otherwise allow
// a wide range of characters (address, shop name). This is a defense-in-
// depth check, not a substitute for output encoding — React already
// escapes rendered text by default, but this stops it from being stored
// in the first place.
const HTML_LIKE_RE = /<[^>]*>|javascript:/i;

export function validateShopName(name) {
  if (typeof name !== 'string') return 'Shop name must be text.';
  const trimmed = name.trim();
  if (!trimmed) return 'Shop name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Shop name must be 2-100 characters.';
  if (HTML_LIKE_RE.test(trimmed)) return 'Shop name contains characters that are not allowed.';
  return null;
}

export function validateAddress(address) {
  if (typeof address !== 'string') return 'Address must be text.';
  const trimmed = address.trim();
  if (!trimmed) return 'Address is required.';
  if (trimmed.length > 200) return 'Address is too long.';
  if (HTML_LIKE_RE.test(trimmed)) return 'Address contains characters that are not allowed.';
  return null;
}

// Deliberately more permissive than the strict PH mobile format required
// for User.mobileNumber (a shop's public contact line may legitimately be
// a landline). Still required, type-checked, and length-bounded.
const CONTACT_RE = /^[0-9+()\-\s]{7,20}$/;

export function validateContactPhone(phone) {
  if (typeof phone !== 'string') return 'Contact number must be text.';
  const trimmed = phone.trim();
  if (!trimmed) return 'Contact number is required.';
  if (!CONTACT_RE.test(trimmed)) return 'Enter a valid contact number.';
  return null;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm", 24-hour

export function validateOperatingHours(openingTime, closingTime) {
  if (typeof openingTime !== 'string' || typeof closingTime !== 'string') {
    return 'Set both an opening and closing time.';
  }
  if (!openingTime || !closingTime) return 'Set both an opening and closing time.';
  if (!TIME_RE.test(openingTime) || !TIME_RE.test(closingTime)) {
    return 'Operating hours must be in HH:mm 24-hour format.';
  }
  if (openingTime >= closingTime) return 'Closing time must be after opening time.';
  return null;
}

/**
 * Fields an applicant may set when submitting a shop application.
 * ownerId and status are never in this list — they're set exclusively by
 * the server (ownerId from the authenticated session, status always
 * starts at 'PENDING'). See shopService.js.
 */
export const SHOP_APPLICATION_ALLOWED_FIELDS = ['name', 'address', 'contactPhone', 'openingTime', 'closingTime'];

/**
 * Fields a Shop Admin may change about their OWN shop afterwards.
 * Still no ownerId/status — approval/suspension is a Super Admin action.
 */
export const SHOP_SETTINGS_ALLOWED_FIELDS = ['name', 'address', 'contactPhone', 'openingTime', 'closingTime'];

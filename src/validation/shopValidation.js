// Validation for the Shop Registration flow (Section 3 / 9 of the spec).
// Frontend UX layer only — see the note in authValidation.js. The real
// backend owns final validation plus the approval workflow.

export function validateShopName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Shop name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Shop name must be 2-100 characters.';
  return null;
}

export function validateAddress(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) return 'Address is required.';
  if (trimmed.length > 200) return 'Address is too long.';
  return null;
}

// Loose on purpose: real phone validation should account for country
// formats. This just catches obviously-wrong input client-side.
const CONTACT_RE = /^[0-9+()\-\s]{7,20}$/;

export function validateContact(contact) {
  const trimmed = (contact || '').trim();
  if (!trimmed) return 'Contact number is required.';
  if (!CONTACT_RE.test(trimmed)) return 'Enter a valid phone number.';
  return null;
}

export function validateHours(openTime, closeTime, closed) {
  if (closed) return null;
  if (!openTime || !closeTime) return 'Set both an opening and closing time.';
  if (openTime >= closeTime) return 'Closing time must be after opening time.';
  return null;
}

/**
 * Fields a Shop Admin registering a new shop is allowed to submit.
 * `status` and `ownerId` are intentionally excluded — the backend sets
 * status to "pending" itself and derives ownerId from the authenticated
 * account, never from client input.
 */
export const SHOP_REGISTRATION_ALLOWED_FIELDS = ['name', 'address', 'contact', 'hours'];

/**
 * Fields a Shop Admin is allowed to change on their OWN shop profile
 * (Section 18 mass-assignment protection). Anything not in this list —
 * status, ownerId, id — must be rejected server-side even if present in
 * the request body.
 */
export const SHOP_SETTINGS_ALLOWED_FIELDS = ['name', 'address', 'hours'];

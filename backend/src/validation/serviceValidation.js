// SECURITY HARDENING: type-checked before coercion. Plain `Number(value)`
// on its own is NOT a safe validator — `Number([100]) === 100` in
// JavaScript, so an attacker sending `"estimatedDuration": [100]` instead
// of `100` would previously have sailed through. Every numeric field
// below now requires `typeof value === 'number' || typeof value === 'string'`
// before it's ever coerced.

const HTML_LIKE_RE = /<[^>]*>|javascript:/i;

export function validateServiceName(name) {
  if (typeof name !== 'string') return 'Service name must be text.';
  const trimmed = name.trim();
  if (!trimmed) return 'Service name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Service name must be 2-100 characters.';
  if (HTML_LIKE_RE.test(trimmed)) return 'Service name contains characters that are not allowed.';
  return null;
}

export function validateDescription(description) {
  if (description === undefined || description === null || description === '') return null; // optional
  if (typeof description !== 'string') return 'Description must be text.';
  if (description.length > 500) return 'Description must be 500 characters or fewer.';
  if (HTML_LIKE_RE.test(description)) return 'Description contains characters that are not allowed.';
  return null;
}

function isNumeric(value) {
  return typeof value === 'number' || typeof value === 'string';
}

export function validateEstimatedDuration(duration) {
  if (duration === '' || duration === null || duration === undefined) return 'Duration is required.';
  if (!isNumeric(duration)) return 'Duration must be a number.';
  const n = Number(duration);
  if (Number.isNaN(n) || !Number.isInteger(n)) return 'Duration must be a whole number of minutes.';
  if (n <= 0) return 'Duration must be greater than zero.';
  if (n > 480) return 'Duration cannot exceed 480 minutes.';
  return null;
}

export function validatePrice(price) {
  if (price === '' || price === null || price === undefined) return 'Price is required.';
  if (!isNumeric(price)) return 'Price must be a number.';
  const n = Number(price);
  if (Number.isNaN(n)) return 'Price must be a number.';
  if (n < 0) return 'Price cannot be negative.';
  if (n > 1000000) return 'Price is unreasonably high.';
  return null;
}

export const SERVICE_ALLOWED_FIELDS = ['name', 'description', 'estimatedDuration', 'price'];
export const SERVICE_STATUS_ALLOWED_FIELDS = ['status'];

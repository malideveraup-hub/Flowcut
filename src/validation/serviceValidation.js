// Validation for Service Management (Section 9 of the spec).

export function validateServiceName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Service name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Service name must be 2-100 characters.';
  return null;
}

export function validateDescription(description) {
  if (!description) return null; // optional
  if (description.length > 500) return 'Description must be 500 characters or fewer.';
  return null;
}

export function validateDuration(duration) {
  const n = Number(duration);
  if (duration === '' || duration === null || duration === undefined) return 'Duration is required.';
  if (!Number.isInteger(n)) return 'Duration must be a whole number of minutes.';
  if (n <= 0) return 'Duration must be greater than zero.';
  if (n > 480) return 'Duration seems unreasonably long — check the value.';
  return null;
}

export function validatePrice(price) {
  if (price === '' || price === null || price === undefined) return null; // optional, defaults to 0
  const n = Number(price);
  if (Number.isNaN(n)) return 'Price must be a number.';
  if (n < 0) return 'Price cannot be negative.';
  return null;
}

export const SERVICE_ALLOWED_FIELDS = ['name', 'description', 'durationMin', 'price', 'active'];

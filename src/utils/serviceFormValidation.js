const HTML_LIKE_RE = /<[^>]*>|javascript:/i;

export function validateServiceForm({ name, estimatedDuration, price }) {
  const errors = {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (typeof name !== 'string') errors.name = 'Service name must be text.';
  else if (!normalizedName) errors.name = 'Service name is required.';
  else if (normalizedName.length < 2 || normalizedName.length > 100) errors.name = 'Service name must be 2-100 characters.';
  else if (HTML_LIKE_RE.test(normalizedName)) errors.name = 'Service name contains characters that are not allowed.';

  if (estimatedDuration === '') errors.estimatedDuration = 'Duration is required.';
  else if (!Number.isInteger(Number(estimatedDuration))) errors.estimatedDuration = 'Duration must be a whole number of minutes.';
  else if (Number(estimatedDuration) <= 0) errors.estimatedDuration = 'Duration must be greater than zero.';
  else if (Number(estimatedDuration) > 480) errors.estimatedDuration = 'Duration cannot exceed 480 minutes.';

  if (price === '') errors.price = 'Price is required.';
  else if (!Number.isFinite(Number(price))) errors.price = 'Price must be a number.';
  else if (Number(price) < 0) errors.price = 'Price cannot be negative.';
  else if (Number(price) > 1000000) errors.price = 'Price is unreasonably high.';

  return errors;
}

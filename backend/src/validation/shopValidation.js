const HTML_LIKE_RE = /<[^>]*>|javascript:/i;
const CONTACT_RE = /^[0-9+()\-\s]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGAL_TYPES = ['sole', 'corp', 'part'];
const APPLICATION_FIELDS = new Set([
  'owner', 'shop', 'phone', 'email', 'street', 'barangay', 'city', 'province',
  'lat', 'lng', 'confirmed', 'businessType', 'documents',
]);
const DOCUMENT_KEYS = new Set(['mayor', 'brgy', 'dti', 'sec', 'bir', 'sanitary', 'fsic']);

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

export function validateContactPhone(phone) {
  if (typeof phone !== 'string') return 'Contact number must be text.';
  const trimmed = phone.trim();
  if (!trimmed) return 'Contact number is required.';
  if (!CONTACT_RE.test(trimmed)) return 'Enter a valid contact number.';
  return null;
}

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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fieldError(value, { required = false, label, min = 1, max = 255 } = {}) {
  if (value === undefined) return required ? `${label} is required.` : null;
  if (typeof value !== 'string') return `${label} must be text.`;
  const trimmed = value.trim();
  if (!trimmed && required) return `${label} is required.`;
  if (!trimmed && !required) return null;
  if (trimmed.length < min || trimmed.length > max) return `${label} must be ${min}-${max} characters.`;
  if (HTML_LIKE_RE.test(trimmed)) return `${label} contains characters that are not allowed.`;
  return null;
}

function getDocumentRules(type, city) {
  const normalizedCity = (typeof city === 'string' ? city : '').trim().toLowerCase();
  const cityRules = normalizedCity === 'quezon city'
    ? { sanitary: 'required', fsic: 'required' }
    : normalizedCity === 'makati city' ? { sanitary: 'required' } : {};
  return [
    { key: 'mayor', required: true, dates: ['issue', 'expiry'] },
    { key: 'brgy', required: cityRules.brgy === 'required', dates: ['expiry'] },
    { key: type === 'sole' ? 'dti' : 'sec', required: true, dates: type === 'sole' ? ['issue', 'expiry'] : [] },
    { key: 'bir', required: true, dates: [] },
    { key: 'sanitary', required: cityRules.sanitary === 'required', dates: ['expiry'] },
    { key: 'fsic', required: cityRules.fsic === 'required', dates: ['expiry'] },
  ];
}

function validateDate(value, label, { required, beforeToday, notInPast } = {}) {
  if (value === undefined || value === '') return required ? `${label} is required.` : null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) return `${label} must be a valid date.`;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return `${label} must be a valid date.`;
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (beforeToday && value > today) return `${label} cannot be in the future.`;
  if (notInPast && value < today) return `${label} must be today or later.`;
  return null;
}

export function validateShopRegistration(fields, { draft = false, uploadedDocuments = [] } = {}) {
  const errors = {};
  if (!isRecord(fields)) return { _form: 'Application details must be an object.' };
  const unknown = Object.keys(fields).filter((key) => !APPLICATION_FIELDS.has(key));
  if (unknown.length) errors._form = 'Application contains unsupported fields.';

  const required = !draft;
  const validations = {
    owner: fieldError(fields.owner, { required, label: 'Owner name', min: 2, max: 100 }),
    shop: validateShopNameForMode(fields.shop, required),
    phone: required || fields.phone !== undefined ? validateContactPhoneForMode(fields.phone, required) : null,
    email: validateEmail(fields.email, required),
    street: fieldError(fields.street, { required, label: 'Street address', max: 150 }),
    barangay: fieldError(fields.barangay, { required, label: 'Barangay', max: 100 }),
    city: fieldError(fields.city, { required, label: 'City or municipality', max: 100 }),
    province: fieldError(fields.province, { required, label: 'Province', max: 100 }),
  };
  Object.entries(validations).forEach(([key, error]) => { if (error) errors[key] = error; });

  if (fields.businessType !== undefined || required) {
    if (typeof fields.businessType !== 'string' || !LEGAL_TYPES.includes(fields.businessType)) errors.businessType = 'Choose a valid business type.';
  }

  if (fields.confirmed !== undefined && typeof fields.confirmed !== 'boolean') errors.coords = 'Location confirmation must be true or false.';
  const invalidCoordinateType = ['lat', 'lng'].some((key) => fields[key] !== undefined && typeof fields[key] !== 'string');
  const hasLat = typeof fields.lat === 'string' && fields.lat.trim() !== '';
  const hasLng = typeof fields.lng === 'string' && fields.lng.trim() !== '';
  if (invalidCoordinateType) errors.coords = 'Enter valid latitude and longitude values.';
  if (hasLat || hasLng) {
    const lat = Number(typeof fields.lat === 'string' ? fields.lat.trim() : '');
    const lng = Number(typeof fields.lng === 'string' ? fields.lng.trim() : '');
    if (!hasLat || !hasLng || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.coords = 'Enter valid latitude and longitude values.';
    } else if (fields.confirmed !== true) {
      errors.coords = 'Confirm that the map pin is at your shop.';
    }
  }

  const hasAddress = ['street', 'barangay', 'city', 'province'].some((key) => typeof fields[key] === 'string' && fields[key].trim());
  if (hasAddress || required) {
    const address = ['street', 'barangay', 'city', 'province'].map((key) => typeof fields[key] === 'string' ? fields[key].trim() : '').filter(Boolean).join(', ');
    const addressError = validateAddress(address);
    if (addressError) errors.street = addressError;
  }

  if (fields.documents !== undefined && !isRecord(fields.documents)) errors.documents = { _form: 'Document details must be an object.' };
  else {
    const incomingDocuments = isRecord(fields.documents) ? fields.documents : {};
    const docErrors = Object.create(null);
    for (const [key, metadata] of Object.entries(incomingDocuments)) {
      if (!DOCUMENT_KEYS.has(key) || !isRecord(metadata)) {
        docErrors[key] = ['Invalid document details.'];
        continue;
      }
      const unexpected = Object.keys(metadata).filter((field) => !['number', 'issue', 'expiry'].includes(field));
      if (unexpected.length) docErrors[key] = ['Document details contain unsupported fields.'];
      for (const field of ['number', 'issue', 'expiry']) {
        if (metadata[field] !== undefined && typeof metadata[field] !== 'string') {
          docErrors[key] = [...(docErrors[key] || []), 'Document numbers and dates must be text.'];
        }
      }
      if (typeof metadata.number === 'string' && (metadata.number.length > 100 || HTML_LIKE_RE.test(metadata.number))) {
        docErrors[key] = [...(docErrors[key] || []), 'Enter a valid document number (maximum 100 characters).'];
      }
      for (const field of ['issue', 'expiry']) {
        if (metadata[field] && validateDate(metadata[field], field === 'issue' ? 'Issue date' : 'Expiration date', {})) {
          docErrors[key] = [...(docErrors[key] || []), 'Enter a valid document date.'];
        }
      }
    }

    if (!draft && LEGAL_TYPES.includes(fields.businessType)) {
      getDocumentRules(fields.businessType, fields.city).forEach((spec) => {
        const metadata = incomingDocuments[spec.key] || {};
        const uploaded = uploadedDocuments.includes(spec.key);
        const touched = Boolean(metadata.number || metadata.issue || metadata.expiry || uploaded);
        if (!spec.required && !touched) return;
        const messages = [];
        if (typeof metadata.number !== 'string' || !metadata.number.trim()) messages.push('Enter the document number.');
        else if (metadata.number.trim().length > 100 || HTML_LIKE_RE.test(metadata.number)) messages.push('Enter a valid document number (maximum 100 characters).');
        if (!uploaded) messages.push('Upload this document.');
        const issueError = validateDate(metadata.issue, 'Issue date', { required: spec.dates.includes('issue'), beforeToday: true });
        const expiryError = validateDate(metadata.expiry, 'Expiration date', { required: spec.dates.includes('expiry'), notInPast: true });
        if (issueError) messages.push(issueError);
        if (expiryError) messages.push(expiryError);
        if (metadata.issue && metadata.expiry && metadata.issue >= metadata.expiry) messages.push('Expiration date must be after the issue date.');
        if (messages.length) docErrors[spec.key] = messages;
      });
    }
    if (Object.keys(docErrors).length) errors.documents = docErrors;
  }

  return errors;
}

function validateShopNameForMode(value, required) {
  if (value === undefined) return required ? 'Shop name is required.' : null;
  if (typeof value !== 'string') return 'Shop name must be text.';
  if (!required && !value.trim()) return null;
  return validateShopName(value);
}

function validateContactPhoneForMode(value, required) {
  if (value === undefined) return required ? 'Contact number is required.' : null;
  if (typeof value !== 'string') return 'Contact number must be text.';
  if (!required && !value.trim()) return null;
  return validateContactPhone(value);
}

function validateEmail(value, required) {
  if (value === undefined) return required ? 'Contact email is required.' : null;
  if (typeof value !== 'string') return 'Contact email must be text.';
  const email = value.trim();
  if (!email && !required) return null;
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return 'Enter a valid contact email address.';
  return null;
}

export const SHOP_APPLICATION_ALLOWED_FIELDS = [
  'name', 'address', 'contactPhone', 'openingTime', 'closingTime', 'owner', 'shop', 'phone', 'email',
  'street', 'barangay', 'city', 'province', 'lat', 'lng', 'confirmed', 'businessType', 'documents',
];

export const SHOP_SETTINGS_ALLOWED_FIELDS = ['name', 'address', 'contactPhone', 'openingTime', 'closingTime'];

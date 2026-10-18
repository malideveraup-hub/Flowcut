const CONTACT_RE = /^[0-9+()\-\s]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGAL_TYPES = ['sole', 'corp', 'part'];
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

const CITY_RULES = {
  'quezon city': { sanitary: 'required', fsic: 'required' },
  'makati city': { sanitary: 'required' },
};

export function validateShopName(name) {
  if (typeof name !== 'string') return 'Shop name must be text.';
  const trimmed = name.trim();
  if (!trimmed) return 'Shop name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Shop name must be 2-100 characters.';
  if (/<[^>]*>|javascript:/i.test(trimmed)) return 'Shop name contains characters that are not allowed.';
  return null;
}

export function validateAddress(address) {
  if (typeof address !== 'string') return 'Address must be text.';
  const trimmed = address.trim();
  if (!trimmed) return 'Address is required.';
  if (trimmed.length > 200) return 'Address is too long.';
  if (/<[^>]*>|javascript:/i.test(trimmed)) return 'Address contains characters that are not allowed.';
  return null;
}

export function validateContact(contact) {
  if (typeof contact !== 'string') return 'Contact number must be text.';
  const trimmed = contact.trim();
  if (!trimmed) return 'Contact number is required.';
  if (!CONTACT_RE.test(trimmed)) return 'Enter a valid contact number.';
  return null;
}

export function validateContactEmail(email) {
  if (typeof email !== 'string') return 'Contact email must be text.';
  const trimmed = email.trim();
  if (!trimmed) return 'Contact email is required.';
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return 'Enter a valid email address.';
  return null;
}

export function validateOwnerName(name) {
  if (typeof name !== 'string') return 'Owner name must be text.';
  const trimmed = name.trim();
  if (!trimmed) return 'Owner name is required.';
  if (trimmed.length < 2 || trimmed.length > 100) return 'Owner name must be 2-100 characters.';
  if (/<[^>]*>|javascript:/i.test(trimmed)) return 'Owner name contains characters that are not allowed.';
  return null;
}

export function validateHours(openTime, closeTime, closed = false) {
  if (closed) return null;
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!openTime || !closeTime) return 'Set both an opening and closing time.';
  if (!timePattern.test(openTime) || !timePattern.test(closeTime)) return 'Operating hours must be in HH:mm 24-hour format.';
  if (openTime >= closeTime) return 'Closing time must be after opening time.';
  return null;
}

export function getShopDocumentList(type, city) {
  const rules = CITY_RULES[(city || '').trim().toLowerCase()] || {};
  const sole = type === 'sole';
  return [
    { key: 'mayor', name: "Business / Mayor's Permit", numberLabel: 'Business permit number', dates: ['issue', 'expiry'], requirement: 'required' },
    { key: 'brgy', name: 'Barangay Business Clearance', numberLabel: 'Clearance number', dates: ['expiry'], requirement: rules.brgy || 'conditional' },
    { key: sole ? 'dti' : 'sec', name: 'DTI Certificate or SEC Registration', detail: sole ? 'DTI Certificate of Business Name Registration' : 'SEC Certificate of Registration', numberLabel: sole ? 'DTI registration number' : 'SEC registration number', dates: sole ? ['issue', 'expiry'] : [], requirement: 'required' },
    { key: 'bir', name: 'BIR Certificate of Registration', detail: 'Form 2303', numberLabel: 'BIR COR number', dates: [], requirement: 'required' },
    { key: 'sanitary', name: 'Sanitary Permit', numberLabel: 'Sanitary permit number', dates: ['expiry'], requirement: rules.sanitary || 'conditional' },
    { key: 'fsic', name: 'Fire Safety Inspection Certificate', detail: 'FSIC', numberLabel: 'FSIC number', dates: ['expiry'], requirement: rules.fsic || 'conditional' },
  ];
}

function hasDocDetails(document = {}) {
  return Boolean(document.number?.trim() || document.issue || document.expiry || document.file);
}

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function validateDocument(documentSpec, value = {}) {
  const errors = [];
  const isRequired = documentSpec.requirement === 'required';
  const isTouched = hasDocDetails(value);
  if (!isRequired && !isTouched) return errors;

  if (!value.number?.trim()) errors.push('Enter the document number.');
  else if (value.number.trim().length > 100) errors.push('Document number must be 100 characters or fewer.');

  if (!value.file || value.file.status !== 'uploaded') {
    errors.push(value.file?.status === 'uploading' ? 'Wait for the upload to finish.' : 'Upload this document.');
  }

  if (documentSpec.dates.includes('issue')) {
    if (!value.issue) errors.push('Enter the issue date.');
    else if (value.issue > localToday()) errors.push('Issue date cannot be in the future.');
  }
  if (documentSpec.dates.includes('expiry')) {
    if (!value.expiry) errors.push('Enter the expiration date.');
    else if (value.expiry < localToday()) errors.push('Expiration date cannot be in the past.');
  }
  if (value.issue && value.expiry && value.issue >= value.expiry) errors.push('Expiration date must be after the issue date.');
  return errors;
}

export function validateCoordinates(latitude, longitude, confirmed) {
  if ((latitude === undefined || latitude === '') && (longitude === undefined || longitude === '')) return null;
  if (typeof latitude !== 'string' || typeof longitude !== 'string') return 'Enter valid latitude and longitude values.';
  const latValue = latitude.trim();
  const lngValue = longitude.trim();
  if (!latValue || !lngValue) return 'Enter both latitude and longitude.';
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return 'Enter valid latitude and longitude values.';
  }
  if (!confirmed) return 'Confirm that the map pin is at your shop.';
  return null;
}

export function validateShopApplication(fields, type, documents) {
  const errors = validateShopDetails(fields);
  errors.type = LEGAL_TYPES.includes(type) ? null : 'Choose a business type.';
  errors.documents = {};
  getShopDocumentList(type, fields.city).forEach((item) => {
    const docErrors = validateDocument(item, documents?.[item.key]);
    if (docErrors.length) errors.documents[item.key] = docErrors;
  });
  return errors;
}

export function validateShopDetails(fields) {
  fields = fields && typeof fields === 'object' ? fields : {};
  const addressPart = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim()) return `${label} is required.`;
    if (value.trim().length > max) return `${label} must be ${max} characters or fewer.`;
    if (/<[^>]*>|javascript:/i.test(value.trim())) return `${label} contains characters that are not allowed.`;
    return null;
  };
  const errors = {
    owner: validateOwnerName(fields.owner),
    shop: validateShopName(fields.shop),
    phone: validateContact(fields.phone),
    email: validateContactEmail(fields.email),
    street: addressPart(fields.street, 'Street address', 150),
    barangay: addressPart(fields.barangay, 'Barangay', 100),
    city: addressPart(fields.city, 'City or municipality', 100),
    province: addressPart(fields.province, 'Province', 100),
    coords: validateCoordinates(fields.lat, fields.lng, fields.confirmed),
  };
  const address = [fields.street, fields.barangay, fields.city, fields.province].map((part) => typeof part === 'string' ? part.trim() : '').filter(Boolean).join(', ');
  const addressError = address ? validateAddress(address) : null;
  if (addressError) errors.street = addressError;

  return errors;
}

export function hasValidationErrors(errors) {
  return Object.entries(errors).some(([key, value]) => key === 'documents'
    ? Object.keys(value || {}).length > 0
    : Boolean(value));
}

export function validateShopDocumentFile(file) {
  const ext = file?.name?.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Unsupported file type. Upload a PDF, JPG or PNG.';
  const expectedMime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
  if (file.type && file.type !== expectedMime) return 'This file’s format doesn’t match its extension. Upload a valid PDF, JPG or PNG.';
  if (!file.size) return 'This file is empty.';
  if (file.size > MAX_BYTES) return 'This file is larger than the 5 MB limit.';
  return null;
}

export async function hasValidDocumentSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const startsWith = (...signature) => signature.every((byte, index) => bytes[index] === byte);
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return startsWith(0x25, 0x50, 0x44, 0x46);
  if (ext === 'png') return startsWith(0x89, 0x50, 0x4e, 0x47);
  return startsWith(0xff, 0xd8, 0xff);
}

export const SHOP_REGISTRATION_ALLOWED_FIELDS = [
  'owner', 'shop', 'phone', 'email', 'street', 'barangay', 'city', 'province', 'lat', 'lng', 'confirmed',
  'businessType', 'documents',
];

export const SHOP_SETTINGS_ALLOWED_FIELDS = ['name', 'address', 'hours'];

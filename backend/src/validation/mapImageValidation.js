import { AppError } from '../middleware/errorHandler.js';

export const MAX_MAP_IMAGE_SIZE = 5 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { mimeType: 'image/jpeg', extension: 'jpg', matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { mimeType: 'image/png', extension: 'png', matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mimeType: 'image/webp', extension: 'webp', matches: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
];

export function validateMapImageMetadata(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const rawLocationName = input.locationName ?? input.description;
  const locationName = typeof rawLocationName === 'string' ? rawLocationName.trim() : '';
  const errors = {};
  if (title.length < 2 || title.length > 100) errors.title = 'Title must be 2-100 characters.';
  if (locationName.length > 500) errors.locationName = 'Location must be 500 characters or fewer.';

  let location;
  if (input.location != null) {
    const rawX = input.location.x;
    const rawY = input.location.y;
    const x = Number(input.location.x);
    const y = Number(input.location.y);
    const hasValue = (value) => (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    if (!hasValue(rawX) || !hasValue(rawY) || x < 0 || x > 100 || y < 0 || y > 100) {
      errors.location = 'Map position must use valid x and y values from 0 to 100.';
    } else {
      location = { x, y };
    }
  }

  if (Object.keys(errors).length) throw new AppError(400, 'Please check the map image details.', errors);
  return { title, locationName, ...(location ? { location } : {}) };
}

export function validateMapImageFile(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError(400, 'Choose an image file to upload.');
  if (buffer.length > MAX_MAP_IMAGE_SIZE) throw new AppError(413, 'Images may be up to 5 MB.');

  const detected = IMAGE_SIGNATURES.find((signature) => signature.matches(buffer));
  if (!detected || detected.mimeType !== contentType) {
    throw new AppError(400, 'Upload a valid JPG, PNG, or WebP image.');
  }
  return detected;
}

export function sanitizeMapImageFilename(filename, extension) {
  const baseName = typeof filename === 'string' ? filename.split(/[\\/]/).pop() : '';
  const safeName = (baseName || `map-image.${extension}`).replace(/[^\w.-]/g, '_').slice(0, 255);
  return safeName.toLowerCase().endsWith(`.${extension}`) ? safeName : `${safeName}.${extension}`;
}

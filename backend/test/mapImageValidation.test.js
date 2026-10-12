import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MAP_IMAGE_SIZE,
  sanitizeMapImageFilename,
  validateMapImageFile,
  validateMapImageMetadata,
} from '../src/validation/mapImageValidation.js';
import MapImage from '../src/models/MapImage.js';

test('map image metadata trims strings and accepts optional schematic map coordinates', () => {
  assert.deepEqual(
    validateMapImageMetadata({
      title: '  Shop opening  ',
      locationName: '  New location  ',
      location: { x: '25', y: 70 },
    }),
    { title: 'Shop opening', locationName: 'New location', location: { x: 25, y: 70 } }
  );
  assert.deepEqual(validateMapImageMetadata({ title: 'Launch', locationName: '' }), {
    title: 'Launch',
    locationName: '',
  });
});

test('map image metadata rejects invalid fields and incomplete coordinates', () => {
  assert.throws(() => validateMapImageMetadata({ title: 'x', locationName: 'a'.repeat(501) }), (error) => {
    assert.equal(error.statusCode, 400);
    assert.ok(error.errors.title);
    assert.ok(error.errors.locationName);
    return true;
  });
  assert.throws(() => validateMapImageMetadata({ title: 'Launch', location: { x: null, y: 10 } }), (error) => {
    assert.equal(error.statusCode, 400);
    assert.ok(error.errors.location);
    return true;
  });
  assert.throws(() => validateMapImageMetadata({ title: 'Launch', location: { x: 101, y: 10 } }), (error) => {
    assert.equal(error.statusCode, 400);
    return true;
  });
});

test('legacy image descriptions are read as location names during transition', () => {
  assert.deepEqual(validateMapImageMetadata({ title: 'Shop', description: 'San Fabian' }), {
    title: 'Shop',
    locationName: 'San Fabian',
  });
});

test('map image uploads accept actual JPG, PNG, and WebP signatures only', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const webp = Buffer.from('RIFF0000WEBP');
  assert.equal(validateMapImageFile(jpeg, 'image/jpeg').extension, 'jpg');
  assert.equal(validateMapImageFile(png, 'image/png').extension, 'png');
  assert.equal(validateMapImageFile(webp, 'image/webp').extension, 'webp');
  assert.throws(() => validateMapImageFile(jpeg, 'image/png'), { statusCode: 400 });
  assert.throws(() => validateMapImageFile(Buffer.from('<svg/>'), 'image/svg+xml'), { statusCode: 400 });
  assert.throws(() => validateMapImageFile(Buffer.alloc(MAX_MAP_IMAGE_SIZE + 1), 'image/jpeg'), { statusCode: 413 });
});

test('stored map image filenames cannot preserve directory traversal', () => {
  assert.equal(sanitizeMapImageFilename('../../my image.png', 'png'), 'my_image.png');
  assert.equal(sanitizeMapImageFilename('photo.jpeg', 'jpg'), 'photo.jpeg.jpg');
});

test('map images require a shop relationship for customer Discover association', async () => {
  const image = new MapImage({
    title: 'Shop feature',
    uploaderId: '507f1f77bcf86cd799439011',
  });
  await assert.rejects(image.validate(), (error) => {
    assert.ok(error.errors.shopId);
    return true;
  });
});

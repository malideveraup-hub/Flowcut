import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateServiceForm } from '../src/utils/serviceFormValidation.js';

test('service form accepts the existing Shop Admin service fields', () => {
  assert.deepEqual(validateServiceForm({ name: '  Classic Cut ', estimatedDuration: '30', price: '25.50' }), {});
  assert.deepEqual(validateServiceForm({ name: 'Free Trim', estimatedDuration: '1', price: '0' }), {});
});

test('service form enforces required fields and server validation limits', () => {
  assert.deepEqual(validateServiceForm({ name: '', estimatedDuration: '', price: '' }), {
    name: 'Service name is required.',
    estimatedDuration: 'Duration is required.',
    price: 'Price is required.',
  });
  const errors = validateServiceForm({ name: '<script>', estimatedDuration: '480.5', price: '-1' });
  assert.match(errors.name, /not allowed/);
  assert.match(errors.estimatedDuration, /whole number/);
  assert.match(errors.price, /negative/);
  assert.equal(
    validateServiceForm({ name: 'A'.repeat(101), estimatedDuration: '481', price: '1000001' }).name,
    'Service name must be 2-100 characters.'
  );
});

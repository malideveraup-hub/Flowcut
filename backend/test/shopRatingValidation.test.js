import test from 'node:test';
import assert from 'node:assert/strict';
import ShopRating from '../src/models/ShopRating.js';
import { validateShopRating } from '../src/validation/shopRatingValidation.js';

test('shop ratings accept only whole stars from one to five', () => {
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(validateShopRating({ rating }), rating);
  for (const rating of [0, 6, 1.5, '5', null]) {
    assert.throws(() => validateShopRating({ rating }), { statusCode: 400 });
  }
});

test('a customer can have only one rating record per shop', () => {
  const uniqueShopRatingIndex = ShopRating.schema.indexes().find(([, options]) => options.unique);
  assert.deepEqual(uniqueShopRatingIndex?.[0], { shopId: 1, customerId: 1 });
});

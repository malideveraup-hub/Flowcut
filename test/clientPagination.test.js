import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateItems } from '../src/utils/clientPagination.js';

const makeItems = (length) => Array.from({ length }, (_, index) => `item-${index + 1}`);

test('client card pagination handles empty, partial, and exact page boundaries', () => {
  for (const count of [0, 1, 9, 10, 18, 19]) {
    const first = paginateItems(makeItems(count), 1);
    assert.equal(first.items.length, Math.min(count, 9), `${count} items on page one`);
    assert.equal(first.page, 1);
    assert.equal(first.totalPages, Math.max(1, Math.ceil(count / 9)));
    assert.equal(first.start, count ? 1 : 0);
    assert.equal(first.end, Math.min(count, 9));

    if (count > 9) {
      const last = paginateItems(makeItems(count), 99);
      assert.equal(last.page, last.totalPages);
      assert.equal(last.items.length, count % 9 || 9);
      assert.equal(last.end, count);
    }
  }
});

test('client pagination clamps invalid pages after filtered results shrink', () => {
  const filtered = makeItems(10).filter((item) => Number(item.split('-')[1]) < 4);
  const result = paginateItems(filtered, 2);
  assert.equal(result.page, 1);
  assert.deepEqual(result.items, ['item-1', 'item-2', 'item-3']);
});

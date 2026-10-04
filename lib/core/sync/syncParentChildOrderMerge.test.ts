import { expect, it } from 'vitest';

import { mergeParentChildOrders } from './syncParentChildOrderMerge.js';

const names = new Map([
  ['a', 'Alpha'], ['b', 'Topic'], ['c', 'Topic'], ['d', 'Delta'],
  ['x', 'Apple'], ['y', 'Pear'], ['z', 'Banana']
]);
const compareAdded = (left: string, right: string) =>
  names.get(left)!.localeCompare(names.get(right)!, 'zh-CN', { numeric: true }) ||
  (left < right ? -1 : left > right ? 1 : 0);

it('retains the shared order and breaks one insertion tie by stable ID', () => {
  expect(mergeParentChildOrders(['a', 'b'], ['a', 'c'], compareAdded)).toEqual(['a', 'b', 'c']);
  expect(mergeParentChildOrders(['a', 'c'], ['a', 'b'], compareAdded)).toEqual(['a', 'b', 'c']);
});

it('keeps additions near their common anchors and their own relative order', () => {
  const left = ['a', 'x', 'y', 'd'];
  const right = ['a', 'z', 'd', 'c'];
  expect(mergeParentChildOrders(left, right, compareAdded)).toEqual(['a', 'x', 'z', 'y', 'd', 'c']);
  expect(mergeParentChildOrders(right, left, compareAdded)).toEqual(['a', 'x', 'z', 'y', 'd', 'c']);
});

it('does not silently decide a reordered common sequence', () => {
  expect(() => mergeParentChildOrders(['a', 'd'], ['d', 'a'], compareAdded))
    .toThrow('sync_parent_order_common_reordered');
});

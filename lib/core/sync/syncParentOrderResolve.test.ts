import { expect, it } from 'vitest';

import { resolveParentOrderHeads } from './syncParentOrderResolve.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';

const base: ParentOrderVersion = { versionId: 'base', kind: 'baseline',
  order: ['a', 'b', 'c'], parentVersionIds: [] };
const left: ParentOrderVersion = { versionId: 'user-a', kind: 'user',
  order: ['c', 'b', 'a'], parentVersionIds: ['base'] };
const right: ParentOrderVersion = { versionId: 'user-b', kind: 'user',
  order: ['b', 'a', 'c'], parentVersionIds: ['base'] };
const third: ParentOrderVersion = { versionId: 'user-c', kind: 'user',
  order: ['a', 'c', 'b'], parentVersionIds: ['base'] };

function resolve(versions: ParentOrderVersion[], headIds: string[], members = base.order) {
  return resolveParentOrderHeads({ versions, headIds, members: new Set(members),
    compareAdded: (a, b) => a.localeCompare(b) });
}

it('keeps original user priority and immutable losers across pairwise merge groupings', () => {
  const all = [base, left, right, third];
  const expected = resolve(all, [left.versionId, right.versionId, third.versionId]);
  const ab = resolve(all, [left.versionId, right.versionId]);
  const bc = resolve(all, [right.versionId, third.versionId]);
  expect(resolve([...all, ab.version], [ab.version.versionId, third.versionId]))
    .toEqual(expected);
  expect(resolve([...all, bc.version], [bc.version.versionId, left.versionId]))
    .toEqual(expected);
  expect(expected.order).toEqual(left.order);
  expect(expected.losingVersionIds).toEqual([right.versionId, third.versionId]);
});

it('combines concurrent membership additions without creating a user reorder vote', () => {
  const x: ParentOrderVersion = { versionId: 'x', kind: 'membership',
    order: ['a', 'x', 'b', 'c'], parentVersionIds: ['base'] };
  const y: ParentOrderVersion = { versionId: 'y', kind: 'membership',
    order: ['a', 'y', 'b', 'c'], parentVersionIds: ['base'] };
  const result = resolve([base, x, y], ['x', 'y'], ['a', 'b', 'c', 'x', 'y']);
  expect(result.order).toEqual(['a', 'x', 'y', 'b', 'c']);
  expect(result.winningVersionId).toBeNull();
  expect(result.losingVersionIds).toEqual([]);
});

it('adopts a causally later user choice after an automatic merge', () => {
  const merged = resolve([base, left, right], [left.versionId, right.versionId]);
  const later: ParentOrderVersion = { versionId: 'user-z', kind: 'user',
    order: right.order, parentVersionIds: [merged.version.versionId] };
  const result = resolve([base, left, right, merged.version, later],
    [left.versionId, later.versionId]);
  expect(result.order).toEqual(right.order);
  expect(result.version).toEqual(later);
  expect(result.losingVersionIds).toEqual([]);
});

it('requires complete ancestry before adopting a received head', () => {
  expect(() => resolve([left], [left.versionId]))
    .toThrow('sync_parent_order_lineage_unproven');
});

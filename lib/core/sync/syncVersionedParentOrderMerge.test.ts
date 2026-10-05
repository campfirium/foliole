import { expect, it } from 'vitest';

import { mergeVersionedParentOrders,
  restoreParentOrderSnapshot } from './syncVersionedParentOrderMerge.js';

const compareAdded = (left: string, right: string) => left.localeCompare(right,
  'zh-CN', { numeric: true });
const members = (...ids: string[]) => new Set(ids);

it('keeps a single changed common order and naturally sorts only tied additions', () => {
  const result = mergeVersionedParentOrders({ base: ['a', 'b'], facts: [
    { versionId: 'v1', order: ['a', 'z', 'b'] },
    { versionId: 'v2', order: ['b', 'a', 'x'] }
  ], members: members('a', 'b', 'x', 'z'), compareAdded });
  expect(result.order).toEqual(['b', 'a', 'x', 'z']);
  expect(result.winningVersionId).toBe('v2');
});

it('uses original version IDs for conflicting reorders regardless of fact arrival order', () => {
  const facts = [
    { versionId: 'v3', order: ['b', 'a', 'c'] },
    { versionId: 'v1', order: ['c', 'b', 'a'] },
    { versionId: 'v2', order: ['a', 'c', 'b'] }
  ];
  const input = { base: ['a', 'b', 'c'], members: members('a', 'b', 'c'), compareAdded };
  const first = mergeVersionedParentOrders({ ...input, facts });
  const reverse = mergeVersionedParentOrders({ ...input, facts: [...facts].reverse() });
  expect(first).toEqual(reverse);
  expect(first.order).toEqual(['c', 'b', 'a']);
  expect(first.winningVersionId).toBe('v1');
  expect(first.losingVersionIds).toEqual(['v2', 'v3']);
});

it('puts an addition after its former preceding anchor when anchors reverse', () => {
  const result = mergeVersionedParentOrders({ base: ['a', 'b'], facts: [
    { versionId: 'v1', order: ['a', 'x', 'b'] },
    { versionId: 'v2', order: ['b', 'a'] }
  ], members: members('a', 'b', 'x'), compareAdded });
  expect(result.order).toEqual(['b', 'a', 'x']);
});

it.each([
  [['a', 'c', 'd', 'x'], ['a', 'x', 'c', 'd']],
  [['a', 'd', 'x'], ['a', 'd', 'x']]
])('uses only the original surviving anchors of an addition', (currentMembers, expected) => {
  const result = mergeVersionedParentOrders({ base: ['a', 'b', 'c', 'd'], facts: [
    { versionId: 'v1', order: ['a', 'b', 'x', 'c', 'd'] },
    { versionId: 'v2', order: ['a', 'b', 'c', 'd'] }
  ], members: new Set(currentMembers), compareAdded });
  expect(result.order).toEqual(expected);
});

it('preserves one source’s known addition order while interleaving independent additions', () => {
  const result = mergeVersionedParentOrders({ base: ['a', 'b'], facts: [
    { versionId: 'v1', order: ['a', 'z', 'x', 'b'] },
    { versionId: 'v2', order: ['a', 'y', 'b'] }
  ], members: members('a', 'b', 'x', 'y', 'z'), compareAdded });
  expect(result.order).toEqual(['a', 'y', 'z', 'x', 'b']);
});

it('does not call matching concurrent common reorders losers', () => {
  const result = mergeVersionedParentOrders({ base: ['a', 'b'], facts: [
    { versionId: 'v1', order: ['b', 'a'] },
    { versionId: 'v2', order: ['b', 'a'] }
  ], members: members('a', 'b'), compareAdded });
  expect(result.order).toEqual(['b', 'a']);
  expect(result.losingVersionIds).toEqual([]);
});

it('does not restore deleted or moved members and preserves later additions', () => {
  expect(restoreParentOrderSnapshot(['b', 'a', 'gone'], ['a', 'x', 'b', 'moved'],
    members('a', 'b', 'x'), compareAdded)).toEqual(['b', 'a', 'x']);
});

it('lets a later user edit replace an earlier winning choice through causality', () => {
  const facts = [
    { versionId: 'a', order: ['b', 'a', 'c'] },
    { versionId: 'b', order: ['c', 'a', 'b'] },
    { versionId: 'z', order: ['a', 'c', 'b'], supersedes: ['a', 'b'] }
  ];
  const result = mergeVersionedParentOrders({ base: ['a', 'b', 'c'], facts,
    members: members('a', 'b', 'c'), compareAdded });
  expect(result.order).toEqual(['a', 'c', 'b']);
  expect(result.winningVersionId).toBe('z');
  expect(result.losingVersionIds).toEqual([]);
});

it('accepts an identical relayed user fact without changing merge identity', () => {
  const fact = { versionId: 'v1', order: ['b', 'a'] };
  const input = { base: ['a', 'b'], members: members('a', 'b'), compareAdded };
  expect(mergeVersionedParentOrders({ ...input, facts: [fact, { ...fact }] }))
    .toEqual(mergeVersionedParentOrders({ ...input, facts: [fact] }));
  expect(() => mergeVersionedParentOrders({ ...input, facts: [fact,
    { versionId: 'v1', order: ['a', 'b'] }] })).toThrow('sync_parent_order_fact_collision');
});

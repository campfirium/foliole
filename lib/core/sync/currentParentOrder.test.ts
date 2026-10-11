import { describe, expect, it } from 'vitest';

import { currentParentOrderHash, joinParentOrderSources, parseParentOrderSources,
  projectCurrentParentOrder, type ParentOrderSource } from './currentParentOrder.js';

const source = (authorId: string, counter: number, childIds: string[]): ParentOrderSource =>
  ({ authorId, counter, childIds });
const members = (ids: string[]) => ids.map((id) => ({ id, title: id, createdAt: '2026-01-01' }));

describe('original current parent facts', () => {
  it('keeps an older original constraint which a name tie must not override', () => {
    const facts = [source('A', 3, ['a', 'x', 'b']), source('B', 2, ['a', 'y', 'b']),
      source('C', 1, ['a', 'y', 'x', 'b'])];
    for (const permutation of [facts, [...facts].reverse(), [facts[1]!, facts[2]!, facts[0]!]]) {
      expect(projectCurrentParentOrder(permutation, members(['a', 'b', 'x', 'y'])))
        .toEqual(['a', 'y', 'x', 'b']);
    }
  });

  it('keeps both independent additions between their common anchors', () => {
    const facts = [source('A', 2, ['a', 'z', 'b']), source('B', 2, ['a', 'y', 'b'])];
    expect(projectCurrentParentOrder(facts, members(['a', 'b', 'y', 'z'])))
      .toEqual(['a', 'y', 'z', 'b']);
  });

  it('gives a later real complete edit priority and drops conflicting older constraints', () => {
    const facts = [source('A', 4, ['b', 'a']), source('B', 3, ['a', 'x', 'b'])];
    expect(projectCurrentParentOrder(facts, members(['a', 'b', 'x']))).toEqual(['b', 'a', 'x']);
  });

  it('joins associatively and idempotently without creating a materialized source', () => {
    const a = [source('A', 1, ['a', 'x', 'b'])];
    const b = [source('B', 2, ['a', 'y', 'b'])];
    const c = [source('A', 3, ['b', 'a', 'x'])];
    const result = joinParentOrderSources(joinParentOrderSources(a, b), c);
    expect(result).toEqual(joinParentOrderSources(a, joinParentOrderSources(b, c)));
    expect(joinParentOrderSources(result, result)).toEqual(result);
    expect(result).toHaveLength(2);
  });

  it('rejects same-author same-counter equivocation and duplicate children', () => {
    const original = [source('A', 1, ['a', 'b'])];
    expect(() => joinParentOrderSources(original, [source('A', 1, ['b', 'a'])])).toThrow('collision');
    expect(original[0]!.childIds).toEqual(['a', 'b']);
    expect(() => parseParentOrderSources([source('A', 1, ['a', 'a'])])).toThrow();
  });

  it('hashes counters and all sources even when the displayed order does not change', () => {
    const a = [source('A', 1, ['a', 'b'])];
    const b = [source('A', 2, ['a', 'b'])];
    const c = [...b, source('B', 0, ['a', 'b'])];
    expect(projectCurrentParentOrder(a, members(['a', 'b'])))
      .toEqual(projectCurrentParentOrder(c, members(['a', 'b'])));
    expect(new Set([a, b, c].map((facts) => currentParentOrderHash('parent', facts))).size).toBe(3);
    expect(currentParentOrderHash('parent', c)).toBe(currentParentOrderHash('parent', [...c].reverse()));
  });

  it('uses actual members, preserves late facts, and appends completely omitted members by creation', () => {
    const facts = [source('A', 1, ['a', 'deleted', 'late', 'b'])];
    expect(projectCurrentParentOrder(facts, members(['a', 'b', 'omitted'])))
      .toEqual(['a', 'b', 'omitted']);
    expect(projectCurrentParentOrder(facts, members(['a', 'late', 'b', 'omitted'])))
      .toEqual(['a', 'late', 'b', 'omitted']);
    expect(facts[0]!.childIds).toContain('deleted');
  });
});

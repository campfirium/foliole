import { expect, it } from 'vitest';

import { projectParentOrderUserFacts,
  type ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { mergeVersionedParentOrders } from './syncVersionedParentOrderMerge.js';

const base: ParentOrderVersion = { versionId: 'base', kind: 'baseline',
  order: ['a', 'b', 'c'], parentVersionIds: [] };
const left: ParentOrderVersion = { versionId: 'a', kind: 'user',
  order: ['b', 'a', 'c'], parentVersionIds: ['base'] };
const right: ParentOrderVersion = { versionId: 'b', kind: 'user',
  order: ['c', 'a', 'b'], parentVersionIds: ['base'] };

it('keeps original concurrent edits after an automatic merge', () => {
  const merged: ParentOrderVersion = { versionId: 'merge-1', kind: 'merge',
    order: ['b', 'a', 'c'], parentVersionIds: ['a', 'b'] };
  const facts = projectParentOrderUserFacts([base, left, right, merged], ['merge-1']);
  expect(facts.map((fact) => fact.versionId)).toEqual(['a', 'b']);
  expect(mergeVersionedParentOrders({ base: base.order, facts,
    members: new Set(base.order), compareAdded: (a, b) => a.localeCompare(b) }).order)
    .toEqual(left.order);
});

it('recognizes a later user reorder after a merge as the causal successor', () => {
  const merged: ParentOrderVersion = { versionId: 'merge-1', kind: 'merge',
    order: ['b', 'a', 'c'], parentVersionIds: ['a', 'b'] };
  const later: ParentOrderVersion = { versionId: 'z', kind: 'user',
    order: ['a', 'c', 'b'], parentVersionIds: ['merge-1'] };
  const facts = projectParentOrderUserFacts([base, left, right, merged, later], ['z']);
  expect(facts.find((fact) => fact.versionId === 'z')?.supersedes).toEqual(['a', 'b']);
  expect(mergeVersionedParentOrders({ base: base.order, facts,
    members: new Set(base.order), compareAdded: (a, b) => a.localeCompare(b) }).order)
    .toEqual(later.order);
});

it('deduplicates relayed versions and rejects a conflicting ID or missing edge', () => {
  expect(projectParentOrderUserFacts([base, left, { ...left }], ['a'])).toHaveLength(1);
  expect(() => projectParentOrderUserFacts([base, left, { ...left, order: ['a'] }], ['a']))
    .toThrow('sync_parent_order_fact_collision');
  expect(() => projectParentOrderUserFacts([left], ['a']))
    .toThrow('sync_parent_order_lineage_unproven');
});

it('rejects a cycle rather than inventing a common ancestor', () => {
  expect(() => projectParentOrderUserFacts([{ ...base, parentVersionIds: ['a'] }, left], ['a']))
    .toThrow('sync_parent_order_lineage_unproven');
});

it('replays three original edits identically after either pair merges first', () => {
  const third: ParentOrderVersion = { versionId: 'c', kind: 'user',
    order: ['a', 'c', 'b'], parentVersionIds: ['base'] };
  const ab: ParentOrderVersion = { versionId: 'merge-ab', kind: 'merge',
    order: left.order, parentVersionIds: ['a', 'b'] };
  const bc: ParentOrderVersion = { versionId: 'merge-bc', kind: 'merge',
    order: right.order, parentVersionIds: ['b', 'c'] };
  const resolve = (versions: ParentOrderVersion[], heads: string[]) => {
    const facts = projectParentOrderUserFacts(versions, heads);
    return mergeVersionedParentOrders({ base: base.order, facts,
      members: new Set(base.order), compareAdded: (a, b) => a.localeCompare(b) });
  };
  const first = resolve([base, left, right, third, ab], ['merge-ab', 'c']);
  const second = resolve([base, left, right, third, bc], ['a', 'merge-bc']);
  expect(first).toEqual(second);
  expect(first.losingVersionIds).toEqual(['b', 'c']);
});

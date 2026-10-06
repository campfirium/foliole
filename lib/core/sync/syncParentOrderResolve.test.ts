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
  expect(resolve([...all, ab.version, bc.version],
    [ab.version.versionId, bc.version.versionId])).toEqual(expected);
  expect(expected.order).toEqual(left.order);
  expect(expected.losingVersionIds).toEqual([right.versionId, third.versionId]);
});

it('inherits a user successor and preserves a sole changed common order', () => {
  expect(resolve([base, left], [base.versionId, left.versionId]).version).toEqual(left);
  const unchanged: ParentOrderVersion = { versionId: 'user-0', kind: 'user',
    order: base.order, parentVersionIds: [base.versionId] };
  const result = resolve([base, left, unchanged], [unchanged.versionId, left.versionId]);
  expect(result.order).toEqual(left.order);
  expect(result.winningVersionId).toBe(left.versionId);
  expect(result.losingVersionIds).toEqual([]);
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

it('keeps the shared base when the other branch has no user reorder', () => {
  const baseline: ParentOrderVersion = { versionId: 'initial', kind: 'baseline',
    order: ['a', 'b', 'c', 'd'], parentVersionIds: [] };
  const added: ParentOrderVersion = { versionId: 'added', kind: 'user',
    order: ['a', 'b', 'x', 'c', 'd'], parentVersionIds: ['initial'] };
  const removed: ParentOrderVersion = { versionId: 'removed', kind: 'membership',
    order: ['a', 'd'], parentVersionIds: ['initial'] };
  const versions = [baseline, added, removed];
  const result = resolve(versions, ['removed', 'added'], ['a', 'd', 'x']);
  expect(result.order).toEqual(['a', 'd', 'x']);
  expect(resolve(versions, ['added', 'removed'], ['a', 'd', 'x']))
    .toEqual(result);
});

it('inherits the complete arrangement after 10000 causally ordered membership changes', () => {
  const versions: ParentOrderVersion[] = [base];
  for (let index = 0; index < 10000; index += 1) {
    versions.push({ versionId: `membership-${index}`, kind: 'membership',
      order: base.order, parentVersionIds: [versions.at(-1)!.versionId] });
  }
  const head = versions.at(-1)!;
  expect(resolve([...versions].reverse(), [head.versionId])).toMatchObject({
    order: base.order, version: head, losingVersionIds: []
  });
});

it('preserves original user causality through a deep membership history', () => {
  const versions: ParentOrderVersion[] = [base];
  for (let index = 0; index < 10000; index += 1) {
    const previous = versions.at(-1)!;
    versions.push(index === 2500 || index === 7500
      ? { ...(index === 2500 ? left : right), parentVersionIds: [previous.versionId] }
      : { versionId: `membership-${index}`, kind: 'membership',
        order: previous.order, parentVersionIds: [previous.versionId] });
  }
  const head = versions.at(-1)!;
  expect(resolve(versions, [head.versionId])).toMatchObject({
    order: right.order, version: head, losingVersionIds: []
  });
  expect(resolve([...versions].reverse(), [head.versionId]))
    .toEqual(resolve(versions, [head.versionId]));
});

import { expect, it } from 'vitest';

import { createReadwiseCleanupSubtreeCollector, reduceReadwiseCleanupRootCandidates } from './readwiseCleanupStructure.js';

it('collects complete subtrees in source sibling order without mutating or retaining previous results', () => {
  const rows = [
    { id: 'root', parent_id: null },
    ...Array.from({ length: 1000 }, (_, index) => ({ id: `child-${index}`, parent_id: 'root' })),
    { id: 'grandchild', parent_id: 'child-0' },
    { id: 'other', parent_id: null }
  ];
  const before = structuredClone(rows);
  const collect = createReadwiseCleanupSubtreeCollector(rows);
  const expected = [rows[0], rows[1], rows[1001], ...rows.slice(2, 1001)];
  expect(collect('root')).toEqual(expected);
  expect(collect('missing')).toEqual([]);
  expect(collect('child-0')).toEqual([rows[1], rows[1001]]);
  collect('root').pop();
  expect(collect('root')).toEqual(expected);
  expect(rows).toEqual(before);
});

it('preserves the root candidate order and eliminates nested and duplicate candidates', () => {
  const rows = [
    { id: 'parent', parent_id: null },
    { id: 'child', parent_id: 'parent' },
    { id: 'other', parent_id: null }
  ];
  const candidate = (nodeId: string) => ({ nodeId, importedAt: '2026-10-29', ruleId: 'rule', sourcePath: nodeId });
  const parent = candidate('parent');
  const other = candidate('other');
  expect(reduceReadwiseCleanupRootCandidates([
    candidate('child'), other, parent, candidate('child')
  ], rows)).toEqual([parent, other]);
});

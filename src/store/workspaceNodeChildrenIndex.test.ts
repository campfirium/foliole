import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { patchWorkspaceRecord, recordWorkspaceRecordPatch } from '../shared/workspaceRecordPatch';

import { collectNodeSubtreeIds } from './workspaceHelpers';
import { prepareWorkspaceNodeChildrenIndex as prepare } from './workspaceNodeChildrenIndex';

const node = (id: string, parentNodeId: string | null = null) => ({ id, parentNodeId, title: id }) as Node;
const fixture = () => ({ root: node('root'), a: node('a', 'root'), b: node('b', 'root'),
  deep: node('deep', 'a'), other: node('other'), outside: node('outside', 'other') });

it('reuses the index through both hinted and unhinted nonstructural publications', () => {
  const first = fixture();
  const index = prepare(first);
  const content = patchWorkspaceRecord(first, { a: { ...first.a, content: 'Changed' } });
  expect(prepare(content, first)).toBe(index);
  const refreshed = Object.fromEntries(Object.entries(content).map(([id, value]) =>
    [id, { ...value, priority: 7, deletedAt: id === 'b' ? 'trashed' : null }]));
  expect(prepare(refreshed, content)).toBe(index);
  expect(collectNodeSubtreeIds('root', refreshed)).toEqual(['root', 'a', 'b', 'deep']);
});

it('updates only affected relation buckets and leaves old snapshots unchanged', () => {
  const first = fixture();
  const index = prepare(first);
  const moved = patchWorkspaceRecord(first, { deep: { ...first.deep, parentNodeId: 'b' } });
  const next = prepare(moved, first);
  expect(next.children.get(null)).toBe(index.children.get(null));
  expect(next.children.get('other')).toBe(index.children.get('other'));
  expect(collectNodeSubtreeIds('a', moved)).toEqual(['a']);
  expect(collectNodeSubtreeIds('b', moved)).toEqual(['b', 'deep']);
  expect(collectNodeSubtreeIds('a', first)).toEqual(['a', 'deep']);
});

it('detects unhinted moves and same-count membership replacements', () => {
  const first = fixture();
  prepare(first);
  const { deep: removed, ...retained } = first;
  void removed;
  const next = { ...retained, added: node('added', 'b') };
  prepare(next, first);
  expect(collectNodeSubtreeIds('root', next)).toEqual(['root', 'a', 'b', 'added']);
  expect(collectNodeSubtreeIds('root', first)).toEqual(['root', 'a', 'b', 'deep']);
  const moved = { ...next, added: { ...next.added, parentNodeId: 'other' } };
  prepare(moved, next);
  expect(collectNodeSubtreeIds('other', moved)).toEqual(['other', 'outside', 'added']);
});

it('preserves numeric enumeration and source-key ordering on additions and replacements', () => {
  const first = fixture();
  prepare(first);
  const next = patchWorkspaceRecord(first, { '10': node('10', 'root'), '2': node('2', 'root') });
  prepare(next, first);
  expect(collectNodeSubtreeIds('root', next)).toEqual(['root', '2', '10', 'a', 'b', 'deep']);
  const reordered = { root: first.root, b: first.b, new: node('new', 'root'), a: first.a, deep: first.deep };
  prepare(reordered, next);
  expect(collectNodeSubtreeIds('root', reordered)).toEqual(['root', 'b', 'new', 'a', 'deep']);
});

it('honors actual new-key insertion order even when the patch hint has another order', () => {
  const first = fixture();
  prepare(first);
  const next = { ...first, last: node('last', 'root'), later: node('later', 'root') };
  recordWorkspaceRecordPatch(first, next, ['later', 'last']);
  prepare(next, first);
  expect(collectNodeSubtreeIds('root', next)).toEqual(['root', 'a', 'b', 'last', 'later', 'deep']);
});

it('does not inspect unrelated nodes for a reliable nonstructural patch', () => {
  let reads = 0;
  const first = { root: node('root'), a: node('a', 'root'), unrelated: {
    id: 'unrelated', get parentNodeId() { reads++; return null; }
  } as Node };
  prepare(first);
  reads = 0;
  const next = patchWorkspaceRecord(first, { a: { ...first.a, content: 'New body' } });
  prepare(next, first);
  collectNodeSubtreeIds('root', next);
  expect(reads).toBe(0);
});

it('isolates independent libraries with identical ids and different relationships', () => {
  const first = fixture();
  const second = { ...fixture(), deep: node('deep', 'other') };
  prepare(first);
  prepare(second, first);
  expect(collectNodeSubtreeIds('a', second)).toEqual(['a']);
  expect(collectNodeSubtreeIds('other', second)).toEqual(['other', 'deep', 'outside']);
  expect(collectNodeSubtreeIds('a', first)).toEqual(['a', 'deep']);
});

it('keeps alias multiplicity when a source key moves and uses array-index key boundaries', () => {
  const first = fixture();
  prepare(first);
  const added = patchWorkspaceRecord(first, { alias: node('a', 'root'),
    '4294967295': node('4294967295', 'root'), '4294967294': node('4294967294', 'root') });
  prepare(added, first);
  expect(collectNodeSubtreeIds('root', added)).toEqual([
    'root', '4294967294', 'a', 'b', 'a', '4294967295', 'deep', 'deep'
  ]);
  const movedAlias = patchWorkspaceRecord(added, { alias: node('a', 'other') });
  prepare(movedAlias, added);
  expect(collectNodeSubtreeIds('root', movedAlias)).toEqual([
    'root', '4294967294', 'a', 'b', '4294967295', 'deep'
  ]);
  expect(collectNodeSubtreeIds('other', movedAlias)).toEqual(['other', 'outside', 'a', 'deep']);
});

import { expect, it } from 'vitest';

import { WorkspaceNodePriorityState } from './workspaceNodePriorityState.js';

it('updates moved and reprioritized subtrees while preserving independent branches', () => {
  const index = new WorkspaceNodePriorityState([
    { id: 'a', parentNodeId: null, priority: 2 }, { id: 'b', parentNodeId: null, priority: 8 },
    { id: 'folder', parentNodeId: 'a' }, { id: 'leaf', parentNodeId: 'folder' },
    { id: 'override', parentNodeId: 'folder', priority: 0 }, { id: 'child', parentNodeId: 'override' },
    { id: 'default', parentNodeId: null }
  ], 5);
  const values = index.priorities;
  index.update([{ id: 'folder', parentNodeId: 'b' }]);
  expect([values.get('folder'), values.get('leaf'), values.get('a'), values.get('override'), values.get('child')])
    .toEqual([8, 8, 2, 0, 0]);
  index.update([{ id: 'b', parentNodeId: null, priority: 3 }]);
  expect([values.get('folder'), values.get('leaf'), values.get('override')]).toEqual([3, 3, 0]);
  index.setDefaultPriority(7);
  expect([values.get('default'), values.get('leaf'), values.get('child')]).toEqual([7, 3, 0]);
});

it('handles simultaneous moves, missing parents, deletion and reinsertion', () => {
  const index = new WorkspaceNodePriorityState([
    { id: 'a', parentNodeId: null, priority: 2 }, { id: 'b', parentNodeId: 'a' }, { id: 'c', parentNodeId: 'b' }
  ], 5);
  index.update([{ id: 'b', parentNodeId: null, priority: 9 }, { id: 'a', parentNodeId: 'b', priority: null }]);
  expect([...index.priorities.values()]).toEqual([9, 9, 9]);
  index.update([], ['b']);
  expect(Object.fromEntries(index.priorities)).toEqual({ a: 5, c: 5 });
  index.update([{ id: 'b', parentNodeId: null, priority: 1 }]);
  expect(Object.fromEntries(index.priorities)).toEqual({ a: 1, b: 1, c: 1 });
});

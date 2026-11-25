import { expect, it } from 'vitest';

import { WorkspaceNodePriorityState } from './workspaceNodePriorityState.js';

it('tracks the nearest enforced folder across changes and moves without replacing a material priority', () => {
  const outer = { id: 'outer', kind: 'folder', parentNodeId: null, priority: 3, enforcePriority: true };
  const inner = { id: 'inner', kind: 'folder', parentNodeId: 'outer', priority: 2 };
  const topic = { id: 'topic', kind: 'topic', parentNodeId: 'inner', priority: 9 };
  const card = { id: 'card', kind: 'item', parentNodeId: 'topic', priority: 8 };
  const index = new WorkspaceNodePriorityState([outer, inner, topic, card], 5);
  expect([index.priorities.get('topic'), index.priorities.get('card')]).toEqual([3, 3]);
  index.update([{ ...inner, enforcePriority: true }]);
  expect([index.priorities.get('topic'), index.priorities.get('card')]).toEqual([2, 2]);
  index.update([{ ...topic, priority: 7 }]);
  expect(index.priorities.get('topic')).toBe(2);
  index.update([{ ...topic, parentNodeId: 'outer', priority: 7 }]);
  expect([index.priorities.get('topic'), index.priorities.get('card')]).toEqual([3, 3]);
  index.update([{ ...outer, priority: 0 }]);
  expect([index.priorities.get('topic'), index.priorities.get('card')]).toEqual([0, 0]);
  index.update([{ ...outer, priority: 0, enforcePriority: false }]);
  expect([index.priorities.get('topic'), index.priorities.get('card')]).toEqual([7, 8]);
});

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

it('updates complete UUID paths through explicit overrides and retains unrelated derived paths', () => {
  const index = new WorkspaceNodePriorityState([
    { id: 'a', parentNodeId: null }, { id: 'b', parentNodeId: null },
    { id: 'branch', parentNodeId: 'a' }, { id: 'override', parentNodeId: 'branch', priority: 0 },
    { id: 'leaf', parentNodeId: 'override' }
  ], 5);
  const paths = index.paths;
  const independent = paths.get('a');
  expect(paths.get('leaf')).toEqual(['a', 'branch', 'override', 'leaf']);
  index.update([{ id: 'branch', parentNodeId: 'b' }]);
  expect(paths.get('leaf')).toEqual(['b', 'branch', 'override', 'leaf']);
  expect(paths.get('a')).toBe(independent);
  const leaf = paths.get('leaf');
  index.setDefaultPriority(9);
  index.update([{ id: 'branch', parentNodeId: 'b', priority: 3 }]);
  expect(paths.get('leaf')).toBe(leaf);
  index.update([], ['b']);
  expect(paths.has('b')).toBe(false);
  expect(paths.get('leaf')).toEqual(['b', 'branch', 'override', 'leaf']);
  index.update([{ id: 'b', parentNodeId: 'a' }]);
  expect(paths.get('leaf')).toEqual(['a', 'b', 'branch', 'override', 'leaf']);
});

it('applies and releases enforcement when a whole subtree crosses an enforcing folder', () => {
  const branch = { id: 'branch', kind: 'folder', parentNodeId: 'plain', priority: 8 };
  const index = new WorkspaceNodePriorityState([
    { id: 'plain', kind: 'folder', parentNodeId: null },
    { id: 'strict', kind: 'folder', parentNodeId: null, priority: 1, enforcePriority: true },
    branch, { id: 'leaf', kind: 'topic', parentNodeId: 'branch', priority: 6 }
  ], 5);
  index.update([{ ...branch, parentNodeId: 'strict' }]);
  expect(index.priorities.get('leaf')).toBe(1);
  index.update([{ ...branch, parentNodeId: 'plain' }]);
  expect([index.priorities.get('branch'), index.priorities.get('leaf')]).toEqual([8, 6]);
  index.update([{ id: 'fresh', kind: 'folder', parentNodeId: 'strict' }, { ...branch, parentNodeId: 'fresh' }]);
  expect(index.priorities.get('leaf')).toBe(1);
});

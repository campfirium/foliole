import { expect, it } from 'vitest';

import { createWorkspaceNodePriorityIndex } from './workspaceNodePriorityIndex.js';

it('materializes a concrete priority for every node while preserving explicit and inherited zero', () => {
  const nodes = {
    child: { id: 'child', parentNodeId: 'folder', priority: null },
    leaf: { id: 'leaf', parentNodeId: 'child', priority: 0 },
    inherited: { id: 'inherited', parentNodeId: 'leaf' },
    folder: { id: 'folder', parentNodeId: null, priority: 2 },
    default: { id: 'default', parentNodeId: null, priority: null },
    orphan: { id: 'orphan', parentNodeId: 'missing' }
  };
  expect(Object.fromEntries(createWorkspaceNodePriorityIndex(nodes, 5))).toEqual({
    child: 2, leaf: 0, inherited: 0, folder: 2, default: 5, orphan: 5
  });
  expect(nodes.child.priority).toBeNull();
  expect(nodes.default.priority).toBeNull();
});

it('reflects a moved subtree and changed default in a fresh index without altering the previous result', () => {
  const nodes = {
    a: { id: 'a', parentNodeId: null, priority: 2 },
    b: { id: 'b', parentNodeId: null, priority: 8 },
    folder: { id: 'folder', parentNodeId: 'a' },
    child: { id: 'child', parentNodeId: 'folder' },
    default: { id: 'default', parentNodeId: null }
  };
  const before = createWorkspaceNodePriorityIndex(nodes, 5);
  const after = createWorkspaceNodePriorityIndex({ ...nodes, folder: { ...nodes.folder, parentNodeId: 'b' } }, 7);
  expect([before.get('folder'), before.get('child'), before.get('default')]).toEqual([2, 2, 5]);
  expect([after.get('folder'), after.get('child'), after.get('default')]).toEqual([8, 8, 7]);
});

it('handles deep trees and cyclic parent relations without recursive stack growth', () => {
  const nodes: Record<string, { id: string; parentNodeId: string | null; priority?: number }> = {};
  for (let index = 0; index < 20_000; index++) {
    nodes[`n${index}`] = { id: `n${index}`, parentNodeId: index ? `n${index - 1}` : null };
  }
  Object.assign(nodes, { x: { id: 'x', parentNodeId: 'y' }, y: { id: 'y', parentNodeId: 'x' },
    p: { id: 'p', parentNodeId: 'q', priority: 3 }, q: { id: 'q', parentNodeId: 'p' } });
  const priorities = createWorkspaceNodePriorityIndex(nodes, 5);
  expect(priorities.size).toBe(20_004);
  expect(priorities.get('n19999')).toBe(5);
  expect([priorities.get('x'), priorities.get('y'), priorities.get('p'), priorities.get('q')]).toEqual([5, 5, 3, 3]);
});

import { expect, it } from 'vitest';

import { createWorkspaceNodePaths } from './workspaceNodePaths.js';
import { WorkspaceNodePriorityState } from './workspaceNodePriorityState.js';

it('preserves UUID ancestry for roots, missing parents and cycles regardless of input order', () => {
  const nodes = [
    { id: 'leaf', parentNodeId: 'folder' }, { id: 'folder', parentNodeId: 'root' },
    { id: 'root', parentNodeId: null }, { id: 'orphan', parentNodeId: 'missing' },
    { id: 'cycle-leaf', parentNodeId: 'a' }, { id: 'a', parentNodeId: 'b' },
    { id: 'b', parentNodeId: 'a' }, { id: 'self', parentNodeId: 'self' }
  ];
  for (const ordered of [nodes, [...nodes].reverse()]) {
    const paths = createWorkspaceNodePaths(ordered);
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
      expect(paths.get(node.id)).toEqual(ancestry(byId[node.id]!, byId));
    }
  }
});

it('matches fresh ancestry after simultaneous moves, removals, cycles and restoration', () => {
  const nodes = new Map(Array.from({ length: 30 }, (_, index) => [String(index), {
    id: String(index), parentNodeId: index ? String(Math.floor((index - 1) / 2)) : null
  }]));
  const index = new WorkspaceNodePriorityState(nodes.values(), 5);
  const changes = [
    [{ id: '1', parentNodeId: '2' }, { id: '2', parentNodeId: null }],
    [{ id: '2', parentNodeId: '1' }], [{ id: '2', parentNodeId: null }],
    [], [{ id: '2', parentNodeId: '0' }]
  ];
  changes.forEach((updates, step) => {
    const removed = step === 3 ? ['2'] : [];
    for (const id of removed) nodes.delete(id);
    for (const node of updates) nodes.set(node.id, node);
    index.update(updates, removed);
    const byId = Object.fromEntries(nodes);
    expect(index.paths.size).toBe(nodes.size);
    for (const node of Object.values(byId)) {
      expect(index.paths.get(node.id)).toEqual(ancestry(node, byId));
    }
  });
});

// Independent ancestor walk checks equivalence with the retired per-candidate projection.
function ancestry(node: { id: string; parentNodeId: string | null },
  byId: Record<string, { parentNodeId: string | null }>) {
  const path = [node.id];
  const seen = new Set(path);
  let parent = node.parentNodeId;
  while (parent && !seen.has(parent)) {
    path.unshift(parent);
    seen.add(parent);
    parent = byId[parent]?.parentNodeId ?? null;
  }
  return path;
}

import { expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => vi.fn())
}));

import type { Node } from '../features/nodes/model/nodeTypes';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';
import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import type { WorkspaceState } from './workspaceStore';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

function createNode(id: string): Node {
  return {
    content: '',
    createdAt: '2026-09-22T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-09-22T00:00:00.000Z'
  };
}

it('keeps a selection-only update off full special-root normalization', () => {
  const current = createTestWorkspaceState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      'node-1': createNode('node-1'),
      'node-2': createNode('node-2'),
      'node-3': createNode('node-3')
    }
  });
  const unrelatedNode = current.nodesById['node-3'];

  const next = withWorkspaceRendererBoundary(
    { activeNodeId: 'node-2' },
    current
  ) as Partial<WorkspaceState>;

  expect(next.nodesById?.['node-3']).toBe(unrelatedNode);
  expect(next.activeNodeId).toBe('node-2');
});

it('reconciles a registered one-node document patch without rebuilding unrelated nodes', () => {
  const node1 = createNode('node-1');
  const node2 = createNode('node-2');
  const current = createTestWorkspaceState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: { 'node-1': node1, 'node-2': node2 }
  });
  const nextNodesById = patchWorkspaceRecord(current.nodesById, {
    'node-1': { ...node1, content: 'Loaded body' }
  });

  const next = withWorkspaceRendererBoundary({ nodesById: nextNodesById }, current);

  expect(next.nodesById?.['node-1']?.content).toBe('Loaded body');
  expect(next.nodesById?.['node-2']).toBe(node2);
});

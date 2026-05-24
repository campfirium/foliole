import { expect, it } from 'vitest';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import { createInitialWorkspaceState } from './workspaceStore';

function createNode(nodeId: string) {
  const seedNode = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')).nodesById['node-1']!;
  return {
    ...seedNode,
    id: nodeId,
    title: nodeId,
    content: 'Loaded body',
    hasContent: true,
    reveal: 'Loaded reveal',
    hasReveal: true
  };
}

function createLoadedNodes() {
  return {
    'node-1': {
      ...createNode('node-1'),
      title: 'Node 1',
      content: 'First node body',
      reveal: 'First answer'
    },
    'node-2': {
      ...createNode('node-2'),
      title: 'Node 2',
      content: 'Second node body',
      reveal: 'Second answer'
    }
  };
}

it('refreshes reusable boundary projections when a manifest-preserved entity fact changes', () => {
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createNode('node-1'),
      'node-2': createNode('node-2')
    }
  };
  const nextNodesById = {
    ...currentState.nodesById,
    'node-1': {
      ...currentState.nodesById['node-1']!,
      bodyBlobHash: 'body-hash-v2',
      content: ''
    }
  };
  const nextState = enforceWorkspaceRendererBoundary(
    { nodesById: nextNodesById },
    currentState
  ) as { nodesById: typeof nextNodesById };

  expect(nextState.nodesById['node-1']?.bodyBlobHash).toBe('body-hash-v2');
  expect(nextState.nodesById['node-1']?.content).toBe('');
});

it('keeps pending nodes loaded for nodesById-only boundary patches', () => {
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: createLoadedNodes()
  };
  const nextState = enforceWorkspaceRendererBoundary(
    { nodesById: createLoadedNodes() },
    currentState,
    new Set(['node-1'])
  ) as { nodesById: ReturnType<typeof createLoadedNodes> };

  expect(nextState.nodesById['node-1']).toMatchObject({
    content: 'First node body',
    hasContent: true,
    reveal: 'First answer',
    hasReveal: true
  });
  expect(nextState.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});

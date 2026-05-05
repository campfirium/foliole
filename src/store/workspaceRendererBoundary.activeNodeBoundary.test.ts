import { expect, it } from 'vitest';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function createGuardedNode(nodeId: string) {
  const node = {
    ...useWorkspaceStore.getState().nodesById['node-1'],
    id: nodeId,
    title: `Guarded ${nodeId}`,
    content: '',
    hasContent: false,
    reveal: null,
    hasReveal: false
  };

  Object.defineProperty(node, 'content', {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error(`unexpected full reconciliation touch: ${nodeId}.content`);
    }
  });

  Object.defineProperty(node, 'title', {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error(`unexpected full reconciliation touch: ${nodeId}.title`);
    }
  });

  return node;
}

it('avoids full reconciliation for active-node-only patches during node switching', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];
  const guardedNode = createGuardedNode('node-999');
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-1',
    rendererBoundaryKeepNodeIds: ['node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        title: 'Node 1',
        content: 'First node body',
        hasContent: true,
        reveal: 'First answer',
        hasReveal: true
      },
      'node-2': {
        ...seedNode,
        id: 'node-2',
        title: 'Node 2',
        content: 'Second node body',
        hasContent: true,
        reveal: 'Second answer',
        hasReveal: true
      },
      'node-999': guardedNode
    },
    nodeOrder: ['node-1', 'node-2', 'node-999'],
    trashedNodeIds: []
  };

  const nextState = enforceWorkspaceRendererBoundary({ activeNodeId: 'node-2' }, currentState) as {
    nodesById: Record<string, unknown>;
  };

  expect(nextState.nodesById['node-999']).toBe(guardedNode);
});

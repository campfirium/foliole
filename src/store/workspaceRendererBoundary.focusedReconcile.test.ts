import { expect, it } from 'vitest';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

it('falls back to full reconciliation when node ids change but counts match', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-1',
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
      'special-inbox': {
        ...useWorkspaceStore.getState().nodesById['special-inbox']
      },
      'special-virtual-root': {
        ...useWorkspaceStore.getState().nodesById['special-virtual-root']
      }
    }
  } as unknown as WorkspaceState;

  const nextState = enforceWorkspaceRendererBoundary(
    {
      activeNodeId: 'node-1',
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
          content: '',
          hasContent: true,
          reveal: null,
          hasReveal: false
        },
        'pdf-parent': {
          ...seedNode,
          id: 'pdf-parent',
          title: 'PDF Parent',
          content: '',
          hasContent: false,
          reveal: null,
          hasReveal: false
        }
      }
    } as Partial<WorkspaceState>,
    currentState as WorkspaceState & { rendererBoundaryKeepNodeIds?: string[] }
  ) as { nodesById: Record<string, { id: string }> };

  expect(Object.keys(nextState.nodesById).sort()).toEqual(['node-1', 'node-2', 'pdf-parent']);
});

import { expect, it } from 'vitest';

import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';
import { useWorkspaceStore } from './workspaceStore';

it('trims the previous active document when selection and target document change together', () => {
  const currentState = createTestWorkspaceState({
    activeNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...useWorkspaceStore.getState().nodesById['node-1']!,
        content: 'Previous body',
        hasContent: true,
        id: 'node-1'
      },
      'node-2': {
        ...useWorkspaceStore.getState().nodesById['node-1']!,
        content: '',
        hasContent: true,
        id: 'node-2'
      }
    }
  });

  const nextState = enforceWorkspaceRendererBoundary({
    activeNodeId: 'node-2',
    nodesById: {
      ...currentState.nodesById,
      'node-2': { ...currentState.nodesById['node-2']!, content: 'Next body' }
    }
  }, currentState) as WorkspaceState;

  expect(nextState.nodesById['node-1']?.content).toBe('');
  expect(nextState.nodesById['node-2']?.content).toBe('Next body');
});

it('falls back to full reconciliation when node ids change but counts match', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  const currentState = createTestWorkspaceState({
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
        ...useWorkspaceStore.getState().nodesById['special-inbox']!
      },
      'special-virtual-root': {
        ...useWorkspaceStore.getState().nodesById['special-virtual-root']!
      }
    }
  });

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

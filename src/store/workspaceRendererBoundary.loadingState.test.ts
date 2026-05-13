import { expect, it } from 'vitest';

import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';

it('treats empty content with unknown metadata as not yet loaded', () => {
  const currentState = createTestWorkspaceState();
  const seedNode = currentState.nodesById['node-1'];

  const nextState = enforceWorkspaceRendererBoundary(
    {
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...currentState.nodesById,
        'node-1': {
          ...seedNode,
          id: 'node-1',
          title: 'Node 1',
          content: 'First node body',
          hasContent: true,
          reveal: null,
          hasReveal: false
        },
        'node-2': {
          ...seedNode,
          id: 'node-2',
          title: 'Node 2',
          content: '',
          hasContent: undefined,
          reveal: null,
          hasReveal: false
        }
      },
      trashedNodeIds: []
    } as unknown as Partial<WorkspaceState>,
    currentState as WorkspaceState & { rendererBoundaryKeepNodeIds?: string[] }
  ) as { nodesById: Record<string, { content: string; hasContent?: boolean }> };

  expect(nextState.nodesById['node-2']).toMatchObject({
    content: '',
    hasContent: undefined
  });
});

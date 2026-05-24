import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
});

it('does not open a deleted node when trash projection is stale', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;

  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        content: 'Visible body',
        hasContent: true,
        id: 'node-1',
        title: 'Node 1'
      },
      'node-2': {
        ...seedNode,
        content: 'Deleted body',
        deletedAt: '2026-05-24T00:00:00.000Z',
        hasContent: true,
        id: 'node-2',
        title: 'Deleted node'
      }
    },
    trashedNodeIds: []
  });

  expect(useWorkspaceStore.getState().openNode('node-2')).toBeNull();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
});

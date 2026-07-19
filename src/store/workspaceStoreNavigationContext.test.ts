import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
});

it('keeps active Topic and browse root aligned across located navigation history', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  const folder = (id: string) => ({
    ...seedNode, content: '', hasContent: false, id, kind: 'folder' as const, parentNodeId: null, title: id
  });
  const topic = (id: string, parentNodeId: string) => ({
    ...seedNode, id, kind: 'topic' as const, parentNodeId, title: id
  });
  useWorkspaceStore.setState({
    activeNodeId: 'topic-a',
    browseRootNodeId: 'folder-a',
    navigation: { backStack: [], forwardStack: [] },
    nodeOrder: ['folder-a', 'topic-a', 'folder-b', 'topic-b'],
    nodesById: {
      'folder-a': folder('folder-a'),
      'topic-a': topic('topic-a', 'folder-a'),
      'folder-b': folder('folder-b'),
      'topic-b': topic('topic-b', 'folder-b')
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().openNode('topic-b', 'target-context');
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: 'topic-b', browseRootNodeId: 'folder-b' });

  useWorkspaceStore.getState().goBack();
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: 'topic-a', browseRootNodeId: 'folder-a' });

  useWorkspaceStore.getState().goForward();
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: 'topic-b', browseRootNodeId: 'folder-b' });
});

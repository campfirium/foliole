import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
import { useWorkspaceDualListState } from './workspaceDualListState';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  specialKind?: WorkspaceListNode['specialKind'];
  title: string;
}): WorkspaceListNode {
  return {
    createdAt: '2026-05-22T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    review: null,
    ...(args.specialKind ? { specialKind: args.specialKind } : {}),
    title: args.title,
    updatedAt: '2026-05-22T00:00:00.000Z'
  };
}

it('uses Home as the entity root without reparenting Inbox in source data', () => {
  const nodesById: WorkspaceListNodesById = {
    [HOME_NODE_ID]: createNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-a-child': createNode({ id: 'folder-a-child', kind: 'folder', parentNodeId: 'folder-a', title: 'Folder A Child' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'topic-nested': createNode({ id: 'topic-nested', kind: 'topic', parentNodeId: 'folder-a-child', title: 'Nested Topic' }),
    'topic-inbox': createNode({ id: 'topic-inbox', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Inbox Topic' }),
    'topic-child': createNode({ id: 'topic-child', kind: 'topic', parentNodeId: 'topic-a', title: 'Topic child' })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: HOME_NODE_ID,
      isTrashViewOpen: false,
      listNodesById: nodesById,
      nodeOrder: [HOME_NODE_ID, INBOX_NODE_ID, 'folder-a', 'folder-a-child', 'topic-a', 'topic-nested', 'topic-inbox', 'topic-child'],
      trashedNodeIds: []
    })
  );

  expect(result.current.activeFolderColumnId).toBe(HOME_NODE_ID);
  expect(result.current.activeFolderId).toBe(HOME_NODE_ID);
  expect(result.current.folderNodeOrder).toEqual([HOME_NODE_ID, INBOX_NODE_ID, 'folder-a', 'folder-a-child', TRASH_NODE_ID]);
  expect(result.current.folderNodesById[INBOX_NODE_ID]?.parentNodeId).toBe(HOME_NODE_ID);
  expect(result.current.folderNodesById['folder-a']?.parentNodeId).toBe(HOME_NODE_ID);
  expect(result.current.folderNodesById['folder-a-child']?.parentNodeId).toBe('folder-a');
  expect(result.current.folderNodesById[TRASH_NODE_ID]?.parentNodeId).toBeNull();
  expect(nodesById[INBOX_NODE_ID]?.parentNodeId).toBeNull();
  expect(result.current.topicNodeOrder).toEqual(['topic-a', 'topic-nested', 'topic-inbox']);
  expect(result.current.topicChildrenByParent.get('topic-a')).toEqual(['topic-child']);
  expect(result.current.folderTopicCountById.get(HOME_NODE_ID)).toBe(3);

  expect(
    sortWorkspaceContentNodeIds(
      result.current.topicNodeOrder,
      result.current.topicNodesById,
      { direction: 'desc', key: 'lastOpenedAt' },
      {
        'topic-a': { updatedAt: '2026-05-21T10:00:00.000Z' },
        'topic-inbox': { updatedAt: '2026-05-22T10:00:00.000Z' }
      }
    )
  ).toEqual(['topic-inbox', 'topic-a', 'topic-nested']);
});

it('keeps the Home column active while revealing the selected topic folder', () => {
  const nodesById: WorkspaceListNodesById = {
    [HOME_NODE_ID]: createNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'topic-a',
      preferredFolderColumnId: HOME_NODE_ID,
      isTrashViewOpen: false,
      listNodesById: nodesById,
      nodeOrder: [HOME_NODE_ID, INBOX_NODE_ID, 'folder-a', 'topic-a'],
      trashedNodeIds: []
    })
  );

  expect(result.current.activeFolderColumnId).toBe(HOME_NODE_ID);
  expect(result.current.activeFolderId).toBe(HOME_NODE_ID);
  expect(result.current.revealFolderId).toBe('folder-a');
  expect(result.current.topicNodeOrder).toEqual(['topic-a']);
});

it('keeps Demo Guides above Inbox when the workspace snapshot orders it first', () => {
  const nodesById: WorkspaceListNodesById = {
    [HOME_NODE_ID]: createNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'demo-guides': createNode({ id: 'demo-guides', kind: 'folder', title: 'Guides' }),
    'demo-welcome': createNode({
      id: 'demo-welcome',
      kind: 'topic',
      parentNodeId: 'demo-guides',
      title: 'Welcome to Foliole'
    })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'demo-welcome',
      isTrashViewOpen: false,
      listNodesById: nodesById,
      nodeOrder: [HOME_NODE_ID, 'demo-guides', INBOX_NODE_ID, 'demo-welcome'],
      trashedNodeIds: []
    })
  );

  expect(result.current.folderNodeOrder).toEqual([HOME_NODE_ID, 'demo-guides', INBOX_NODE_ID, TRASH_NODE_ID]);
  expect(result.current.topicNodeOrder).toEqual(['demo-welcome']);
});

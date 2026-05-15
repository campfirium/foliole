import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceDualListState } from './workspaceDualListState';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): NonNullable<WorkspaceListNodesById[string]> {
  return {
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

const nodesById: WorkspaceListNodesById = {
  [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
  'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
  'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
  'topic-b': createNode({ id: 'topic-b', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic B' })
};

it('keeps heavy column projections stable when selection stays in the same folder', () => {
  const baseProps = {
    isTrashViewOpen: false,
    listNodesById: nodesById,
    nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b'],
    trashedNodeIds: []
  };
  const { result, rerender } = renderHook(
    ({ activeNodeId }: { activeNodeId: string }) =>
      useWorkspaceDualListState({ ...baseProps, activeNodeId }),
    { initialProps: { activeNodeId: 'topic-a' } }
  );
  const first = result.current;

  rerender({ activeNodeId: 'topic-b' });

  expect(result.current.activeFolderColumnId).toBe('folder-a');
  expect(result.current.folderNodesById).toBe(first.folderNodesById);
  expect(result.current.topicNodesById).toBe(first.topicNodesById);
  expect(result.current.topicNodeOrder).toBe(first.topicNodeOrder);
});

it('keeps the active topic in its folder column when that topic has children', () => {
  const topicParentNodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'topic-parent': createNode({
      id: 'topic-parent',
      kind: 'topic',
      parentNodeId: INBOX_NODE_ID,
      title: 'Topic parent'
    }),
    'topic-child': createNode({
      id: 'topic-child',
      kind: 'topic',
      parentNodeId: 'topic-parent',
      title: 'Topic child'
    })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'topic-parent',
      isTrashViewOpen: false,
      listNodesById: topicParentNodesById,
      nodeOrder: [INBOX_NODE_ID, 'topic-parent', 'topic-child'],
      trashedNodeIds: []
    })
  );

  expect(result.current.activeFolderColumnId).toBe(INBOX_NODE_ID);
  expect(result.current.topicNodeOrder).toEqual(['topic-parent', 'topic-child']);
});

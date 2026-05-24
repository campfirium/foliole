import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceDualListState } from './workspaceDualListState';

function createNode(args: {
  deletedAt?: string | null;
  id: string;
  kind: 'folder' | 'topic';
  parentNodeId?: string | null;
  title: string;
}): NonNullable<WorkspaceListNodesById[string]> {
  return {
    createdAt: '2026-04-20T00:00:00.000Z',
    ...(args.deletedAt !== undefined ? { deletedAt: args.deletedAt } : {}),
    hasContent: args.kind !== 'folder',
    hasReveal: false,
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  } as NonNullable<WorkspaceListNodesById[string]>;
}

it('keeps restored lifecycle nodes visible despite stale trash projection', () => {
  const nodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createNode({
      deletedAt: null,
      id: 'topic-a',
      kind: 'topic',
      parentNodeId: 'folder-a',
      title: 'Topic A'
    }),
    'topic-b': createNode({
      deletedAt: '2026-05-24T00:00:00.000Z',
      id: 'topic-b',
      kind: 'topic',
      parentNodeId: 'folder-a',
      title: 'Topic B'
    })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'folder-a',
      isTrashViewOpen: false,
      listNodesById: nodesById,
      nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b'],
      trashedNodeIds: ['topic-a']
    })
  );

  expect(result.current.topicNodeOrder).toEqual(['topic-a']);
});

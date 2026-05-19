import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { INBOX_NODE_ID, TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceDualListState } from './workspaceDualListState';

function createNode(args: {
  anchorLink?: NonNullable<WorkspaceListNodesById[string]>['anchorLink'];
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): NonNullable<WorkspaceListNodesById[string]> {
  return {
    createdAt: '2026-04-20T00:00:00.000Z',
    ...(args.anchorLink !== undefined ? { anchorLink: args.anchorLink } : {}),
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

it('reuses the folder projection while switching between folders', () => {
  const folderSwitchNodesById: WorkspaceListNodesById = {
    ...nodesById,
    'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' }),
    'topic-c': createNode({ id: 'topic-c', kind: 'topic', parentNodeId: 'folder-b', title: 'Topic C' })
  };
  const baseProps = {
    isTrashViewOpen: false,
    listNodesById: folderSwitchNodesById,
    nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b', 'folder-b', 'topic-c'],
    trashedNodeIds: []
  };
  const { result, rerender } = renderHook(
    ({ activeNodeId }: { activeNodeId: string }) =>
      useWorkspaceDualListState({ ...baseProps, activeNodeId }),
    { initialProps: { activeNodeId: 'folder-a' } }
  );
  const folderNodesById = result.current.folderNodesById;

  rerender({ activeNodeId: 'folder-b' });

  expect(result.current.activeFolderColumnId).toBe('folder-b');
  expect(result.current.folderNodesById).toBe(folderNodesById);
  expect(result.current.topicNodeOrder).toEqual(['topic-c']);
});

it('reflects topic title edits from the latest source data', () => {
  const baseProps = {
    activeNodeId: 'folder-a',
    isTrashViewOpen: false,
    listNodesById: nodesById,
    nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b'],
    trashedNodeIds: []
  };
  const { result, rerender } = renderHook(
    ({ listNodesById }: { listNodesById: WorkspaceListNodesById }) =>
      useWorkspaceDualListState({ ...baseProps, listNodesById }),
    { initialProps: { listNodesById: nodesById } }
  );
  const folderTopicCountById = result.current.folderTopicCountById;

  rerender({
    listNodesById: {
      ...nodesById,
      'topic-a': { ...nodesById['topic-a']!, title: 'Renamed Topic A' }
    }
  });

  expect(result.current.topicNodeOrder).toEqual(['topic-a', 'topic-b']);
  expect(result.current.topicNodesById['topic-a']?.title).toBe('Renamed Topic A');
  expect(result.current.folderTopicCountById).toBe(folderTopicCountById);
});

it('reflects moved topics in the selected folder without waiting for a later rebuild', () => {
  const initialNodesById: WorkspaceListNodesById = {
    ...nodesById,
    'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' })
  };
  const nodeOrder = [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b', 'folder-b'];
  const { result, rerender } = renderHook(
    ({ listNodesById }: { listNodesById: WorkspaceListNodesById }) =>
      useWorkspaceDualListState({
        activeNodeId: 'folder-b',
        isTrashViewOpen: false,
        listNodesById,
        nodeOrder,
        trashedNodeIds: []
      }),
    { initialProps: { listNodesById: initialNodesById } }
  );

  expect(result.current.topicNodeOrder).toEqual([]);

  rerender({
    listNodesById: {
      ...initialNodesById,
      'topic-b': { ...initialNodesById['topic-b']!, parentNodeId: 'folder-b' }
    }
  });

  expect(result.current.topicNodeOrder).toEqual(['topic-b']);
});

it('counts native content under folders without counting nested folders or derived nodes', () => {
  const folderCountNodesById: WorkspaceListNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-child': createNode({ id: 'folder-child', kind: 'folder', parentNodeId: 'folder-a', title: 'Folder child' }),
    'folder-empty': createNode({ id: 'folder-empty', kind: 'folder', parentNodeId: 'folder-a', title: 'Empty child' }),
    'topic-direct': createNode({ id: 'topic-direct', kind: 'topic', parentNodeId: 'folder-a', title: 'Direct Topic' }),
    'topic-nested': createNode({ id: 'topic-nested', kind: 'topic', parentNodeId: 'folder-child', title: 'Nested Topic' }),
    'topic-highlight': createNode({ anchorLink: { id: 'hl-1', kind: 'highlight' }, id: 'topic-highlight', kind: 'topic', parentNodeId: 'topic-nested', title: 'Highlight' }),
    'item-cloze': createNode({ anchorLink: { id: 'cloze-1', kind: 'cloze' }, id: 'item-cloze', kind: 'item', parentNodeId: 'topic-nested', title: 'Cloze' })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'folder-a',
      isTrashViewOpen: false,
      listNodesById: folderCountNodesById,
      nodeOrder: [INBOX_NODE_ID, 'folder-a', 'folder-child', 'folder-empty', 'topic-direct', 'topic-nested', 'topic-highlight', 'item-cloze'],
      trashedNodeIds: []
    })
  );

  expect(result.current.folderTopicCountById.get('folder-a')).toBe(1);
  expect(result.current.folderTopicCountById.get('folder-child')).toBe(1);
  expect(result.current.folderTopicCountById.get('folder-empty')).toBe(0);
});

it('counts visible trash roots on the Trash navigation row', () => {
  const trashNodesById: WorkspaceListNodesById = {
    ...nodesById,
    'folder-trash': createNode({ id: 'folder-trash', kind: 'folder', title: 'Deleted Folder' }),
    'topic-trash-child': createNode({ id: 'topic-trash-child', kind: 'topic', parentNodeId: 'folder-trash', title: 'Covered Topic' }),
    'topic-trash': createNode({ id: 'topic-trash', kind: 'topic', title: 'Deleted Topic' })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'folder-a',
      isTrashViewOpen: false,
      listNodesById: trashNodesById,
      nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'topic-b', 'folder-trash', 'topic-trash-child', 'topic-trash'],
      trashedNodeIds: ['folder-trash', 'topic-trash-child', 'topic-trash']
    })
  );

  expect(result.current.folderTopicCountById.get(TRASH_NODE_ID)).toBe(2);
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
    }),
    'topic-grandchild': createNode({
      id: 'topic-grandchild',
      kind: 'topic',
      parentNodeId: 'topic-child',
      title: 'Topic grandchild'
    })
  };

  const { result } = renderHook(() =>
    useWorkspaceDualListState({
      activeNodeId: 'topic-parent',
      isTrashViewOpen: false,
      listNodesById: topicParentNodesById,
      nodeOrder: [INBOX_NODE_ID, 'topic-parent', 'topic-child', 'topic-grandchild'],
      trashedNodeIds: []
    })
  );

  expect(result.current.activeFolderColumnId).toBe(INBOX_NODE_ID);
  expect(result.current.topicNodeOrder).toEqual(['topic-parent']);
  expect(result.current.topicChildrenByParent.get('topic-parent')).toEqual(['topic-child']);
  expect(result.current.topicChildrenByParent.get('topic-child')).toEqual(['topic-grandchild']);
});

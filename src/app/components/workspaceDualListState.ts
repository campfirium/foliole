import { useMemo } from 'react';

import {
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  isInboxNode,
  isTrashNode,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import { selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildFolderNavigationNodesByIdFromOrder,
  resolveActiveFolderColumnNodeId,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';
import {
  buildWorkspaceListChildrenIndex,
  type WorkspaceListChildrenIndex
} from './workspaceListChildrenIndex';

export interface WorkspaceDualListStateArgs {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  trashedNodeIds: string[];
}

function useActiveFolderColumns(args: WorkspaceDualListStateArgs) {
  return useMemo(() => ({
    activeFolderColumnId: args.isTrashViewOpen
      ? TRASH_NODE_ID
      : resolveActiveFolderColumnNodeId(
          args.activeNodeId,
          args.nodeOrder,
          args.listNodesById,
          args.trashedNodeIds
        ),
    activeFolderId: args.isTrashViewOpen
      ? TRASH_NODE_ID
      : resolveFocusedFolderNodeId(
          args.activeNodeId,
          args.nodeOrder,
          args.listNodesById,
          args.trashedNodeIds
        )
  }), [
    args.activeNodeId,
    args.isTrashViewOpen,
    args.listNodesById,
    args.nodeOrder,
    args.trashedNodeIds
  ]);
}

function isVisibleTopicNode(
  nodeId: string,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const node = nodesById[nodeId];
  return Boolean(node && !trashedNodeIds.includes(nodeId) && node.kind !== 'folder');
}

function isVisibleFolderId(nodeId: string, nodesById: WorkspaceListNodesById) {
  const node = nodesById[nodeId];
  return Boolean(
    node?.kind === 'folder' &&
    !isVirtualRootNode(node) &&
    !isVirtualNode(node)
  );
}

function buildFolderNodeOrderFromIndex(
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  const regularFolderIds = index.visibleNodeIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return (
      isVisibleFolderId(nodeId, nodesById) &&
      nodeId !== INBOX_NODE_ID &&
      nodeId !== TRASH_NODE_ID &&
      !isInboxNode(node) &&
      !isTrashNode(node)
    );
  });

  return [
    ...(index.visibleNodeIdSet.has(INBOX_NODE_ID) && isVisibleFolderId(INBOX_NODE_ID, nodesById)
      ? [INBOX_NODE_ID]
      : []),
    ...regularFolderIds,
    TRASH_NODE_ID
  ];
}

function collectTopicColumnNodeIdsFromIndex(
  folderNodeId: string | null,
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!folderNodeId) return [];
  return (index.visibleChildrenByParent.get(folderNodeId) ?? []).filter((nodeId) =>
    isVisibleTopicNode(nodeId, nodesById, trashedNodeIds)
  );
}

function countVisibleTopicsInSubtree(
  nodeId: string,
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  cache: Map<string, number>
): number {
  const cached = cache.get(nodeId);
  if (cached !== undefined) return cached;

  let count = 0;
  for (const childId of index.visibleChildrenByParent.get(nodeId) ?? []) {
    const child = nodesById[childId];
    if (!child) continue;
    count += child.kind === 'folder' ? 0 : 1;
    count += countVisibleTopicsInSubtree(childId, index, nodesById, cache);
  }
  cache.set(nodeId, count);
  return count;
}

function buildFolderTopicCountById(
  folderNodeOrder: string[],
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  nodeOrder: string[],
  trashedNodeIds: readonly string[]
) {
  const countCache = new Map<string, number>();
  const countById = new Map<string, number>();
  for (const folderId of folderNodeOrder) {
    const count = countVisibleTopicsInSubtree(folderId, index, nodesById, countCache);
    if (count > 0) countById.set(folderId, count);
  }
  const trashCount = selectTrashRootIds(nodeOrder, nodesById, [...trashedNodeIds]).length;
  if (trashCount > 0) countById.set(TRASH_NODE_ID, trashCount);
  return countById;
}

function useWorkspaceDualListStaticData(args: WorkspaceDualListStateArgs) {
  return useMemo(() => {
    const listIndex = buildWorkspaceListChildrenIndex(args.nodeOrder, args.listNodesById, args.trashedNodeIds);
    const folderNodeOrder = buildFolderNodeOrderFromIndex(listIndex, args.listNodesById);
    return {
      folderTopicCountById: buildFolderTopicCountById(
        folderNodeOrder,
        listIndex,
        args.listNodesById,
        args.nodeOrder,
        args.trashedNodeIds
      ),
      folderNodeOrder,
      folderNodesById: buildFolderNavigationNodesByIdFromOrder(folderNodeOrder, args.listNodesById),
      listIndex
    };
  }, [args.listNodesById, args.nodeOrder, args.trashedNodeIds]);
}

export function useWorkspaceDualListState(args: WorkspaceDualListStateArgs) {
  const activeColumns = useActiveFolderColumns(args);
  const { activeFolderColumnId, activeFolderId } = activeColumns;
  const staticData = useWorkspaceDualListStaticData(args);

  return useMemo(() => {
    const topicNodeOrder = collectTopicColumnNodeIdsFromIndex(
      activeFolderColumnId,
      staticData.listIndex,
      args.listNodesById,
      args.trashedNodeIds
    );

    return {
      activeFolderColumnId,
      activeFolderId,
      folderNodeOrder: staticData.folderNodeOrder,
      folderNodesById: staticData.folderNodesById,
      folderTopicCountById: staticData.folderTopicCountById,
      topicChildrenByParent: staticData.listIndex.visibleChildrenByParent,
      topicNodeOrder,
      topicNodesById: args.listNodesById
    };
  }, [
    activeFolderColumnId,
    activeFolderId,
    args.listNodesById,
    args.trashedNodeIds,
    staticData
  ]);
}

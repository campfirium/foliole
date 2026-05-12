import { useMemo } from 'react';

import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildFolderNavigationNodeOrder,
  buildFolderNavigationNodesById,
  buildTopicNavigationNodesById,
  resolveActiveFolderColumnNodeId,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';

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

function buildTopicColumnIndex(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const orderIndexById = new Map<string, number>();
  const visibleChildrenByParent = new Map<string | null, string[]>();

  nodeOrder.forEach((nodeId, index) => {
    orderIndexById.set(nodeId, index);
    if (trashedNodeIds.includes(nodeId)) return;
    const node = nodesById[nodeId];
    if (!node) return;
    const parentId = node.parentNodeId ?? null;
    visibleChildrenByParent.set(parentId, [...(visibleChildrenByParent.get(parentId) ?? []), nodeId]);
  });

  return { orderIndexById, visibleChildrenByParent };
}

function collectTopicColumnNodeIdsFromIndex(
  folderNodeId: string | null,
  index: ReturnType<typeof buildTopicColumnIndex>,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!folderNodeId) return [];
  const topicNodeIds = new Set<string>();
  const queue = (index.visibleChildrenByParent.get(folderNodeId) ?? []).filter((nodeId) =>
    isVisibleTopicNode(nodeId, nodesById, trashedNodeIds)
  );
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const nodeId = queue[queueIndex];
    if (topicNodeIds.has(nodeId)) continue;
    topicNodeIds.add(nodeId);
    queue.push(
      ...(index.visibleChildrenByParent.get(nodeId) ?? []).filter((childId) =>
        isVisibleTopicNode(childId, nodesById, trashedNodeIds)
      )
    );
  }
  return [...topicNodeIds].sort((left, right) =>
    (index.orderIndexById.get(left) ?? 0) - (index.orderIndexById.get(right) ?? 0)
  );
}

function useWorkspaceDualListStaticData(args: WorkspaceDualListStateArgs) {
  return useMemo(() => {
    const folderNodeOrder = buildFolderNavigationNodeOrder(args.nodeOrder, args.listNodesById, args.trashedNodeIds);
    return {
      folderNodeOrder,
      folderNodesById: buildFolderNavigationNodesById(args.nodeOrder, args.listNodesById, args.trashedNodeIds),
      topicIndex: buildTopicColumnIndex(args.nodeOrder, args.listNodesById, args.trashedNodeIds)
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
      staticData.topicIndex,
      args.listNodesById,
      args.trashedNodeIds
    );

    return {
      activeFolderColumnId,
      activeFolderId,
      folderNodeOrder: staticData.folderNodeOrder,
      folderNodesById: staticData.folderNodesById,
      topicNodeOrder,
      topicNodesById: buildTopicNavigationNodesById(topicNodeOrder, args.listNodesById)
    };
  }, [
    activeFolderColumnId,
    activeFolderId,
    args.listNodesById,
    args.trashedNodeIds,
    staticData
  ]);
}

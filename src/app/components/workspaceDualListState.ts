import { useMemo, useRef } from 'react';

import { HOME_NODE_ID, TRASH_NODE_ID, isHomeNode } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isCanonicalVisibleNodeId } from '../../shared/workspaceCanonicalSelectors';

import {
  buildWorkspaceDualListStructureData,
  buildWorkspaceListStructureSignature,
  type WorkspaceDualListStructureData
} from './workspaceDualListStructure';
import {
  buildFolderNavigationNodesByIdFromOrder,
  resolveActiveFolderColumnNodeId,
  resolveFocusedFolderNodeId
} from './workspaceFolderNavigation';
import {
  type WorkspaceListChildrenIndex
} from './workspaceListChildrenIndex';

export interface WorkspaceDualListStateArgs {
  activeNodeId: string | null;
  preferredFolderColumnId?: string | null;
  isTrashViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  trashedNodeIds: string[];
}

interface WorkspaceDualListStructureCache {
  data: WorkspaceDualListStructureData;
  signature: string;
}

function useActiveFolderColumns(args: WorkspaceDualListStateArgs) {
  return useMemo(() => {
    const focusedFolderId = resolveFocusedFolderNodeId(
      args.activeNodeId,
      args.nodeOrder,
      args.listNodesById,
      args.trashedNodeIds
    );
    const resolvedColumnId = resolveActiveFolderColumnNodeId(
      args.activeNodeId,
      args.nodeOrder,
      args.listNodesById,
      args.trashedNodeIds
    );
    const preferredColumnId = args.preferredFolderColumnId
      ? resolveActiveFolderColumnNodeId(
          args.preferredFolderColumnId,
          args.nodeOrder,
          args.listNodesById,
          args.trashedNodeIds
        )
      : null;
    const activeFolderColumnId = preferredColumnId ?? resolvedColumnId;

    return {
      activeFolderColumnId: args.isTrashViewOpen ? TRASH_NODE_ID : activeFolderColumnId,
      activeFolderId: args.isTrashViewOpen ? TRASH_NODE_ID : (activeFolderColumnId ?? focusedFolderId),
      revealFolderId: args.isTrashViewOpen || focusedFolderId === activeFolderColumnId ? null : focusedFolderId
    };
  }, [
    args.activeNodeId,
    args.isTrashViewOpen,
    args.listNodesById,
    args.nodeOrder,
    args.preferredFolderColumnId,
    args.trashedNodeIds
  ]);
}

function isVisibleTopicNode(
  nodeId: string,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const node = nodesById[nodeId];
  return Boolean(node && isCanonicalVisibleNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, nodeId) && node.kind !== 'folder');
}

function collectTopicColumnNodeIdsFromIndex(
  folderNodeId: string | null,
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!folderNodeId) return [];
  if (folderNodeId === HOME_NODE_ID || isHomeNode(nodesById[folderNodeId])) {
    return index.visibleNodeIds.filter((nodeId) => {
      if (!isVisibleTopicNode(nodeId, nodesById, trashedNodeIds)) {
        return false;
      }
      const parentId = nodesById[nodeId]?.parentNodeId ?? null;
      const parentNode = parentId ? nodesById[parentId] : null;
      return !parentNode || parentNode.kind === 'folder';
    });
  }
  return (index.visibleChildrenByParent.get(folderNodeId) ?? []).filter((nodeId) =>
    isVisibleTopicNode(nodeId, nodesById, trashedNodeIds)
  );
}

function useWorkspaceDualListStructureData(args: WorkspaceDualListStateArgs) {
  const cacheRef = useRef<WorkspaceDualListStructureCache | null>(null);
  const signature = buildWorkspaceListStructureSignature(
    args.nodeOrder,
    args.listNodesById,
    args.trashedNodeIds
  );

  if (cacheRef.current?.signature === signature) {
    return cacheRef.current.data;
  }

  const data = buildWorkspaceDualListStructureData(args);
  cacheRef.current = { data, signature };
  return data;
}

export function useWorkspaceDualListState(args: WorkspaceDualListStateArgs) {
  const activeColumns = useActiveFolderColumns(args);
  const { activeFolderColumnId, activeFolderId } = activeColumns;
  const structureData = useWorkspaceDualListStructureData(args);
  const folderNodesById = useMemo(
    () => buildFolderNavigationNodesByIdFromOrder(structureData.folderNodeOrder, args.listNodesById),
    [args.listNodesById, structureData.folderNodeOrder]
  );

  return useMemo(() => {
    const topicNodeOrder = collectTopicColumnNodeIdsFromIndex(
      activeFolderColumnId,
      structureData.listIndex,
      args.listNodesById,
      args.trashedNodeIds
    );

    return {
      activeFolderColumnId,
      activeFolderId,
      folderNodeOrder: structureData.folderNodeOrder,
      folderNodesById,
      folderTopicCountById: structureData.folderTopicCountById,
      revealFolderId: activeColumns.revealFolderId,
      topicChildrenByParent: structureData.listIndex.visibleChildrenByParent,
      topicNodeOrder,
      topicNodesById: args.listNodesById
    };
  }, [
    activeFolderColumnId,
    activeFolderId,
    activeColumns.revealFolderId,
    args.listNodesById,
    args.trashedNodeIds,
    folderNodesById,
    structureData
  ]);
}

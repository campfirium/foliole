import { useMemo, useRef } from 'react';

import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

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
  listNodesById: WorkspaceDualListStateArgs['listNodesById'];
  nodeOrder: WorkspaceDualListStateArgs['nodeOrder'];
  signature: string;
  trashedNodeIds: WorkspaceDualListStateArgs['trashedNodeIds'];
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

function useWorkspaceDualListStructureData(args: WorkspaceDualListStateArgs) {
  const cacheRef = useRef<WorkspaceDualListStructureCache | null>(null);
  if (
    cacheRef.current?.nodeOrder === args.nodeOrder &&
    cacheRef.current.listNodesById === args.listNodesById &&
    cacheRef.current.trashedNodeIds === args.trashedNodeIds
  ) {
    return cacheRef.current.data;
  }

  const signature = buildWorkspaceListStructureSignature(
    args.nodeOrder,
    args.listNodesById,
    args.trashedNodeIds
  );

  if (cacheRef.current?.signature === signature) {
    return cacheRef.current.data;
  }

  const data = buildWorkspaceDualListStructureData(args);
  cacheRef.current = {
    data,
    listNodesById: args.listNodesById,
    nodeOrder: args.nodeOrder,
    signature,
    trashedNodeIds: args.trashedNodeIds
  };
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
    const topicNodeOrder = activeFolderColumnId
      ? (structureData.topicNodeOrderByFolderId.get(activeFolderColumnId) ?? [])
      : [];

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
    folderNodesById,
    structureData
  ]);
}

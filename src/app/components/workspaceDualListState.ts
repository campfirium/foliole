import { useMemo, useRef } from 'react';

import { TRASH_NODE_ID } from '../../features/nodes/model/specialNodes';
import { getWorkspaceListStructureSource, type WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { readWorkspaceRecordPatch } from '../../shared/workspaceRecordPatch';

import {
  buildWorkspaceDualListStructureData,
  hasWorkspaceListStructureChange,
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
  source: ReturnType<typeof getWorkspaceListStructureSource>;
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

function sameIds(before: readonly string[], after: readonly string[]) {
  return before === after || (before.length === after.length && before.every((id, i) => id === after[i]));
}

function canReuseStructure(
  args: WorkspaceDualListStateArgs,
  previous: WorkspaceDualListStructureCache,
  source: WorkspaceDualListStructureCache['source']
) {
  if (!sameIds(previous.nodeOrder, args.nodeOrder) || !sameIds(previous.trashedNodeIds, args.trashedNodeIds)) return false;
  if (previous.listNodesById === args.listNodesById) return true;
  const isUnchanged = (id: string) => !hasWorkspaceListStructureChange(
    previous.listNodesById[id], args.listNodesById[id]
  );
  const changedIds = readWorkspaceRecordPatch(source, previous.source);
  return changedIds
    ? changedIds.every(isUnchanged)
    : args.nodeOrder.every(isUnchanged) && args.trashedNodeIds.every(isUnchanged);
}

function useWorkspaceDualListStructureData(args: WorkspaceDualListStateArgs) {
  const cacheRef = useRef<WorkspaceDualListStructureCache | undefined>(undefined);
  const previous = cacheRef.current;
  const source = getWorkspaceListStructureSource(args.listNodesById);
  const data = previous && canReuseStructure(args, previous, source)
    ? previous.data
    : buildWorkspaceDualListStructureData(args, previous);
  cacheRef.current = {
    data, listNodesById: args.listNodesById, nodeOrder: args.nodeOrder, source,
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
      folderTopicCountById: structureData.folderCounts.byFolderId,
      revealFolderId: activeColumns.revealFolderId,
      topicChildrenByParent: structureData.listIndex.visibleChildrenByParent,
      homeTopicNodeOrder: structureData.homeTopicNodeOrder,
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

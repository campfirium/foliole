import { useCallback, useMemo } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import {
  resolveWorkspaceTopicTreeDropOperation,
  type WorkspaceTopicTreeMoveIntent
} from './workspaceTopicTreeDropOperation';
import { createWorkspaceTopicTreeMove } from './workspaceTopicTreeManualDrag';

export type WorkspaceTopicTreeDragController = ReturnType<typeof useNodeListDragController>;

interface WorkspaceTopicTreeDragArgs {
  activeFolderId: string;
  itemIds: string[];
  isManualSort: boolean;
  isVirtualFolderManualOrder: boolean;
  manualOrderIds: string[];
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeMoveIntent) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  selectedNodeIds: string[];
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[]) => boolean;
}

export function useWorkspaceTopicTreeDrag(args: WorkspaceTopicTreeDragArgs) {
  const draggableNodesById = useMemo(
    () => args.nodesById,
    [args.nodesById]
  );
  const selectedMovableNodeIds = useMemo(
    () => filterMovableTopicTreeSelection(args.selectedNodeIds, args.nodesById),
    [args.nodesById, args.selectedNodeIds]
  );
  const moveNodes = useWorkspaceTopicTreeMoveNodes(args);
  const canDropOnNode = useWorkspaceTopicTreeCanDropOnNode(args);
  return useNodeListDragController({
    canDropOnNode,
    disableRootDrop: true,
    isTrashViewOpen: false,
    moveNodes,
    nodesById: draggableNodesById,
    noteRowIds: args.itemIds,
    selectedNodeIds: selectedMovableNodeIds
  });
}

function useWorkspaceTopicTreeCanDropOnNode(args: WorkspaceTopicTreeDragArgs) {
  return useCallback((sourceNodeIds: string[], targetNodeId: string, intent: WorkspaceTopicTreeMoveIntent) => (
    resolveWorkspaceTopicTreeDropOperation({
      activeFolderId: args.activeFolderId,
      currentOrder: args.manualOrderIds,
      intent,
      isManualSort: args.isManualSort,
      isVirtualFolderManualOrder: args.isVirtualFolderManualOrder,
      nodesById: args.nodesById,
      sourceNodeIds,
      targetNodeId
    }) !== 'reject'
  ), [args.activeFolderId, args.isManualSort, args.isVirtualFolderManualOrder, args.manualOrderIds, args.nodesById]);
}

function useWorkspaceTopicTreeMoveNodes(
  args: WorkspaceTopicTreeDragArgs
) {
  return useMemo(() => createWorkspaceTopicTreeMove({
    activeFolderId: args.activeFolderId,
    currentOrder: args.manualOrderIds,
    isManualSort: args.isManualSort,
    isVirtualFolderManualOrder: args.isVirtualFolderManualOrder,
    moveNodes: args.moveNodes,
    nodesById: args.nodesById,
    ...definedProps({ setFolderManualChildOrder: args.setFolderManualChildOrder })
  }), [args.activeFolderId, args.isManualSort, args.isVirtualFolderManualOrder, args.manualOrderIds, args.moveNodes, args.nodesById, args.setFolderManualChildOrder]);
}

export function filterMovableTopicTreeSelection(
  selectedNodeIds: readonly string[],
  nodesById: WorkspaceListNodesById
) {
  return selectedNodeIds.filter((nodeId) => canNodeBeMoved(nodesById[nodeId]));
}

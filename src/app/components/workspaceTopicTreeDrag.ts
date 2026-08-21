import { useCallback, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import type { WorkspaceTopicTreeMoveIntent } from './workspaceTopicTreeDropOperation';
import { createWorkspaceTopicTreeMove } from './workspaceTopicTreeManualDrag';

export interface WorkspaceTopicTreeDragController extends ReturnType<typeof useNodeListDragController> {
  isStructuralDragActive: boolean;
}

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
  const [isStructuralDragActive, setIsStructuralDragActive] = useState(false);
  const structuralDragRef = useRef(false);
  const draggableNodesById = useMemo(
    () => args.nodesById,
    [args.nodesById]
  );
  const selectedMovableNodeIds = useMemo(
    () => filterMovableTopicTreeSelection(args.selectedNodeIds, args.nodesById),
    [args.nodesById, args.selectedNodeIds]
  );
  const moveNodes = useWorkspaceTopicTreeMoveNodes(args);
  const drag = useNodeListDragController({
    disableRootDrop: true,
    isTrashViewOpen: false,
    moveNodes,
    nodesById: draggableNodesById,
    noteRowIds: args.itemIds,
    selectedNodeIds: selectedMovableNodeIds
  });

  return useStructuralTopicTreeDragController({
    drag,
    isStructuralDragActive,
    setIsStructuralDragActive,
    structuralDragRef
  });
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

function useStructuralTopicTreeDragController(args: {
  drag: ReturnType<typeof useNodeListDragController>;
  isStructuralDragActive: boolean;
  setIsStructuralDragActive: (next: boolean) => void;
  structuralDragRef: { current: boolean };
}) {
  const rememberStructuralModifier = useCallback((event: ReactDragEvent<HTMLElement>) => {
    args.structuralDragRef.current = event.altKey;
    args.setIsStructuralDragActive(event.altKey);
  }, [args]);
  const onDragOverNode = useCallback((targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    rememberStructuralModifier(event);
    args.drag.onDragOverNode(targetNodeId, event);
  }, [args.drag, rememberStructuralModifier]);
  const onDropOnNode = useCallback((targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    rememberStructuralModifier(event);
    args.drag.onDropOnNode(targetNodeId, event);
    args.structuralDragRef.current = false;
    args.setIsStructuralDragActive(false);
  }, [args, rememberStructuralModifier]);
  const onDragEnd = useCallback(() => {
    args.structuralDragRef.current = false;
    args.setIsStructuralDragActive(false);
    args.drag.onDragEnd();
  }, [args]);

  return {
    ...args.drag,
    isStructuralDragActive: args.isStructuralDragActive,
    onDragEnd,
    onDragEnterNode: onDragOverNode,
    onDragOverNode,
    onDropOnNode
  } satisfies WorkspaceTopicTreeDragController;
}

export function filterMovableTopicTreeSelection(
  selectedNodeIds: readonly string[],
  nodesById: WorkspaceListNodesById
) {
  return selectedNodeIds.filter((nodeId) => canNodeBeMoved(nodesById[nodeId]));
}

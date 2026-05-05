import { useState, type DragEvent as ReactDragEvent } from 'react';

import type { Node } from '../model/nodeTypes';

interface UseNodeListDragControllerInput {
  isTrashViewOpen: boolean;
  moveNode: (nodeId: string, nextParentNodeId: string | null) => boolean;
  nodesById: Record<string, Node>;
}

export interface NodeListDragController {
  dragSourceNodeId: string | null;
  dropTargetNodeId: string | null;
  isRootDropActive: boolean;
  onDragEnd: () => void;
  onDragEnterNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverRoot: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStartNode: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropOnNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropRoot: (event: ReactDragEvent<HTMLElement>) => void;
}

interface DragStateSetters {
  setDragSourceNodeId: (nodeId: string | null) => void;
  setDropTargetNodeId: (nodeId: string | null) => void;
  setIsRootDropActive: (isActive: boolean) => void;
}

function resetDragState(setters: DragStateSetters) {
  setters.setDragSourceNodeId(null);
  setters.setDropTargetNodeId(null);
  setters.setIsRootDropActive(false);
}

function createOnDragStartNode(
  isTrashViewOpen: boolean,
  nodesById: Record<string, Node>,
  setDragSourceNodeId: (nodeId: string | null) => void
) {
  return (nodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const node = nodesById[nodeId];
    if (isTrashViewOpen || !node || node.anchorLink) {
      event.preventDefault();
      return;
    }
    setDragSourceNodeId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
  };
}

function createOnDragOverNode(
  isTrashViewOpen: boolean,
  dragSourceNodeId: string | null,
  nodesById: Record<string, Node>,
  setDropTargetNodeId: (nodeId: string | null) => void,
  setIsRootDropActive: (isActive: boolean) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    if (
      isTrashViewOpen ||
      !dragSourceNodeId ||
      dragSourceNodeId === targetNodeId ||
      !nodesById[targetNodeId]
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetNodeId(targetNodeId);
    setIsRootDropActive(false);
  };
}

function createOnDropOnNode(
  isTrashViewOpen: boolean,
  dragSourceNodeId: string | null,
  moveNode: (nodeId: string, nextParentNodeId: string | null) => boolean,
  setters: DragStateSetters
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!dragSourceNodeId || isTrashViewOpen || dragSourceNodeId === targetNodeId) {
      resetDragState(setters);
      return;
    }
    moveNode(dragSourceNodeId, targetNodeId);
    resetDragState(setters);
  };
}

function createOnDragOverRoot(
  isTrashViewOpen: boolean,
  dragSourceNodeId: string | null,
  setDropTargetNodeId: (nodeId: string | null) => void,
  setIsRootDropActive: (isActive: boolean) => void
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    if (isTrashViewOpen || !dragSourceNodeId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetNodeId(null);
    setIsRootDropActive(true);
  };
}

function createOnDropRoot(
  isTrashViewOpen: boolean,
  dragSourceNodeId: string | null,
  moveNode: (nodeId: string, nextParentNodeId: string | null) => boolean,
  setters: DragStateSetters
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!dragSourceNodeId || isTrashViewOpen) {
      resetDragState(setters);
      return;
    }
    moveNode(dragSourceNodeId, null);
    resetDragState(setters);
  };
}

export function useNodeListDragController({
  isTrashViewOpen,
  moveNode,
  nodesById
}: UseNodeListDragControllerInput): NodeListDragController {
  const [dragSourceNodeId, setDragSourceNodeId] = useState<string | null>(null);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const [isRootDropActive, setIsRootDropActive] = useState(false);
  const setters: DragStateSetters = {
    setDragSourceNodeId,
    setDropTargetNodeId,
    setIsRootDropActive
  };

  const onDragStartNode = createOnDragStartNode(isTrashViewOpen, nodesById, setDragSourceNodeId);
  const onDragOverNode = createOnDragOverNode(
    isTrashViewOpen,
    dragSourceNodeId,
    nodesById,
    setDropTargetNodeId,
    setIsRootDropActive
  );
  const onDropOnNode = createOnDropOnNode(isTrashViewOpen, dragSourceNodeId, moveNode, setters);
  const onDragOverRoot = createOnDragOverRoot(
    isTrashViewOpen,
    dragSourceNodeId,
    setDropTargetNodeId,
    setIsRootDropActive
  );
  const onDropRoot = createOnDropRoot(isTrashViewOpen, dragSourceNodeId, moveNode, setters);
  const onDragEnd = () => resetDragState(setters);

  return {
    dragSourceNodeId,
    dropTargetNodeId,
    isRootDropActive,
    onDragEnd,
    onDragEnterNode: onDragOverNode,
    onDragOverNode,
    onDragOverRoot,
    onDragStartNode,
    onDropOnNode,
    onDropRoot
  };
}

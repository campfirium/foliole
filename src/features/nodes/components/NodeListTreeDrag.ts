import { useCallback, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';

import { canNodeBeMoved } from '../model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

const DROP_INTENT_EDGE_RATIO = 0.25;

type DropIntent = 'before' | 'after' | 'child';
type MoveIntent = DropIntent | 'root';

interface UseNodeListDragControllerInput {
  disableRootDrop: boolean;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => boolean;
  nodesById: WorkspaceListNodesById;
  noteRowIds: string[];
  selectedNodeIds: string[];
}

export interface NodeListDragController {
  dropTargetNodeId: string | null;
  dropIntent: DropIntent | null;
  isRootDropActive: boolean;
  onDragEnd: () => void;
  onDragEnterNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverRoot: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStartNode: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropOnNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropRoot: (event: ReactDragEvent<HTMLElement>) => void;
}

interface DragState {
  dropIntent: DropIntent | null;
  dropTargetNodeId: string | null;
  isRootDropActive: boolean;
  sourceNodeIds: string[];
}

function createInitialDragState(): DragState {
  return {
    dropIntent: null,
    dropTargetNodeId: null,
    isRootDropActive: false,
    sourceNodeIds: []
  };
}

function resolveDragSourceNodeIds(
  nodeId: string,
  noteRowIds: string[],
  selectedNodeIds: string[]
): string[] {
  if (!selectedNodeIds.includes(nodeId)) {
    return [nodeId];
  }
  const selectedSet = new Set(selectedNodeIds);
  const scopedSelection = noteRowIds.filter((candidateId) => selectedSet.has(candidateId));
  return scopedSelection.length > 0 ? scopedSelection : [nodeId];
}

function resolveDropIntent(event: ReactDragEvent<HTMLElement>): DropIntent {
  const rowRect = event.currentTarget.getBoundingClientRect();
  const topEdge = rowRect.top + rowRect.height * DROP_INTENT_EDGE_RATIO;
  const bottomEdge = rowRect.bottom - rowRect.height * DROP_INTENT_EDGE_RATIO;
  if (event.clientY <= topEdge) {
    return 'before';
  }
  if (event.clientY >= bottomEdge) {
    return 'after';
  }
  return 'child';
}

function isInvalidDropTarget(
  targetNodeId: string,
  sourceNodeIds: string[],
  nodesById: WorkspaceListNodesById
) {
  const sourceSet = new Set(sourceNodeIds);
  if (sourceSet.has(targetNodeId)) {
    return true;
  }
  let cursorId = nodesById[targetNodeId]?.parentNodeId ?? null;
  while (cursorId) {
    if (sourceSet.has(cursorId)) {
      return true;
    }
    cursorId = nodesById[cursorId]?.parentNodeId ?? null;
  }
  return false;
}

function createNodeDropHandler(
  isTrashViewOpen: boolean,
  state: DragState,
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => boolean,
  setState: (next: DragState) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    if (
      isTrashViewOpen ||
      state.sourceNodeIds.length === 0 ||
      !state.dropIntent ||
      state.sourceNodeIds.includes(targetNodeId)
    ) {
      setState(createInitialDragState());
      return;
    }

    moveNodes(state.sourceNodeIds, targetNodeId, state.dropIntent);
    setState(createInitialDragState());
  };
}

function createRootDropHandler(
  disableRootDrop: boolean,
  sourceNodeIds: string[],
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => boolean,
  setState: (next: DragState) => void
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    if (disableRootDrop || sourceNodeIds.length === 0) {
      setState(createInitialDragState());
      return;
    }
    moveNodes(sourceNodeIds, null, 'root');
    setState(createInitialDragState());
  };
}

function createNodeDragOverHandler(
  isTrashViewOpen: boolean,
  nodesById: WorkspaceListNodesById,
  sourceNodeIds: string[],
  setState: (updater: (prev: DragState) => DragState) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    if (
      isTrashViewOpen ||
      sourceNodeIds.length === 0 ||
      !nodesById[targetNodeId] ||
      isInvalidDropTarget(targetNodeId, sourceNodeIds, nodesById)
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const dropIntent = resolveDropIntent(event);
    setState((prev) => ({
      ...prev,
      dropIntent,
      dropTargetNodeId: targetNodeId,
      isRootDropActive: false
    }));
  };
}

function createDragStartHandler(
  isTrashViewOpen: boolean,
  nodesById: WorkspaceListNodesById,
  noteRowIds: string[],
  selectedNodeIds: string[],
  setState: (next: DragState) => void
) {
  return (nodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const node = nodesById[nodeId];
    if (isTrashViewOpen || !canNodeBeMoved(node)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    setState({
      dropIntent: null,
      dropTargetNodeId: null,
      isRootDropActive: false,
      sourceNodeIds: resolveDragSourceNodeIds(nodeId, noteRowIds, selectedNodeIds)
    });
  };
}

function createDragOverRootHandler(
  disableRootDrop: boolean,
  sourceNodeIds: string[],
  setState: (updater: (prev: DragState) => DragState) => void
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    if (disableRootDrop || sourceNodeIds.length === 0) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setState((prev) => ({
      ...prev,
      dropIntent: null,
      dropTargetNodeId: null,
      isRootDropActive: true
    }));
  };
}

export function useNodeListDragController({
  disableRootDrop,
  isTrashViewOpen,
  moveNodes,
  nodesById,
  noteRowIds,
  selectedNodeIds
}: UseNodeListDragControllerInput): NodeListDragController {
  const [state, setState] = useState<DragState>(createInitialDragState);
  const onDragStartNode = useMemo(
    () =>
      createDragStartHandler(isTrashViewOpen, nodesById, noteRowIds, selectedNodeIds, setState),
    [isTrashViewOpen, nodesById, noteRowIds, selectedNodeIds]
  );
  const onDragOverNode = useMemo(
    () => createNodeDragOverHandler(isTrashViewOpen, nodesById, state.sourceNodeIds, setState),
    [isTrashViewOpen, nodesById, state.sourceNodeIds]
  );
  const onDropOnNode = useMemo(
    () => createNodeDropHandler(isTrashViewOpen, state, moveNodes, setState),
    [isTrashViewOpen, moveNodes, state]
  );
  const onDragOverRoot = useMemo(
    () => createDragOverRootHandler(disableRootDrop, state.sourceNodeIds, setState),
    [disableRootDrop, state.sourceNodeIds]
  );
  const onDropRoot = useMemo(
    () => createRootDropHandler(disableRootDrop, state.sourceNodeIds, moveNodes, setState),
    [disableRootDrop, moveNodes, state.sourceNodeIds]
  );

  return {
    dropTargetNodeId: state.dropTargetNodeId,
    dropIntent: state.dropIntent,
    isRootDropActive: state.isRootDropActive,
    onDragEnd: useCallback(() => setState(createInitialDragState()), []),
    onDragEnterNode: onDragOverNode,
    onDragOverNode,
    onDragOverRoot,
    onDragStartNode,
    onDropOnNode,
    onDropRoot
  };
}

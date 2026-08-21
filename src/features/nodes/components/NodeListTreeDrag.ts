import { useCallback, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';

import { canNodeBeMoved } from '../model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import {
  canDropNodeListSourceOnRoot,
  type NodeListDropIntent
} from './nodeListDragIntent';
import {
  clearNodeListDragSource,
  readNodeListDragSource,
  resolveDragSourceNodeIds,
  writeNodeListDragSource
} from './NodeListDragSource';
import {
  createInitialNodeListDragState,
  createNodeListDragLeaveHandler,
  type NodeListDragState
} from './NodeListDragState';
import {
  createNodeDragOverHandler,
  createNodeDropHandler,
  type CanDropOnNode,
  type NodeListMoveIntent
} from './NodeListNodeDrop';

interface UseNodeListDragControllerInput {
  canDropOnNode?: CanDropOnNode;
  disableRootDrop: boolean;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: NodeListMoveIntent) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  noteRowIds: string[];
  selectedNodeIds: string[];
}

export interface NodeListDragController {
  dropTargetNodeId: string | null;
  dropIntent: NodeListDropIntent | null;
  isRootDropActive: boolean;
  onDragEnd: () => void;
  onDragEnterNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragLeaveNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOverRoot: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStartNode: (nodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropOnNode: (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDropRoot: (event: ReactDragEvent<HTMLElement>) => void;
}

function createRootDropHandler(
  disableRootDrop: boolean,
  nodesById: WorkspaceListNodesById,
  sourceNodeIds: string[],
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: NodeListMoveIntent) => Promise<boolean>,
  setState: (next: NodeListDragState) => void
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    const effectiveSourceNodeIds = readNodeListDragSource(event, sourceNodeIds);
    if (
      disableRootDrop ||
      effectiveSourceNodeIds.length === 0 ||
      !canDropNodeListSourceOnRoot(effectiveSourceNodeIds, nodesById)
    ) {
      setState(createInitialNodeListDragState());
      return;
    }
    void moveNodes(effectiveSourceNodeIds, null, 'root');
    clearNodeListDragSource();
    setState(createInitialNodeListDragState());
  };
}

function createDragStartHandler(
  isTrashViewOpen: boolean,
  nodesById: WorkspaceListNodesById,
  noteRowIds: string[],
  selectedNodeIds: string[],
  setState: (next: NodeListDragState) => void
) {
  return (nodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const node = nodesById[nodeId];
    if (isTrashViewOpen || !canNodeBeMoved(node)) {
      event.preventDefault();
      return;
    }
    const sourceNodeIds = resolveDragSourceNodeIds(nodeId, noteRowIds, selectedNodeIds);
    writeNodeListDragSource(event, sourceNodeIds);
    setState({
      dropIntent: null,
      dropTargetNodeId: null,
      isRootDropActive: false,
      sourceNodeIds
    });
  };
}

function createDragOverRootHandler(
  disableRootDrop: boolean,
  nodesById: WorkspaceListNodesById,
  sourceNodeIds: string[],
  setState: (updater: (prev: NodeListDragState) => NodeListDragState) => void
) {
  return (event: ReactDragEvent<HTMLElement>) => {
    const effectiveSourceNodeIds = readNodeListDragSource(event, sourceNodeIds);
    if (
      disableRootDrop ||
      effectiveSourceNodeIds.length === 0 ||
      !canDropNodeListSourceOnRoot(effectiveSourceNodeIds, nodesById)
    ) {
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
  canDropOnNode,
  disableRootDrop,
  isTrashViewOpen,
  moveNodes,
  nodesById,
  noteRowIds,
  selectedNodeIds
}: UseNodeListDragControllerInput): NodeListDragController {
  const [state, setState] = useState<NodeListDragState>(createInitialNodeListDragState);
  const onDragStartNode = useMemo(
    () =>
      createDragStartHandler(isTrashViewOpen, nodesById, noteRowIds, selectedNodeIds, setState),
    [isTrashViewOpen, nodesById, noteRowIds, selectedNodeIds]
  );
  const onDragOverNode = useMemo(
    () => createNodeDragOverHandler({ canDropOnNode, isTrashViewOpen, nodesById, setState, sourceNodeIds: state.sourceNodeIds }),
    [canDropOnNode, isTrashViewOpen, nodesById, state.sourceNodeIds]
  );
  const onDragLeaveNode = useMemo(
    () => createNodeListDragLeaveHandler(setState),
    []
  );
  const onDropOnNode = useMemo(
    () => createNodeDropHandler({ canDropOnNode, isTrashViewOpen, moveNodes, nodesById, setState, state }),
    [canDropOnNode, isTrashViewOpen, moveNodes, nodesById, state]
  );
  const onDragOverRoot = useMemo(
    () => createDragOverRootHandler(disableRootDrop, nodesById, state.sourceNodeIds, setState),
    [disableRootDrop, nodesById, state.sourceNodeIds]
  );
  const onDropRoot = useMemo(
    () => createRootDropHandler(disableRootDrop, nodesById, state.sourceNodeIds, moveNodes, setState),
    [disableRootDrop, moveNodes, nodesById, state.sourceNodeIds]
  );

  return {
    dropTargetNodeId: state.dropTargetNodeId,
    dropIntent: state.dropIntent,
    isRootDropActive: state.isRootDropActive,
    onDragEnd: useCallback(() => {
      clearNodeListDragSource();
      setState(createInitialNodeListDragState());
    }, []),
    onDragEnterNode: onDragOverNode,
    onDragLeaveNode,
    onDragOverNode,
    onDragOverRoot,
    onDragStartNode,
    onDropOnNode,
    onDropRoot
  };
}

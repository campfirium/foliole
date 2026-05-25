import { useCallback, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';

import { canNodeBeMoved } from '../model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import {
  canDropNodeListSourceOnRoot,
  resolveNodeListDropIntent,
  type NodeListDropIntent
} from './nodeListDragIntent';
import {
  clearNodeListDragSource,
  isInvalidNodeListDropTarget,
  readNodeListDragSource,
  resolveDragSourceNodeIds,
  writeNodeListDragSource
} from './NodeListDragSource';
import {
  createInitialNodeListDragState,
  createNodeListDragLeaveHandler,
  type NodeListDragState
} from './NodeListDragState';

type MoveIntent = NodeListDropIntent | 'root';

interface UseNodeListDragControllerInput {
  disableRootDrop: boolean;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => Promise<boolean>;
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

function createNodeDropHandler(
  isTrashViewOpen: boolean,
  state: NodeListDragState,
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => Promise<boolean>,
  setState: (next: NodeListDragState) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    const sourceNodeIds = readNodeListDragSource(event, state.sourceNodeIds);
    if (
      isTrashViewOpen ||
      sourceNodeIds.length === 0 ||
      !state.dropIntent ||
      sourceNodeIds.includes(targetNodeId)
    ) {
      setState(createInitialNodeListDragState());
      return;
    }

    void moveNodes(sourceNodeIds, targetNodeId, state.dropIntent);
    clearNodeListDragSource();
    setState(createInitialNodeListDragState());
  };
}

function createRootDropHandler(
  disableRootDrop: boolean,
  nodesById: WorkspaceListNodesById,
  sourceNodeIds: string[],
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: MoveIntent) => Promise<boolean>,
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

function createNodeDragOverHandler(
  isTrashViewOpen: boolean,
  nodesById: WorkspaceListNodesById,
  sourceNodeIds: string[],
  setState: (updater: (prev: NodeListDragState) => NodeListDragState) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const effectiveSourceNodeIds = readNodeListDragSource(event, sourceNodeIds);
    if (
      isTrashViewOpen ||
      effectiveSourceNodeIds.length === 0 ||
      !nodesById[targetNodeId] ||
      isInvalidNodeListDropTarget(targetNodeId, effectiveSourceNodeIds, nodesById)
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const isCrossTreeDrop = effectiveSourceNodeIds.some((nodeId) => !nodesById[nodeId]);
    const dropIntent = isCrossTreeDrop ? 'child' : resolveNodeListDropIntent(event);
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
    () => createNodeDragOverHandler(isTrashViewOpen, nodesById, state.sourceNodeIds, setState),
    [isTrashViewOpen, nodesById, state.sourceNodeIds]
  );
  const onDragLeaveNode = useMemo(
    () => createNodeListDragLeaveHandler(setState),
    []
  );
  const onDropOnNode = useMemo(
    () => createNodeDropHandler(isTrashViewOpen, state, moveNodes, setState),
    [isTrashViewOpen, moveNodes, state]
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

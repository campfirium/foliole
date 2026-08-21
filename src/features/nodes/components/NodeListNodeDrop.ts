import type { DragEvent as ReactDragEvent } from 'react';

import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { resolveNodeListDropIntent, type NodeListDropIntent } from './nodeListDragIntent';
import {
  clearNodeListDragSource,
  isInvalidNodeListDropTarget,
  readNodeListDragSource
} from './NodeListDragSource';
import {
  clearNodeListDropTarget,
  createInitialNodeListDragState,
  type NodeListDragState
} from './NodeListDragState';

export type NodeListMoveIntent = NodeListDropIntent | 'root';
export type CanDropOnNode = (
  sourceNodeIds: string[],
  targetNodeId: string,
  intent: NodeListDropIntent
) => boolean;

export function createNodeDropHandler(args: {
  canDropOnNode: CanDropOnNode | undefined;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: NodeListMoveIntent) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  setState: (next: NodeListDragState) => void;
  state: NodeListDragState;
}) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const sourceNodeIds = readNodeListDragSource(event, args.state.sourceNodeIds);
    const dropIntent = sourceNodeIds.some((nodeId) => !args.nodesById[nodeId])
      ? 'child'
      : resolveNodeListDropIntent(event);
    if (
      args.isTrashViewOpen ||
      sourceNodeIds.length === 0 ||
      sourceNodeIds.includes(targetNodeId) ||
      args.canDropOnNode?.(sourceNodeIds, targetNodeId, dropIntent) === false
    ) {
      if (!args.canDropOnNode) event.preventDefault();
      args.setState(createInitialNodeListDragState());
      return;
    }
    event.preventDefault();
    void args.moveNodes(sourceNodeIds, targetNodeId, dropIntent);
    clearNodeListDragSource();
    args.setState(createInitialNodeListDragState());
  };
}

export function createNodeDragOverHandler(args: {
  canDropOnNode: CanDropOnNode | undefined;
  isTrashViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  setState: (updater: (prev: NodeListDragState) => NodeListDragState) => void;
  sourceNodeIds: string[];
}) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    const sourceNodeIds = readNodeListDragSource(event, args.sourceNodeIds);
    const isCrossTreeDrop = sourceNodeIds.some((nodeId) => !args.nodesById[nodeId]);
    const dropIntent = isCrossTreeDrop ? 'child' : resolveNodeListDropIntent(event);
    if (
      args.isTrashViewOpen ||
      sourceNodeIds.length === 0 ||
      !args.nodesById[targetNodeId] ||
      isInvalidNodeListDropTarget(targetNodeId, sourceNodeIds, args.nodesById) ||
      args.canDropOnNode?.(sourceNodeIds, targetNodeId, dropIntent) === false
    ) {
      if (args.canDropOnNode) {
        event.dataTransfer.dropEffect = 'none';
        args.setState(clearNodeListDropTarget);
      }
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    args.setState((prev) => ({
      ...prev,
      dropIntent,
      dropTargetNodeId: targetNodeId,
      isRootDropActive: false
    }));
  };
}

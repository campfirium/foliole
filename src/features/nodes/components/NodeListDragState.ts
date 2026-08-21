import type { DragEvent as ReactDragEvent } from 'react';

import type { NodeListDropIntent } from './nodeListDragIntent';

export interface NodeListDragState {
  dropIntent: NodeListDropIntent | null;
  dropTargetNodeId: string | null;
  isRootDropActive: boolean;
  sourceNodeIds: string[];
}

export function createInitialNodeListDragState(): NodeListDragState {
  return {
    dropIntent: null,
    dropTargetNodeId: null,
    isRootDropActive: false,
    sourceNodeIds: []
  };
}

export function clearNodeListDropTarget(state: NodeListDragState): NodeListDragState {
  return state.dropIntent === null && state.dropTargetNodeId === null && !state.isRootDropActive
    ? state
    : { ...state, dropIntent: null, dropTargetNodeId: null, isRootDropActive: false };
}

function shouldKeepNodeListDropTarget(event: ReactDragEvent<HTMLElement>) {
  const nextTarget = event.relatedTarget;
  return nextTarget instanceof Node && event.currentTarget.contains(nextTarget);
}

export function createNodeListDragLeaveHandler(
  setState: (updater: (prev: NodeListDragState) => NodeListDragState) => void
) {
  return (targetNodeId: string, event: ReactDragEvent<HTMLElement>) => {
    if (shouldKeepNodeListDropTarget(event)) {
      return;
    }
    setState((prev) => prev.dropTargetNodeId === targetNodeId
      ? clearNodeListDropTarget(prev)
      : prev);
  };
}

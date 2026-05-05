import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { isNodeInSubtree, resolveFirstChildInsertIndex } from './workspaceNodeTreeOrder';

export type NodeDropIntent = 'before' | 'after' | 'child' | 'root';

function resolveChildInsertIndex(
  nodeOrder: string[],
  targetNodeId: string,
  nodesById: Record<string, Node>
) {
  let lastIndex = -1;
  for (let index = 0; index < nodeOrder.length; index += 1) {
    const nodeId = nodeOrder[index];
    if (!nodeId) {
      continue;
    }
    if (isNodeInSubtree(nodeId, targetNodeId, nodesById)) {
      lastIndex = index;
    }
  }
  return lastIndex >= 0 ? lastIndex + 1 : nodeOrder.length;
}

function resolveAfterInsertIndex(
  nodeOrder: string[],
  targetNodeId: string,
  nodesById: Record<string, Node>
) {
  let lastIndex = -1;
  for (let index = 0; index < nodeOrder.length; index += 1) {
    const nodeId = nodeOrder[index];
    if (!nodeId) {
      continue;
    }
    if (isNodeInSubtree(nodeId, targetNodeId, nodesById)) {
      lastIndex = index;
    }
  }
  return lastIndex >= 0 ? lastIndex + 1 : nodeOrder.length;
}

export function resolveNextParentNodeId(
  intent: NodeDropIntent,
  targetNodeId: string | null,
  nodesById: Record<string, Node>
) {
  if (intent === 'root' || !targetNodeId) {
    return null;
  }
  if (intent === 'child') {
    return targetNodeId;
  }
  return nodesById[targetNodeId]?.parentNodeId ?? null;
}

export function resolveInsertIndex(
  remainingNodeOrder: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent,
  nodesById: Record<string, Node>
) {
  if (intent === 'root' || !targetNodeId) {
    return remainingNodeOrder.length;
  }
  if (intent === 'child') {
    if (targetNodeId === INBOX_NODE_ID) {
      return resolveFirstChildInsertIndex(remainingNodeOrder, targetNodeId, nodesById);
    }
    return resolveChildInsertIndex(remainingNodeOrder, targetNodeId, nodesById);
  }
  if (intent === 'before') {
    const targetIndex = remainingNodeOrder.indexOf(targetNodeId);
    return targetIndex >= 0 ? targetIndex : remainingNodeOrder.length;
  }
  return resolveAfterInsertIndex(remainingNodeOrder, targetNodeId, nodesById);
}

export function isSameNodeOrder(previous: string[], next: string[]) {
  if (previous.length !== next.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

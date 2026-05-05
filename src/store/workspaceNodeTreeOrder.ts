import type { Node } from '../features/nodes/model/nodeTypes';

import { collectNodeSubtreeIds } from './workspaceHelpers';

export function isNodeInSubtree(
  nodeId: string,
  subtreeRootId: string,
  nodesById: Record<string, Node>
) {
  let cursorId: string | null = nodeId;
  while (cursorId) {
    if (cursorId === subtreeRootId) {
      return true;
    }
    cursorId = nodesById[cursorId]?.parentNodeId ?? null;
  }
  return false;
}

export function collectOrderedSubtreeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>
) {
  const subtreeIds = new Set(collectNodeSubtreeIds(rootNodeId, nodesById));
  return nodeOrder.filter((nodeId) => subtreeIds.has(nodeId));
}

export function resolveFirstChildInsertIndex(
  nodeOrder: string[],
  targetParentId: string | null,
  nodesById: Record<string, Node>
) {
  if (!targetParentId) {
    return 0;
  }

  const firstChildIndex = nodeOrder.findIndex(
    (nodeId) => nodesById[nodeId]?.parentNodeId === targetParentId
  );
  if (firstChildIndex >= 0) {
    return firstChildIndex;
  }

  const parentIndex = nodeOrder.indexOf(targetParentId);
  return parentIndex >= 0 ? parentIndex + 1 : nodeOrder.length;
}

function resolveInsertIndex(
  nodeOrder: string[],
  targetParentId: string | null,
  nodesById: Record<string, Node>
) {
  if (!targetParentId) {
    return nodeOrder.length;
  }

  let lastIndex = -1;
  for (let index = 0; index < nodeOrder.length; index += 1) {
    const nodeId = nodeOrder[index];
    if (!nodeId) {
      continue;
    }
    if (isNodeInSubtree(nodeId, targetParentId, nodesById)) {
      lastIndex = index;
    }
  }

  return lastIndex >= 0 ? lastIndex + 1 : nodeOrder.length;
}

export function insertNodeBlockUnderParent(
  nodeOrder: string[],
  nodeIdsToInsert: string[],
  targetParentId: string | null,
  nodesById: Record<string, Node>
) {
  if (nodeIdsToInsert.length === 0) {
    return nodeOrder;
  }
  const insertSet = new Set(nodeIdsToInsert);
  const remaining = nodeOrder.filter((nodeId) => !insertSet.has(nodeId));
  const insertIndex = resolveInsertIndex(remaining, targetParentId, nodesById);
  return [
    ...remaining.slice(0, insertIndex),
    ...nodeIdsToInsert,
    ...remaining.slice(insertIndex)
  ];
}

export function insertNodeBlockAsFirstChild(
  nodeOrder: string[],
  nodeIdsToInsert: string[],
  targetParentId: string | null,
  nodesById: Record<string, Node>
) {
  if (nodeIdsToInsert.length === 0) {
    return nodeOrder;
  }
  const insertSet = new Set(nodeIdsToInsert);
  const remaining = nodeOrder.filter((nodeId) => !insertSet.has(nodeId));
  const insertIndex = resolveFirstChildInsertIndex(remaining, targetParentId, nodesById);
  return [
    ...remaining.slice(0, insertIndex),
    ...nodeIdsToInsert,
    ...remaining.slice(insertIndex)
  ];
}

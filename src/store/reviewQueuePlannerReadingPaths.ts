import type { ReviewQueueNode } from './reviewQueuePlanner';

export function resolveReviewQueueNodePathNodeIds(
  node: ReviewQueueNode,
  nodesById: Record<string, ReviewQueueNode | undefined>
) {
  const path = [node.id];
  const visitedNodeIds = new Set<string>(path);
  let currentNodeId = node.parentNodeId;

  while (currentNodeId && !visitedNodeIds.has(currentNodeId)) {
    path.unshift(currentNodeId);
    visitedNodeIds.add(currentNodeId);
    currentNodeId = nodesById[currentNodeId]?.parentNodeId ?? null;
  }

  return path;
}

export function resolveReviewQueueReadingDueAt(node: ReviewQueueNode) {
  return node.reading?.nextAt ?? node.createdAt;
}

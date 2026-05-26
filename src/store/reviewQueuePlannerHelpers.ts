import type { ReviewQueueNode } from './reviewQueuePlanner';

export function createSeededRandom(seedInput: string) {
  let hash = 2166136261;
  for (const character of seedInput) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function hasShelvedAncestor(node: ReviewQueueNode, nodesById: Record<string, ReviewQueueNode | undefined>) {
  const visitedNodeIds = new Set<string>();
  let currentNode: ReviewQueueNode | undefined = node;
  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    if (currentNode.shelvedAt) {
      return true;
    }
    visitedNodeIds.add(currentNode.id);
    currentNode = currentNode.parentNodeId ? nodesById[currentNode.parentNodeId] : undefined;
  }
  return false;
}

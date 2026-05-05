import type { Node } from '../features/nodes/model/nodeTypes';

export function normalizeWidth(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function collectNodeSubtreeIds(nodeId: string, nodesById: Record<string, Node>) {
  const ids: string[] = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || !nodesById[currentId]) {
      continue;
    }

    ids.push(currentId);
    for (const candidate of Object.values(nodesById)) {
      if (candidate.parentNodeId === currentId) {
        queue.push(candidate.id);
      }
    }
  }

  return ids;
}

export function findFallbackActiveNodeId(
  deletedParentId: string | null,
  nodeOrder: string[],
  nodesById: Record<string, Node>
): string | null {
  if (deletedParentId && nodesById[deletedParentId]) {
    return deletedParentId;
  }
  return nodeOrder[0] ?? null;
}

import type { Node } from '../features/nodes/model/nodeTypes';
import { prepareWorkspaceNodeChildrenIndex } from '../features/nodes/model/workspaceNodeChildrenIndex';

export function normalizeWidth(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function collectNodeSubtreeIds(nodeId: string, nodesById: Record<string, Node>) {
  if (!nodeId || !nodesById[nodeId]) return [];
  const index = prepareWorkspaceNodeChildrenIndex(nodesById);
  const ids: string[] = [];
  const queue = [nodeId];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const currentId = queue[cursor];
    if (!currentId || !nodesById[currentId]) {
      continue;
    }

    ids.push(currentId);
    for (const child of index.children.get(currentId) ?? []) {
      queue.push(child.id);
    }
  }

  return ids;
}

export function findFallbackActiveNodeId(
  deletedParentId: string | null,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  excludedNodeIds: ReadonlySet<string> = new Set<string>()
): string | null {
  if (deletedParentId && nodesById[deletedParentId] && !excludedNodeIds.has(deletedParentId)) {
    return deletedParentId;
  }
  const firstVisibleNodeId = nodeOrder.find((nodeId) => !excludedNodeIds.has(nodeId));
  return firstVisibleNodeId ?? null;
}

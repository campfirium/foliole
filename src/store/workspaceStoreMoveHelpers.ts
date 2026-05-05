import type { WorkspaceState } from './workspaceStore';

export function collectMoveRootIds(
  nodeIds: string[],
  nodeOrder: string[],
  nodesById: WorkspaceState['nodesById']
) {
  const selectedSet = new Set(nodeIds.filter((nodeId) => Boolean(nodesById[nodeId])));
  return nodeOrder.filter((nodeId) => {
    if (!selectedSet.has(nodeId)) {
      return false;
    }
    let cursorId = nodesById[nodeId]?.parentNodeId ?? null;
    while (cursorId) {
      if (selectedSet.has(cursorId)) {
        return false;
      }
      cursorId = nodesById[cursorId]?.parentNodeId ?? null;
    }
    return true;
  });
}

export function collectMovedNodeBlock(
  rootNodeIds: string[],
  nodeOrder: string[],
  collectOrderedSubtreeIds: (nodeId: string, nodeOrder: string[], nodesById: WorkspaceState['nodesById']) => string[],
  nodesById: WorkspaceState['nodesById']
) {
  const movedNodeIds = rootNodeIds.flatMap((nodeId) =>
    collectOrderedSubtreeIds(nodeId, nodeOrder, nodesById)
  );
  return [...new Set(movedNodeIds)];
}

import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { collectNodeSubtreeIds, findFallbackActiveNodeId } from './workspaceHelpers';
import type { WorkspaceState } from './workspaceStore';

export function collectRootDeleteTargets(
  state: WorkspaceState,
  nodeIds: string[],
  includeTrashed: boolean
) {
  const validIds = nodeIds.filter((nodeId) => {
    const node = state.nodesById[nodeId];
    if (!node || isProtectedRootNode(node)) {
      return false;
    }
    return includeTrashed ? true : !state.trashedNodeIds.includes(nodeId);
  });
  const selectedSet = new Set(validIds);
  return [...new Set(validIds)].filter((nodeId) => {
    const parentNodeId = state.nodesById[nodeId]?.parentNodeId;
    return !parentNodeId || !selectedSet.has(parentNodeId);
  });
}

export function collectDeletedNodeIds(
  targetNodeIds: string[],
  nodesById: Record<string, Node>
) {
  const deletedNodeIds = new Set<string>();
  for (const targetNodeId of targetNodeIds) {
    for (const deletedNodeId of collectNodeSubtreeIds(targetNodeId, nodesById)) {
      deletedNodeIds.add(deletedNodeId);
    }
  }
  return deletedNodeIds;
}

export function resolveFallbackFromTargets(
  targetNodeIds: string[],
  state: WorkspaceState,
  nextNodeOrder: string[],
  nextNodesById: Record<string, Node>,
  excludedNodeIds: ReadonlySet<string>
) {
  const fallbackParentId = targetNodeIds
    .map((nodeId) => state.nodesById[nodeId]?.parentNodeId ?? null)
    .find((parentNodeId) => parentNodeId && nextNodesById[parentNodeId] && !excludedNodeIds.has(parentNodeId));
  return findFallbackActiveNodeId(fallbackParentId ?? null, nextNodeOrder, nextNodesById, excludedNodeIds);
}

import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

/**
 * Child orders only re-place nodes the workspace holds. When they name a parent or child the workspace
 * lacks and the patch does not bring, the patch cannot place it, so the caller reloads the workspace.
 */
export function canPlaceChildOrders(nodesById: Record<string, unknown>, patch: WorkspaceNodeMutationPatchResult) {
  if (!patch.childOrders) return true;
  const incoming = new Set(patch.nodes.map((node) => node.nodeId));
  const known = (id: string) => incoming.has(id) || Boolean(nodesById[id]);
  return patch.childOrders.every(({ parentNodeId, childIds }) =>
    (parentNodeId === null || known(parentNodeId)) && childIds.every(known));
}

import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';

// Article projection uses the document and its direct annotation children only.
// Keep their original order and lifecycle facts for the shared normalizer.
export function scopeCompanionArticleSnapshot(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  if (!snapshot || !nodeId) return null;
  const nodesById: WorkspaceSnapshot['nodesById'] = {};
  for (const [id, node] of Object.entries(snapshot.nodesById)) {
    if (node && (id === nodeId || node.parentNodeId === nodeId)) nodesById[id] = node;
  }
  return { ...snapshot, activeNodeId: nodeId, nodeOrder: [], nodesById };
}

import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';

import { companionArticleChildIds } from './companionReadingDemand';

// Article projection uses the document and its direct annotation children only.
// Keep their original order and lifecycle facts for the shared normalizer.
export function scopeCompanionArticleSnapshot(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  if (!snapshot || !nodeId) return null;
  const nodesById: WorkspaceSnapshot['nodesById'] = {};
  for (const id of [nodeId, ...companionArticleChildIds(snapshot.nodesById, nodeId)]) {
    const node = snapshot.nodesById[id];
    if (node) nodesById[id] = node;
  }
  return { ...snapshot, activeNodeId: nodeId, nodeOrder: [], nodesById };
}

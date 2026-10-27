import { findSequentialReadingSourcesForNode } from '../../lib/core/review/sequentialReadingLookup';

import { hasUnconfirmedNodeContent } from './workspaceNodeContentVersionGuard';
import type { WorkspaceState } from './workspaceStore';
import { drainPendingNodeContentRuntimePersist } from './workspaceStoreContentRuntimePersist';

export function confirmMoveReadingContent(
  before: WorkspaceState, nextNodesById: WorkspaceState['nodesById'], rootNodeIds: string[]
) {
  const roots = new Set(rootNodeIds.flatMap((id) => [id,
    ...findSequentialReadingSourcesForNode(id, before.nodesById),
    ...findSequentialReadingSourcesForNode(id, nextNodesById)]));
  const ids = before.nodeOrder.filter((id) => {
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor && !visited.has(cursor)) {
      if (roots.has(cursor)) return true;
      visited.add(cursor);
      cursor = before.nodesById[cursor]?.parentNodeId ?? null;
    }
    return false;
  }).filter(hasUnconfirmedNodeContent);
  if (!ids.length) return true;
  return Promise.all(ids.map((id) => drainPendingNodeContentRuntimePersist(id))).then((saved) =>
    saved.every(Boolean) && ids.every((id) => !hasUnconfirmedNodeContent(id)));
}

import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { syncNodeContentToRuntime, syncRelearnNodeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createRelearnNodeAction(set: WorkspaceSet): WorkspaceState['relearnNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let relearned = false;
    let shouldSyncReviewReset = false;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node) || node.specialKind) {
        return state;
      }
      if (!isFsrsReviewItemNode(node) && !isReadingReviewItemNode(node)) {
        return state;
      }
      relearned = true;
      if (!node.review && !node.reading && !node.shelvedAt) {
        return state;
      }
      shouldSyncReviewReset = isFsrsReviewItemNode(node);
      const nextNode: Node = {
        ...node,
        review: shouldSyncReviewReset ? null : node.review,
        reading: null,
        shelvedAt: null,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (shouldSyncReviewReset) {
      syncRelearnNodeToRuntime({ nodeId });
      return relearned;
    }
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return relearned;
  };
}

import { nodeReadingSummary, nodeReviewSummary } from '../../lib/core/nodes/nodeLearningSummary';
import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { syncNodeContentToRuntime, syncRelearnNodeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createRelearnNodeAction(set: WorkspaceSet): WorkspaceState['relearnNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let relearned = false;
    let shouldSyncReviewReset = false;
    let shouldSyncNodeContent = false;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node) || node.specialKind) {
        return state;
      }
      if (!isFsrsReviewItemNode(node) && !isReadingReviewItemNode(node)) {
        return state;
      }
      relearned = true;
      if (!nodeReviewSummary(node) && !nodeReadingSummary(node) && !node.shelvedAt) {
        return state;
      }
      shouldSyncReviewReset = isFsrsReviewItemNode(node);
      shouldSyncNodeContent = Boolean(node.shelvedAt);
      const nextNode: Node = {
        ...node,
        ...(shouldSyncReviewReset ? { review: null } : {}),
        reading: null,
        shelvedAt: null,
        updatedAt: shouldSyncNodeContent ? now : node.updatedAt
      };
      nextNodeForSync = nextNode;
      localPatch = {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
      return state;
    });
    if (!relearned || !localPatch) return relearned;
    if (shouldSyncReviewReset) {
      if (!syncRelearnNodeToRuntime({ nodeId })) return false;
      set(localPatch);
      return true;
    }
    if (shouldSyncNodeContent) {
      set(localPatch);
      if (nextNodeForSync) syncNodeContentToRuntime(nextNodeForSync);
      return true;
    }
    set(localPatch);
    void saveNodeReadingStateToRuntime({ nodeId, reading: null, updatedAt: now });
    return relearned;
  };
}

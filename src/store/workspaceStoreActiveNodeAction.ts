import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
export function createWorkspaceActiveNodeAction(set: Set): WorkspaceState['setActiveNode'] {
  return nodeId => {
    if (nodeId === null) {
      set({ activeNodeId: null });
      return;
    }
    const openedAt = new Date().toISOString();
    let didOpen = false;
    set((state) => {
      if (!isCanonicalVisibleNodeId(state, nodeId)) {
        return state;
      }
      didOpen = true;
      return {
        activeNodeId: nodeId,
        reviewSession: reconcileReviewSession(state, nodeId)
      };
    });
    if (didOpen) void persistNodeOpened(set, nodeId, openedAt);
  };
}

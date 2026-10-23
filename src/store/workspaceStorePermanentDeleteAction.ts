import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesPermanentlyMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { collectDeleteActionTargets } from './workspaceTrashMutationTargets';
import { commitPermanentDeleteMutation, type TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

type WorkspaceSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function reloadAfterFailedPermanentDelete() {
  showAppRuntimeNotice('Could not delete from Trash. Please try again.', 'error');
  // Loaded lazily: the refresh scheduler imports the store this action belongs to.
  void import('./workspaceRefreshScheduler').then(({ requestWorkspaceStateRefresh }) => {
    requestWorkspaceStateRefresh('content-changed');
  });
}

/** Hides the nodes at once; the runtime removes them in the background. */
export function createDeleteNodesPermanentlyAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceState['deleteNodesPermanently'] {
  return async (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesPermanentlyMutation(state, collectDeleteActionTargets(state, nodeIds));
      return mutation ? mutation.patch : state;
    });
    const pendingMutation = mutation as DeleteNodeMutationResult | null;
    if (!pendingMutation) return;
    const result = await commitPermanentDeleteMutation(runtimeHandlers, pendingMutation);
    if (!result || result.removedNodeIds.length !== pendingMutation.nodeIds.length) {
      reloadAfterFailedPermanentDelete();
      return;
    }
    // A refresh while the runtime was still deleting may have loaded some of these nodes back.
    set((state) => computeDeleteNodesPermanentlyMutation(state, result.removedNodeIds)?.patch ?? state);
  };
}

import { resolveWorkspaceBrowseRootForTarget } from './workspaceBrowseRoot';
import type { WorkspaceState } from './workspaceStore';

export function buildReviewActiveNodeContext(
  state: WorkspaceState,
  nextActiveNodeId: string | null
) {
  const activeNodeId = nextActiveNodeId ?? state.activeNodeId;
  if (!activeNodeId) return { activeNodeId };
  return {
    activeNodeId,
    browseRootNodeId: resolveWorkspaceBrowseRootForTarget({
      browseRootNodeId: state.browseRootNodeId,
      intent: 'target-context',
      nodesById: state.nodesById,
      targetNodeId: activeNodeId,
      trashedNodeIds: state.trashedNodeIds
    })
  };
}

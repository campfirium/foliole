import { resolveWorkspaceBrowseRootForTarget } from './workspaceBrowseRoot';
import type { WorkspaceState } from './workspaceStore';

export function resolveReviewActiveBrowseRootNodeId(args: {
  activeNodeId: string;
  browseRootNodeId: string;
  nodesById: WorkspaceState['nodesById'];
  trashedNodeIds: string[];
}) {
  return resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: args.browseRootNodeId,
    intent: 'target-context',
    nodesById: args.nodesById,
    targetNodeId: args.activeNodeId,
    trashedNodeIds: args.trashedNodeIds
  });
}

export function buildReviewActiveNodeContext(
  state: WorkspaceState,
  nextActiveNodeId: string | null
) {
  const activeNodeId = nextActiveNodeId ?? state.activeNodeId;
  if (!activeNodeId) return { activeNodeId };
  return {
    activeNodeId,
    browseRootNodeId: resolveReviewActiveBrowseRootNodeId({
      activeNodeId,
      browseRootNodeId: state.browseRootNodeId,
      nodesById: state.nodesById,
      trashedNodeIds: state.trashedNodeIds
    })
  };
}

import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import type { WorkspaceState } from './workspaceStore';

export const RECENT_RENDERER_BOUNDARY_NODE_LIMIT = 2;

function appendRecentKeepNodeId(
  keepNodeIds: readonly string[],
  nodeId: string | null,
  limit = RECENT_RENDERER_BOUNDARY_NODE_LIMIT
) {
  if (!nodeId) {
    return keepNodeIds.slice(0, limit);
  }
  return [nodeId, ...keepNodeIds.filter((keepNodeId) => keepNodeId !== nodeId)].slice(0, limit);
}

export function resolveRendererBoundaryKeepNodeIds(
  state: WorkspaceState | Partial<WorkspaceState>,
  currentState: WorkspaceState
) {
  if ('activeNodeId' in state && state.activeNodeId !== currentState.activeNodeId) {
    return appendRecentKeepNodeId(
      currentState.rendererBoundaryKeepNodeIds.filter((nodeId) => nodeId !== state.activeNodeId),
      currentState.activeNodeId
    );
  }

  if ('rendererBoundaryKeepNodeIds' in state) {
    return (state.rendererBoundaryKeepNodeIds ?? currentState.rendererBoundaryKeepNodeIds).slice(
      0,
      RECENT_RENDERER_BOUNDARY_NODE_LIMIT
    );
  }

  return currentState.rendererBoundaryKeepNodeIds;
}

export function collectRendererBoundaryKeepNodeIds(
  state: WorkspaceState | Partial<WorkspaceState>,
  currentState: WorkspaceState
) {
  const keepNodeIds = new Set(listPendingNodeSyncNodeIds());
  const rendererBoundaryKeepNodeIds = resolveRendererBoundaryKeepNodeIds(state, currentState);

  for (const nodeId of rendererBoundaryKeepNodeIds) {
    keepNodeIds.add(nodeId);
  }

  return keepNodeIds;
}

import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import type { WorkspaceState } from './workspaceStore';

export const RECENT_RENDERER_BOUNDARY_NODE_LIMIT = 2;

export function resolveRendererBoundaryKeepNodeIds(
  state: WorkspaceState | Partial<WorkspaceState>,
  currentState: WorkspaceState
) {
  if ('activeNodeId' in state && state.activeNodeId !== currentState.activeNodeId) {
    const requestedKeepNodeIds = 'rendererBoundaryKeepNodeIds' in state
      ? state.rendererBoundaryKeepNodeIds ?? currentState.rendererBoundaryKeepNodeIds
      : currentState.rendererBoundaryKeepNodeIds;
    return requestedKeepNodeIds
      .filter((nodeId) => nodeId !== currentState.activeNodeId && nodeId !== state.activeNodeId)
      .slice(0, RECENT_RENDERER_BOUNDARY_NODE_LIMIT);
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

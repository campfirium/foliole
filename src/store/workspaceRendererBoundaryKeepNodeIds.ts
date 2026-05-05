import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import type { WorkspaceState } from './workspaceStore';

export function resolveRendererBoundaryKeepNodeIds(
  state: WorkspaceState | Partial<WorkspaceState>,
  currentState: WorkspaceState
) {
  if ('activeNodeId' in state && state.activeNodeId !== currentState.activeNodeId) {
    return currentState.activeNodeId ? [currentState.activeNodeId] : [];
  }

  if ('rendererBoundaryKeepNodeIds' in state) {
    return state.rendererBoundaryKeepNodeIds ?? currentState.rendererBoundaryKeepNodeIds;
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

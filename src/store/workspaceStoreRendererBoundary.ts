import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import {
  collectRendererBoundaryKeepNodeIds,
  resolveRendererBoundaryKeepNodeIds
} from './workspaceRendererBoundaryKeepNodeIds';
import type { WorkspaceState } from './workspaceStore';

export function withWorkspaceRendererBoundary(
  state: WorkspaceState | Partial<WorkspaceState>,
  currentState: WorkspaceState
) {
  const nextRendererBoundaryKeepNodeIds = resolveRendererBoundaryKeepNodeIds(state, currentState);
  const nextState =
    'rendererBoundaryKeepNodeIds' in state
      ? state
      : { ...state, rendererBoundaryKeepNodeIds: nextRendererBoundaryKeepNodeIds };

  return enforceWorkspaceRendererBoundary(
    nextState,
    currentState,
    collectRendererBoundaryKeepNodeIds(nextState, currentState)
  );
}

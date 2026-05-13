import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import {
  collectRendererBoundaryKeepNodeIds,
  resolveRendererBoundaryKeepNodeIds
} from './workspaceRendererBoundaryKeepNodeIds';
import type { WorkspaceState } from './workspaceStore';

export function withWorkspaceRendererBoundary<T extends WorkspaceState | Partial<WorkspaceState>>(
  state: T,
  currentState: WorkspaceState
): T {
  const nextRendererBoundaryKeepNodeIds = resolveRendererBoundaryKeepNodeIds(state, currentState);
  const nextState =
    'rendererBoundaryKeepNodeIds' in state
      ? state
      : { ...state, rendererBoundaryKeepNodeIds: nextRendererBoundaryKeepNodeIds };

  return enforceWorkspaceRendererBoundary(
    nextState,
    currentState,
    collectRendererBoundaryKeepNodeIds(nextState, currentState)
  ) as T;
}

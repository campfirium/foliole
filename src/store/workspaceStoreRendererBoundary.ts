import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

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

  if (!hasWorkspaceRuntimeRepository()) {
    return nextState as T;
  }

  return enforceWorkspaceRendererBoundary(
    nextState,
    currentState,
    collectRendererBoundaryKeepNodeIds(nextState, currentState)
  ) as T;
}

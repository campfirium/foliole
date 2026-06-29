import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import {
  collectRendererBoundaryKeepNodeIds,
  resolveRendererBoundaryKeepNodeIds
} from './workspaceRendererBoundaryKeepNodeIds';
import type { WorkspaceState } from './workspaceStore';

function withWorkspaceSpecialRoots<T extends WorkspaceState | Partial<WorkspaceState>>(
  state: T,
  currentState: WorkspaceState
): T {
  if (!('nodeOrder' in state) && !('nodesById' in state) && !('trashedNodeIds' in state)) {
    return state;
  }
  return {
    ...state,
    ...ensureInboxNodeInSnapshot({
      activeNodeId: 'activeNodeId' in state ? state.activeNodeId ?? null : currentState.activeNodeId,
      nodeOrder: 'nodeOrder' in state ? state.nodeOrder ?? [] : currentState.nodeOrder,
      nodesById: 'nodesById' in state ? state.nodesById ?? {} : currentState.nodesById,
      trashedNodeIds: 'trashedNodeIds' in state ? state.trashedNodeIds ?? [] : currentState.trashedNodeIds
    })
  };
}

export function withWorkspaceRendererBoundary<T extends WorkspaceState | Partial<WorkspaceState>>(
  state: T,
  currentState: WorkspaceState
): T {
  const normalizedState = withWorkspaceSpecialRoots(state, currentState);
  const nextRendererBoundaryKeepNodeIds = resolveRendererBoundaryKeepNodeIds(normalizedState, currentState);
  const nextState =
    'rendererBoundaryKeepNodeIds' in normalizedState
      ? normalizedState
      : { ...normalizedState, rendererBoundaryKeepNodeIds: nextRendererBoundaryKeepNodeIds };

  if (!hasWorkspaceRuntimeRepository()) {
    return nextState as T;
  }

  return enforceWorkspaceRendererBoundary(
    nextState,
    currentState,
    collectRendererBoundaryKeepNodeIds(nextState, currentState)
  ) as T;
}

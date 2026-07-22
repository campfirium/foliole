import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { resolveWorkspaceBrowseRootNodeId } from './workspaceBrowseRoot';
import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import {
  collectRendererBoundaryKeepNodeIds,
  resolveRendererBoundaryKeepNodeIds
} from './workspaceRendererBoundaryKeepNodeIds';
import { resolveReviewActiveBrowseRootNodeId } from './workspaceReviewBrowseRoot';
import type { WorkspaceState } from './workspaceStore';

function resolveVisibleActiveNodeId<T extends WorkspaceState | Partial<WorkspaceState>>(
  state: T,
  currentState: WorkspaceState
) {
  const activeNodeId = 'activeNodeId' in state ? state.activeNodeId ?? null : currentState.activeNodeId;
  if (!activeNodeId) {
    return null;
  }
  const source = {
    nodeOrder: 'nodeOrder' in state ? state.nodeOrder ?? [] : currentState.nodeOrder,
    nodesById: 'nodesById' in state ? state.nodesById ?? {} : currentState.nodesById,
    trashedNodeDeletedAtById:
      'trashedNodeDeletedAtById' in state
        ? state.trashedNodeDeletedAtById ?? {}
        : currentState.trashedNodeDeletedAtById,
    trashedNodeIds: 'trashedNodeIds' in state ? state.trashedNodeIds ?? [] : currentState.trashedNodeIds
  };
  if (isCanonicalVisibleNodeId(source, activeNodeId)) {
    return activeNodeId;
  }
  return currentState.activeNodeId && isCanonicalVisibleNodeId(currentState, currentState.activeNodeId)
    ? currentState.activeNodeId
    : null;
}

function withWorkspaceSpecialRoots<T extends WorkspaceState | Partial<WorkspaceState>>(
  state: T,
  currentState: WorkspaceState
): T {
  if (!('activeNodeId' in state) && !('browseRootNodeId' in state) && !('nodeOrder' in state) && !('nodesById' in state) && !('reviewSession' in state) && !('trashedNodeIds' in state)) {
    return state;
  }
  const normalized = ensureInboxNodeInSnapshot({
    activeNodeId: resolveVisibleActiveNodeId(state, currentState),
    nodeOrder: 'nodeOrder' in state ? state.nodeOrder ?? [] : currentState.nodeOrder,
    nodesById: 'nodesById' in state ? state.nodesById ?? {} : currentState.nodesById,
    trashedNodeIds: 'trashedNodeIds' in state ? state.trashedNodeIds ?? [] : currentState.trashedNodeIds
  });
  const browseRootNodeId = resolveWorkspaceBrowseRootNodeId({
    browseRootNodeId: 'browseRootNodeId' in state
      ? state.browseRootNodeId
      : currentState.browseRootNodeId,
    nodesById: normalized.nodesById,
    trashedNodeIds: normalized.trashedNodeIds
  });
  const reviewSession = 'reviewSession' in state
    ? state.reviewSession ?? currentState.reviewSession
    : currentState.reviewSession;
  const alignedBrowseRootNodeId = normalized.activeNodeId && normalized.activeNodeId === reviewSession.currentNodeId
    ? resolveReviewActiveBrowseRootNodeId({
        activeNodeId: normalized.activeNodeId,
        browseRootNodeId,
        nodesById: normalized.nodesById,
        trashedNodeIds: normalized.trashedNodeIds
      })
    : browseRootNodeId;
  return {
    ...state,
    ...normalized,
    browseRootNodeId: alignedBrowseRootNodeId
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

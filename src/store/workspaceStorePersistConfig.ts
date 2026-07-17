import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { resolveWorkspaceSnapshotActiveNodeId } from '../../lib/core/database/workspaceSnapshotContract';
import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { resolveWorkspaceBrowseRootNodeId } from './workspaceBrowseRoot';
import { mergeHydratedWorkspaceMembership } from './workspaceHydrateObjectMerge';
import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import { workspacePersistStorage } from './workspacePersistStorage';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { collectRendererBoundaryKeepNodeIds } from './workspaceRendererBoundaryKeepNodeIds';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStore';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

function canKeepCurrentActiveNode(current: WorkspaceState, next: WorkspaceState) {
  const normalizedNext = ensureInboxNodeInSnapshot({
    activeNodeId: next.activeNodeId,
    nodeOrder: next.nodeOrder,
    nodesById: next.nodesById,
    trashedNodeIds: next.trashedNodeIds
  });
  return current.isHydrated &&
    resolveWorkspaceSnapshotActiveNodeId({
      activeNodeId: current.activeNodeId,
      nodeOrder: normalizedNext.nodeOrder,
      nodesById: normalizedNext.nodesById
    }) === current.activeNodeId;
}

function resolveMergedActiveNodeId(current: WorkspaceState, next: WorkspaceState) {
  return canKeepCurrentActiveNode(current, next) ? current.activeNodeId : next.activeNodeId;
}

function toPersistedReviewSession(reviewSession: WorkspaceState['reviewSession']) {
  const persistedReviewSession = { ...reviewSession };
  delete persistedReviewSession.soonNodeIds;
  return persistedReviewSession;
}

function partializeWorkspaceState(state: WorkspaceState): WorkspacePersistedState {
  const nodesById = hasWorkspaceRuntimeRepository()
    ? trimWorkspaceNodesForRendererBoundary(
        state.activeNodeId,
        state.nodesById,
        collectRendererBoundaryKeepNodeIds(state, state)
      )
    : state.nodesById;

  return {
    activeNodeId: state.activeNodeId,
    browseRootNodeId: state.browseRootNodeId,
    capturedWorkspaceVersion: state.capturedWorkspaceVersion,
    layout: state.layout,
    nodeViewById: state.nodeViewById,
    nodeOrder: state.nodeOrder,
    nodesById,
    rendererBoundaryKeepNodeIds: state.rendererBoundaryKeepNodeIds,
    reviewSession: toPersistedReviewSession(state.reviewSession),
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds,
    untitledSequenceByParent: state.untitledSequenceByParent
  };
}

export function createWorkspaceStorePersistConfig(
  onHydrated: (error?: unknown) => void
): PersistOptions<WorkspaceState, WorkspacePersistedState> {
  return {
    name: 'foliole-workspace-v1',
    skipHydration: true,
    storage: createJSONStorage<WorkspacePersistedState>(() => workspacePersistStorage),
    partialize: partializeWorkspaceState,
    merge: (persistedState, current) => {
      const persisted = parsePersistedWorkspaceState(persistedState);
      const nextState = {
        ...current,
        ...persisted,
        ...mergeHydratedWorkspaceMembership(current, persisted),
        isHydrated: current.isHydrated,
        layout: {
          ...current.layout,
          ...persisted.layout
        },
        nodeViewById: persisted.nodeViewById ?? current.nodeViewById,
        rendererBoundaryKeepNodeIds: persisted.rendererBoundaryKeepNodeIds ?? current.rendererBoundaryKeepNodeIds,
        reviewSession: persisted.reviewSession ?? current.reviewSession,
        untitledSequenceByParent:
          persisted.untitledSequenceByParent ?? current.untitledSequenceByParent
      };
      const nextWorkspaceState: WorkspaceState = {
        ...nextState,
        browseRootNodeId: resolveWorkspaceBrowseRootNodeId({
          browseRootNodeId: persisted.browseRootNodeId ?? current.browseRootNodeId,
          nodesById: nextState.nodesById,
          trashedNodeIds: nextState.trashedNodeIds
        }),
        ...ensureInboxNodeInSnapshot({
          activeNodeId: resolveMergedActiveNodeId(current, nextState),
          nodeOrder: nextState.nodeOrder,
          nodesById: nextState.nodesById,
          trashedNodeIds: nextState.trashedNodeIds
        })
      };
      return withWorkspaceRendererBoundary({
        ...nextWorkspaceState,
        reviewSession: persisted.reviewSession
          ? reconcileReviewSession(nextWorkspaceState)
          : nextWorkspaceState.reviewSession
      }, current);
    },
    onRehydrateStorage: () => (_state: unknown, error?: unknown) => {
      onHydrated(error);
    }
  };
}

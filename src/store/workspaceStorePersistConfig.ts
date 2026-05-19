import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';

import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import { workspacePersistStorage } from './workspacePersistStorage';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { collectRendererBoundaryKeepNodeIds } from './workspaceRendererBoundaryKeepNodeIds';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStore';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

function canKeepCurrentActiveNode(current: WorkspaceState, next: WorkspaceState) {
  return Boolean(
    current.isHydrated &&
      current.activeNodeId &&
      next.nodesById[current.activeNodeId] &&
      !next.trashedNodeIds.includes(current.activeNodeId)
  );
}

function resolveMergedActiveNodeId(current: WorkspaceState, next: WorkspaceState) {
  return canKeepCurrentActiveNode(current, next) ? current.activeNodeId : next.activeNodeId;
}

function partializeWorkspaceState(state: WorkspaceState): WorkspacePersistedState {
  return {
    activeNodeId: state.activeNodeId,
    layout: state.layout,
    nodeViewById: state.nodeViewById,
    nodeOrder: state.nodeOrder,
    nodesById: trimWorkspaceNodesForRendererBoundary(
      state.activeNodeId,
      state.nodesById,
      collectRendererBoundaryKeepNodeIds(state, state)
    ),
    reviewSession: state.reviewSession,
    reviewSessionMode: state.reviewSessionMode,
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
        isHydrated: current.isHydrated,
        layout: {
          ...current.layout,
          ...persisted.layout
        },
        nodeViewById: persisted.nodeViewById ?? current.nodeViewById,
        reviewSession: persisted.reviewSession ?? current.reviewSession,
        reviewSessionMode: persisted.reviewSessionMode ?? current.reviewSessionMode,
        trashedNodeDeletedAtById: persisted.trashedNodeDeletedAtById ?? current.trashedNodeDeletedAtById,
        untitledSequenceByParent:
          persisted.untitledSequenceByParent ?? current.untitledSequenceByParent
      };
      const nextWorkspaceState: WorkspaceState = {
        ...nextState,
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

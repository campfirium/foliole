import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';

import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import { workspacePersistStorage } from './workspacePersistStorage';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { collectRendererBoundaryKeepNodeIds } from './workspaceRendererBoundaryKeepNodeIds';
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

export function createWorkspaceStorePersistConfig(
  onHydrated: (error?: unknown) => void
): PersistOptions<WorkspaceState, WorkspacePersistedState> {
  return {
    name: 'foliole-workspace-v1',
    skipHydration: true,
    storage: createJSONStorage<WorkspacePersistedState>(() => workspacePersistStorage),
    partialize: (state: WorkspaceState): WorkspacePersistedState => ({
      activeNodeId: state.activeNodeId,
      layout: state.layout,
      nodeViewById: state.nodeViewById,
      nodeOrder: state.nodeOrder,
      nodesById: trimWorkspaceNodesForRendererBoundary(
        state.activeNodeId,
        state.nodesById,
        collectRendererBoundaryKeepNodeIds(state, state)
      ),
      trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
      trashedNodeIds: state.trashedNodeIds,
      untitledSequenceByParent: state.untitledSequenceByParent
    }),
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
      return withWorkspaceRendererBoundary(nextWorkspaceState, current);
    },
    onRehydrateStorage: () => (_state: unknown, error?: unknown) => {
      onHydrated(error);
    }
  };
}

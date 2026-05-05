import { createJSONStorage } from 'zustand/middleware';

import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';

import { workspacePersistStorage } from './workspacePersistStorage';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { collectRendererBoundaryKeepNodeIds } from './workspaceRendererBoundaryKeepNodeIds';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStore';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

export function createWorkspaceStorePersistConfig(
  onHydrated: (error?: unknown) => void
) {
  return {
    name: 'foliole-workspace-v1',
    skipHydration: true,
    storage: createJSONStorage(() => workspacePersistStorage),
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
    merge: (persistedState: unknown, currentState: unknown) => {
      const persisted = (persistedState ?? {}) as Partial<WorkspacePersistedState>;
      const current = currentState as WorkspaceState;
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
      return withWorkspaceRendererBoundary(
        {
          ...nextState,
          ...ensureInboxNodeInSnapshot({
            activeNodeId: nextState.activeNodeId,
            nodeOrder: nextState.nodeOrder,
            nodesById: nextState.nodesById,
            trashedNodeIds: nextState.trashedNodeIds
          })
        },
        current
      ) as WorkspaceState;
    },
    onRehydrateStorage: () => (_state: unknown, error?: unknown) => {
      onHydrated(error);
    }
  };
}

import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function normalizeNodeViewState(viewState: WorkspaceState['nodeViewById'][string]) {
  if (!viewState) {
    return null;
  }
  return {
    scrollTop: Math.max(0, viewState.scrollTop),
    selection: {
      from: Math.max(0, viewState.selection.from),
      to: Math.max(0, viewState.selection.to)
    }
  };
}

function hasSameNodeViewState(
  previousViewState: WorkspaceState['nodeViewById'][string],
  nextViewState: NonNullable<WorkspaceState['nodeViewById'][string]>
) {
  if (!previousViewState) {
    return false;
  }
  return (
    previousViewState.scrollTop === nextViewState.scrollTop &&
    previousViewState.selection.from === nextViewState.selection.from &&
    previousViewState.selection.to === nextViewState.selection.to
  );
}

export function createSetNodeViewStateAction(set: WorkspaceSet): WorkspaceState['setNodeViewState'] {
  return (nodeId, viewState) => {
    set((state) => {
      if (!state.nodesById[nodeId]) {
        return state;
      }
      const normalizedViewState = normalizeNodeViewState(viewState);
      if (!normalizedViewState || hasSameNodeViewState(state.nodeViewById[nodeId], normalizedViewState)) {
        return state;
      }
      return {
        nodeViewById: {
          ...state.nodeViewById,
          [nodeId]: normalizedViewState
        }
      };
    });
  };
}

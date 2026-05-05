import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createSetNodeViewStateAction(set: WorkspaceSet): WorkspaceState['setNodeViewState'] {
  return (nodeId, viewState) => {
    set((state) => {
      if (!state.nodesById[nodeId]) {
        return state;
      }
      return {
        nodeViewById: {
          ...state.nodeViewById,
          [nodeId]: {
            scrollTop: Math.max(0, viewState.scrollTop),
            selection: {
              from: Math.max(0, viewState.selection.from),
              to: Math.max(0, viewState.selection.to)
            }
          }
        }
      };
    });
  };
}

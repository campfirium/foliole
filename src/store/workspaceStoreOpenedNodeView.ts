import type { WorkspaceState } from './workspaceStore';

export function markNodeOpenedViewState(
  state: WorkspaceState,
  nodeId: string,
  now = new Date()
): WorkspaceState['nodeViewById'] {
  const currentViewState = state.nodeViewById[nodeId];
  const nextUpdatedAt = now.toISOString();
  if (currentViewState?.updatedAt === nextUpdatedAt) {
    return state.nodeViewById;
  }
  return {
    ...state.nodeViewById,
    [nodeId]: {
      scrollTop: Math.max(0, currentViewState?.scrollTop ?? 0),
      selection: currentViewState?.selection
        ? {
            from: Math.max(0, currentViewState.selection.from),
            to: Math.max(0, currentViewState.selection.to)
          }
        : null,
      updatedAt: nextUpdatedAt
    }
  };
}

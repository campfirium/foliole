import { useWorkspaceStore } from '../../store/workspaceStore';

import type { WorkspaceDebugApi } from './workspaceDebugBridgeTypes';

export function getWorkspaceStructureHistory(): ReturnType<WorkspaceDebugApi['getWorkspaceStructureHistory']> {
  const history = useWorkspaceStore.getState().appActionHistory;
  const summarize = ({ id, type }: { id: string; type: string }) => ({ id, type });
  return {
    pendingCreate: history.pendingCreate ? summarize(history.pendingCreate.entry) : null,
    redoStack: history.redoStack.map(summarize),
    undoStack: history.undoStack.map(summarize)
  };
}

export function getWorkspaceStructureState(): ReturnType<WorkspaceDebugApi['getWorkspaceStructureState']> {
  const state = useWorkspaceStore.getState();
  return { browseRootNodeId: state.browseRootNodeId, nodeOrder: [...state.nodeOrder] };
}

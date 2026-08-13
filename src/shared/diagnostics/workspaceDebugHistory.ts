import { useWorkspaceStore } from '../../store/workspaceStore';

export interface WorkspaceDebugOperationHistory {
  invalidations: Array<{ nodeId: string; reason: string }>;
  redoStack: Array<{ nodeId?: string; type: string }>;
  undoStack: Array<{ nodeId?: string; type: string }>;
}

function toDebugOperationEntry(entry: { nodeId?: string; type: string }) {
  return {
    ...('nodeId' in entry ? { nodeId: entry.nodeId } : {}),
    type: entry.type
  };
}

export function getEditorOperationHistory(): WorkspaceDebugOperationHistory {
  const state = useWorkspaceStore.getState();
  const history = state.editorOperationHistory;
  const session = state.activeNodeId ? history.sessionsByNodeId[state.activeNodeId] : undefined;
  return {
    invalidations: history.invalidations,
    redoStack: (session?.redoStack ?? []).map(toDebugOperationEntry),
    undoStack: (session?.undoStack ?? []).map(toDebugOperationEntry)
  };
}

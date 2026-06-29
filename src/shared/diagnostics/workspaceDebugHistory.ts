import { useWorkspaceStore } from '../../store/workspaceStore';

export interface WorkspaceDebugOperationHistory {
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
  const history = useWorkspaceStore.getState().editorOperationHistory;
  return {
    redoStack: history.redoStack.map(toDebugOperationEntry),
    undoStack: history.undoStack.map(toDebugOperationEntry)
  };
}

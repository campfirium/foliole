import { moveEditorOperationEntry, type EditorOperationHistoryEntry } from '../features/editor/model/editorOperationHistory';

import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export function applyWorkspaceTextHistory(args: {
  context?: EditorOperationApplyContext;
  entry: Extract<EditorOperationHistoryEntry, { type: 'text.edit' }>;
  mode: 'redo' | 'undo';
  nodeId: string;
  set: WorkspaceSet;
}) {
  const currentContent = args.context?.getCurrentContent?.() ?? args.context?.currentContent;
  if (!args.context || args.context.nodeId !== args.nodeId ||
    !args.entry.nativeState || currentContent !== args.entry.nativeState.doc.toString()) {
    return false;
  }
  const applied = args.context.applyText(args.entry, args.mode);
  if (!applied) {
    return false;
  }
  args.set((state) => ({
    editorOperationHistory: moveEditorOperationEntry(state.editorOperationHistory, args.nodeId, args.mode,
      typeof applied === 'object' ? applied.nativeState : undefined)
  }));
  return true;
}

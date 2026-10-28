import { digestEditorContent } from '../features/editor/model/editorContentDigest';
import { moveEditorOperationEntry, type EditorOperationHistoryEntry } from '../features/editor/model/editorOperationHistory';

import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

function expectedTextContent(entry: Extract<EditorOperationHistoryEntry, { type: 'text.edit' }>, mode: 'redo' | 'undo') {
  return mode === 'undo' ? entry.afterDigest : entry.beforeDigest;
}

export function applyWorkspaceTextHistory(args: {
  context?: EditorOperationApplyContext;
  entry: Extract<EditorOperationHistoryEntry, { type: 'text.edit' }>;
  mode: 'redo' | 'undo';
  nodeId: string;
  set: WorkspaceSet;
}) {
  const currentContent = args.context?.getCurrentContent?.() ?? args.context?.currentContent;
  if (!args.context || args.context.nodeId !== args.nodeId ||
    digestEditorContent(currentContent ?? '') !== expectedTextContent(args.entry, args.mode)) {
    return false;
  }
  if (!args.context.applyText(args.entry, args.mode)) {
    return false;
  }
  args.set((state) => ({
    editorOperationHistory: moveEditorOperationEntry(state.editorOperationHistory, args.nodeId, args.mode)
  }));
  return true;
}

import {
  getEditorOperationRedoTitle,
  getEditorOperationTopEntry,
  getEditorOperationUndoTitle,
  type EditorOperationHistoryState
} from '../features/editor/model/editorOperationHistory';
import type { Translate } from '../shared/localization/LocalizationProvider';

import { getWorkspaceRedoTitle, getWorkspaceUndoTitle, type WorkspaceActionHistoryState } from './workspaceActionHistory';
import { getApplicationHistoryTarget } from './workspaceApplicationHistory';
import { resolveWorkspaceHistoryCommand, type HistoryCommandMode } from './workspaceHistoryCommandState';
import type { WorkspaceState } from './workspaceStore';
import type { EditorOperationApplyContext } from './workspaceStoreTypes';
import {
  getUndoRouterContentContext,
  getUndoRouterContentDocumentId,
  getUndoRouterOwner,
  resolveUndoCommandTarget,
  type UndoCommandTarget
} from './workspaceUndoRouter';

export function getHistoryCommandState(args: {
  appActionHistory: WorkspaceActionHistoryState;
  editorOperationHistory: EditorOperationHistoryState;
  mode: HistoryCommandMode;
  target: UndoCommandTarget;
  t: Translate;
}) {
  const { mode, target, t } = args;
  const application = args.appActionHistory.application;
  if (application) {
    const operation = getApplicationHistoryTarget(application, mode);
    const entry = operation?.entry;
    const title = !entry ? undefined : operation?.domain === 'workspace' ? entry.title :
      t(entry.type === 'text.edit' ? 'desktop.command.editorOperation.editText' :
        entry.type === 'annotation.create' ? 'desktop.command.editorOperation.createAnnotation' : 'desktop.command.editorOperation.deleteAnnotation');
    return { enabled: Boolean(operation && !operation.blocked),
      title: title ? t(mode === 'undo' ? 'desktop.command.undoOperation' : 'desktop.command.redoOperation', { operation: title })
        : t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo') };
  }
  if (target.owner === 'workspace') {
    return {
      enabled: Boolean(resolveWorkspaceHistoryCommand(args.appActionHistory, mode)),
      title: (mode === 'undo' ? getWorkspaceUndoTitle : getWorkspaceRedoTitle)(args.appActionHistory, t)
    };
  }
  const entry = getEditorOperationTopEntry(args.editorOperationHistory, target.documentId, mode);
  return {
    enabled: Boolean(entry && (entry.type === 'text.edit' || !entry.applyingMode)),
    title: (mode === 'undo' ? getEditorOperationUndoTitle : getEditorOperationRedoTitle)(
      args.editorOperationHistory, target.documentId, t
    )
  };
}

export function createHistoryCommands(args: {
  flushPendingEditorDraft?: () => boolean;
  getEditorOperationContext: () => EditorOperationApplyContext | undefined;
  ws: Pick<WorkspaceState, 'redoEditorOperation' | 'redoWorkspaceAction' | 'undoEditorOperation' | 'undoWorkspaceAction'> &
    Partial<Pick<WorkspaceState, 'appActionHistory' | 'undoApplicationOperation' | 'redoApplicationOperation'>>;
}) {
  const execute = (mode: HistoryCommandMode) => {
    if (args.ws.appActionHistory?.application) {
      args.flushPendingEditorDraft?.();
      const context = getUndoRouterContentContext(args.getEditorOperationContext());
      return (mode === 'undo' ? args.ws.undoApplicationOperation : args.ws.redoApplicationOperation)?.(context) ?? false;
    }
    const owner = getUndoRouterOwner();
    const fallback = owner === 'content' ? args.getEditorOperationContext() : undefined;
    const target = resolveUndoCommandTarget(owner, getUndoRouterContentDocumentId(), fallback?.nodeId ?? null);
    if (target.owner === 'content') {
      const context = getUndoRouterContentContext(fallback);
      if (target.documentId && context?.nodeId !== target.documentId) return false;
      return mode === 'undo' ? args.ws.undoEditorOperation(context) : args.ws.redoEditorOperation(context);
    }
    args.flushPendingEditorDraft?.();
    return mode === 'undo' ? args.ws.undoWorkspaceAction() : args.ws.redoWorkspaceAction();
  };
  return { undo: () => execute('undo'), redo: () => execute('redo') };
}

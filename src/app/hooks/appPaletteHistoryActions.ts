import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';

import type { useWorkspaceSelectors } from './appControllerState';
import {
  getUndoRouterContentContext,
  getUndoRouterContentDocumentId,
  getUndoRouterOwner
} from './undoRouter';

function resolveContentContext(fallback: EditorOperationApplyContext | undefined) {
  const context = getUndoRouterContentContext(fallback);
  return getUndoRouterContentDocumentId() && !context ? null : context;
}

export function createPaletteHistoryActions(args: {
  flushPendingEditorDraft?: () => boolean;
  getEditorOperationContext: () => EditorOperationApplyContext | undefined;
  ws: Pick<
    ReturnType<typeof useWorkspaceSelectors>,
    'redoEditorOperation' | 'redoWorkspaceAction' | 'undoEditorOperation' | 'undoWorkspaceAction'
  >;
}) {
  const flushEditorDraft = () => {
    args.flushPendingEditorDraft?.();
  };
  return {
    redoWorkspaceAction: () => {
      if (getUndoRouterOwner() === 'content') {
        const context = resolveContentContext(args.getEditorOperationContext());
        return context === null ? false : args.ws.redoEditorOperation(context);
      }
      flushEditorDraft();
      return args.ws.redoWorkspaceAction();
    },
    undoWorkspaceAction: () => {
      if (getUndoRouterOwner() === 'content') {
        const context = resolveContentContext(args.getEditorOperationContext());
        return context === null ? false : args.ws.undoEditorOperation(context);
      }
      flushEditorDraft();
      return args.ws.undoWorkspaceAction();
    }
  };
}

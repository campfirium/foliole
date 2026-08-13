import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';

import type { useWorkspaceSelectors } from './appControllerState';
import { getUndoRouterOwner } from './undoRouter';

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
        return args.ws.redoEditorOperation(args.getEditorOperationContext());
      }
      flushEditorDraft();
      return args.ws.redoWorkspaceAction();
    },
    undoWorkspaceAction: () => {
      if (getUndoRouterOwner() === 'content') {
        return args.ws.undoEditorOperation(args.getEditorOperationContext());
      }
      flushEditorDraft();
      return args.ws.undoWorkspaceAction();
    }
  };
}

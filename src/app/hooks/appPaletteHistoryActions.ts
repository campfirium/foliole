import type { useWorkspaceSelectors } from './appControllerState';

export function createPaletteHistoryActions(args: {
  flushPendingEditorDraft?: () => boolean;
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
      flushEditorDraft();
      return args.ws.redoEditorOperation() || args.ws.redoWorkspaceAction();
    },
    undoWorkspaceAction: () => {
      flushEditorDraft();
      return args.ws.undoEditorOperation() || args.ws.undoWorkspaceAction();
    }
  };
}

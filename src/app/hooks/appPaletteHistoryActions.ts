import type { useWorkspaceSelectors } from './appControllerState';

export function createPaletteHistoryActions(args: {
  ws: Pick<
    ReturnType<typeof useWorkspaceSelectors>,
    'redoEditorOperation' | 'redoWorkspaceAction' | 'undoEditorOperation' | 'undoWorkspaceAction'
  >;
}) {
  return {
    redoWorkspaceAction: () => args.ws.redoEditorOperation() || args.ws.redoWorkspaceAction(),
    undoWorkspaceAction: () => args.ws.undoEditorOperation() || args.ws.undoWorkspaceAction()
  };
}

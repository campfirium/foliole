import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

export function createSelectionAnnotationPaletteActions(args: {
  layoutProps: WorkspaceLayoutProps;
}) {
  return {
    addSelectionNote: args.layoutProps.editorCommands.onOpenSelectionNote,
    createSelectionCloze: args.layoutProps.editorCommands.onCreateCloze,
    createSelectionHighlight: args.layoutProps.editorCommands.onCreateHighlight
  };
}

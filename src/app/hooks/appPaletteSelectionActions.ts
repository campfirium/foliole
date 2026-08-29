import { requestActivePdfSelectionAnnotation } from '../components/pdfSurfaceRegistration';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

export function createSelectionAnnotationPaletteActions(args: {
  layoutProps: WorkspaceLayoutProps;
}) {
  const run = (kind: 'cloze' | 'highlight' | 'note', fallback: () => void) => () => {
    if (!requestActivePdfSelectionAnnotation(kind)) fallback();
  };
  return {
    addSelectionNote: run('note', args.layoutProps.editorCommands.onOpenSelectionNote),
    createSelectionCloze: run('cloze', args.layoutProps.editorCommands.onCreateCloze),
    createSelectionHighlight: run('highlight', args.layoutProps.editorCommands.onCreateHighlight)
  };
}

import { definedProps } from '../shared/lib/definedProps';

import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import type { ImmersiveReadableArticleProps } from './CompanionReadableArticleSurface';
import { createPendingAnnotationActions, type useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import type { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

export function CompanionArticleSelectionLayer({ articleProps: props, toolbar, pending }: {
  articleProps: ImmersiveReadableArticleProps;
  toolbar: ReturnType<typeof useCompanionSelectionAnnotationToolbar>;
  pending: ReturnType<typeof useCompanionPendingReadableArticle>;
}) {
  const { createSelectionAnnotation, deleteExistingHighlight, adjustExistingHighlightRange } = createPendingAnnotationActions(props, pending);
  return <SelectionAnnotationToolbarLayer key={props.readableArticle.nodeId}
    editor={toolbar.editorRef.current} parentNodeId={props.readableArticle.nodeId}
    onActivateExistingHighlight={toolbar.activateCreatedHighlight}
    onOpenExistingHighlight={props.onOpenExistingHighlight} snapshot={props.snapshot}
    onClose={toolbar.clearSelectionAndCloseToolbar} resolveSelectionPayload={toolbar.resolveSelectionPayload}
    state={toolbar.selectionToolbar} {...definedProps({
      onAddExistingHighlightNote: props.onAddExistingHighlightNote,
      onAdjustExistingHighlightRange: props.onAdjustExistingHighlightRange ? adjustExistingHighlightRange : undefined,
      onCreateSelectionAnnotation: props.onCreateSelectionAnnotation ? createSelectionAnnotation : undefined,
      onDeleteExistingHighlight: props.onDeleteExistingHighlight ? deleteExistingHighlight : undefined
    })} />;
}

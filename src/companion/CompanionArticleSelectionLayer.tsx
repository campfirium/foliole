import { definedProps } from '../shared/lib/definedProps';
import { HighlightRangeHandles } from '../shared/ui/HighlightRangeHandles';

import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import type { ImmersiveReadableArticleProps } from './CompanionReadableArticleSurface';
import { createPendingAnnotationActions, type useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import type { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

export function CompanionArticleSelectionLayer({ articleProps: props, toolbar, pending, surface }: {
  articleProps: ImmersiveReadableArticleProps;
  toolbar: ReturnType<typeof useCompanionSelectionAnnotationToolbar>;
  surface: HTMLElement | null;
  pending: ReturnType<typeof useCompanionPendingReadableArticle>;
}) {
  const { createSelectionAnnotation, deleteExistingHighlight, adjustExistingHighlightRange } = createPendingAnnotationActions(props, pending);
  const editor = toolbar.editorRef.current;
  const range = toolbar.selectionToolbar?.adjustableRange;
  return <>
    {range ? <HighlightRangeHandles touch editor={editor} scrollSurface={surface}
      highlight={{ kind: 'selection', locator: range, nodeId: props.readableArticle.nodeId }}
      onPreview={toolbar.managed.preview} onCommit={(_nodeId, next) => toolbar.managed.setRange(next)} /> : null}
    <SelectionAnnotationToolbarLayer key={props.readableArticle.nodeId}
      editor={toolbar.editorRef.current} scrollSurface={surface} parentNodeId={props.readableArticle.nodeId}
      onActivateExistingHighlight={toolbar.activateCreatedHighlight}
      onOpenExistingHighlight={props.onOpenExistingHighlight} snapshot={props.snapshot}
      onClose={toolbar.clearSelectionAndCloseToolbar} resolveSelectionPayload={toolbar.resolveSelectionPayload}
      onSelectParagraph={toolbar.selectReadingParagraph} getExpandedParagraphText={toolbar.getExpandedParagraphText}
      state={toolbar.selectionToolbar} {...definedProps({
        onAddExistingHighlightNote: props.onAddExistingHighlightNote,
        onAdjustExistingHighlightRange: props.onAdjustExistingHighlightRange ? adjustExistingHighlightRange : undefined,
        onCreateSelectionAnnotation: props.onCreateSelectionAnnotation ? createSelectionAnnotation : undefined,
        onDeleteExistingHighlight: props.onDeleteExistingHighlight ? deleteExistingHighlight : undefined
      })} />
  </>;
}

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import { getImageClozeAnswerEditorNodeId } from '../../features/image-cloze/model/imageClozePresentation';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { useAnswerEditorHistory } from './useAnswerEditorHistory';

interface DocumentPanelAnswerSectionProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  editorAppearanceKey: string;
  editorNodeId: string | null;
  fitBlockImagesToViewport?: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onAnswerImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  readOnly?: boolean;
  reveal: string;
  reviewEscapeBlurEnabled?: boolean;
  sharedBlockImageMaxHeight?: number;
}

export function DocumentPanelAnswerSection(props: DocumentPanelAnswerSectionProps) {
  const t = useTranslation();
  const answerNodeId = getImageClozeAnswerEditorNodeId(props.editorNodeId);
  const answerEditorKey = `answer-${props.editorAppearanceKey}-${answerNodeId ?? 'none'}`;
  const answerHistory = useAnswerEditorHistory(answerNodeId);

  return (
    <section
      aria-label={t('desktop.document.answerSection')}
      className={cn(
        'relative flex min-h-0 overflow-hidden',
        props.answerSectionMode === 'balanced' ? 'flex-1' : 'flex-[0_0_calc(30dvh+60px)]'
      )}
      data-undo-history-document-id={answerNodeId ?? undefined}
    >
      <MarkdownEditor
        applicationCutEnabled
        ariaLabel={t('desktop.document.answerEditor')}
        className="answer-editor-host min-h-0"
        hideTitleHeading={false}
        key={answerEditorKey}
        nodeId={answerNodeId}
        onChange={props.onAnswerChange}
        onDocumentInput={answerHistory.handleDocumentInput}
        onReady={answerHistory.handleReady}
        value={props.reveal}
        {...definedProps({
          blockImageMaxHeightOverride: props.sharedBlockImageMaxHeight,
          debugId: props.answerEditorDebugId,
          fitBlockImagesToViewport: props.fitBlockImagesToViewport,
          onFitBlockImageMetricsChange: props.onAnswerImageMetricsChange,
          onImageLoadStateChange: props.onAnswerImageLoadStateChange,
          onPastedAnchors: props.onPastedTextAnchors,
          readOnly: props.readOnly,
          reviewEscapeBlurEnabled: props.reviewEscapeBlurEnabled
        })}
      />
    </section>
  );
}

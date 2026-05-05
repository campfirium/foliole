import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextAnchorDecoration } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../../features/editor/model/nodeLinkPreview';
import { getImageClozeAnswerEditorNodeId } from '../../features/image-cloze/model/imageClozePresentation';
import { cn } from '../../shared/lib/utils';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';
import { DocumentWidthResizeHandles } from './DocumentWidthResizeHandles';

export interface BlockImageMetrics {
  imageCount: number;
  nonImageHeight: number;
  viewportHeight: number;
}

export interface DocumentPanelBodyLayoutProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  immersiveEditing?: boolean;
  editorNodeId: string | null;
  editorReadingSelection?: EditorSelection | null;
  editorReadingTargetViewportMode?: EditorViewportMode | null;
  editorReadingTargetViewportRatio?: number | null;
  editorNodeViewState?: NodeViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string) => void;
  emptyContent?: ReactNode;
  emptyState?: {
    description: string;
    title: string;
  };
  fitBlockImagesToViewport?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  hasAnswerSection: boolean;
  isDocumentResizing: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onOpenNodeLink?: (title: string) => void;
  onPreviewNodeLink?: (request: EditorNodeLinkPreviewRequest | null) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore?: () => boolean;
  onPromptImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onPromptImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onSetReadingPositionSelection?: (selection: EditorSelection) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onResetLayout: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  promptEditorDebugId?: string;
  readOnly?: boolean;
  reveal: string;
  sharedBlockImageMaxHeight?: number;
  showDocumentOutline?: boolean;
  showDocumentResizeHandles?: boolean;
}

function AnswerSection(props: DocumentPanelBodyLayoutProps) {
  const answerNodeId = getImageClozeAnswerEditorNodeId(props.editorNodeId);
  const answerEditorKey = `answer-${props.editorAppearanceKey}-${answerNodeId ?? 'none'}`;

  return (
    <section
      aria-label="Cloze answer section"
      className={cn(
        'relative flex min-h-0 overflow-hidden',
        props.answerSectionMode === 'balanced' ? 'flex-1' : 'flex-[0_0_calc(30dvh+60px)]'
      )}
    >
      <MarkdownEditor
        ariaLabel="Answer editor"
        blockImageMaxHeightOverride={props.sharedBlockImageMaxHeight}
        className="answer-editor-host min-h-0"
        debugId={props.answerEditorDebugId}
        fitBlockImagesToViewport={props.fitBlockImagesToViewport}
        hideTitleHeading={false}
        key={answerEditorKey}
        nodeId={answerNodeId}
        onChange={props.onAnswerChange}
        onFitBlockImageMetricsChange={props.onAnswerImageMetricsChange}
        onImageLoadStateChange={props.onAnswerImageLoadStateChange}
        onPastedAnchors={props.onPastedTextAnchors}
        readOnly={props.readOnly}
        value={props.reveal}
      />
    </section>
  );
}

function renderDocumentBodyContent(props: DocumentPanelBodyLayoutProps) {
  if (props.emptyState) {
    return (
      <div className="flex min-h-0 flex-1 flex-col py-8">
        <div className="flex min-h-0 flex-1 px-6 max-[1080px]:px-4">
          {props.emptyContent ?? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const promptEditorKey = `prompt-${props.editorAppearanceKey}`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <MarkdownEditor
        ariaLabel="Prompt editor"
        blockImageMaxHeightOverride={props.sharedBlockImageMaxHeight}
        className="prompt-editor-host"
        contentPaddingBottom={props.editorContentPaddingBottom}
        debugId={props.promptEditorDebugId}
        fitBlockImagesToViewport={props.fitBlockImagesToViewport}
        hideScrollbar={props.editorHideScrollbar}
        hideTitleHeading={props.editorHideTitleHeading}
        immersiveEditing={props.immersiveEditing}
        key={promptEditorKey}
        lineDiffDecorations={props.editorDiffDecorations}
        nodeId={props.editorNodeId}
        readingSelection={props.editorReadingSelection}
        readingTargetViewportMode={props.editorReadingTargetViewportMode}
        readingTargetViewportRatio={props.editorReadingTargetViewportRatio}
        nodeViewState={props.editorNodeViewState}
        onBeginApplyingReadingPosition={props.onBeginApplyingReadingPosition}
        onChange={props.onEditorChange}
        onCompleteApplyingReadingPosition={props.onCompleteApplyingReadingPosition}
        onContextMenu={props.onEditorContextMenu}
        onDoubleClick={props.onEditorDoubleClick}
        onFitBlockImageMetricsChange={props.onPromptImageMetricsChange}
        onImageLoadStateChange={props.onPromptImageLoadStateChange}
        onOpenExternalLink={props.onOpenExternalLink}
        onOpenNodeLink={props.onOpenNodeLink}
        onPreviewNodeLink={props.onPreviewNodeLink}
        onPastedAnchors={props.onPastedTextAnchors}
        onReady={props.onEditorReady}
        onShouldSuppressSelectionRestore={props.onShouldSuppressSelectionRestore}
        readOnly={props.readOnly}
        onSetReadingPositionSelection={props.onSetReadingPositionSelection}
        textAnchorDecorations={props.textAnchorDecorations}
        value={props.editorContent}
      />
    </div>
  );
}

function renderDocumentOutline(props: DocumentPanelBodyLayoutProps) {
  if (props.emptyState || props.showDocumentOutline === false) {
    return null;
  }
  return (
    <DocumentOutlineLayer
      content={props.editorContent}
      documentMaxWidth={props.documentMaxWidth}
      onRevealPosition={props.onRevealDocumentPosition}
      onResolveDocumentPositionAtViewportY={props.onResolveDocumentPositionAtViewportY}
    />
  );
}

function DocumentSectionDivider(props: Pick<DocumentPanelBodyLayoutProps, 'documentMaxWidth'>) {
  void props.documentMaxWidth;
  return (
    <div aria-hidden="true" className="relative h-3 shrink-0">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-border [width:min(100%,var(--document-max-width))]" />
    </div>
  );
}

export function renderDocumentPanelBodyLayout(props: DocumentPanelBodyLayoutProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full" data-resizing={props.isDocumentResizing}>
      {renderDocumentOutline(props)}
      <div className="document-panel-editor-stack flex h-full min-h-0 w-full flex-1 flex-col">
        {renderDocumentBodyContent(props)}
        {props.hasAnswerSection && !props.emptyState ? (
          <>
            <DocumentSectionDivider documentMaxWidth={props.documentMaxWidth} />
            <AnswerSection {...props} />
          </>
        ) : null}
      </div>
      {props.showDocumentResizeHandles === false ? null : (
        <DocumentWidthResizeHandles
          onResetLayout={props.onResetLayout}
          onStartDocumentResize={props.onStartDocumentResize}
        />
      )}
    </div>
  );
}

export function computeSharedBlockImageMaxHeight({
  availableHeight,
  answerMetrics,
  promptMetrics
}: {
  availableHeight: number;
  answerMetrics: BlockImageMetrics | null;
  promptMetrics: BlockImageMetrics | null;
}) {
  const promptImageCount = promptMetrics?.imageCount ?? 0;
  const answerImageCount = answerMetrics?.imageCount ?? 0;
  const totalImageCount = promptImageCount + answerImageCount;

  if (availableHeight <= 0 || totalImageCount <= 0) {
    return undefined;
  }

  const sectionHeights = [promptMetrics, answerMetrics]
    .filter((metrics): metrics is BlockImageMetrics => Boolean(metrics && metrics.imageCount > 0))
    .map((metrics) => Math.floor((metrics.viewportHeight - metrics.nonImageHeight - 8) / metrics.imageCount))
    .filter((height) => Number.isFinite(height));

  if (sectionHeights.length > 0) {
    return Math.max(120, Math.min(...sectionHeights));
  }

  const totalViewportHeight = (promptMetrics?.viewportHeight ?? 0) + (answerMetrics?.viewportHeight ?? 0);
  const heightBudget = totalViewportHeight > 0 ? totalViewportHeight : availableHeight;
  const totalNonImageHeight = (promptMetrics?.nonImageHeight ?? 0) + (answerMetrics?.nonImageHeight ?? 0);
  return Math.max(120, Math.floor((heightBudget - totalNonImageHeight - 16) / totalImageCount));
}

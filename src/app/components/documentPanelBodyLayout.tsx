import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextAnchorDecoration } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../../features/editor/model/nodeLinkPreview';
import { definedProps } from '../../shared/lib/definedProps';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';
import { DocumentPanelAnswerSection } from './DocumentPanelAnswerSection';

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
  editorContentPaddingTop?: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  immersiveEditing?: boolean;
  reviewCaretLineHighlight?: boolean;
  editorNodeId: string | null;
  editorReadingRestoreCommandId?: string | null;
  editorReadingRestoreScrollTop?: number;
  editorReadingSelection?: EditorSelection | null;
  editorReadingTargetViewportMode?: EditorViewportMode | null;
  editorReadingTargetViewportRatio?: number | null;
  editorNodeViewState?: NodeViewState | undefined;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string, commandId?: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string, selection?: EditorSelection, commandId?: string) => void;
  emptyContent?: ReactNode;
  emptyState?: {
    description: string;
    title: string;
  };
  fitBlockImagesToViewport?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  hasAnswerSection: boolean;
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
  promptEditorDebugId?: string;
  readOnly?: boolean;
  reveal: string;
  sharedBlockImageMaxHeight?: number;
  showDocumentOutline?: boolean;
}

function renderDocumentBodyContent(props: DocumentPanelBodyLayoutProps) {
  if (props.emptyState) {
    return renderDocumentEmptyBody(props, props.emptyState);
  }

  const promptEditorKey = `prompt-${props.editorAppearanceKey}`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <MarkdownEditor
        ariaLabel="Prompt editor"
        className="prompt-editor-host"
        key={promptEditorKey}
        nodeId={props.editorNodeId}
        onChange={props.onEditorChange}
        value={props.editorContent}
        {...definedProps({
          blockImageMaxHeightOverride: props.sharedBlockImageMaxHeight,
          contentPaddingBottom: props.editorContentPaddingBottom,
          contentPaddingTop: props.editorContentPaddingTop,
          debugId: props.promptEditorDebugId,
          fitBlockImagesToViewport: props.fitBlockImagesToViewport,
          hideScrollbar: props.editorHideScrollbar,
          hideTitleHeading: props.editorHideTitleHeading,
          immersiveEditing: props.immersiveEditing,
          lineDiffDecorations: props.editorDiffDecorations,
          nodeViewState: props.editorNodeViewState,
          onBeginApplyingReadingPosition: props.onBeginApplyingReadingPosition,
          onCompleteApplyingReadingPosition: props.onCompleteApplyingReadingPosition,
          onContextMenu: props.onEditorContextMenu,
          onDoubleClick: props.onEditorDoubleClick,
          onFitBlockImageMetricsChange: props.onPromptImageMetricsChange,
          onImageLoadStateChange: props.onPromptImageLoadStateChange,
          onOpenExternalLink: props.onOpenExternalLink,
          onOpenNodeLink: props.onOpenNodeLink,
          onPreviewNodeLink: props.onPreviewNodeLink,
          onPastedAnchors: props.onPastedTextAnchors,
          onReady: props.onEditorReady,
          onSetReadingPositionSelection: props.onSetReadingPositionSelection,
          onShouldSuppressSelectionRestore: props.onShouldSuppressSelectionRestore,
          readOnly: props.readOnly,
          readingRestoreCommandId: props.editorReadingRestoreCommandId,
          readingRestoreScrollTop: props.editorReadingRestoreScrollTop,
          readingSelection: props.editorReadingSelection,
          readingTargetViewportMode: props.editorReadingTargetViewportMode,
          readingTargetViewportRatio: props.editorReadingTargetViewportRatio,
          reviewCaretLineHighlight: props.reviewCaretLineHighlight,
          textAnchorDecorations: props.textAnchorDecorations
        })}
      />
    </div>
  );
}

function renderDocumentEmptyBody(
  props: DocumentPanelBodyLayoutProps,
  emptyState: NonNullable<DocumentPanelBodyLayoutProps['emptyState']>
) {
  return (
    <div className="flex min-h-0 flex-1 flex-col py-8">
      <div className="flex min-h-0 flex-1 px-6 max-[1080px]:px-4">
        {props.emptyContent ?? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <AppEmptyState description={emptyState.description} title={emptyState.title} />
          </div>
        )}
      </div>
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
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-[var(--workspace-region-main-document-content-divider)] [width:min(100%,var(--document-max-width))]" />
    </div>
  );
}

export function renderDocumentPanelBodyLayout(props: DocumentPanelBodyLayoutProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full">
      {renderDocumentOutline(props)}
      <div className="document-panel-editor-stack flex h-full min-h-0 w-full flex-1 flex-col">
        {renderDocumentBodyContent(props)}
        {props.hasAnswerSection && !props.emptyState ? (
          <>
            <DocumentSectionDivider documentMaxWidth={props.documentMaxWidth} />
            <DocumentPanelAnswerSection {...props} />
          </>
        ) : null}
      </div>
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

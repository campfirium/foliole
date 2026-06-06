import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextAnchorDecoration } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../../features/editor/model/nodeLinkPreview';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';

import {
  renderDocumentPanelBodyLayout,
  type BlockImageMetrics
} from './documentPanelBodyLayout';
import { startDocumentPanelDiagnostic } from './documentPanelSectionDiagnostic';
import { useDocumentPanelBodyMetrics } from './useDocumentPanelBodyMetrics';

interface DocumentPanelBodyProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  editorContentPaddingTop?: string;
  fitBlockImagesToViewport?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  reviewCaretLineHighlight?: boolean;
  reviewEscapeBlurEnabled?: boolean;
  emptyContent?: ReactNode;
  editorNodeId: string | null;
  editorReadingRestoreCommandId?: string | null;
  editorReadingRestoreScrollTop?: number;
  editorReadingSelection?: EditorSelection | null;
  editorReadingTargetViewportMode?: EditorViewportMode | null;
  editorReadingTargetViewportRatio?: number | null;
  editorNodeViewState?: NodeViewState | undefined;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string, commandId?: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string, selection?: EditorSelection, commandId?: string) => void;
  emptyState?: {
    description: string;
    title: string;
  };
  hasAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onEditorChange: (content: string) => void;
  onEditorInput?: (meta: { nodeId: string | null }) => void;
  onEditorContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onOpenNodeLink?: (title: string) => void;
  onPreviewNodeLink?: (request: EditorNodeLinkPreviewRequest | null) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore?: () => boolean;
  onPromptImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onPromptImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
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

export function DocumentPanelBody({
  answerEditorDebugId = 'answer-editor',
  answerSectionMode = 'fixed',
  promptEditorDebugId = 'prompt-editor',
  showDocumentOutline = true,
  ...props
}: DocumentPanelBodyProps) {
  const finishDiagnostic = startDocumentPanelDiagnostic('document-panel-body-render', {
    editorContentLength: props.editorContent.length,
    editorNodeId: props.editorNodeId,
    hasAnswerSection: props.hasAnswerSection,
    textAnchorDecorations: props.textAnchorDecorations ?? null
  });
  const {
    handleAnswerImageLoadStateChange,
    handlePromptImageLoadStateChange,
    layoutRef,
    setAnswerImageMetrics,
    setPromptImageMetrics,
    sharedBlockImageMaxHeight
  } = useDocumentPanelBodyMetrics({
    editorContent: props.editorContent,
    editorNodeId: props.editorNodeId,
    ...definedProps({ onPromptImageLoadStateChange: props.onPromptImageLoadStateChange }),
    reveal: props.reveal
  });

  const bodyProps: DocumentPanelBodyProps = definedProps({
    ...props,
    answerEditorDebugId,
    answerSectionMode,
    onAnswerImageLoadStateChange: handleAnswerImageLoadStateChange,
    onAnswerImageMetricsChange: setAnswerImageMetrics,
    onPromptImageLoadStateChange: handlePromptImageLoadStateChange,
    onPromptImageMetricsChange: setPromptImageMetrics,
    promptEditorDebugId,
    sharedBlockImageMaxHeight: props.fitBlockImagesToViewport ? sharedBlockImageMaxHeight : undefined,
    showDocumentOutline
  });

  finishDiagnostic({
    sharedBlockImageMaxHeight: props.fitBlockImagesToViewport ? sharedBlockImageMaxHeight ?? null : null
  });
  return (
    <div
      className={cn('flex min-h-0 flex-1 pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0')}
      ref={layoutRef}
    >
      {renderDocumentPanelBodyLayout(bodyProps)}
    </div>
  );
}

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorTextAnchorDecoration } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../../features/editor/model/nodeLinkPreview';
import { cn } from '../../shared/lib/utils';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import {
  renderDocumentPanelBodyLayout,
  type BlockImageMetrics
} from './documentPanelBodyLayout';
import { useDocumentPanelBodyMetrics } from './useDocumentPanelBodyMetrics';

interface DocumentPanelBodyProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  fitBlockImagesToViewport?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  emptyContent?: ReactNode;
  editorNodeId: string | null;
  editorReadingSelection?: EditorSelection | null;
  editorReadingTargetViewportMode?: EditorViewportMode | null;
  editorReadingTargetViewportRatio?: number | null;
  editorNodeViewState?: NodeViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string) => void;
  emptyState?: {
    description: string;
    title: string;
  };
  hasAnswerSection: boolean;
  isDocumentResizing: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onEditorChange: (content: string) => void;
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

export function DocumentPanelBody({
  answerEditorDebugId = 'answer-editor',
  answerSectionMode = 'fixed',
  promptEditorDebugId = 'prompt-editor',
  showDocumentOutline = true,
  showDocumentResizeHandles = true,
  ...props
}: DocumentPanelBodyProps) {
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
    onPromptImageLoadStateChange: props.onPromptImageLoadStateChange,
    reveal: props.reveal
  });

  const bodyProps: DocumentPanelBodyProps = {
    answerEditorDebugId,
    answerSectionMode,
    onAnswerImageLoadStateChange: handleAnswerImageLoadStateChange,
    onAnswerImageMetricsChange: setAnswerImageMetrics,
    onPromptImageLoadStateChange: handlePromptImageLoadStateChange,
    onPromptImageMetricsChange: setPromptImageMetrics,
    promptEditorDebugId,
    sharedBlockImageMaxHeight: props.fitBlockImagesToViewport ? sharedBlockImageMaxHeight : undefined,
    showDocumentOutline,
    showDocumentResizeHandles,
    ...props
  };

  return (
    <div
      className={cn('flex min-h-0 flex-1 pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0')}
      ref={layoutRef}
    >
      {renderDocumentPanelBodyLayout(bodyProps)}
    </div>
  );
}

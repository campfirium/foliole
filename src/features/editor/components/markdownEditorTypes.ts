import type { MouseEvent as ReactMouseEvent } from 'react';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type {
  EditorAdapter,
  EditorContentChangeMeta,
  EditorDiffDecorations,
  EditorMissingAttachmentResourceHandler,
  EditorTextAnchorDecoration,
  EditorViewportMode
} from '../adapters/EditorAdapter';
import type { EditorSelection } from '../adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

export interface EditorViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  } | null;
}

export interface MarkdownEditorProps {
  ariaLabel?: string;
  blockImageMaxHeightOverride?: number;
  blockImageWidthOverride?: string;
  className?: string;
  contentPaddingTop?: string;
  contentPaddingBottom?: string;
  fitBlockImagesToViewport?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  debugId?: string;
  hideTitleHeading?: boolean;
  hideScrollbar?: boolean;
  immersiveEditing?: boolean;
  lineDiffDecorations?: EditorDiffDecorations | null;
  nodeId: string | null;
  readingSelection?: EditorSelection | null;
  readingTargetViewportMode?: EditorViewportMode | null;
  readingTargetViewportRatio?: number | null;
  nodeViewState?: EditorViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string) => void;
  onChange: (value: string, meta?: EditorContentChangeMeta) => void;
  onCompleteApplyingReadingPosition?: (reason: string, selection?: EditorSelection) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onOpenNodeLink?: (title: string) => void;
  onPreviewNodeLink?: (request: EditorNodeLinkPreviewRequest | null) => void;
  onPastedAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore?: () => boolean;
  readOnly?: boolean;
  onSetReadingPositionSelection?: (selection: EditorSelection) => void;
  value: string;
}

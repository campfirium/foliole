import type { FocusEvent as ReactFocusEvent, FormEvent as ReactFormEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

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
import type { EditorRestoreSelectionMode } from '../model/editorRestoreCommand';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

export interface EditorViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  } | null;
}

export type MarkdownReadOnlyInteractionMode = 'editor' | 'document';

export interface MarkdownEditorProps {
  applicationCutEnabled?: boolean;
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
  trailingDivider?: boolean;
  immersiveEditing?: boolean;
  lineDiffDecorations?: EditorDiffDecorations | null;
  liveMarkdownEnabled?: boolean;
  localDocumentPath?: string | null;
  nodeId: string | null;
  readingRestoreCommandId?: string | null;
  readingRestoreScrollTop?: number;
  readingSelection?: EditorSelection | null;
  readingSelectionMode?: EditorRestoreSelectionMode;
  readingTargetViewportMode?: EditorViewportMode | null;
  readingTargetViewportRatio?: number | null;
  nodeViewState?: EditorViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string, commandId?: string) => void;
  onBeforeInputCapture?: (event: ReactFormEvent<HTMLDivElement>) => void;
  onBlurCapture?: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onChange: (value: string, meta?: EditorContentChangeMeta) => void;
  onCompleteApplyingReadingPosition?: (reason: string, selection?: EditorSelection, commandId?: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onExitEditing?: () => boolean;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onDocumentInput?: (meta: EditorContentChangeMeta) => void;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onOpenNodeLink?: (title: string) => void;
  onPreviewNodeLink?: (request: EditorNodeLinkPreviewRequest | null) => void;
  onPastedAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  onRedo?: () => boolean;
  onShouldSuppressSelectionRestore?: () => boolean;
  readOnly?: boolean;
  readOnlyInteractionMode?: MarkdownReadOnlyInteractionMode;
  reviewCaretLineHighlight?: boolean;
  reviewEscapeBlurEnabled?: boolean;
  scrollContainer?: 'editor' | 'outer';
  onSetReadingPositionSelection?: (selection: EditorSelection) => void;
  onUndo?: () => boolean;
  onKeyDownCapture?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  value: string;
}

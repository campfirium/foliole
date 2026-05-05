import type { MouseEvent as ReactMouseEvent } from 'react';

import type {
  EditorAdapter,
  EditorDiffDecorations,
  EditorTextAnchorDecoration
} from '../adapters/EditorAdapter';
import type { EditorSelection } from '../adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';

export interface EditorViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  };
}

export interface MarkdownEditorProps {
  ariaLabel?: string;
  blockImageMaxHeightOverride?: number;
  className?: string;
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
  nodeViewState?: EditorViewState;
  onBeginApplyingReadingPosition?: (selection: EditorSelection, reason: string) => void;
  onChange: (value: string) => void;
  onCompleteApplyingReadingPosition?: (reason: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onOpenNodeLink?: (title: string) => void;
  onPastedAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore?: () => boolean;
  readOnly?: boolean;
  onSetReadingPositionSelection?: (selection: EditorSelection) => void;
  value: string;
}

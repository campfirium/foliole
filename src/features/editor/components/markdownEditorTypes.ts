import type { MouseEvent as ReactMouseEvent } from 'react';

import type { EditorAdapter, EditorDiffDecorations } from '../adapters/EditorAdapter';

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
  hiddenTextAnchorKeys?: readonly string[];
  debugId?: string;
  hideTitleHeading?: boolean;
  hideScrollbar?: boolean;
  lineDiffDecorations?: EditorDiffDecorations | null;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  onChange: (value: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  readOnly?: boolean;
  value: string;
}

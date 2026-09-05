import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { startImmersiveReadingScrollMotion } from './immersiveReadingViewportBandMotion';

export const IMMERSIVE_READING_FORWARD_REVEAL_RATIO = 0.15;
export const IMMERSIVE_READING_BACKWARD_REVEAL_RATIO = 0.8;
const IMMERSIVE_READING_SAFE_TOP_RATIO = 0.2;
const IMMERSIVE_READING_FORWARD_SAFE_TOP_RATIO = 0.15;
const IMMERSIVE_READING_SAFE_BOTTOM_RATIO = 0.7;

interface ImmersiveViewportBandSource {
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
}

export function shouldRevealSelectionInImmersiveBand(args: {
  direction: 'backward' | 'forward';
  props: ImmersiveViewportBandSource;
  selection: EditorSelection;
}) {
  const editor = args.props.editorAdapterRef.current;
  const viewportRect = editor?.getViewportRect?.();
  if (!editor || !viewportRect || viewportRect.height <= 0) {
    return true;
  }
  if (args.direction === 'forward' && editor.getPositionClientRect) {
    const startRect = editor.getPositionClientRect(args.selection.from);
    const endRect = editor.getPositionClientRect(args.selection.to);
    if (startRect && endRect) {
      const safeTop = viewportRect.top + viewportRect.height * IMMERSIVE_READING_FORWARD_SAFE_TOP_RATIO;
      const safeBottom = viewportRect.top + viewportRect.height * IMMERSIVE_READING_SAFE_BOTTOM_RATIO;
      return Math.min(startRect.top, endRect.top) < safeTop || Math.max(startRect.bottom, endRect.bottom) > safeBottom;
    }
  }
  const topPosition = editor.getDocumentPositionAtViewportY(
    viewportRect.top + viewportRect.height * IMMERSIVE_READING_SAFE_TOP_RATIO
  );
  const bottomPosition = editor.getDocumentPositionAtViewportY(
    viewportRect.top + viewportRect.height * IMMERSIVE_READING_SAFE_BOTTOM_RATIO
  );
  if (typeof topPosition !== 'number' || typeof bottomPosition !== 'number') {
    return true;
  }
  const lowerBound = Math.min(topPosition, bottomPosition);
  const upperBound = Math.max(topPosition, bottomPosition);
  if (args.selection.from >= lowerBound && args.selection.from <= upperBound) {
    return false;
  }
  return args.direction === 'forward' ? args.selection.from > upperBound : args.selection.from < lowerBound;
}

export function revealSelectionForImmersiveBand(args: {
  direction: 'backward' | 'forward';
  props: ImmersiveViewportBandSource;
  selection: EditorSelection;
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return;
  }
  const targetRatio =
    args.direction === 'forward'
      ? IMMERSIVE_READING_FORWARD_REVEAL_RATIO
      : IMMERSIVE_READING_BACKWARD_REVEAL_RATIO;
  const viewportRect = editor.getViewportRect?.();
  const positionTop = editor.getPositionViewportTop?.(args.selection.from);
  if (viewportRect && typeof positionTop === 'number') {
    const metrics = editor.getScrollMetrics();
    const targetScrollTop = Math.min(
      Math.max(0, metrics.scrollTop + positionTop - (viewportRect.top + viewportRect.height * targetRatio)),
      Math.max(0, metrics.scrollHeight - metrics.clientHeight)
    );
    startImmersiveReadingScrollMotion(editor, targetScrollTop);
    return;
  }
  if (editor.revealSelectionAtViewportRatio) {
    editor.revealSelectionAtViewportRatio(
      args.selection,
      targetRatio,
      { preserveFocus: true }
    );
    return;
  }
  editor.revealSelection(args.selection, { preserveFocus: true });
}

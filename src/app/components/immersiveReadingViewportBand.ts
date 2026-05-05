import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export const IMMERSIVE_READING_FORWARD_REVEAL_RATIO = 0.2;
export const IMMERSIVE_READING_BACKWARD_REVEAL_RATIO = 0.8;
const IMMERSIVE_READING_SAFE_TOP_RATIO = 0.2;
const IMMERSIVE_READING_SAFE_BOTTOM_RATIO = 0.8;

export function shouldRevealSelectionInImmersiveBand(args: {
  direction: 'backward' | 'forward';
  props: WorkspaceLayoutProps;
  selection: EditorSelection;
}) {
  const editor = args.props.editorAdapterRef.current;
  const viewportRect = editor?.getViewportRect?.();
  if (!editor || !viewportRect || viewportRect.height <= 0) {
    return true;
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
  props: WorkspaceLayoutProps;
  selection: EditorSelection;
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return;
  }
  if (editor.revealSelectionAtViewportRatio) {
    editor.revealSelectionAtViewportRatio(
      args.selection,
      args.direction === 'forward'
        ? IMMERSIVE_READING_FORWARD_REVEAL_RATIO
        : IMMERSIVE_READING_BACKWARD_REVEAL_RATIO
    );
    return;
  }
  editor.revealSelection(args.selection);
}

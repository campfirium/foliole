import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';

function collapseSelectionToCaret(selection: EditorSelection) {
  return {
    from: selection.from,
    to: selection.from
  };
}

export function resolvePersistedViewStateSelection(args: {
  editor: EditorAdapter | null;
  isImmersiveMode: boolean;
  sharedReadingSelection: EditorSelection | null;
}) {
  if (args.isImmersiveMode && args.sharedReadingSelection) {
    return collapseSelectionToCaret(args.sharedReadingSelection);
  }

  const currentSelection = args.editor?.getSelection() ?? { from: 0, to: 0 };
  const visiblePosition = args.editor?.getPrimaryVisiblePosition?.();
  const hasExplicitSelection = currentSelection.from !== currentSelection.to;
  const hasNonZeroCursor = currentSelection.from !== 0 || currentSelection.to !== 0;
  const isSelectionNearViewport =
    typeof visiblePosition === 'number' &&
    typeof args.editor?.isPositionNearViewportRatio === 'function' &&
    args.editor.isPositionNearViewportRatio(currentSelection.to, 0.15, 0.35);

  if (hasExplicitSelection || (hasNonZeroCursor && (typeof visiblePosition !== 'number' || isSelectionNearViewport))) {
    return collapseSelectionToCaret(currentSelection);
  }
  if (typeof visiblePosition === 'number') {
    return { from: visiblePosition, to: visiblePosition };
  }
  if (args.sharedReadingSelection) {
    return collapseSelectionToCaret(args.sharedReadingSelection);
  }
  return collapseSelectionToCaret(currentSelection);
}

import type { EditorViewportMode } from '../adapters/EditorAdapter';
import {
  createEditorRestoreTarget,
  createEditorRestoreTargetKey
} from '../model/editorRestoreStateMachine';

import type { EditorViewState } from './markdownEditorTypes';

export function normalizeRestoreSelection(selection: EditorViewState['selection']) {
  if (!selection) {
    return null;
  }
  return selection.from === selection.to
    ? selection
    : {
        from: selection.from,
        to: selection.from
      };
}

export function resolveRestoreScrollTop(
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined
) {
  const normalizedReadingSelection = readingSelection ? normalizeRestoreSelection(readingSelection) : null;
  const normalizedNodeSelection = nodeViewState?.selection
    ? normalizeRestoreSelection(nodeViewState.selection)
    : null;
  if (!normalizedReadingSelection) {
    return nodeViewState?.scrollTop;
  }
  if (
    normalizedNodeSelection &&
    normalizedNodeSelection.from === normalizedReadingSelection.from &&
    normalizedNodeSelection.to === normalizedReadingSelection.to
  ) {
    return nodeViewState?.scrollTop;
  }
  return undefined;
}

export function shouldCollapseSelectionAfterRestore(selection: NonNullable<EditorViewState['selection']>) {
  if (selection.from !== selection.to || (selection.from === 0 && selection.to === 0)) {
    return undefined;
  }
  return selection;
}

export function createPendingRestoreSelectionKey(
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined,
  targetViewportMode?: EditorViewportMode | null
) {
  const selectionSource = readingSelection ?? nodeViewState?.selection;
  const selection = selectionSource ? normalizeRestoreSelection(selectionSource) : null;
  const scrollTop = resolveRestoreScrollTop(readingSelection, nodeViewState);
  const target = createEditorRestoreTarget({
    nodeId,
    scrollTop,
    selectionFrom: selection?.from ?? null,
    selectionTo: selection?.to ?? null
  });
  if (!target) {
    return null;
  }
  return createEditorRestoreTargetKey(target, targetViewportMode);
}

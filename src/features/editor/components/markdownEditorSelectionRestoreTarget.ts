import type { EditorViewportMode } from '../adapters/EditorAdapter';
import { createEditorRestoreCommandKey } from '../model/editorRestoreCommand';
import { createEditorRestoreTarget } from '../model/editorRestoreStateMachine';

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

export function shouldCollapseSelectionAfterRestore(selection: NonNullable<EditorViewState['selection']>) {
  if (selection.from !== selection.to || (selection.from === 0 && selection.to === 0)) {
    return undefined;
  }
  return selection;
}

export function createPendingRestoreSelectionKey(
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  readingRestoreScrollTop: number | undefined,
  targetViewportMode?: EditorViewportMode | null,
  restoreCommandId?: string | null
) {
  if (!restoreCommandId) {
    return null;
  }
  const selection = readingSelection ? normalizeRestoreSelection(readingSelection) : null;
  const target = createEditorRestoreTarget({
    nodeId,
    scrollTop: readingRestoreScrollTop,
    selectionFrom: selection?.from ?? null,
    selectionTo: selection?.to ?? null
  });
  if (!target) {
    return null;
  }
  void targetViewportMode;
  return createEditorRestoreCommandKey(restoreCommandId);
}

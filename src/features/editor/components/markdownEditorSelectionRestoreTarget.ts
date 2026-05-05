import type { EditorViewState } from './markdownEditorTypes';

export function resolveRestoreScrollTop(
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined
) {
  if (readingSelection) {
    return undefined;
  }
  return nodeViewState?.scrollTop;
}

export function createPendingRestoreSelectionKey(
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined
) {
  const selection = readingSelection ?? nodeViewState?.selection;
  if (!nodeId || !selection) {
    return null;
  }
  return `${nodeId}:${selection.from}:${selection.to}:${resolveRestoreScrollTop(readingSelection, nodeViewState) ?? 'auto'}`;
}

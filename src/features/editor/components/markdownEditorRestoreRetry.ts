import type { EditorViewState } from './markdownEditorTypes';

export function canRetryScrollOnlyRestore(
  selection: EditorViewState['selection'],
  restoreScrollTop: number | undefined,
  activeRestoreValueLength: number,
  valueLength: number
) {
  return (
    (!selection || (selection.from === 0 && selection.to === 0)) &&
    typeof restoreScrollTop === 'number' &&
    restoreScrollTop > 0 &&
    valueLength > activeRestoreValueLength
  );
}

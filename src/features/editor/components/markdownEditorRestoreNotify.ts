import type { EditorViewportMode } from '../adapters/EditorAdapter';

import type { EditorViewState } from './markdownEditorTypes';

export function shouldNotifyReadingPositionApply(args: {
  readingRestoreCommandId?: string | null;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
}) {
  return Boolean(
    args.readingRestoreCommandId ||
    args.readingSelection ||
    args.readingTargetViewportMode ||
    typeof args.readingTargetViewportRatio === 'number'
  );
}

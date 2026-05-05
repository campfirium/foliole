import type { EditorViewportMode } from '../adapters/EditorAdapter';

import type { EditorViewState } from './markdownEditorTypes';

export function shouldNotifyReadingPositionApply(args: {
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
}) {
  return Boolean(
    args.readingSelection ||
    args.readingTargetViewportMode ||
    typeof args.readingTargetViewportRatio === 'number'
  );
}

import { EditorSelection as CodeMirrorSelection } from '@codemirror/state';

import type { EditorSelection } from './EditorAdapter';

export function toEditorSelectionRanges(selection: { ranges: ReadonlyArray<{ from: number; to: number }> }): EditorSelection[] {
  return selection.ranges.map(({ from, to }) => ({ from, to }));
}

export function createCodeMirrorSelection(
  selections: EditorSelection[],
  clampPosition: (position: number) => number
) {
  const ranges = selections.map((selection) =>
    CodeMirrorSelection.range(clampPosition(selection.from), clampPosition(selection.to))
  );
  return ranges.length > 0
    ? CodeMirrorSelection.create(ranges, ranges.length - 1)
    : CodeMirrorSelection.single(clampPosition(0));
}

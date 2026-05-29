import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';

import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { collectMarkdownMathRangesFromTree } from '../model/markdownMathRanges';

import type { PreviewMarkdownParse } from './liveMarkdownDecorations';
import type { EditedMathRange } from './liveMarkdownMathEditState';

export function buildPreviewAtomicRangeSet(
  parsed: PreviewMarkdownParse,
  editedMathRange: EditedMathRange | null
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  if (getEditorDisplayMode() === 'source') return Decoration.none;
  const { markdownTree, source } = parsed;
  const mathRanges = collectMarkdownMathRangesFromTree(markdownTree, source);
  for (const mathRange of mathRanges) {
    if (editedMathRange?.from === mathRange.from && editedMathRange.to === mathRange.to) continue;
    ranges.push(Decoration.mark({}).range(mathRange.from, mathRange.to));
  }
  return Decoration.set(ranges, true);
}

import { deleteCharBackward } from '@codemirror/commands';
import { Prec, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap } from '@codemirror/view';

import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { collectMarkdownMathRangesFromTree } from '../model/markdownMathRanges';

import type { PreviewMarkdownParse } from './liveMarkdownDecorations';
import type { EditedMathRange } from './liveMarkdownMathEditState';

export function buildPreviewAtomicRangeSet(
  parsed: PreviewMarkdownParse,
  editedMathRange: EditedMathRange | null,
  decorations: DecorationSet
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  if (getEditorDisplayMode() === 'source') return Decoration.none;
  const { markdownTree, source } = parsed;
  decorations.between(0, source.length, (from, to, decoration) => {
    if (decoration.spec.atomicListPrefix === true && !source.slice(from, to).includes('\n')) {
      ranges.push(decoration.range(from, to));
    }
  });
  const mathRanges = collectMarkdownMathRangesFromTree(markdownTree, source);
  for (const mathRange of mathRanges) {
    if (editedMathRange?.from === mathRange.from && editedMathRange.to === mathRange.to) continue;
    ranges.push(Decoration.mark({}).range(mathRange.from, mathRange.to));
  }
  return Decoration.set(ranges, true);
}

function deleteBackwardAcrossListPrefix(view: EditorView) {
  if (view.composing || view.state.readOnly) return false;
  const atomicRanges = view.state.facet(EditorView.atomicRanges).map((provide) => provide(view));
  const afterPrefix = view.state.selection.ranges.some(({ empty, head }) =>
    empty && atomicRanges.some((ranges) => {
      let found = false;
      ranges.between(head, head, (_from, to, decoration) => {
        if (to === head && decoration instanceof Decoration && decoration.spec.atomicListPrefix === true) {
          found = true;
        }
      });
      return found;
    })
  );
  return afterPrefix && deleteCharBackward(view);
}

export const renderedListPrefixKeymap = Prec.highest(keymap.of([
  { key: 'Backspace', run: deleteBackwardAcrossListPrefix }
]));

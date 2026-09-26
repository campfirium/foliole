import { EditorSelection, EditorState, type SelectionRange, type Text } from '@codemirror/state';

const DEVANAGARI_VIRAMA = '\u094d';
const graphemeSegmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });

function expandConjunctStart(doc: Text, range: SelectionRange): SelectionRange {
  if (
    range.empty || range.undirectional || range.from === 0 ||
    doc.sliceString(range.from - 1, range.from) !== DEVANAGARI_VIRAMA
  ) return range;

  const line = doc.lineAt(range.from);
  const offset = range.from - line.from;
  const segment = graphemeSegmenter.segment(line.text).containing(offset);
  if (!segment || segment.index >= offset) return range;

  const from = line.from + segment.index;
  return range.anchor < range.head
    ? EditorSelection.range(from, range.head)
    : EditorSelection.range(range.anchor, from);
}

export const preserveDevanagariConjunctPointerSelection = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.selection || transaction.docChanged || !transaction.isUserEvent('select.pointer')) {
    return transaction;
  }

  const selection = transaction.newSelection;
  let ranges: SelectionRange[] | null = null;
  for (const [index, range] of selection.ranges.entries()) {
    const adjusted = expandConjunctStart(transaction.newDoc, range);
    if (adjusted === range) continue;
    if (!ranges) ranges = selection.ranges.slice();
    ranges[index] = adjusted;
  }
  if (!ranges) return transaction;

  return [transaction, {
    selection: EditorSelection.create(ranges, selection.mainIndex),
    sequential: true
  }];
});

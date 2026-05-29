import type { EditorView } from '@codemirror/view';

import { collectReadwiseOriginalFilePlaceholderRangesFromLines } from '../model/readwiseOriginalFilePlaceholder';

import { collectViewportLines } from './liveMarkdownDecorationCollections';
import { resolveVisibleLineWindow } from './liveMarkdownViewport';

export function collectPreviewViewportContext(view: EditorView) {
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  return {
    endLine,
    startLine,
    startLineNumber,
    endLineNumber,
    viewportRange: { from: startLine.from, to: endLine.to }
  };
}

export function collectViewportReadwiseOriginalFilePlaceholders(
  view: EditorView,
  startLineNumber: number,
  endLineNumber: number,
  viewportRange: { from: number; to: number }
) {
  const readwiseStartLineNumber = Math.max(1, startLineNumber - 3);
  const readwiseEndLineNumber = Math.min(view.state.doc.lines, endLineNumber + 3);
  return collectReadwiseOriginalFilePlaceholderRangesFromLines(
    collectViewportLines(view, readwiseStartLineNumber, readwiseEndLineNumber)
  ).filter((range) =>
    (range.to >= viewportRange.from && range.from <= viewportRange.to) ||
    range.hiddenRanges.some((hiddenRange) => hiddenRange.to >= viewportRange.from && hiddenRange.from <= viewportRange.to)
  );
}
